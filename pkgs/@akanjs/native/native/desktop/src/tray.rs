//! Tray icons on macOS (tray plugin, plugins.md §5): NSStatusItem in the system status bar.
//!
//! Know-how from the references (electrobun nativeWrapper.mm createTray/StatusItemTarget, Tauri's
//! tray API docs in tauri/crates/tauri/src/tray/mod.rs):
//! - The button sends its action on left and right mouse-up (sendActionOn), so both are clicks.
//! - A status item with a menu set opens the menu on every click and never sends the action. To
//!   keep click events and still show the menu, the menu is set only while the click opens it
//!   (setMenu → performClick → setMenu(nil)).
//! - Icons are sized to the 18 pt status bar height; template images follow the menu bar's
//!   light/dark appearance.
//!
//! Events: `click { tray, button }` for every left and right click; then, if the tray has a menu,
//! a right click opens it, and so does a left click unless menuOnLeftClick is false. Menu items
//! push `menuClick { tray, item }` (menu.rs Source::Tray).

use std::{
  cell::{Cell, OnceCell, RefCell},
  collections::HashMap,
  path::{Path, PathBuf},
};

use objc2::{
  define_class, msg_send,
  rc::Retained,
  runtime::{NSObject, NSObjectProtocol},
  sel, AllocAnyThread, MainThreadMarker, MainThreadOnly,
};
use objc2_app_kit::{
  NSApplication, NSEventMask, NSEventModifierFlags, NSEventType, NSImage, NSMenu, NSStatusBar, NSStatusBarButton, NSStatusItem,
  NSUserInterfaceItemIdentification, NSVariableStatusItemLength,
};
use objc2_foundation::{NSData, NSSize, NSString};

use crate::{
  json::{self, V},
  menu, push_event,
  routes::{route, Route},
};

/// Status bar icon height in points.
const ICON_HEIGHT: f64 = 18.0;

struct Tray {
  item: Retained<NSStatusItem>,
  menu: Option<Retained<NSMenu>>,
  menu_on_left_click: bool,
}

thread_local! {
  static TRAYS: RefCell<HashMap<String, Tray>> = RefCell::new(HashMap::new());
  static TARGET: OnceCell<Retained<TrayTarget>> = const { OnceCell::new() };
  /// tray.trigger: the button a synthetic click reports (performClick has no mouse event). A
  /// synthetic click does not open the tray's menu.
  static FORCED_BUTTON: Cell<Option<&'static str>> = const { Cell::new(None) };
}

define_class!(
  // SAFETY: NSObject has no subclassing requirements; TrayTarget has no Drop.
  #[unsafe(super(NSObject))]
  #[thread_kind = MainThreadOnly]
  #[name = "AkanNativeTrayTarget"]
  struct TrayTarget;

  impl TrayTarget {
    #[unsafe(method(akanNativeTrayClicked:))]
    fn clicked(&self, sender: &NSStatusBarButton) {
      let Some(id) = sender.identifier().map(|i| i.to_string()) else { return };
      let forced = FORCED_BUTTON.with(|f| f.take());
      let button = forced.unwrap_or_else(|| {
        let event = NSApplication::sharedApplication(self.mtm()).currentEvent();
        let right = event.is_some_and(|e| {
          matches!(e.r#type(), NSEventType::RightMouseUp | NSEventType::RightMouseDown) || e.modifierFlags().contains(NSEventModifierFlags::Control)
        });
        if right { "right" } else { "left" }
      });
      push_event(&format!(r#"{{"type":"tray","event":"click","tray":{},"button":"{button}"}}"#, json::quote(&id)));
      if forced.is_some() {
        return; // tray.trigger: no menu, nobody could close it
      }
      // Take what the menu needs, then release the registry: the menu runs a nested loop.
      let open = TRAYS.with(|t| {
        let trays = t.borrow();
        let tray = trays.get(&id)?;
        let menu = tray.menu.clone()?;
        (button == "right" || tray.menu_on_left_click).then(|| (tray.item.clone(), menu))
      });
      if let Some((item, menu)) = open {
        item.setMenu(Some(&menu));
        unsafe { sender.performClick(None) };
        item.setMenu(None);
      }
    }
  }

  unsafe impl NSObjectProtocol for TrayTarget {}
);

impl TrayTarget {
  fn new(mtm: MainThreadMarker) -> Retained<Self> {
    let this = Self::alloc(mtm).set_ivars(());
    unsafe { msg_send![super(this), init] }
  }
}

fn mtm() -> Result<MainThreadMarker, String> {
  MainThreadMarker::new().ok_or_else(|| "trays are built on the main thread".to_string())
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

/// An app path ("/tray.png", a public/ asset) or a FileRef URL ("/__akan_native/file/<id>") → a file.
pub fn resolve_app_file(app_dir: &Path, path: &str) -> Result<PathBuf, String> {
  let exists = |rel: &str| app_dir.join(rel).is_file();
  match route(path, exists) {
    Route::File(id) => crate::FILES.lock().unwrap().get(&id).map(|(p, _)| p.clone()).ok_or_else(|| format!("no file {path}")),
    // The SPA fallback answers any path without an extension with index.html: not an icon.
    Route::Asset(rel) if rel != "index.html" || path.trim_start_matches('/') == "index.html" => Ok(app_dir.join(rel)),
    _ => Err(format!("{path} is not a file of the app (a public/ asset path or a /__akan_native/file URL)")),
  }
}

fn image(app_dir: &Path, path: &str, template: bool) -> Result<Retained<NSImage>, String> {
  let file = resolve_app_file(app_dir, path)?;
  let bytes = std::fs::read(&file).map_err(|e| format!("cannot read {path}: {e}"))?;
  let data = NSData::with_bytes(&bytes);
  let image = NSImage::initWithData(NSImage::alloc(), &data).ok_or_else(|| format!("{path} is not an image"))?;
  let size = image.size();
  if size.height > 0.0 {
    image.setSize(NSSize::new(size.width * ICON_HEIGHT / size.height, ICON_HEIGHT));
  }
  image.setTemplate(template);
  Ok(image)
}

fn button(item: &NSStatusItem, mtm: MainThreadMarker) -> Result<Retained<NSStatusBarButton>, String> {
  item.button(mtm).ok_or_else(|| "the status item has no button".to_string())
}

fn apply(tray: &mut Tray, cmd: &V, app_dir: &Path, mtm: MainThreadMarker, id: &str) -> Result<(), String> {
  let button = button(&tray.item, mtm)?;
  if cmd.get("icon").is_some() {
    match string(cmd, "icon")? {
      Some(path) => {
        let image = image(app_dir, path, flag(cmd, "iconAsTemplate")?.unwrap_or(false))?;
        button.setImage(Some(&image));
      }
      None => button.setImage(None),
    }
  } else if let Some(template) = flag(cmd, "iconAsTemplate")? {
    if let Some(image) = button.image() {
      image.setTemplate(template);
    }
  }
  if cmd.get("title").is_some() {
    button.setTitle(&NSString::from_str(string(cmd, "title")?.unwrap_or("")));
  }
  if cmd.get("tooltip").is_some() {
    button.setToolTip(string(cmd, "tooltip")?.map(NSString::from_str).as_deref());
  }
  match cmd.get("menu") {
    None => {}
    Some(V::Null) => tray.menu = None,
    Some(items) => tray.menu = Some(menu::build(items, &menu::Source::Tray(id.to_string()))?),
  }
  if let Some(v) = flag(cmd, "menuOnLeftClick")? {
    tray.menu_on_left_click = v;
  }
  Ok(())
}

fn tray_json(id: &str, tray: &Tray, mtm: MainThreadMarker) -> String {
  let button = tray.item.button(mtm);
  let title = button.as_ref().map(|b| b.title().to_string()).unwrap_or_default();
  let tooltip = button.as_ref().and_then(|b| b.toolTip()).map(|t| json::quote(&t.to_string())).unwrap_or_else(|| "null".into());
  let image = button.as_ref().and_then(|b| b.image());
  format!(
    r#"{{"id":{},"title":{},"tooltip":{tooltip},"icon":{},"iconAsTemplate":{},"menu":{},"menuOnLeftClick":{}}}"#,
    json::quote(id),
    json::quote(&title),
    image.is_some(),
    image.is_some_and(|i| i.isTemplate()),
    tray.menu.is_some(),
    tray.menu_on_left_click
  )
}

/// tray.* shell ops; None for other ops.
pub fn shell_op(op: &str, cmd: &V, app_dir: &Path) -> Option<Result<String, String>> {
  if !op.starts_with("tray.") {
    return None;
  }
  Some(run(op, cmd, app_dir))
}

fn run(op: &str, cmd: &V, app_dir: &Path) -> Result<String, String> {
  let mtm = mtm()?;
  if op == "tray.list" {
    return TRAYS.with(|t| {
      let trays = t.borrow();
      let mut ids: Vec<&String> = trays.keys().collect();
      ids.sort();
      Ok(format!("[{}]", ids.iter().map(|id| tray_json(id, &trays[*id], mtm)).collect::<Vec<_>>().join(",")))
    });
  }
  let id = string(cmd, "id")?.filter(|s| !s.is_empty()).ok_or("id is required")?.to_string();
  match op {
    "tray.create" => {
      let fresh = TRAYS.with(|t| !t.borrow().contains_key(&id));
      if fresh {
        // A tray with neither icon nor title would take no space and could not be clicked.
        if string(cmd, "icon")?.is_none() && string(cmd, "title")?.is_none_or(str::is_empty) {
          return Err("a tray needs an icon or a title".into());
        }
        let item = NSStatusBar::systemStatusBar().statusItemWithLength(NSVariableStatusItemLength);
        let button = button(&item, mtm)?;
        let target = TARGET.with(|t| t.get_or_init(|| TrayTarget::new(mtm)).clone());
        unsafe {
          button.setTarget(Some(&target));
          button.setAction(Some(sel!(akanNativeTrayClicked:)));
        }
        button.sendActionOn(NSEventMask::LeftMouseUp | NSEventMask::RightMouseUp);
        button.setIdentifier(Some(&NSString::from_str(&id)));
        let mut tray = Tray { item, menu: None, menu_on_left_click: true };
        if let Err(e) = apply(&mut tray, cmd, app_dir, mtm, &id) {
          NSStatusBar::systemStatusBar().removeStatusItem(&tray.item);
          return Err(e);
        }
        let json = tray_json(&id, &tray, mtm);
        TRAYS.with(|t| t.borrow_mut().insert(id, tray));
        return Ok(json);
      }
      // Creating an existing id updates it (a reloaded page creates its tray again).
      update(&id, cmd, app_dir, mtm)
    }
    "tray.update" => update(&id, cmd, app_dir, mtm),
    "tray.remove" => {
      if let Some(tray) = TRAYS.with(|t| t.borrow_mut().remove(&id)) {
        NSStatusBar::systemStatusBar().removeStatusItem(&tray.item);
      }
      Ok("null".into())
    }
    "tray.trigger" => {
      let item = TRAYS.with(|t| t.borrow().get(&id).map(|tray| tray.item.clone())).ok_or_else(|| format!("no tray {id}"))?;
      let which = match string(cmd, "button")? {
        None | Some("left") => "left",
        Some("right") => "right",
        Some(other) => return Err(format!("unknown button {other}")),
      };
      FORCED_BUTTON.with(|f| f.set(Some(which)));
      unsafe { button(&item, mtm)?.performClick(None) };
      FORCED_BUTTON.with(|f| f.set(None));
      Ok("null".into())
    }
    _ => Err(format!("unknown op {op}")),
  }
}

fn update(id: &str, cmd: &V, app_dir: &Path, mtm: MainThreadMarker) -> Result<String, String> {
  TRAYS.with(|t| {
    let mut trays = t.borrow_mut();
    let tray = trays.get_mut(id).ok_or_else(|| format!("no tray {id}"))?;
    apply(tray, cmd, app_dir, mtm, id)?;
    Ok(tray_json(id, tray, mtm))
  })
}
