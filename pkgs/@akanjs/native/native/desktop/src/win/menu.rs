//! Menus on Windows (menu plugin, plugins.md §5): a Win32 menu bar on every window with its
//! accelerators, context menus, and the HMENUs of tray menus (tray.rs), from the item trees and
//! roles of chrome.rs, with the ops and events of menu.rs.
//!
//! Know-how from the references:
//! - One HMENU per window: a window destroys its menu when it goes, so one shared menu would break
//!   the other windows (Electrobun shares one, electrobun/package/src/native/win/nativeWrapper.cpp:
//!   6142-6147). SetMenu, then DrawMenuBar (:13188-13189). The text after the tab is only the key
//!   shown (:6893-6899).
//! - tao's window procedure has no WM_COMMAND case (tao-0.37.0/src/platform_impl/windows/
//!   event_loop.rs:2187-2216) and menus send WM_COMMAND rather than post it, so the msg hook never
//!   sees it: a window subclass (SetWindowSubclass, as wry subclasses the same window, wry-0.57.0/
//!   src/webview2/mod.rs:1288-1358) takes menu (HIWORD 0) and accelerator (HIWORD 1) commands.
//!   Electrobun only takes HIWORD 0 and so drops its accelerators (nativeWrapper.cpp:5964-5971).
//! - Command ids are 16 bits (WM_COMMAND's LOWORD, ACCEL.cmd): id = chrome.rs index + 1.
//! - Accelerators: keys typed into the page go to WebView2's browser process and never reach this
//!   thread's message loop, so TranslateAcceleratorW in the msg hook (all Tauri does, tauri/crates/
//!   tauri/src/app.rs:2472-2489) only works while a window of the app itself has the focus.
//!   WebView2 raises AcceleratorKeyPressed for keys with Ctrl or Alt and keys that type nothing; a
//!   match there is marked handled and posted as the accelerator's WM_COMMAND. The msg hook passes
//!   the top-level window: msg.hwnd can be a child, whose WM_COMMAND would go nowhere.
//! - Context and tray menus: SetForegroundWindow before TrackPopupMenuEx(TPM_RETURNCMD) and a
//!   WM_NULL after it, or the menu does not close when the user clicks elsewhere (Electrobun
//!   nativeWrapper.cpp:13242-13271). closeAfterMs: a timer of the owner window ends the menu
//!   (EndMenu) from inside TrackPopupMenu's modal loop.
//! - The page's editing roles: WebView2 has no editing-command API, so Copy sends Ctrl+C to the
//!   focused page with SendInput (Electrobun fakes its Redo keys the same way, :5711-5741).
//!
//! No app menu by default: a Windows window has no menu bar unless the app sets one (macOS needs
//! its default menu for Cmd+C/V; WebView2 handles Ctrl+C/V itself).

use std::cell::{OnceCell, RefCell};

use tao::platform::windows::WindowExtWindows;
use windows::core::{w, HSTRING};
use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, POINT, WPARAM};
use windows::Win32::Graphics::Gdi::ClientToScreen;
use windows::Win32::UI::Input::KeyboardAndMouse::{
  GetKeyState, SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYBD_EVENT_FLAGS, KEYEVENTF_KEYUP, VIRTUAL_KEY, VK_CONTROL, VK_DELETE, VK_LWIN, VK_MENU,
  VK_RWIN, VK_SHIFT,
};
use windows::Win32::UI::Shell::{DefSubclassProc, RemoveWindowSubclass, SetWindowSubclass};
use windows::Win32::UI::WindowsAndMessaging::{
  AppendMenuW, CheckMenuItem, CreateAcceleratorTableW, CreateMenu, CreatePopupMenu, DestroyAcceleratorTable, DestroyMenu, DrawMenuBar, EndMenu, GetAncestor,
  GetCursorPos, GetMenu, KillTimer, MessageBoxW, PostMessageW, RegisterWindowMessageW, SetForegroundWindow, SetMenu, SetTimer, TrackPopupMenuEx,
  TranslateAcceleratorW, ACCEL, ACCEL_VIRT_FLAGS, GA_ROOT, HACCEL, HMENU, MB_ICONINFORMATION, MB_OK, MF_BYCOMMAND, MF_CHECKED, MF_GRAYED, MF_POPUP,
  MF_SEPARATOR, MF_STRING, MF_UNCHECKED, MSG, TPM_RETURNCMD, TPM_RIGHTBUTTON, WM_CLOSE, WM_COMMAND, WM_KEYDOWN, WM_NCDESTROY, WM_NULL, WM_SYSKEYDOWN,
};

use crate::{
  chrome::{self, Clicked, Edit, Node, Role, Source, Tree},
  json::V,
};

/// SetWindowSubclass id; wry uses WM_USER+0x64 and +0x66 on the same window.
const SUBCLASS_ID: usize = 0x616B_616E; // "akan"
/// The closeAfterMs timer of a context menu.
const CLOSE_TIMER: usize = 0x6F6D;

/// A key of the accelerator table: virtual key, ACCEL flags (FVIRTKEY | FSHIFT | FCONTROL | FALT), command id.
#[derive(Clone, Copy)]
struct Key {
  vk: u16,
  flags: u8,
  cmd: u16,
}

struct AppMenu {
  tree: Tree,
  keys: Vec<Key>,
  accel: Option<HACCEL>,
}

thread_local! {
  /// The shell's windows: (window id, HWND).
  static WINDOWS: RefCell<Vec<(u32, HWND)>> = const { RefCell::new(Vec::new()) };
  /// The app menu; None: no menu bar (the default).
  static APP: RefCell<Option<AppMenu>> = const { RefCell::new(None) };
  static APP_NAME: RefCell<String> = const { RefCell::new(String::new()) };
  static BUTTON_CREATED: OnceCell<u32> = const { OnceCell::new() };
}

pub fn set_app_name(name: &str) {
  APP_NAME.with(|n| {
    if n.borrow().as_str() != name {
      *n.borrow_mut() = name.to_string();
    }
  });
}

pub fn app_name() -> String {
  APP_NAME.with(|n| n.borrow().clone())
}

/// The shell's windows (dock.rs).
pub fn hwnds() -> Vec<HWND> {
  WINDOWS.with(|w| w.borrow().iter().map(|(_, hwnd)| *hwnd).collect())
}

fn window_id(hwnd: HWND) -> Option<u32> {
  WINDOWS.with(|w| w.borrow().iter().find(|(_, h)| *h == hwnd).map(|(id, _)| *id))
}

/// "TaskbarButtonCreated", sent to a window when its taskbar button appears (dock.rs applies the
/// badge and progress then: before, the calls fail).
fn button_created() -> u32 {
  BUTTON_CREATED.with(|m| *m.get_or_init(|| unsafe { RegisterWindowMessageW(w!("TaskbarButtonCreated")) }))
}

// ───────────────────────── building ─────────────────────────

/// The item's text: & would underline the next letter, and the key follows a tab.
fn text(label: &str, accel: Option<&crate::accelerator::Accelerator>) -> HSTRING {
  let mut s = label.replace('&', "&&");
  if let Some(a) = accel {
    s.push('\t');
    s.push_str(&a.win_label());
  }
  HSTRING::from(s)
}

fn append(menu: HMENU, nodes: &[Node]) -> Result<(), String> {
  let fail = |e: windows::core::Error| format!("INTERNAL: cannot build the menu: {e}");
  for node in nodes {
    unsafe {
      match node {
        Node::Separator => AppendMenuW(menu, MF_SEPARATOR, 0, None).map_err(fail)?,
        Node::Submenu { label, children, .. } => {
          let sub = CreatePopupMenu().map_err(fail)?;
          append(sub, children)?;
          AppendMenuW(menu, MF_POPUP | MF_STRING, sub.0 as usize, &text(label, None)).map_err(fail)?;
        }
        Node::Command(c) => {
          let mut flags = MF_STRING;
          if !c.enabled {
            flags |= MF_GRAYED;
          }
          if c.checked() == Some(true) {
            flags |= MF_CHECKED;
          }
          AppendMenuW(menu, flags, c.index + 1, &text(&c.label, c.accelerator.as_ref())).map_err(fail)?;
        }
      }
    }
  }
  Ok(())
}

/// A context or tray menu.
pub fn build_popup(tree: &Tree) -> Result<HMENU, String> {
  let menu = unsafe { CreatePopupMenu() }.map_err(|e| format!("INTERNAL: cannot build the menu: {e}"))?;
  if let Err(e) = append(menu, &tree.nodes) {
    unsafe {
      let _ = DestroyMenu(menu);
    }
    return Err(e);
  }
  Ok(menu)
}

fn build_bar(tree: &Tree) -> Result<HMENU, String> {
  let bar = unsafe { CreateMenu() }.map_err(|e| format!("INTERNAL: cannot build the menu: {e}"))?;
  if let Err(e) = append(bar, &tree.nodes) {
    unsafe {
      let _ = DestroyMenu(bar);
    }
    return Err(e);
  }
  Ok(bar)
}

fn keys(tree: &Tree) -> Vec<Key> {
  let mut keys = Vec::new();
  for c in tree.commands() {
    let Some(a) = c.key() else { continue };
    match (a.win_vk(), a.win_accel_flags(), u16::try_from(c.index + 1)) {
      (Some(vk), Some(flags), Ok(cmd)) => keys.push(Key { vk, flags, cmd }),
      // The Windows key cannot be in an accelerator table: the item shows it, it does not fire.
      _ => log!("menu: {} has no Windows accelerator", a.canonical()),
    }
  }
  keys
}

/// Puts `bar` on the window (None: no menu bar) and destroys the one it had.
fn put(hwnd: HWND, bar: Option<HMENU>) {
  unsafe {
    let old = GetMenu(hwnd);
    let _ = SetMenu(hwnd, bar);
    let _ = DrawMenuBar(hwnd);
    if !old.is_invalid() {
      let _ = DestroyMenu(old);
    }
  }
}

fn set_app(tree: Option<Tree>) -> Result<(), String> {
  if tree.as_ref().is_some_and(|t| t.commands().len() >= u16::MAX as usize) {
    return Err("the app menu has more than 65534 items".into());
  }
  let hwnds = hwnds();
  for hwnd in &hwnds {
    let bar = tree.as_ref().map(build_bar).transpose()?;
    put(*hwnd, bar);
  }
  let app = tree.map(|tree| {
    let keys = keys(&tree);
    let accels: Vec<ACCEL> = keys.iter().map(|k| ACCEL { fVirt: ACCEL_VIRT_FLAGS(k.flags), key: k.vk, cmd: k.cmd }).collect();
    let accel = if accels.is_empty() { None } else { unsafe { CreateAcceleratorTableW(&accels) }.ok() };
    AppMenu { tree, keys, accel }
  });
  let old = APP.with(|a| std::mem::replace(&mut *a.borrow_mut(), app));
  if let Some(accel) = old.and_then(|m| m.accel) {
    unsafe {
      let _ = DestroyAcceleratorTable(accel);
    }
  }
  Ok(())
}

// ───────────────────────── windows ─────────────────────────

/// lib.rs open_window (through mod.rs), for every window.
pub fn window_opened(id: u32, window: &tao::window::Window, webview: &wry::WebView) {
  let hwnd = HWND(window.hwnd() as *mut _);
  unsafe {
    let _ = SetWindowSubclass(hwnd, Some(subclass), SUBCLASS_ID, 0);
  }
  let _ = button_created();
  WINDOWS.with(|w| w.borrow_mut().push((id, hwnd)));
  let bar = APP.with(|a| a.borrow().as_ref().map(|m| build_bar(&m.tree)));
  match bar {
    Some(Ok(bar)) => put(hwnd, Some(bar)),
    Some(Err(e)) => log!("window {id}: {e}"),
    None => {}
  }
  watch_keys(hwnd, webview);
}

unsafe extern "system" fn subclass(hwnd: HWND, msg: u32, wparam: WPARAM, lparam: LPARAM, _id: usize, _data: usize) -> LRESULT {
  match msg {
    // From the menu (HIWORD 0) or an accelerator (HIWORD 1); controls send their HWND in lParam.
    WM_COMMAND if lparam.0 == 0 && (wparam.0 >> 16) & 0xFFFF <= 1 => {
      let cmd = (wparam.0 & 0xFFFF) as u16;
      if cmd > 0 && command(Some(hwnd), cmd as usize - 1) {
        return LRESULT(0);
      }
    }
    WM_NCDESTROY => {
      WINDOWS.with(|w| w.borrow_mut().retain(|(_, h)| *h != hwnd));
      let _ = RemoveWindowSubclass(hwnd, Some(subclass), SUBCLASS_ID);
    }
    _ if msg == button_created() => super::dock::button_created(hwnd),
    _ => {}
  }
  DefSubclassProc(hwnd, msg, wparam, lparam)
}

/// An app menu command, from window `hwnd` (None: menu.trigger without a window). false: not one.
fn command(hwnd: Option<HWND>, index: usize) -> bool {
  let clicked = APP.with(|a| a.borrow_mut().as_mut().map(|m| m.tree.click(index, &Source::App)));
  match clicked {
    None => false,
    Some(Clicked::Item { checked: Some(on) }) => {
      let cmd = (index + 1) as u32;
      for hwnd in hwnds() {
        unsafe { CheckMenuItem(GetMenu(hwnd), cmd, (MF_BYCOMMAND | if on { MF_CHECKED } else { MF_UNCHECKED }).0) };
      }
      true
    }
    Some(Clicked::Role(role)) => {
      perform(role, hwnd.and_then(window_id), hwnd, false);
      true
    }
    Some(_) => true,
  }
}

/// A standard item. `window`: the menu's window (None: the most recently focused one); `owner`:
/// the About box's parent; `tray`: a tray menu, where editing roles have no page.
pub fn perform(role: Role, window: Option<u32>, owner: Option<HWND>, tray: bool) {
  match role {
    Role::Quit => chrome::request_quit(),
    Role::About => {
      let name = app_name();
      unsafe { MessageBoxW(owner, &HSTRING::from(name.as_str()), &HSTRING::from(format!("About {name}")), MB_OK | MB_ICONINFORMATION) };
    }
    r if r.is_window_role() => chrome::defer_window_role(r, window),
    r => {
      if let (Some(edit), false) = (r.edit(), tray) {
        send_keys(edit);
      }
    }
  }
}

fn key(vk: VIRTUAL_KEY, up: bool) -> INPUT {
  INPUT {
    r#type: INPUT_KEYBOARD,
    Anonymous: INPUT_0 { ki: KEYBDINPUT { wVk: vk, wScan: 0, dwFlags: if up { KEYEVENTF_KEYUP } else { KEYBD_EVENT_FLAGS(0) }, time: 0, dwExtraInfo: 0 } },
  }
}

/// The page's editing command as its keys, to the focused page.
fn send_keys(edit: Edit) {
  let (vk, ctrl, shift) = match edit {
    Edit::Undo => (VIRTUAL_KEY(b'Z' as u16), true, false),
    Edit::Redo => (VIRTUAL_KEY(b'Y' as u16), true, false),
    Edit::Cut => (VIRTUAL_KEY(b'X' as u16), true, false),
    Edit::Copy => (VIRTUAL_KEY(b'C' as u16), true, false),
    Edit::Paste => (VIRTUAL_KEY(b'V' as u16), true, false),
    Edit::PastePlain => (VIRTUAL_KEY(b'V' as u16), true, true),
    Edit::Delete => (VK_DELETE, false, false),
    Edit::SelectAll => (VIRTUAL_KEY(b'A' as u16), true, false),
  };
  let mut inputs = Vec::new();
  let mods: Vec<VIRTUAL_KEY> = [(ctrl, VK_CONTROL), (shift, VK_SHIFT)].iter().filter(|(on, _)| *on).map(|(_, k)| *k).collect();
  inputs.extend(mods.iter().map(|k| key(*k, false)));
  inputs.push(key(vk, false));
  inputs.push(key(vk, true));
  inputs.extend(mods.iter().rev().map(|k| key(*k, true)));
  unsafe { SendInput(&inputs, std::mem::size_of::<INPUT>() as i32) };
}

/// `menu.windowRole` (chrome.rs defer_window_role): close asks the window as its close button does.
pub fn window_role(cmd: &V, window: &tao::window::Window) -> Result<String, String> {
  let hwnd = HWND(window.hwnd() as *mut _);
  chrome::window_role(cmd, window, || unsafe {
    let _ = PostMessageW(Some(hwnd), WM_CLOSE, WPARAM(0), LPARAM(0));
  })
}

// ───────────────────────── accelerators ─────────────────────────

fn down(vk: VIRTUAL_KEY) -> bool {
  unsafe { GetKeyState(vk.0 as i32) < 0 }
}

/// The enabled app menu command for this key with the modifiers held now.
fn accelerator_for(vk: u16) -> Option<u16> {
  if down(VK_LWIN) || down(VK_RWIN) {
    return None;
  }
  let flags = 1 | (if down(VK_SHIFT) { 4 } else { 0 }) | (if down(VK_CONTROL) { 8 } else { 0 }) | (if down(VK_MENU) { 0x10 } else { 0 });
  APP.with(|a| {
    let app = a.borrow();
    let app = app.as_ref()?;
    let key = app.keys.iter().find(|k| k.vk == vk && k.flags == flags)?;
    app.tree.command(key.cmd as usize - 1).filter(|c| c.enabled).map(|_| key.cmd)
  })
}

/// Menu accelerators while the page has the focus: WebView2's AcceleratorKeyPressed.
fn watch_keys(hwnd: HWND, webview: &wry::WebView) {
  use webview2_com::AcceleratorKeyPressedEventHandler;
  use webview2_com::Microsoft::Web::WebView2::Win32::{COREWEBVIEW2_KEY_EVENT_KIND, COREWEBVIEW2_KEY_EVENT_KIND_KEY_DOWN, COREWEBVIEW2_KEY_EVENT_KIND_SYSTEM_KEY_DOWN};
  use wry::WebViewExtWindows;
  // The handler runs on this thread (the controller's); the window as a number.
  let raw = hwnd.0 as isize;
  let handler = AcceleratorKeyPressedEventHandler::create(Box::new(move |_, args| {
    let Some(args) = args else { return Ok(()) };
    unsafe {
      let mut kind = COREWEBVIEW2_KEY_EVENT_KIND::default();
      args.KeyEventKind(&mut kind)?;
      if kind != COREWEBVIEW2_KEY_EVENT_KIND_KEY_DOWN && kind != COREWEBVIEW2_KEY_EVENT_KIND_SYSTEM_KEY_DOWN {
        return Ok(());
      }
      let mut vk = 0u32;
      args.VirtualKey(&mut vk)?;
      if let Some(cmd) = u16::try_from(vk).ok().and_then(accelerator_for) {
        args.SetHandled(true)?;
        // Posted: the handler runs inside WebView2's input call.
        let _ = PostMessageW(Some(HWND(raw as *mut _)), WM_COMMAND, WPARAM((1 << 16) | cmd as usize), LPARAM(0));
      }
    }
    Ok(())
  }));
  let result = unsafe {
    let mut token = 0;
    webview.controller().add_AcceleratorKeyPressed(&handler, &mut token)
  };
  if let Err(e) = result {
    log!("menu accelerators while the page has the focus: {e}");
  }
}

/// The msg hook: accelerators while a window of the app itself has the focus.
pub fn translate(msg: *const MSG) -> bool {
  let msg = unsafe { &*msg };
  if msg.message != WM_KEYDOWN && msg.message != WM_SYSKEYDOWN {
    return false;
  }
  let Some(accel) = APP.with(|a| a.borrow().as_ref().and_then(|m| m.accel)) else { return false };
  let root = unsafe { GetAncestor(msg.hwnd, GA_ROOT) };
  if window_id(root).is_none() {
    return false;
  }
  // Sends WM_COMMAND to the subclass now; APP is not borrowed.
  unsafe { TranslateAcceleratorW(root, accel, msg) != 0 }
}

// ───────────────────────── popups ─────────────────────────

unsafe extern "system" fn end_menu(hwnd: HWND, _msg: u32, id: usize, _time: u32) {
  let _ = KillTimer(Some(hwnd), id);
  let _ = EndMenu();
}

pub fn cursor() -> POINT {
  let mut p = POINT::default();
  unsafe {
    let _ = GetCursorPos(&mut p);
  }
  p
}

/// Shows `menu` at `at` (screen pixels) and destroys it. Returns the chosen command's index.
pub fn track(menu: HMENU, owner: HWND, at: POINT, close_after_ms: Option<f64>) -> Option<usize> {
  unsafe {
    let _ = SetForegroundWindow(owner);
    if let Some(ms) = close_after_ms {
      SetTimer(Some(owner), CLOSE_TIMER, ms.min(u32::MAX as f64) as u32, Some(end_menu));
    }
    let cmd = TrackPopupMenuEx(menu, (TPM_RETURNCMD | TPM_RIGHTBUTTON).0, at.x, at.y, owner, None).0;
    if close_after_ms.is_some() {
      let _ = KillTimer(Some(owner), CLOSE_TIMER);
    }
    let _ = PostMessageW(Some(owner), WM_NULL, WPARAM(0), LPARAM(0));
    let _ = DestroyMenu(menu);
    (cmd > 0).then(|| cmd as usize - 1)
  }
}

/// menu.popup { items, x?, y?, closeAfterMs? } over window `id`: returns when the menu closes,
/// after the chosen item's click event.
pub fn popup(cmd: &V, id: u32, win: &crate::Win) -> Result<String, String> {
  let mut tree = chrome::parse(cmd.get("items").ok_or("items is required")?, &app_name())?;
  let at = match (cmd.get("x").and_then(|v| v.as_f64()), cmd.get("y").and_then(|v| v.as_f64())) {
    (Some(x), Some(y)) if x.is_finite() && y.is_finite() => Some((x, y)),
    (None, None) => None,
    _ => return Err("give both x and y (CSS px), or neither for the mouse position".into()),
  };
  let close_after = cmd.get("closeAfterMs").and_then(|v| v.as_f64()).filter(|ms| ms.is_finite() && *ms >= 0.0);
  let hwnd = HWND(win.window.hwnd() as *mut _);
  let point = match at {
    // CSS px from the page's top-left, which is the client area's (wry sizes the webview to it).
    Some((x, y)) => {
      let scale = win.window.scale_factor();
      let mut p = POINT { x: (x * scale).round() as i32, y: (y * scale).round() as i32 };
      unsafe {
        let _ = ClientToScreen(hwnd, &mut p);
      }
      p
    }
    None => cursor(),
  };
  let menu = build_popup(&tree)?;
  if let Some(index) = track(menu, hwnd, point, close_after) {
    if let Clicked::Role(role) = tree.click(index, &Source::Context(id)) {
      perform(role, Some(id), Some(hwnd), false);
    }
  }
  Ok("null".into())
}

// ───────────────────────── ops ─────────────────────────

/// menu.* shell ops that need no window; None for other ops (menu.popup, menu.windowRole: mod.rs window_op).
pub fn shell_op(op: &str, cmd: &V, app_name: &str) -> Option<Result<String, String>> {
  if !op.starts_with("menu.") {
    return None;
  }
  set_app_name(app_name);
  let result = match op {
    "menu.setApp" => cmd
      .get("items")
      .ok_or_else(|| "items is required".to_string())
      .and_then(|items| chrome::parse_app_menu(items, app_name))
      .and_then(|tree| set_app(Some(tree)))
      .map(|()| "null".to_string()),
    "menu.reset" => set_app(None).map(|()| "null".into()),
    "menu.get" => Ok(APP.with(|a| a.borrow().as_ref().map_or_else(|| "[]".to_string(), |m| m.tree.to_json()))),
    "menu.trigger" => match cmd.get("id").and_then(|v| v.as_str()) {
      Some(id) => {
        let index = APP.with(|a| a.borrow().as_ref().and_then(|m| m.tree.find(id)));
        match index {
          // As if chosen in the most recently opened window.
          Some(index) => {
            command(WINDOWS.with(|w| w.borrow().last().map(|(_, h)| *h)), index);
            Ok("null".into())
          }
          None => Err(format!("no menu item {id:?}")),
        }
      }
      None => Err("id must be a string".into()),
    },
    _ => return None,
  };
  Some(result)
}
