//! What the menu, tray and dock plugins' Windows and Linux shells (win/, linux/) share: menu item
//! trees from the plugins' JSON, click events, the standard items ("roles") and what they do
//! there, tray icon files and the dock plugin's arguments. macOS builds its NSMenus straight from
//! the JSON (menu.rs) and has its own dock.rs; the rules and messages here are the same, so one
//! item tree works everywhere. Pure logic, unit tested on any host.
//!
//! Roles on Windows and Linux (documented in plugins/menu/src/index.ts):
//! - appMenu → "File" with About and Exit (Windows) / Quit (Linux); editMenu → "Edit";
//!   windowMenu → "Window" (Minimize, Maximize, Full Screen, Close); helpMenu → "Help" with the
//!   given items (left out without any).
//! - about → a small About box with the app's name (muda does the same); quit → the app's quit
//!   sequence (D4), as Cmd+Q on macOS.
//! - undo … selectAll → the page's editing command. WebView2 and WebKitGTK handle these keys
//!   themselves, so their accelerators are shown but not registered: GTK activates accelerators
//!   before the focused widget (tao returns Propagation::Proceed, tao-0.37.0/src/platform_impl/
//!   linux/event_loop.rs:875-886), so a registered Ctrl+C would never reach the page's text
//!   fields, and on Windows the Ctrl+C the item sends would come back as the accelerator.
//! - minimize, zoom (maximize/restore), toggleFullScreen, close → the menu's window.
//! - hide, hideOthers, showAll, bringAllToFront and services are macOS concepts: left out,
//!   together with the separators next to them.
#![cfg_attr(target_os = "macos", allow(dead_code))]

use std::path::{Path, PathBuf};

use crate::{
  accelerator::{self, Accelerator},
  json::{self, V},
  push_event,
  routes::{route, Route},
};

// ───────────────────────── roles ─────────────────────────

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Role {
  About,
  Quit,
  Undo,
  Redo,
  Cut,
  Copy,
  Paste,
  PasteAndMatchStyle,
  Delete,
  SelectAll,
  Minimize,
  Zoom,
  Close,
  ToggleFullScreen,
}

const ROLES: [(Role, &str); 14] = [
  (Role::About, "about"),
  (Role::Quit, "quit"),
  (Role::Undo, "undo"),
  (Role::Redo, "redo"),
  (Role::Cut, "cut"),
  (Role::Copy, "copy"),
  (Role::Paste, "paste"),
  (Role::PasteAndMatchStyle, "pasteAndMatchStyle"),
  (Role::Delete, "delete"),
  (Role::SelectAll, "selectAll"),
  (Role::Minimize, "minimize"),
  (Role::Zoom, "zoom"),
  (Role::Close, "close"),
  (Role::ToggleFullScreen, "toggleFullScreen"),
];

/// macOS item roles without an equivalent here: left out.
const MACOS_ONLY: [&str; 4] = ["hide", "hideOthers", "showAll", "bringAllToFront"];
/// The same submenu roles as menu.rs.
const SUBMENU_ROLES: [&str; 5] = ["appMenu", "editMenu", "windowMenu", "helpMenu", "services"];

/// The page's editing commands (roles undo … selectAll).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Edit {
  Undo,
  Redo,
  Cut,
  Copy,
  Paste,
  PastePlain,
  Delete,
  SelectAll,
}

impl Role {
  pub fn name(self) -> &'static str {
    ROLES.iter().find(|(r, _)| *r == self).map_or("", |(_, n)| n)
  }

  pub fn from_name(name: &str) -> Option<Role> {
    ROLES.iter().find(|(_, n)| *n == name).map(|(r, _)| *r)
  }

  /// Ok(None): a macOS role, left out here.
  fn parse(name: &str) -> Result<Option<Role>, String> {
    match Role::from_name(name) {
      Some(role) => Ok(Some(role)),
      None if MACOS_ONLY.contains(&name) => Ok(None),
      None => Err(format!("unknown menu role {name:?}")),
    }
  }

  pub fn label(self, app: &str) -> String {
    match self {
      Role::About => format!("About {app}"),
      Role::Quit if cfg!(target_os = "windows") => "Exit".into(),
      Role::Quit => "Quit".into(),
      Role::Undo => "Undo".into(),
      Role::Redo => "Redo".into(),
      Role::Cut => "Cut".into(),
      Role::Copy => "Copy".into(),
      Role::Paste => "Paste".into(),
      Role::PasteAndMatchStyle => "Paste as Plain Text".into(),
      Role::Delete => "Delete".into(),
      Role::SelectAll => "Select All".into(),
      Role::Minimize => "Minimize".into(),
      Role::Zoom => "Maximize".into(),
      Role::Close => "Close".into(),
      Role::ToggleFullScreen => "Full Screen".into(),
    }
  }

  /// Windows and GNOME conventions: Redo is Ctrl+Y on Windows, Quit has no key there (Alt+F4
  /// closes the window).
  fn default_accelerator(self) -> Option<&'static str> {
    Some(match self {
      Role::Undo => "CmdOrCtrl+Z",
      Role::Redo if cfg!(target_os = "windows") => "CmdOrCtrl+Y",
      Role::Redo => "CmdOrCtrl+Shift+Z",
      Role::Cut => "CmdOrCtrl+X",
      Role::Copy => "CmdOrCtrl+C",
      Role::Paste => "CmdOrCtrl+V",
      Role::PasteAndMatchStyle => "CmdOrCtrl+Shift+V",
      Role::Delete => "Delete",
      Role::SelectAll => "CmdOrCtrl+A",
      Role::Close => "CmdOrCtrl+W",
      Role::Quit if !cfg!(target_os = "windows") => "CmdOrCtrl+Q",
      Role::ToggleFullScreen => "F11",
      _ => return None,
    })
  }

  pub fn edit(self) -> Option<Edit> {
    Some(match self {
      Role::Undo => Edit::Undo,
      Role::Redo => Edit::Redo,
      Role::Cut => Edit::Cut,
      Role::Copy => Edit::Copy,
      Role::Paste => Edit::Paste,
      Role::PasteAndMatchStyle => Edit::PastePlain,
      Role::Delete => Edit::Delete,
      Role::SelectAll => Edit::SelectAll,
      _ => return None,
    })
  }

  /// Acts on the menu's window (window_role).
  pub fn is_window_role(self) -> bool {
    matches!(self, Role::Minimize | Role::Zoom | Role::ToggleFullScreen | Role::Close)
  }
}

// ───────────────────────── trees ─────────────────────────

pub enum Node {
  Separator,
  Command(Command),
  Submenu { label: String, role: Option<&'static str>, children: Vec<Node> },
}

pub struct Command {
  /// 0, 1, … in tree order. Win32 command ids are this + 1; GTK and D-Bus items carry it.
  pub index: usize,
  pub label: String,
  pub accelerator: Option<Accelerator>,
  pub enabled: bool,
  pub kind: Kind,
}

pub enum Kind {
  /// `checked` is Some for check items.
  Item { id: String, checked: Option<bool> },
  Role(Role),
}

impl Command {
  /// The accelerator to register (accelerator tables, accel groups). The page's editing keys
  /// stay with the webview (see the top).
  pub fn key(&self) -> Option<&Accelerator> {
    match self.kind {
      Kind::Role(role) if role.edit().is_some() => None,
      _ => self.accelerator.as_ref(),
    }
  }

  pub fn checked(&self) -> Option<bool> {
    match &self.kind {
      Kind::Item { checked, .. } => *checked,
      Kind::Role(_) => None,
    }
  }
}

pub struct Tree {
  pub nodes: Vec<Node>,
}

/// Who owns a menu; decides the event a click pushes (menu.rs Source).
#[derive(Clone, Debug, PartialEq)]
pub enum Source {
  App,
  /// A context menu of this window.
  Context(u32),
  /// The menu of this tray.
  Tray(String),
}

impl Source {
  /// The event JSON without its closing brace.
  fn event_start(&self, id: &str) -> String {
    let id = json::quote(id);
    match self {
      Source::App => format!(r#"{{"type":"menu","source":"app","id":{id}"#),
      Source::Context(window) => format!(r#"{{"type":"menu","source":"context","window":{window},"id":{id}"#),
      Source::Tray(tray) => format!(r#"{{"type":"tray","event":"menuClick","tray":{},"item":{id}"#, json::quote(tray)),
    }
  }
}

/// What a click did.
#[derive(Debug, PartialEq)]
pub enum Clicked {
  /// The item's event was pushed; a check item toggled to `checked`.
  Item { checked: Option<bool> },
  /// A standard item: the OS part performs it.
  Role(Role),
  /// Disabled, or no such command.
  Nothing,
}

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

/// Appends a node; a separator only after something that is not one.
fn push(out: &mut Vec<Node>, node: Node) {
  if matches!(node, Node::Separator) && matches!(out.last(), None | Some(Node::Separator)) {
    return;
  }
  out.push(node);
}

fn finish(mut out: Vec<Node>) -> Vec<Node> {
  while matches!(out.last(), Some(Node::Separator)) {
    out.pop();
  }
  out
}

struct Parser<'a> {
  app: &'a str,
  next: usize,
}

impl Parser<'_> {
  fn command(&mut self, label: String, accelerator: Option<Accelerator>, enabled: bool, kind: Kind) -> Node {
    let index = self.next;
    self.next += 1;
    Node::Command(Command { index, label, accelerator, enabled, kind })
  }

  fn items(&mut self, items: &[V]) -> Result<Vec<Node>, String> {
    let mut out = Vec::new();
    for v in items {
      if let Some(node) = self.item(v)? {
        push(&mut out, node);
      }
    }
    Ok(finish(out))
  }

  fn role(&mut self, name: &str, label: Option<String>, accel: Option<&str>) -> Result<Option<Node>, String> {
    let Some(role) = Role::parse(name)? else { return Ok(None) };
    let accelerator = accel.or(role.default_accelerator()).map(accelerator::parse).transpose()?;
    let label = label.unwrap_or_else(|| role.label(self.app));
    Ok(Some(self.command(label, accelerator, true, Kind::Role(role))))
  }

  /// None: left out here (a macOS role, or a standard submenu with nothing in it).
  fn item(&mut self, v: &V) -> Result<Option<Node>, String> {
    if !matches!(v, V::Obj(_)) {
      return Err("each menu item must be an object".into());
    }
    if string(v, "type")?.as_deref() == Some("separator") {
      return Ok(Some(Node::Separator));
    }
    let label = string(v, "label")?;
    let accel = string(v, "accelerator")?;
    let role = string(v, "role")?;
    let submenu = v.get("submenu").map(items_of).transpose()?;

    if let Some(role) = role.as_deref() {
      if SUBMENU_ROLES.contains(&role) {
        return self.submenu_role(role, label, submenu);
      }
      if submenu.is_some() {
        return Err(format!("role {role:?} has no submenu"));
      }
      return self.role(role, label, accel.as_deref());
    }

    let label = label.ok_or("menu items need a label (or a role, or type: \"separator\")")?;
    if let Some(children) = submenu {
      return Ok(Some(Node::Submenu { label, role: None, children: self.items(children)? }));
    }
    let id = string(v, "id")?.ok_or_else(|| format!("menu item {label:?} needs an id"))?;
    let accelerator = accel.as_deref().map(accelerator::parse).transpose()?;
    let checked = flag(v, "checked")?;
    let enabled = flag(v, "enabled")? != Some(false);
    Ok(Some(self.command(label, accelerator, enabled, Kind::Item { id, checked })))
  }

  fn submenu_role(&mut self, role: &str, label: Option<String>, children: Option<&[V]>) -> Result<Option<Node>, String> {
    let (role, title, defaults): (&'static str, &str, &[&str]) = match role {
      "appMenu" => ("appMenu", "File", &["about", "-", "quit"]),
      "editMenu" => ("editMenu", "Edit", &["undo", "redo", "-", "cut", "copy", "paste", "pasteAndMatchStyle", "delete", "-", "selectAll"]),
      "windowMenu" => ("windowMenu", "Window", &["minimize", "zoom", "toggleFullScreen", "-", "close"]),
      "helpMenu" => ("helpMenu", "Help", &[]),
      _ => return Ok(None), // services
    };
    let nodes = match children {
      Some(children) => self.items(children)?,
      None => {
        let mut out = Vec::new();
        for name in defaults {
          let node = if *name == "-" { Some(Node::Separator) } else { self.role(name, None, None)? };
          if let Some(node) = node {
            push(&mut out, node);
          }
        }
        finish(out)
      }
    };
    if nodes.is_empty() {
      return Ok(None);
    }
    Ok(Some(Node::Submenu { label: label.unwrap_or_else(|| title.into()), role: Some(role), children: nodes }))
  }
}

/// A context or tray menu.
pub fn parse(items: &V, app: &str) -> Result<Tree, String> {
  let nodes = Parser { app, next: 0 }.items(items_of(items)?)?;
  Ok(Tree { nodes })
}

/// The app menu: submenus only, as on macOS (menu.rs set_app_menu), so one tree fits every OS.
pub fn parse_app_menu(items: &V, app: &str) -> Result<Tree, String> {
  let list = items_of(items)?;
  if list.is_empty() {
    return Err("the app menu needs at least one submenu".into());
  }
  for (i, v) in list.iter().enumerate() {
    let is_submenu = v.get("submenu").is_some() || string(v, "role")?.is_some_and(|r| SUBMENU_ROLES.contains(&r.as_str()));
    if !is_submenu {
      return Err(format!("app menu entry {i} must be a submenu: the macOS menu bar only holds submenus"));
    }
  }
  parse(items, app)
}

impl Tree {
  /// Every command, in index order.
  pub fn commands(&self) -> Vec<&Command> {
    fn walk<'a>(nodes: &'a [Node], out: &mut Vec<&'a Command>) {
      for node in nodes {
        match node {
          Node::Command(c) => out.push(c),
          Node::Submenu { children, .. } => walk(children, out),
          Node::Separator => {}
        }
      }
    }
    let mut out = Vec::new();
    walk(&self.nodes, &mut out);
    out
  }

  #[cfg_attr(target_os = "linux", allow(dead_code))] // Windows looks up accelerators' commands
  pub fn command(&self, index: usize) -> Option<&Command> {
    self.commands().into_iter().find(|c| c.index == index)
  }

  fn command_mut(&mut self, index: usize) -> Option<&mut Command> {
    fn walk(nodes: &mut [Node], index: usize) -> Option<&mut Command> {
      for node in nodes {
        match node {
          Node::Command(c) if c.index == index => return Some(c),
          Node::Submenu { children, .. } => {
            if let Some(c) = walk(children, index) {
              return Some(c);
            }
          }
          _ => {}
        }
      }
      None
    }
    walk(&mut self.nodes, index)
  }

  /// menu.trigger: an item id, or "role:<name>" (how macOS identifies standard items).
  pub fn find(&self, id: &str) -> Option<usize> {
    let role = id.strip_prefix("role:").and_then(Role::from_name);
    self
      .commands()
      .into_iter()
      .find(|c| match &c.kind {
        Kind::Item { id: item, .. } => item == id,
        Kind::Role(r) => Some(*r) == role,
      })
      .map(|c| c.index)
  }

  /// A click on a command: an item pushes its event (a check item toggles first); a role is left
  /// to the OS part.
  pub fn click(&mut self, index: usize, source: &Source) -> Clicked {
    let Some(command) = self.command_mut(index) else { return Clicked::Nothing };
    if !command.enabled {
      return Clicked::Nothing;
    }
    match &mut command.kind {
      Kind::Role(role) => Clicked::Role(*role),
      Kind::Item { id, checked } => {
        let mut event = source.event_start(id);
        if let Some(on) = checked.as_mut() {
          *on = !*on;
          event.push_str(&format!(r#","checked":{on}"#));
        }
        event.push('}');
        push_event(&event);
        Clicked::Item { checked: *checked }
      }
    }
  }

  /// The tree as JSON items, the shape setAppMenu takes (menu.rs menu_json).
  pub fn to_json(&self) -> String {
    nodes_json(&self.nodes)
  }
}

fn nodes_json(nodes: &[Node]) -> String {
  let out: Vec<String> = nodes
    .iter()
    .map(|node| match node {
      Node::Separator => r#"{"type":"separator"}"#.to_string(),
      Node::Command(c) => {
        let mut fields = vec![format!(r#""label":{}"#, json::quote(&c.label))];
        match &c.kind {
          Kind::Item { id, .. } => fields.push(format!(r#""id":{}"#, json::quote(id))),
          Kind::Role(role) => fields.push(format!(r#""role":"{}""#, role.name())),
        }
        if let Some(a) = &c.accelerator {
          fields.push(format!(r#""accelerator":{}"#, json::quote(&a.canonical())));
        }
        if let Some(checked) = c.checked() {
          fields.push(format!(r#""checked":{checked}"#));
        }
        if !c.enabled {
          fields.push(r#""enabled":false"#.into());
        }
        format!("{{{}}}", fields.join(","))
      }
      Node::Submenu { label, role, children } => {
        let role = role.map(|r| format!(r#","role":"{r}""#)).unwrap_or_default();
        format!(r#"{{"label":{}{role},"submenu":{}}}"#, json::quote(label), nodes_json(children))
      }
    })
    .collect();
  format!("[{}]", out.join(","))
}

// ───────────────────────── what roles do ─────────────────────────

/// quit: the app's quit sequence, as AppKit's terminate: asks the host (lib.rs should_terminate).
pub fn request_quit() {
  use std::sync::atomic::Ordering;
  if crate::QUITTING.load(Ordering::Acquire) || crate::WAKE.load(Ordering::Acquire) == 0 {
    crate::akan_native_quit(0);
  } else {
    crate::push_watched(r#"{"type":"quitRequested","reason":"user"}"#, None);
  }
}

/// Menu clicks arrive outside the event loop's handler, where the tao windows are not at hand. The
/// window roles run there as the internal op `menu.windowRole` (answered with id 0, which the
/// host never uses, so the reply is dropped). No window: the most recently focused one.
pub fn defer_window_role(role: Role, window: Option<u32>) {
  let window = window.map(|w| format!(r#","window":{w}"#)).unwrap_or_default();
  crate::send(crate::UserEvent::Shell { id: 0, json: format!(r#"{{"op":"menu.windowRole","role":"{}"{window}}}"#, role.name()) });
}

/// `menu.windowRole` on one window. `close` asks the window to close as its close button does
/// (tao has no call for it), so the host still decides (closeRequested).
pub fn window_role(cmd: &V, window: &tao::window::Window, close: impl FnOnce()) -> Result<String, String> {
  let role = cmd.get("role").and_then(|v| v.as_str()).and_then(Role::from_name).ok_or("role must be a window role")?;
  match role {
    Role::Close => close(),
    Role::Minimize => window.set_minimized(true),
    Role::Zoom => window.set_maximized(!window.is_maximized()),
    Role::ToggleFullScreen => {
      let on = window.fullscreen().is_none();
      window.set_fullscreen(on.then_some(tao::window::Fullscreen::Borderless(None)));
    }
    _ => return Err(format!("{} is not a window role", role.name())),
  }
  Ok("null".into())
}

// ───────────────────────── trays ─────────────────────────

/// An app path ("/tray.png", a public/ asset) or a FileRef URL ("/__akan_native/file/<id>") → a file
/// (the same rules as tray.rs on macOS).
pub fn resolve_app_file(app_dir: &Path, path: &str) -> Result<PathBuf, String> {
  let exists = |rel: &str| app_dir.join(rel).is_file();
  match route(path, exists) {
    Route::File(id) => crate::FILES.lock().unwrap().get(&id).map(|(p, _)| p.clone()).ok_or_else(|| format!("no file {path}")),
    // The SPA fallback answers any path without an extension with index.html: not an icon.
    Route::Asset(rel) if rel != "index.html" || path.trim_start_matches('/') == "index.html" => Ok(app_dir.join(rel)),
    _ => Err(format!("{path} is not a file of the app (a public/ asset path or a /__akan_native/file URL)")),
  }
}

// ───────────────────────── dock ─────────────────────────

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum ProgressKind {
  Normal,
  Paused,
  Error,
}

/// A shown progress bar: the fraction the page asked for (0..1) and how it is drawn.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Progress {
  pub value: f64,
  pub kind: ProgressKind,
}

/// `dock.setProgress` arguments (dock.rs parse_progress).
pub fn parse_progress(cmd: &V) -> Result<Option<Progress>, String> {
  let value = match cmd.get("progress") {
    None | Some(V::Null) => return Ok(None),
    Some(V::Num(n)) if (0.0..=1.0).contains(n) => *n,
    Some(_) => return Err("progress must be a number from 0 to 1, or null".into()),
  };
  let kind = match cmd.get("state") {
    None | Some(V::Null) => ProgressKind::Normal,
    Some(V::Str(s)) if s == "normal" => ProgressKind::Normal,
    Some(V::Str(s)) if s == "paused" => ProgressKind::Paused,
    Some(V::Str(s)) if s == "error" => ProgressKind::Error,
    Some(_) => return Err("state must be one of normal, paused, error".into()),
  };
  Ok(Some(Progress { value, kind }))
}

/// `dock.setBadge`'s label: null or "" removes the badge.
pub fn parse_label(cmd: &V) -> Result<Option<String>, String> {
  match cmd.get("label") {
    None | Some(V::Null) => Ok(None),
    Some(V::Str(s)) if s.is_empty() => Ok(None),
    Some(V::Str(s)) => Ok(Some(s.clone())),
    Some(_) => Err("label must be a string or null".into()),
  }
}

/// `dock.setVisible`'s flag.
pub fn parse_visible(cmd: &V) -> Result<bool, String> {
  cmd.get("visible").and_then(|v| v.as_bool()).ok_or_else(|| "visible must be a boolean".to_string())
}

/// The dock state (dock.rs state_json): `visible` is whether the app has taskbar buttons.
pub fn dock_state_json(badge: Option<&str>, visible: bool, progress: Option<Progress>) -> String {
  let badge = badge.map_or_else(|| "null".into(), json::quote);
  let (value, kind) = match progress {
    None => ("null".to_string(), "null".to_string()),
    Some(p) => {
      let name = match p.kind {
        ProgressKind::Normal => "normal",
        ProgressKind::Paused => "paused",
        ProgressKind::Error => "error",
      };
      (format!("{}", p.value), format!(r#""{name}""#))
    }
  };
  let policy = if visible { "regular" } else { "accessory" };
  format!(r#"{{"visible":{visible},"policy":"{policy}","badge":{badge},"progress":{value},"progressState":{kind}}}"#)
}

#[cfg(test)]
mod tests {
  use super::*;

  fn tree(s: &str) -> Result<Tree, String> {
    parse_app_menu(&json::parse(s).unwrap(), "Sample")
  }

  #[test]
  fn roles_map_and_round_trip() {
    let t = tree(r#"[{"role":"appMenu"},{"role":"editMenu"},{"label":"Selftest","submenu":[{"id":"go","label":"Go","accelerator":"CmdOrCtrl+Alt+Shift+G"},{"id":"check","label":"Check","checked":false}]}]"#).unwrap();
    let out = t.to_json();
    assert!(json::parse(&out).is_ok());
    let quit = if cfg!(target_os = "windows") { r#"{"label":"Exit","role":"quit"}"# } else { r#"{"label":"Quit","role":"quit","accelerator":"CmdOrCtrl+Q"}"# };
    assert!(out.starts_with(&format!(r#"[{{"label":"File","role":"appMenu","submenu":[{{"label":"About Sample","role":"about"}},{{"type":"separator"}},{quit}]}}"#)), "{out}");
    assert!(out.contains(r#"{"label":"Paste","role":"paste","accelerator":"CmdOrCtrl+V"}"#), "{out}");
    assert!(out.ends_with(r#"{"label":"Selftest","submenu":[{"label":"Go","id":"go","accelerator":"CmdOrCtrl+Alt+Shift+G"},{"label":"Check","id":"check","checked":false}]}]"#), "{out}");
    // Parsing the output again gives the same tree.
    assert_eq!(tree(&out).unwrap().to_json(), out);
    // Edit roles keep their keys for the webview; others register theirs.
    let commands = t.commands();
    let copy = commands.iter().find(|c| matches!(c.kind, Kind::Role(Role::Copy))).unwrap();
    assert!(copy.accelerator.is_some() && copy.key().is_none());
    assert_eq!(commands.iter().find(|c| matches!(&c.kind, Kind::Item { id, .. } if id == "go")).unwrap().key().unwrap().canonical(), "CmdOrCtrl+Alt+Shift+G");
    assert_eq!(commands.iter().map(|c| c.index).collect::<Vec<_>>(), (0..commands.len()).collect::<Vec<_>>());
  }

  #[test]
  fn macos_roles_are_left_out_with_their_separators() {
    let t = tree(r#"[{"label":"App","submenu":[{"role":"about"},{"type":"separator"},{"role":"services"},{"type":"separator"},{"role":"hide"},{"role":"hideOthers"},{"type":"separator"},{"role":"quit","label":"Leave"}]},{"role":"services"},{"role":"helpMenu"}]"#).unwrap();
    let out = t.to_json();
    assert!(out.starts_with(r#"[{"label":"App","submenu":[{"label":"About Sample","role":"about"},{"type":"separator"},{"label":"Leave","role":"quit""#), "{out}");
    assert_eq!(out.matches("separator").count(), 1, "{out}");
    assert_eq!(t.nodes.len(), 1, "services and an empty helpMenu are left out");
    assert!(tree(r#"[{"role":"helpMenu","submenu":[{"id":"docs","label":"Docs"}]}]"#).unwrap().to_json().contains(r#""label":"Help","role":"helpMenu""#));
  }

  #[test]
  fn rejects_what_macos_rejects() {
    for (bad, why) in [
      (r#"[]"#, "at least one submenu"),
      (r#"[{"id":"x","label":"Top"}]"#, "must be a submenu"),
      (r#"[{"label":"F","submenu":[{"label":"Open"}]}]"#, "needs an id"),
      (r#"[{"label":"F","submenu":[{"role":"fly"}]}]"#, "unknown menu role"),
      (r#"[{"label":"F","submenu":[{"role":"copy","submenu":[]}]}]"#, "has no submenu"),
      (r#"[{"label":"F","submenu":[{"id":"a","label":"A","accelerator":"Hyper+K"}]}]"#, "bad accelerator"),
      (r#"[{"label":"F","submenu":[{"id":"a","label":"A","checked":"yes"}]}]"#, "must be a boolean"),
      (r#"[{"label":"F","submenu":[3]}]"#, "must be an object"),
    ] {
      let e = tree(bad).err().unwrap_or_default();
      assert!(e.contains(why), "{bad}: {e}");
    }
  }

  #[test]
  fn clicks_toggle_check_items_and_hand_over_roles() {
    let mut t = parse(&json::parse(r#"[{"id":"a","label":"A","checked":true},{"id":"b","label":"B","enabled":false},{"role":"quit"}]"#).unwrap(), "S").unwrap();
    assert_eq!(t.find("a"), Some(0));
    assert_eq!(t.find("role:quit"), Some(2));
    assert_eq!(t.find("nope"), None);
    assert_eq!(t.click(0, &Source::App), Clicked::Item { checked: Some(false) });
    assert_eq!(t.command(0).unwrap().checked(), Some(false));
    assert_eq!(t.click(1, &Source::App), Clicked::Nothing);
    assert_eq!(t.click(2, &Source::Tray("t".into())), Clicked::Role(Role::Quit));
    assert_eq!(t.click(9, &Source::App), Clicked::Nothing);
  }

  #[test]
  fn click_events_per_source() {
    let finish = |s: String| format!("{s}}}");
    assert_eq!(finish(Source::App.event_start("save")), r#"{"type":"menu","source":"app","id":"save"}"#);
    assert_eq!(finish(Source::Context(3).event_start("x")), r#"{"type":"menu","source":"context","window":3,"id":"x"}"#);
    assert_eq!(finish(Source::Tray("main".into()).event_start("quit")), r#"{"type":"tray","event":"menuClick","tray":"main","item":"quit"}"#);
  }

  #[test]
  fn dock_arguments_and_state() {
    let cmd = |s: &str| json::parse(s).unwrap();
    assert_eq!(parse_progress(&cmd(r#"{"progress":0.25,"state":"paused"}"#)), Ok(Some(Progress { value: 0.25, kind: ProgressKind::Paused })));
    assert_eq!(parse_progress(&cmd(r#"{"progress":null}"#)), Ok(None));
    assert!(parse_progress(&cmd(r#"{"progress":2}"#)).is_err());
    assert!(parse_progress(&cmd(r#"{"progress":0.5,"state":"busy"}"#)).is_err());
    assert_eq!(parse_label(&cmd(r#"{"label":""}"#)), Ok(None));
    assert!(parse_label(&cmd(r#"{"label":3}"#)).is_err());
    let s = dock_state_json(Some("3"), true, Some(Progress { value: 0.25, kind: ProgressKind::Paused }));
    assert_eq!(s, r#"{"visible":true,"policy":"regular","badge":"3","progress":0.25,"progressState":"paused"}"#);
    assert_eq!(dock_state_json(None, false, None), r#"{"visible":false,"policy":"accessory","badge":null,"progress":null,"progressState":null}"#);
  }
}
