//! Tray icons on Windows (tray plugin, plugins.md §5): notification area icons (Shell_NotifyIconW)
//! on the helper window (msgwin.rs), with the ops and events of tray.rs.
//!
//! Know-how from the references:
//! - Callbacks in the classic layout (no NIM_SETVERSION): wParam is the icon's uID, lParam the
//!   mouse message. Electrobun reads it the same way (electrobun/package/src/native/win/
//!   nativeWrapper.cpp:12785-12791); its left click falls through into the right-click case and
//!   opens the menu (:12792-12795), which menuOnLeftClick decides here.
//! - Explorer forgets every icon when it restarts and broadcasts TaskbarCreated to top-level
//!   windows: the icons are added again then (tao registers the message for the same reason,
//!   tao-0.37.0/src/platform_impl/windows/event_loop.rs:623-626; Electrobun loses its icons).
//! - The icon: PNG bytes become an HICON with CreateIconFromResourceEx, which reads PNG-compressed
//!   icon images (Vista and later), at the small-icon size. The old HICON is destroyed only after
//!   NIM_MODIFY took the new one (Electrobun nativeWrapper.cpp:13001-13028).
//! - The menu: menu.rs builds and tracks it on the helper window (SetForegroundWindow, WM_NULL).
//!
//! Events: `click { tray, button }` for every left and right click; then, if the tray has a menu,
//! a right click opens it, and so does a left click unless menuOnLeftClick is false. A tray has no
//! title on Windows: `title` shows as the tooltip when there is no tooltip. `iconAsTemplate` has no
//! meaning here. Without an icon the tray shows the app's icon (the one akan-native build puts in the exe).

use std::{cell::RefCell, collections::HashMap, path::Path};

use windows::Win32::Foundation::HWND;
use windows::Win32::UI::Shell::{ExtractIconExW, Shell_NotifyIconW, NIF_ICON, NIF_MESSAGE, NIF_TIP, NIM_ADD, NIM_DELETE, NIM_MODIFY, NOTIFYICONDATAW, NOTIFY_ICON_MESSAGE};
use windows::Win32::UI::WindowsAndMessaging::{CreateIconFromResourceEx, DestroyIcon, GetSystemMetrics, LoadIconW, HICON, IDI_APPLICATION, LR_DEFAULTCOLOR, SM_CXSMICON, WM_LBUTTONUP, WM_RBUTTONUP};

use crate::{
  chrome::{self, Clicked, Source, Tree},
  json::{self, V},
  push_event,
};

struct Tray {
  uid: u32,
  /// Ours to destroy; None: the app's icon.
  icon: Option<HICON>,
  template: bool,
  title: String,
  tooltip: Option<String>,
  menu: Option<Tree>,
  menu_on_left_click: bool,
}

thread_local! {
  static TRAYS: RefCell<HashMap<String, Tray>> = RefCell::new(HashMap::new());
  static NEXT_UID: std::cell::Cell<u32> = const { std::cell::Cell::new(1) };
}

fn string<'a>(cmd: &'a V, key: &str) -> Result<Option<&'a str>, String> {
  match cmd.get(key) {
    None | Some(V::Null) => Ok(None),
    Some(V::Str(s)) => Ok(Some(s)),
    Some(_) => Err(format!("{key} must be a string")),
  }
}

fn flag(cmd: &V, key: &str) -> Result<Option<bool>, String> {
  match cmd.get(key) {
    None | Some(V::Null) => Ok(None),
    Some(V::Bool(b)) => Ok(Some(*b)),
    Some(_) => Err(format!("{key} must be a boolean")),
  }
}

fn icon(app_dir: &Path, path: &str) -> Result<HICON, String> {
  let file = chrome::resolve_app_file(app_dir, path)?;
  let bytes = std::fs::read(&file).map_err(|e| format!("cannot read {path}: {e}"))?;
  if !bytes.starts_with(b"\x89PNG") {
    return Err(format!("{path} is not a PNG image"));
  }
  let size = unsafe { GetSystemMetrics(SM_CXSMICON) };
  // 0x00030000: the icon resource format version CreateIconFromResourceEx expects.
  unsafe { CreateIconFromResourceEx(&bytes, true, 0x0003_0000, size, size, LR_DEFAULTCOLOR) }.map_err(|e| format!("{path}: cannot make an icon of it: {e}"))
}

fn data(tray: &Tray, hwnd: HWND) -> NOTIFYICONDATAW {
  let mut nid = NOTIFYICONDATAW {
    cbSize: std::mem::size_of::<NOTIFYICONDATAW>() as u32,
    hWnd: hwnd,
    uID: tray.uid,
    uFlags: NIF_MESSAGE | NIF_ICON | NIF_TIP,
    uCallbackMessage: super::msgwin::WM_TRAY,
    hIcon: tray.icon.unwrap_or_else(app_icon),
    ..Default::default()
  };
  let tip: Vec<u16> = tray.tooltip.as_deref().unwrap_or(&tray.title).encode_utf16().take(nid.szTip.len() - 1).collect();
  nid.szTip[..tip.len()].copy_from_slice(&tip);
  nid
}

/// The exe's first icon at the small-icon size (akan-native build embeds the app icon), else the generic
/// application icon. Loaded once and kept: every tray without an icon of its own shares it.
fn app_icon() -> HICON {
  static ICON: std::sync::OnceLock<usize> = std::sync::OnceLock::new();
  let handle = *ICON.get_or_init(|| {
    let mut small = HICON::default();
    let exe = std::env::current_exe().ok().map(|p| windows::core::HSTRING::from(p.as_os_str()));
    let found = exe.is_some_and(|exe| unsafe { ExtractIconExW(&exe, 0, None, Some(&mut small), 1) } > 0 && !small.is_invalid());
    let icon = if found { small } else { unsafe { LoadIconW(None, IDI_APPLICATION) }.unwrap_or_default() };
    icon.0 as usize
  });
  HICON(handle as *mut std::ffi::c_void)
}

/// Shell_NotifyIconW talks to Explorer and can take messages meanwhile, so TRAYS is not borrowed
/// then: callers pass the data.
fn notify(message: NOTIFY_ICON_MESSAGE, nid: &NOTIFYICONDATAW) -> Result<(), String> {
  if unsafe { Shell_NotifyIconW(message, nid) }.as_bool() {
    Ok(())
  } else {
    Err("INTERNAL: the notification area refused the icon".into())
  }
}

/// Applies the given fields. Returns the icon it replaced, to destroy once the shell has the new one.
fn apply(tray: &mut Tray, cmd: &V, app_dir: &Path, id: &str) -> Result<Option<HICON>, String> {
  // Everything is checked before anything changes.
  let new_icon = match cmd.get("icon") {
    None => None,
    Some(_) => Some(string(cmd, "icon")?.map(|path| icon(app_dir, path)).transpose()?),
  };
  let menu = match cmd.get("menu") {
    None => None,
    Some(V::Null) => Some(None),
    Some(items) => Some(Some(chrome::parse(items, &super::menu::app_name())?)),
  };
  let (template, title, tooltip, left) = (flag(cmd, "iconAsTemplate")?, string(cmd, "title")?, string(cmd, "tooltip")?, flag(cmd, "menuOnLeftClick")?);
  let _ = id;
  let mut old = None;
  if let Some(icon) = new_icon {
    old = std::mem::replace(&mut tray.icon, icon);
  }
  if let Some(template) = template {
    tray.template = template;
  }
  if cmd.get("title").is_some() {
    tray.title = title.unwrap_or("").to_string();
  }
  if cmd.get("tooltip").is_some() {
    tray.tooltip = tooltip.map(str::to_string);
  }
  if let Some(menu) = menu {
    tray.menu = menu;
  }
  if let Some(left) = left {
    tray.menu_on_left_click = left;
  }
  Ok(old)
}

fn destroy(icon: Option<HICON>) {
  if let Some(icon) = icon {
    unsafe {
      let _ = DestroyIcon(icon);
    }
  }
}

fn tray_json(id: &str, tray: &Tray) -> String {
  format!(
    r#"{{"id":{},"title":{},"tooltip":{},"icon":{},"iconAsTemplate":{},"menu":{},"menuOnLeftClick":{}}}"#,
    json::quote(id),
    json::quote(&tray.title),
    tray.tooltip.as_deref().map_or_else(|| "null".into(), json::quote),
    tray.icon.is_some(),
    tray.template,
    tray.menu.is_some(),
    tray.menu_on_left_click
  )
}

fn click(id: &str, button: &str) {
  push_event(&format!(r#"{{"type":"tray","event":"click","tray":{},"button":"{button}"}}"#, json::quote(id)));
}

/// msgwin.rs: a mouse message of the icon `uid`.
pub fn callback(uid: u32, message: u32) {
  let button = match message {
    WM_LBUTTONUP => "left",
    WM_RBUTTONUP => "right",
    _ => return,
  };
  // Take what the menu needs, then let TRAYS go: the menu runs a modal loop.
  let found = TRAYS.with(|t| {
    let trays = t.borrow();
    let (id, tray) = trays.iter().find(|(_, tray)| tray.uid == uid)?;
    let menu = tray.menu.as_ref().filter(|_| button == "right" || tray.menu_on_left_click).map(super::menu::build_popup);
    Some((id.clone(), menu))
  });
  let Some((id, menu)) = found else { return };
  click(&id, button);
  let Some(menu) = menu else { return };
  let (Ok(menu), Ok(owner)) = (menu, super::msgwin::hwnd()) else { return };
  let Some(index) = super::menu::track(menu, owner, super::menu::cursor(), None) else { return };
  let clicked = TRAYS.with(|t| t.borrow_mut().get_mut(&id).and_then(|tray| tray.menu.as_mut()).map(|tree| tree.click(index, &Source::Tray(id.clone()))));
  if let Some(Clicked::Role(role)) = clicked {
    super::menu::perform(role, None, Some(owner), true);
  }
}

/// msgwin.rs: Explorer restarted; the icons are added again.
pub fn recreate() {
  let Ok(hwnd) = super::msgwin::hwnd() else { return };
  let all: Vec<NOTIFYICONDATAW> = TRAYS.with(|t| t.borrow().values().map(|tray| data(tray, hwnd)).collect());
  for nid in all {
    let _ = notify(NIM_ADD, &nid);
  }
}

/// tray.* shell ops; None for other ops.
pub fn shell_op(op: &str, cmd: &V, app_dir: &Path, app_name: &str) -> Option<Result<String, String>> {
  if !op.starts_with("tray.") {
    return None;
  }
  super::menu::set_app_name(app_name);
  Some(run(op, cmd, app_dir))
}

fn run(op: &str, cmd: &V, app_dir: &Path) -> Result<String, String> {
  if op == "tray.list" {
    return TRAYS.with(|t| {
      let trays = t.borrow();
      let mut ids: Vec<&String> = trays.keys().collect();
      ids.sort();
      Ok(format!("[{}]", ids.iter().map(|id| tray_json(id, &trays[*id])).collect::<Vec<_>>().join(",")))
    });
  }
  let id = string(cmd, "id")?.filter(|s| !s.is_empty()).ok_or("id is required")?.to_string();
  let hwnd = super::msgwin::hwnd()?;
  match op {
    "tray.create" if !TRAYS.with(|t| t.borrow().contains_key(&id)) => {
      if string(cmd, "icon")?.is_none() && string(cmd, "title")?.is_none_or(str::is_empty) {
        return Err("a tray needs an icon or a title".into());
      }
      let uid = NEXT_UID.with(|n| n.replace(n.get() + 1));
      let mut tray = Tray { uid, icon: None, template: false, title: String::new(), tooltip: None, menu: None, menu_on_left_click: true };
      apply(&mut tray, cmd, app_dir, &id)?;
      if let Err(e) = notify(NIM_ADD, &data(&tray, hwnd)) {
        destroy(tray.icon);
        return Err(e);
      }
      let json = tray_json(&id, &tray);
      TRAYS.with(|t| t.borrow_mut().insert(id, tray));
      Ok(json)
    }
    // Creating an existing id updates it (a reloaded page creates its tray again).
    "tray.create" | "tray.update" => {
      let (old, nid, json) = TRAYS.with(|t| {
        let mut trays = t.borrow_mut();
        let tray = trays.get_mut(&id).ok_or_else(|| format!("no tray {id}"))?;
        let old = apply(tray, cmd, app_dir, &id)?;
        Ok::<_, String>((old, data(tray, hwnd), tray_json(&id, tray)))
      })?;
      notify(NIM_MODIFY, &nid)?;
      destroy(old);
      Ok(json)
    }
    "tray.remove" => {
      if let Some(tray) = TRAYS.with(|t| t.borrow_mut().remove(&id)) {
        let _ = notify(NIM_DELETE, &data(&tray, hwnd));
        destroy(tray.icon);
      }
      Ok("null".into())
    }
    // A synthetic click (tests): the event only, no menu, which nobody could close.
    "tray.trigger" => {
      if !TRAYS.with(|t| t.borrow().contains_key(&id)) {
        return Err(format!("no tray {id}"));
      }
      match string(cmd, "button")? {
        None | Some("left") => click(&id, "left"),
        Some("right") => click(&id, "right"),
        Some(other) => return Err(format!("unknown button {other}")),
      }
      Ok("null".into())
    }
    _ => Err(format!("unknown op {op}")),
  }
}
