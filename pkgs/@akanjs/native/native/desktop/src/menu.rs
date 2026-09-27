//! Menus on macOS: the app menu (D1 defaults and the menu plugin), context menus and tray menus
//! (plugins.md §5). Built from the JSON item trees the plugins send; AppKit through objc2-app-kit.
//!
//! Know-how from the references (muda's macOS backend as used by tauri/crates/tauri/src/menu,
//! electrobun/package/src/native/macos/nativeWrapper.mm createMenuFromConfig):
//! - The menu bar holds only submenus; the first one is the app menu and macOS shows the app's
//!   name as its title whatever it is called.
//! - Standard items ("roles") have no target: their action travels the responder chain, so
//!   Copy/Paste reach the focused WKWebView and AppKit enables them automatically. Without an
//!   Edit menu Cmd+C/V do nothing in WKWebView (wry/src/lib.rs:1389-1392).
//! - NSApp.windowsMenu gets the window list and "Bring All to Front"; NSApp.servicesMenu the
//!   Services items; NSApp.helpMenu the search field.
//! - Key equivalents: a lowercase character plus a modifier mask (accelerator.rs).
//!
//! Clicks: every clickable item carries the start of its event JSON as representedObject; the
//! shared target pushes it (plus `checked` for check items) as a native event.

use std::cell::{OnceCell, RefCell};

use objc2::{
  define_class, msg_send,
  rc::Retained,
  runtime::{AnyObject, NSObject, NSObjectProtocol, Sel},
  sel, AllocAnyThread, MainThreadMarker, MainThreadOnly, Message,
};
use objc2_app_kit::{
  NSApplication, NSControlStateValueOff, NSControlStateValueOn, NSEvent, NSEventModifierFlags, NSMenu, NSMenuItem,
  NSUserInterfaceItemIdentification, NSView,
};
use objc2_foundation::{NSDate, NSPoint, NSRunLoop, NSRunLoopCommonModes, NSString, NSTimer};

use crate::{accelerator, json::V, push_event};

/// Identifiers of the items akan-native builds without an id.
const SEPARATOR_ID: &str = "akan-native.separator";
const SUBMENU_ID: &str = "akan-native.submenu";

/// NSMenuItem tag bits. AKAN_NATIVE marks every item akan-native built: getAppMenu leaves out the items AppKit
/// adds by itself (Writing Tools, AutoFill, Dictation, Emoji & Symbols under a menu titled "Edit").
const CHECKABLE: isize = 1;
const DISABLED: isize = 2;
/// "OM" in the upper half: AppKit's own items use small tags (Dictation's collided with a single bit).
const AKAN_NATIVE: isize = 0x4F4D << 16;

fn is_akan_native(item: &NSMenuItem) -> bool {
  item.tag() >> 16 == AKAN_NATIVE >> 16
}

/// Who owns a menu; decides the event a click pushes.
#[derive(Clone)]
pub enum Source {
  App,
  /// A context menu of this window.
  Context(u32),
  /// The menu of this tray.
  Tray(String),
}

impl Source {
  /// The event JSON without its closing brace; the click handler finishes it.
  fn event_start(&self, id: &str) -> String {
    let id = crate::json::quote(id);
    match self {
      Source::App => format!(r#"{{"type":"menu","source":"app","id":{id}"#),
      Source::Context(window) => format!(r#"{{"type":"menu","source":"context","window":{window},"id":{id}"#),
      Source::Tray(tray) => format!(r#"{{"type":"tray","event":"menuClick","tray":{},"item":{id}"#, crate::json::quote(tray)),
    }
  }
}

define_class!(
  // SAFETY: NSObject has no subclassing requirements; MenuTarget has no Drop.
  #[unsafe(super(NSObject))]
  #[thread_kind = MainThreadOnly]
  #[name = "AkanNativeMenuTarget"]
  pub struct MenuTarget;

  impl MenuTarget {
    #[unsafe(method(akanNativeMenuAction:))]
    fn action(&self, sender: &NSMenuItem) {
      let Some(start) = sender.representedObject().and_then(|o| o.downcast::<NSString>().ok()) else { return };
      let mut json = start.to_string();
      if sender.tag() & CHECKABLE != 0 {
        let on = sender.state() != NSControlStateValueOn;
        sender.setState(if on { NSControlStateValueOn } else { NSControlStateValueOff });
        json.push_str(&format!(r#","checked":{on}"#));
      }
      json.push('}');
      push_event(&json);
    }

    /// Menus enable items automatically (autoenablesItems); ours follow the `enabled` flag.
    #[unsafe(method(validateMenuItem:))]
    fn validate(&self, item: &NSMenuItem) -> bool {
      item.tag() & DISABLED == 0
    }
  }

  unsafe impl NSObjectProtocol for MenuTarget {}
);

impl MenuTarget {
  fn new(mtm: MainThreadMarker) -> Retained<Self> {
    let this = Self::alloc(mtm).set_ivars(());
    unsafe { msg_send![super(this), init] }
  }
}

thread_local! {
  static TARGET: OnceCell<Retained<MenuTarget>> = const { OnceCell::new() };
  static APP_NAME: RefCell<String> = const { RefCell::new(String::new()) };
}

fn target(mtm: MainThreadMarker) -> Retained<MenuTarget> {
  TARGET.with(|t| t.get_or_init(|| MenuTarget::new(mtm)).clone())
}

fn app_name() -> String {
  APP_NAME.with(|n| n.borrow().clone())
}

fn mtm() -> Result<MainThreadMarker, String> {
  MainThreadMarker::new().ok_or_else(|| "menus are built on the main thread".to_string())
}

// ───────────────────────── roles ─────────────────────────

struct Role {
  name: &'static str,
  label: &'static str,
  action: Sel,
  /// Default accelerator.
  key: Option<&'static str>,
}

fn item_roles() -> [Role; 18] {
  let r = |name, label, action, key| Role { name, label, action, key };
  [
    r("about", "About {app}", sel!(orderFrontStandardAboutPanel:), None),
    r("hide", "Hide {app}", sel!(hide:), Some("Cmd+H")),
    r("hideOthers", "Hide Others", sel!(hideOtherApplications:), Some("Cmd+Alt+H")),
    r("showAll", "Show All", sel!(unhideAllApplications:), None),
    r("quit", "Quit {app}", sel!(terminate:), Some("Cmd+Q")),
    r("undo", "Undo", sel!(undo:), Some("Cmd+Z")),
    r("redo", "Redo", sel!(redo:), Some("Cmd+Shift+Z")),
    r("cut", "Cut", sel!(cut:), Some("Cmd+X")),
    r("copy", "Copy", sel!(copy:), Some("Cmd+C")),
    r("paste", "Paste", sel!(paste:), Some("Cmd+V")),
    r("pasteAndMatchStyle", "Paste and Match Style", sel!(pasteAsPlainText:), Some("Cmd+Alt+Shift+V")),
    r("delete", "Delete", sel!(delete:), None),
    r("selectAll", "Select All", sel!(selectAll:), Some("Cmd+A")),
    r("minimize", "Minimize", sel!(performMiniaturize:), Some("Cmd+M")),
    r("zoom", "Zoom", sel!(performZoom:), None),
    r("close", "Close", sel!(performClose:), Some("Cmd+W")),
    // AppKit retitles it "Enter/Exit Full Screen" by itself.
    r("toggleFullScreen", "Enter Full Screen", sel!(toggleFullScreen:), Some("Cmd+Ctrl+F")),
    r("bringAllToFront", "Bring All to Front", sel!(arrangeInFront:), None),
  ]
}

/// Submenu roles: standard submenus, optionally with the app's own label or items.
const SUBMENU_ROLES: [&str; 5] = ["appMenu", "editMenu", "windowMenu", "helpMenu", "services"];

fn role_items(role: &str) -> Vec<&'static str> {
  match role {
    "appMenu" => vec!["about", "-", "services", "-", "hide", "hideOthers", "showAll", "-", "quit"],
    "editMenu" => vec!["undo", "redo", "-", "cut", "copy", "paste", "pasteAndMatchStyle", "delete", "selectAll"],
    "windowMenu" => vec!["minimize", "zoom", "close", "toggleFullScreen"],
    _ => vec![],
  }
}

fn role_title(role: &str) -> &'static str {
  match role {
    "editMenu" => "Edit",
    "windowMenu" => "Window",
    "helpMenu" => "Help",
    "services" => "Services",
    _ => "",
  }
}

// ───────────────────────── building ─────────────────────────

fn string(v: &V, key: &str) -> Result<Option<String>, String> {
  match v.get(key) {
    None | Some(V::Null) => Ok(None),
    Some(V::Str(s)) => Ok(Some(s.clone())),
    Some(_) => Err(format!("menu item {key} must be a string")),
  }
}

fn flag(v: &V, key: &str) -> Result<Option<bool>, String> {
  match v.get(key) {
    None | Some(V::Null) => Ok(None),
    Some(V::Bool(b)) => Ok(Some(*b)),
    Some(_) => Err(format!("menu item {key} must be a boolean")),
  }
}

fn items_of(v: &V) -> Result<&[V], String> {
  match v {
    V::Arr(items) => Ok(items),
    _ => Err("menu items must be an array".into()),
  }
}

fn new_item(mtm: MainThreadMarker, title: &str, action: Option<Sel>, accel: Option<&accelerator::Accelerator>) -> Retained<NSMenuItem> {
  let key = accel.map(|a| a.key_equivalent()).unwrap_or_default();
  let item = unsafe { NSMenuItem::initWithTitle_action_keyEquivalent(NSMenuItem::alloc(mtm), &NSString::from_str(title), action, &NSString::from_str(&key)) };
  if let Some(a) = accel {
    item.setKeyEquivalentModifierMask(NSEventModifierFlags(a.ns_modifiers()));
  }
  item.setTag(AKAN_NATIVE);
  item
}

fn separator(mtm: MainThreadMarker) -> Retained<NSMenuItem> {
  let item = NSMenuItem::separatorItem(mtm);
  item.setIdentifier(Some(&NSString::from_str(SEPARATOR_ID)));
  item.setTag(AKAN_NATIVE);
  item
}

fn role_item(mtm: MainThreadMarker, name: &str, label: Option<&str>, accel: Option<&str>) -> Result<Retained<NSMenuItem>, String> {
  let roles = item_roles();
  let role = roles.iter().find(|r| r.name == name).ok_or_else(|| format!("unknown menu role {name:?}"))?;
  let title = label.map(str::to_string).unwrap_or_else(|| role.label.replace("{app}", &app_name()));
  let accel = accel.or(role.key).map(accelerator::parse).transpose()?;
  let item = new_item(mtm, &title, Some(role.action), accel.as_ref());
  item.setIdentifier(Some(&NSString::from_str(&format!("role:{name}"))));
  Ok(item)
}

fn build_items(mtm: MainThreadMarker, menu: &NSMenu, items: &[V], source: &Source) -> Result<(), String> {
  for v in items {
    let item = build_item(mtm, v, source)?;
    menu.addItem(&item);
  }
  Ok(())
}

fn build_item(mtm: MainThreadMarker, v: &V, source: &Source) -> Result<Retained<NSMenuItem>, String> {
  if !matches!(v, V::Obj(_)) {
    return Err("each menu item must be an object".into());
  }
  if string(v, "type")?.as_deref() == Some("separator") {
    return Ok(separator(mtm));
  }
  let label = string(v, "label")?;
  let accel = string(v, "accelerator")?;
  let role = string(v, "role")?;
  let submenu = v.get("submenu").map(items_of).transpose()?;

  if let Some(role) = role.as_deref() {
    if SUBMENU_ROLES.contains(&role) {
      return submenu_role(mtm, role, label.as_deref(), submenu, source);
    }
    if submenu.is_some() {
      return Err(format!("role {role:?} has no submenu"));
    }
    return role_item(mtm, role, label.as_deref(), accel.as_deref());
  }

  let label = label.ok_or("menu items need a label (or a role, or type: \"separator\")")?;
  if let Some(children) = submenu {
    let item = new_item(mtm, &label, None, None);
    let sub = NSMenu::initWithTitle(NSMenu::alloc(mtm), &NSString::from_str(&label));
    build_items(mtm, &sub, children, source)?;
    item.setSubmenu(Some(&sub));
    item.setIdentifier(Some(&NSString::from_str(SUBMENU_ID)));
    return Ok(item);
  }
  let id = string(v, "id")?.ok_or_else(|| format!("menu item {label:?} needs an id"))?;
  let accel = accel.as_deref().map(accelerator::parse).transpose()?;
  let item = new_item(mtm, &label, Some(sel!(akanNativeMenuAction:)), accel.as_ref());
  let target = target(mtm);
  let start = NSString::from_str(&source.event_start(&id));
  let object: &AnyObject = &start;
  unsafe {
    item.setTarget(Some(&target));
    item.setRepresentedObject(Some(object));
  }
  item.setIdentifier(Some(&NSString::from_str(&id)));
  let mut tag = AKAN_NATIVE;
  if let Some(checked) = flag(v, "checked")? {
    tag |= CHECKABLE;
    item.setState(if checked { NSControlStateValueOn } else { NSControlStateValueOff });
  }
  if flag(v, "enabled")? == Some(false) {
    tag |= DISABLED;
    item.setEnabled(false);
  }
  item.setTag(tag);
  Ok(item)
}

/// appMenu/editMenu/windowMenu: the standard items unless `submenu` gives others;
/// helpMenu/services: a submenu AppKit fills in (help search, Services).
fn submenu_role(mtm: MainThreadMarker, role: &str, label: Option<&str>, children: Option<&[V]>, source: &Source) -> Result<Retained<NSMenuItem>, String> {
  let title = label.unwrap_or(role_title(role));
  let item = new_item(mtm, title, None, None);
  let sub = NSMenu::initWithTitle(NSMenu::alloc(mtm), &NSString::from_str(title));
  match children {
    Some(children) => build_items(mtm, &sub, children, source)?,
    None => {
      for name in role_items(role) {
        if name == "-" {
          sub.addItem(&separator(mtm));
        } else if name == "services" {
          let services = submenu_role(mtm, "services", None, None, source)?;
          sub.addItem(&services);
        } else {
          let item = role_item(mtm, name, None, None)?;
          sub.addItem(&item);
        }
      }
    }
  }
  item.setSubmenu(Some(&sub));
  item.setIdentifier(Some(&NSString::from_str(&format!("role:{role}"))));
  let app = NSApplication::sharedApplication(mtm);
  match role {
    "windowMenu" => app.setWindowsMenu(Some(&sub)),
    "helpMenu" => app.setHelpMenu(Some(&sub)),
    "services" => app.setServicesMenu(Some(&sub)),
    _ => {}
  }
  Ok(item)
}

/// Builds a standalone menu (context or tray).
pub fn build(items: &V, source: &Source) -> Result<Retained<NSMenu>, String> {
  let mtm = mtm()?;
  let menu = NSMenu::new(mtm);
  build_items(mtm, &menu, items_of(items)?, source)?;
  Ok(menu)
}

// ───────────────────────── app menu ─────────────────────────

/// D1: App (About, Services, Hide, Quit) + Edit + Window, the same set as Tauri's default menu.
pub fn install_default(name: &str) {
  APP_NAME.with(|n| *n.borrow_mut() = name.to_string());
  let defaults = V::Arr(["appMenu", "editMenu", "windowMenu"].iter().map(|r| V::Obj(vec![("role".into(), V::Str((*r).into()))])).collect());
  if let Err(e) = set_app_menu(&defaults) {
    eprintln!("[akan-native native] default menu: {e}");
  }
}

pub fn set_app_menu(items: &V) -> Result<(), String> {
  let mtm = mtm()?;
  let items = items_of(items)?;
  if items.is_empty() {
    return Err("the app menu needs at least one submenu".into());
  }
  let bar = NSMenu::new(mtm);
  for (i, v) in items.iter().enumerate() {
    let is_submenu = v.get("submenu").is_some() || string(v, "role")?.is_some_and(|r| SUBMENU_ROLES.contains(&r.as_str()));
    if !is_submenu {
      return Err(format!("app menu entry {i} must be a submenu: the macOS menu bar only holds submenus"));
    }
    let item = build_item(mtm, v, &Source::App)?;
    bar.addItem(&item);
  }
  NSApplication::sharedApplication(mtm).setMainMenu(Some(&bar));
  Ok(())
}

fn find(menu: &NSMenu, id: &str) -> Option<(Retained<NSMenu>, isize)> {
  for i in 0..menu.numberOfItems() {
    let Some(item) = menu.itemAtIndex(i) else { continue };
    if item.identifier().is_some_and(|x| x.to_string() == id) {
      return Some((menu.retain(), i));
    }
    if let Some(found) = item.submenu().and_then(|sub| find(&sub, id)) {
      return Some(found);
    }
  }
  None
}

/// Acts as if the user chose the item: for automated tests, where nobody can click.
pub fn trigger(id: &str) -> Result<(), String> {
  let mtm = mtm()?;
  let bar = NSApplication::sharedApplication(mtm).mainMenu().ok_or("there is no app menu")?;
  let (menu, index) = find(&bar, id).ok_or_else(|| format!("no menu item {id:?}"))?;
  menu.performActionForItemAtIndex(index);
  Ok(())
}

/// The current app menu as JSON items, the shape setAppMenu takes (roles come back as roles).
pub fn app_menu_json() -> Result<String, String> {
  let mtm = mtm()?;
  match NSApplication::sharedApplication(mtm).mainMenu() {
    Some(bar) => Ok(menu_json(&bar)),
    None => Ok("[]".into()),
  }
}

fn menu_json(menu: &NSMenu) -> String {
  let mut out = Vec::new();
  for i in 0..menu.numberOfItems() {
    let Some(item) = menu.itemAtIndex(i) else { continue };
    if !is_akan_native(&item) {
      continue; // added by AppKit
    }
    let identifier = item.identifier().map(|x| x.to_string()).unwrap_or_default();
    if identifier == SEPARATOR_ID {
      out.push(r#"{"type":"separator"}"#.to_string());
      continue;
    }
    let mut fields = vec![format!(r#""label":{}"#, crate::json::quote(&item.title().to_string()))];
    if let Some(role) = identifier.strip_prefix("role:") {
      fields.push(format!(r#""role":{}"#, crate::json::quote(role)));
    } else if identifier != SUBMENU_ID {
      fields.push(format!(r#""id":{}"#, crate::json::quote(&identifier)));
    }
    let accel = accelerator::Accelerator::from_key_equivalent(&item.keyEquivalent().to_string(), item.keyEquivalentModifierMask().0);
    if let Some(a) = accel {
      fields.push(format!(r#""accelerator":{}"#, crate::json::quote(&a.canonical())));
    }
    if item.tag() & CHECKABLE != 0 {
      fields.push(format!(r#""checked":{}"#, item.state() == NSControlStateValueOn));
    }
    if item.tag() & DISABLED != 0 {
      fields.push(r#""enabled":false"#.into());
    }
    if let Some(sub) = item.submenu() {
      fields.push(format!(r#""submenu":{}"#, menu_json(&sub)));
    }
    out.push(format!("{{{}}}", fields.join(",")));
  }
  format!("[{}]", out.join(","))
}

// ───────────────────────── context menus ─────────────────────────

/// Pops up a context menu over `view` (the window's webview) at a page position, or at the mouse.
/// Returns when the menu closes; a chosen item has pushed its click event by then.
/// `close_after_ms` closes it unchosen (automated tests, where nobody can dismiss it).
pub fn popup(items: &V, window: u32, view: &NSView, at: Option<(f64, f64)>, close_after_ms: Option<f64>) -> Result<(), String> {
  let menu = build(items, &Source::Context(window))?;
  if let Some(ms) = close_after_ms {
    // A timer with an absolute fire date in the common modes, which include the event-tracking
    // mode the menu runs. (performSelector:afterDelay:inModes: fired far too early here: a 3 s
    // delay closed the menu after 0.3–0.7 s.)
    let date = NSDate::dateWithTimeIntervalSinceNow(ms / 1000.0);
    let target: &AnyObject = &menu;
    unsafe {
      let timer = NSTimer::initWithFireDate_interval_target_selector_userInfo_repeats(NSTimer::alloc(), &date, 0.0, target, sel!(cancelTracking), None, false);
      NSRunLoop::currentRunLoop().addTimer_forMode(&timer, NSRunLoopCommonModes);
    }
  }
  match at {
    Some((x, y)) => {
      // CSS px from the page's top-left; WKWebView is flipped, but do not rely on it.
      let y = if view.isFlipped() { y } else { view.frame().size.height - y };
      menu.popUpMenuPositioningItem_atLocation_inView(None, NSPoint::new(x, y), Some(view));
    }
    None => {
      menu.popUpMenuPositioningItem_atLocation_inView(None, NSEvent::mouseLocation(), None);
    }
  }
  Ok(())
}

// ───────────────────────── shell ops ─────────────────────────

/// menu.* shell ops that need no window; None for other ops (menu.popup: popup_op).
pub fn shell_op(op: &str, cmd: &V) -> Option<Result<String, String>> {
  let result = match op {
    "menu.setApp" => cmd.get("items").ok_or_else(|| "items is required".to_string()).and_then(set_app_menu).map(|()| "null".into()),
    "menu.reset" => {
      install_default(&app_name());
      Ok("null".into())
    }
    "menu.get" => app_menu_json(),
    "menu.trigger" => match cmd.get("id").and_then(|v| v.as_str()) {
      Some(id) => trigger(id).map(|()| "null".into()),
      None => Err("id must be a string".into()),
    },
    _ => return None,
  };
  Some(result)
}

/// menu.popup { items, x?, y?, closeAfterMs? } over the calling window's webview.
pub fn popup_op(cmd: &V, window: u32, webview: &wry::WebView) -> Result<String, String> {
  use wry::WebViewExtMacOS;
  let items = cmd.get("items").ok_or("items is required")?;
  let at = match (cmd.get("x").and_then(|v| v.as_f64()), cmd.get("y").and_then(|v| v.as_f64())) {
    (Some(x), Some(y)) if x.is_finite() && y.is_finite() => Some((x, y)),
    (None, None) => None,
    _ => return Err("give both x and y (CSS px), or neither for the mouse position".into()),
  };
  let close_after = cmd.get("closeAfterMs").and_then(|v| v.as_f64()).filter(|ms| ms.is_finite() && *ms >= 0.0);
  let view = webview.webview();
  popup(items, window, &view, at, close_after)?;
  Ok("null".into())
}

#[cfg(test)]
mod tests {
  use super::Source;

  #[test]
  fn click_events_per_source() {
    let finish = |s: String| format!("{s}}}");
    assert_eq!(finish(Source::App.event_start("save")), r#"{"type":"menu","source":"app","id":"save"}"#);
    assert_eq!(finish(Source::Context(3).event_start("copy \"x\"")), r#"{"type":"menu","source":"context","window":3,"id":"copy \"x\""}"#);
    assert_eq!(finish(Source::Tray("main".into()).event_start("quit")), r#"{"type":"tray","event":"menuClick","tray":"main","item":"quit"}"#);
    for s in [Source::App.event_start("a"), Source::Context(1).event_start("b"), Source::Tray("t".into()).event_start("c")] {
      assert!(crate::json::parse(&finish(s)).is_ok());
    }
  }
}
