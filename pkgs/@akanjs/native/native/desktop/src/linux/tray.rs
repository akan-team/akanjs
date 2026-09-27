//! Tray icons on Linux (tray plugin, plugins.md §5): StatusNotifierItem, the D-Bus tray protocol of
//! KDE, GNOME's AppIndicator extension, waybar and others, with its menu as com.canonical.dbusmenu.
//! Both are exported with GDBus (gtk-rs gio); the ops and events are tray.rs's.
//!
//! Know-how from the references and the specs:
//! - Tauri (tray-icon) and Electrobun go through libappindicator, which is not in our tree: no click
//!   events, an icon file on disk, and a menu the icon needs to show (tauri/crates/tauri/src/tray/
//!   mod.rs:66-67, 214-215, 285-291; electrobun/package/src/native/linux/nativeWrapper.cpp:
//!   5788-5903). Speaking the protocol directly gives Activate (a left click) and ContextMenu (a
//!   right click on a tray without a menu), sends the icon as ARGB pixels, and works without a menu.
//! - Every tray has a D-Bus connection of its own. The watcher (org.kde.StatusNotifierWatcher)
//!   tracks items by bus name, so removing an item means its name has to go: closing the
//!   connection does that, where a shared connection would leave a dead icon behind (libappindicator
//!   only sets its item Passive). The item is /StatusNotifierItem on its connection, registered by
//!   the connection's unique name, and it also owns org.kde.StatusNotifierItem-<pid>-<n>.
//! - The watcher can come and go (the panel restarts, or starts after the app): the item registers
//!   whenever the watcher's name appears. Without a watcher the tray exists and waits.
//! - Hosts read properties with Properties.Get/GetAll (GDBus answers from get_property) after the
//!   New* signals; dbusmenu clients re-read the layout after LayoutUpdated.
//! - IconPixmap is (width, height, ARGB32 in network byte order); GdkPixbuf decodes the PNG. A
//!   tray without an icon shows the app's (icon.rgba, as notifications do).
//!
//! Events: `click { tray, button: "left" }` on Activate, `"right"` on ContextMenu and when the
//! panel opens the menu of a tray that opens it on the right button only (menuOnLeftClick false).
//! A left click on a tray with a menu opens the menu (ItemIsMenu), as on macOS. Menu items push
//! `menuClick { tray, item }` (chrome.rs Source::Tray). `iconAsTemplate` has no meaning here;
//! `title` is the item's Title (panels show it as its name or tooltip, not next to the icon).

use std::{cell::RefCell, collections::HashMap, path::Path};

use gtk::{
  gdk_pixbuf::Pixbuf,
  gio,
  glib::{self, variant::ObjectPath, ToVariant, Variant, VariantTy},
};

use crate::{
  chrome::{self, Clicked, Node, Source, Tree},
  json::{self, V},
  push_event,
};

const ITEM_PATH: &str = "/StatusNotifierItem";
const MENU_PATH: &str = "/MenuBar";
const ITEM_INTERFACE: &str = "org.kde.StatusNotifierItem";
const MENU_INTERFACE: &str = "com.canonical.dbusmenu";
const WATCHER: &str = "org.kde.StatusNotifierWatcher";
/// The Menu property of a tray without a menu (what libappindicator uses).
const NO_MENU: &str = "/NO_DBUSMENU";

const ITEM_XML: &str = r#"<node><interface name="org.kde.StatusNotifierItem">
<property name="Category" type="s" access="read"/><property name="Id" type="s" access="read"/>
<property name="Title" type="s" access="read"/><property name="Status" type="s" access="read"/>
<property name="WindowId" type="i" access="read"/><property name="IconThemePath" type="s" access="read"/>
<property name="IconName" type="s" access="read"/><property name="IconPixmap" type="a(iiay)" access="read"/>
<property name="OverlayIconName" type="s" access="read"/><property name="OverlayIconPixmap" type="a(iiay)" access="read"/>
<property name="AttentionIconName" type="s" access="read"/><property name="AttentionIconPixmap" type="a(iiay)" access="read"/>
<property name="AttentionMovieName" type="s" access="read"/><property name="ToolTip" type="(sa(iiay)ss)" access="read"/>
<property name="ItemIsMenu" type="b" access="read"/><property name="Menu" type="o" access="read"/>
<method name="ContextMenu"><arg name="x" type="i" direction="in"/><arg name="y" type="i" direction="in"/></method>
<method name="Activate"><arg name="x" type="i" direction="in"/><arg name="y" type="i" direction="in"/></method>
<method name="SecondaryActivate"><arg name="x" type="i" direction="in"/><arg name="y" type="i" direction="in"/></method>
<method name="Scroll"><arg name="delta" type="i" direction="in"/><arg name="orientation" type="s" direction="in"/></method>
<signal name="NewTitle"/><signal name="NewIcon"/><signal name="NewAttentionIcon"/><signal name="NewOverlayIcon"/>
<signal name="NewToolTip"/><signal name="NewStatus"><arg name="status" type="s"/></signal>
</interface></node>"#;

const MENU_XML: &str = r#"<node><interface name="com.canonical.dbusmenu">
<property name="Version" type="u" access="read"/><property name="TextDirection" type="s" access="read"/>
<property name="Status" type="s" access="read"/><property name="IconThemePath" type="as" access="read"/>
<method name="GetLayout"><arg type="i" name="parentId" direction="in"/><arg type="i" name="recursionDepth" direction="in"/>
<arg type="as" name="propertyNames" direction="in"/><arg type="u" name="revision" direction="out"/><arg type="(ia{sv}av)" name="layout" direction="out"/></method>
<method name="GetGroupProperties"><arg type="ai" name="ids" direction="in"/><arg type="as" name="propertyNames" direction="in"/>
<arg type="a(ia{sv})" name="properties" direction="out"/></method>
<method name="GetProperty"><arg type="i" name="id" direction="in"/><arg type="s" name="name" direction="in"/><arg type="v" name="value" direction="out"/></method>
<method name="Event"><arg type="i" name="id" direction="in"/><arg type="s" name="eventId" direction="in"/><arg type="v" name="data" direction="in"/>
<arg type="u" name="timestamp" direction="in"/></method>
<method name="EventGroup"><arg type="a(isvu)" name="events" direction="in"/><arg type="ai" name="idErrors" direction="out"/></method>
<method name="AboutToShow"><arg type="i" name="id" direction="in"/><arg type="b" name="needUpdate" direction="out"/></method>
<method name="AboutToShowGroup"><arg type="ai" name="ids" direction="in"/><arg type="ai" name="updatesNeeded" direction="out"/>
<arg type="ai" name="idErrors" direction="out"/></method>
<signal name="ItemsPropertiesUpdated"><arg type="a(ia{sv})" name="updatedProps"/><arg type="a(ias)" name="removedProps"/></signal>
<signal name="LayoutUpdated"><arg type="u" name="revision"/><arg type="i" name="parent"/></signal>
<signal name="ItemActivationRequested"><arg type="i" name="id"/><arg type="u" name="timestamp"/></signal>
</interface></node>"#;

/// One dbusmenu item; its id is its index in Layout::entries (0 is the root).
struct Entry {
  props: Variant,
  children: Vec<i32>,
  /// chrome.rs command index of a clickable item.
  command: Option<usize>,
}

/// A tray's D-Bus side: its connection, exported objects, watcher watch and name.
struct Bus {
  conn: gio::DBusConnection,
  registrations: Vec<gio::RegistrationId>,
  /// Ends the watcher watch (gio's name-watcher id type cannot be named: gio::WatcherId is another).
  unwatch: Box<dyn FnOnce()>,
  owner: gio::OwnerId,
}

struct Tray {
  /// None until exported.
  bus: Option<Bus>,
  title: String,
  tooltip: Option<String>,
  /// (width, height, ARGB32 big-endian)
  icon: Option<(i32, i32, Vec<u8>)>,
  template: bool,
  menu: Option<Tree>,
  entries: Vec<Entry>,
  revision: u32,
  menu_on_left_click: bool,
}

thread_local! {
  static TRAYS: RefCell<HashMap<String, Tray>> = RefCell::new(HashMap::new());
  static SERIAL: std::cell::Cell<u32> = const { std::cell::Cell::new(0) };
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

/// The app icon (resources/icon.rgba) as a pixmap, for trays without an icon of their own. Read
/// at the first tray.* op; 64 px, which the tray hosts scale.
static APP_ICON: std::sync::OnceLock<Option<(i32, i32, Vec<u8>)>> = std::sync::OnceLock::new();

fn app_icon() -> Option<&'static (i32, i32, Vec<u8>)> {
  APP_ICON.get().and_then(Option::as_ref)
}

fn load_app_icon(app_dir: &Path) {
  APP_ICON.get_or_init(|| {
    let (side, rgba) = super::app_icon(app_dir.parent()?, 64)?;
    let argb = rgba.chunks_exact(4).flat_map(|p| [p[3], p[0], p[1], p[2]]).collect();
    Some((side as i32, side as i32, argb))
  });
}

fn pixmap(app_dir: &Path, path: &str) -> Result<(i32, i32, Vec<u8>), String> {
  let file = chrome::resolve_app_file(app_dir, path)?;
  let pixbuf = Pixbuf::from_file(&file).map_err(|e| format!("{path} is not an image: {e}"))?;
  let pixbuf = if pixbuf.has_alpha() { pixbuf } else { pixbuf.add_alpha(false, 0, 0, 0).map_err(|e| e.to_string())? };
  let (w, h, stride) = (pixbuf.width(), pixbuf.height(), pixbuf.rowstride() as usize);
  let bytes = pixbuf.read_pixel_bytes();
  let mut argb = Vec::with_capacity((w * h * 4) as usize);
  for y in 0..h as usize {
    for x in 0..w as usize {
      let p = &bytes[y * stride + x * 4..y * stride + x * 4 + 4];
      argb.extend_from_slice(&[p[3], p[0], p[1], p[2]]);
    }
  }
  Ok((w, h, argb))
}

// ───────────────────────── dbusmenu layout ─────────────────────────

fn dict(entries: &[(&str, Variant)]) -> Variant {
  let dict = glib::VariantDict::new(None);
  for (key, value) in entries {
    dict.insert_value(key, value);
  }
  dict.end()
}

/// dbusmenu labels use _ for mnemonics.
fn menu_label(label: &str) -> String {
  label.replace('_', "__")
}

fn layout(tree: Option<&Tree>) -> Vec<Entry> {
  let mut entries = vec![Entry { props: dict(&[("children-display", "submenu".to_variant())]), children: Vec::new(), command: None }];
  fn add(nodes: &[Node], parent: usize, entries: &mut Vec<Entry>) {
    for node in nodes {
      let id = entries.len();
      entries[parent].children.push(id as i32);
      match node {
        Node::Separator => entries.push(Entry { props: dict(&[("type", "separator".to_variant())]), children: Vec::new(), command: None }),
        Node::Submenu { label, children, .. } => {
          entries.push(Entry { props: dict(&[("label", menu_label(label).to_variant()), ("children-display", "submenu".to_variant())]), children: Vec::new(), command: None });
          add(children, id, entries);
        }
        Node::Command(c) => {
          let mut props = vec![("label", menu_label(&c.label).to_variant())];
          if !c.enabled {
            props.push(("enabled", false.to_variant()));
          }
          if let Some(on) = c.checked() {
            props.push(("toggle-type", "checkmark".to_variant()));
            props.push(("toggle-state", (on as i32).to_variant()));
          }
          if let Some(a) = &c.accelerator {
            let mut keys: Vec<String> = [(a.control_key(), "Control"), (a.alt, "Alt"), (a.shift, "Shift"), (a.command, "Super")].iter().filter(|(on, _)| *on).map(|(_, n)| n.to_string()).collect();
            keys.push(key_name(&a.key));
            props.push(("shortcut", vec![keys].to_variant()));
          }
          entries.push(Entry { props: dict(&props), children: Vec::new(), command: Some(c.index) });
        }
      }
    }
  }
  if let Some(tree) = tree {
    add(&tree.nodes, 0, &mut entries);
  }
  entries
}

/// dbusmenu shortcuts name keys as GTK does ("q", "F12", "Page_Up").
fn key_name(key: &str) -> String {
  match key {
    "PageUp" => "Page_Up".into(),
    "PageDown" => "Page_Down".into(),
    "Enter" => "Return".into(),
    "Backspace" => "BackSpace".into(),
    "Plus" => "plus".into(),
    "Space" => "space".into(),
    k if k.starts_with("Num") => format!("KP_{}", &k[3..]),
    k => k.into(),
  }
}

/// (ia{sv}av) of `id` and its children down to `depth` levels (-1: all).
fn node(entries: &[Entry], id: i32, depth: i32) -> Option<Variant> {
  let entry = entries.get(usize::try_from(id).ok()?)?;
  let children: Vec<Variant> = if depth == 0 { Vec::new() } else { entry.children.iter().filter_map(|c| node(entries, *c, depth - 1)).map(|v| Variant::from_variant(&v)).collect() };
  Some(Variant::tuple_from_iter([id.to_variant(), entry.props.clone(), Variant::array_from_iter_with_type(VariantTy::VARIANT, children)]))
}

fn group_properties(entries: &[Entry], ids: &[i32]) -> Variant {
  let ty = VariantTy::new("(ia{sv})").unwrap();
  let items: Vec<Variant> = ids
    .iter()
    .filter_map(|id| entries.get(usize::try_from(*id).ok()?).map(|e| Variant::tuple_from_iter([id.to_variant(), e.props.clone()])))
    .collect();
  Variant::tuple_from_iter([Variant::array_from_iter_with_type(ty, items)])
}

// ───────────────────────── D-Bus ─────────────────────────

fn empty_pixmaps() -> Variant {
  Variant::array_from_iter_with_type(VariantTy::new("(iiay)").unwrap(), Vec::<Variant>::new())
}

fn item_is_menu(tray: &Tray) -> bool {
  tray.menu.is_some() && tray.menu_on_left_click
}

fn item_property(id: &str, name: &str) -> Variant {
  TRAYS.with(|t| {
    let trays = t.borrow();
    let Some(tray) = trays.get(id) else { return "".to_variant() };
    match name {
      "Category" => "ApplicationStatus".to_variant(),
      "Id" => format!("akan-native-{id}").to_variant(),
      "Title" => if tray.title.is_empty() { super::menu::app_name() } else { tray.title.clone() }.to_variant(),
      "Status" => "Active".to_variant(),
      "WindowId" => 0i32.to_variant(),
      // Without an icon, the app's icon (as on Windows), else the icon theme's generic one.
      "IconName" => if tray.icon.is_some() || app_icon().is_some() { "" } else { "application-x-executable" }.to_variant(),
      "IconPixmap" => match tray.icon.as_ref().or(app_icon()) {
        Some((w, h, argb)) => Variant::array_from_iter_with_type(
          VariantTy::new("(iiay)").unwrap(),
          [Variant::tuple_from_iter([w.to_variant(), h.to_variant(), Variant::array_from_fixed_array(argb)])],
        ),
        None => empty_pixmaps(),
      },
      "OverlayIconPixmap" | "AttentionIconPixmap" => empty_pixmaps(),
      "ToolTip" => Variant::tuple_from_iter(["".to_variant(), empty_pixmaps(), tray.tooltip.clone().unwrap_or_default().to_variant(), "".to_variant()]),
      "ItemIsMenu" => item_is_menu(tray).to_variant(),
      "Menu" => ObjectPath::try_from(if tray.menu.is_some() { MENU_PATH } else { NO_MENU }).unwrap().to_variant(),
      _ => "".to_variant(), // IconThemePath, OverlayIconName, AttentionIconName, AttentionMovieName
    }
  })
}

fn click(id: &str, button: &str) {
  push_event(&format!(r#"{{"type":"tray","event":"click","tray":{},"button":"{button}"}}"#, json::quote(id)));
}

fn item_method(id: &str, method: &str) {
  match method {
    "Activate" => click(id, "left"),
    "ContextMenu" => click(id, "right"),
    _ => {} // SecondaryActivate (middle button), Scroll
  }
}

/// A dbusmenu event. "clicked" chooses an item; "opened" on the root is the panel opening the menu.
fn menu_event(id: &str, item: i32, event: &str) {
  let chosen = TRAYS.with(|t| {
    let mut trays = t.borrow_mut();
    let tray = trays.get_mut(id)?;
    match event {
      "opened" if item == 0 && !item_is_menu(tray) => {
        click(id, "right");
        None
      }
      "clicked" => {
        let index = tray.entries.get(usize::try_from(item).ok()?)?.command?;
        let result = tray.menu.as_mut()?.click(index, &Source::Tray(id.to_string()));
        if let Clicked::Item { checked: Some(_) } = result {
          tray.entries = layout(tray.menu.as_ref());
          tray.revision += 1;
          layout_updated(tray);
        }
        Some(result)
      }
      _ => None,
    }
  });
  if let Some(Clicked::Role(role)) = chosen {
    super::menu::perform(role, None);
  }
}

fn menu_method(id: &str, method: &str, params: &Variant) -> Variant {
  let entries = |f: &dyn Fn(&[Entry], u32) -> Variant| TRAYS.with(|t| t.borrow().get(id).map(|tray| f(&tray.entries, tray.revision)));
  let reply = match method {
    "GetLayout" => {
      let (parent, depth, _props) = params.get::<(i32, i32, Vec<String>)>().unwrap_or((0, -1, Vec::new()));
      entries(&|e, revision| {
        let layout = node(e, parent, depth).unwrap_or_else(|| node(e, 0, 0).unwrap());
        Variant::tuple_from_iter([revision.to_variant(), layout])
      })
    }
    "GetGroupProperties" => {
      let (ids, _props) = params.get::<(Vec<i32>, Vec<String>)>().unwrap_or_default();
      entries(&|e, _| {
        let ids: Vec<i32> = if ids.is_empty() { (0..e.len() as i32).collect() } else { ids.clone() };
        group_properties(e, &ids)
      })
    }
    "GetProperty" => {
      let (item, name) = params.get::<(i32, String)>().unwrap_or_default();
      entries(&|e, _| {
        let value = e.get(item as usize).and_then(|entry| glib::VariantDict::new(Some(&entry.props)).lookup_value(&name, None)).unwrap_or_else(|| "".to_variant());
        Variant::tuple_from_iter([Variant::from_variant(&value)])
      })
    }
    "Event" => {
      let item = params.child_value(0).get::<i32>().unwrap_or(-1);
      let event = params.child_value(1).get::<String>().unwrap_or_default();
      menu_event(id, item, &event);
      Some(().to_variant())
    }
    "EventGroup" => {
      let events = params.child_value(0);
      for i in 0..events.n_children() {
        let e = events.child_value(i);
        menu_event(id, e.child_value(0).get::<i32>().unwrap_or(-1), &e.child_value(1).get::<String>().unwrap_or_default());
      }
      Some((Vec::<i32>::new(),).to_variant())
    }
    "AboutToShow" => Some((false,).to_variant()),
    "AboutToShowGroup" => Some((Vec::<i32>::new(), Vec::<i32>::new()).to_variant()),
    _ => None,
  };
  reply.unwrap_or_else(|| ().to_variant())
}

fn menu_property(name: &str) -> Variant {
  match name {
    "Version" => 3u32.to_variant(),
    "TextDirection" => "ltr".to_variant(),
    "Status" => "normal".to_variant(),
    _ => Vec::<String>::new().to_variant(), // IconThemePath
  }
}

fn interface(xml: &str, name: &str) -> gio::DBusInterfaceInfo {
  gio::DBusNodeInfo::for_xml(xml).ok().and_then(|n| n.lookup_interface(name)).expect("valid introspection XML")
}

/// Exports a new tray's objects on a connection of its own and registers it with the watcher.
fn export(id: &str) -> Result<Bus, String> {
  let unsupported = |e: glib::Error| format!("UNSUPPORTED: no D-Bus session bus for the tray: {e}");
  let address = gio::dbus_address_get_for_bus_sync(gio::BusType::Session, None::<&gio::Cancellable>).map_err(unsupported)?;
  let flags = gio::DBusConnectionFlags::AUTHENTICATION_CLIENT | gio::DBusConnectionFlags::MESSAGE_BUS_CONNECTION;
  let conn = gio::DBusConnection::for_address_sync(&address, flags, None::<&gio::DBusAuthObserver>, None::<&gio::Cancellable>).map_err(unsupported)?;
  // The closures run on this (the main) thread's main context, where TRAYS lives; they hold only
  // the tray id (GDBus wants them Send + Sync).
  let (a, b, c, d) = (id.to_string(), id.to_string(), id.to_string(), id.to_string());
  let item = conn
    .register_object(
      ITEM_PATH,
      &interface(ITEM_XML, ITEM_INTERFACE),
      move |_, _, _, _, method, _, invocation| {
        item_method(&a, method);
        invocation.return_value(None);
      },
      move |_, _, _, _, property| item_property(&b, property),
      |_, _, _, _, _, _| false,
    )
    .map_err(|e| format!("INTERNAL: cannot export the tray: {e}"))?;
  let menu = conn.register_object(
    MENU_PATH,
    &interface(MENU_XML, MENU_INTERFACE),
    move |_, _, _, _, method, params, invocation| {
      let reply = menu_method(&c, method, &params);
      invocation.return_value(Some(&reply));
    },
    |_, _, _, _, property| menu_property(property),
    |_, _, _, _, _, _| false,
  );
  let menu = match menu {
    Ok(m) => m,
    Err(e) => {
      let _ = conn.unregister_object(item);
      return Err(format!("INTERNAL: cannot export the tray menu: {e}"));
    }
  };
  let serial = SERIAL.with(|s| {
    s.set(s.get() + 1);
    s.get()
  });
  let owner = gio::bus_own_name_on_connection(&conn, &format!("org.kde.StatusNotifierItem-{}-{serial}", std::process::id()), gio::BusNameOwnerFlags::NONE, |_, _| {}, |_, _| {});
  let watcher = gio::bus_watch_name_on_connection(
    &conn,
    WATCHER,
    gio::BusNameWatcherFlags::NONE,
    move |conn, _, _| {
      let Some(name) = conn.unique_name() else { return };
      let tray = d.clone();
      conn.call(
        Some(WATCHER),
        "/StatusNotifierWatcher",
        WATCHER,
        "RegisterStatusNotifierItem",
        Some(&(name.as_str(),).to_variant()),
        None,
        gio::DBusCallFlags::NONE,
        -1,
        None::<&gio::Cancellable>,
        move |result| {
          if let Err(e) = result {
            log!("tray {tray}: the status notifier watcher refused it: {e}");
          }
        },
      );
    },
    |_, _| {},
  );
  Ok(Bus { conn, registrations: vec![item, menu], unwatch: Box::new(move || gio::bus_unwatch_name(watcher)), owner })
}

fn signal(tray: &Tray, name: &str, args: Option<&Variant>) {
  if let Some(bus) = &tray.bus {
    let _ = bus.conn.emit_signal(None, ITEM_PATH, ITEM_INTERFACE, name, args);
  }
}

fn layout_updated(tray: &Tray) {
  if let Some(bus) = &tray.bus {
    let _ = bus.conn.emit_signal(None, MENU_PATH, MENU_INTERFACE, "LayoutUpdated", Some(&(tray.revision, 0i32).to_variant()));
  }
}

fn apply(tray: &mut Tray, cmd: &V, app_dir: &Path, app_name: &str) -> Result<(), String> {
  if cmd.get("icon").is_some() {
    tray.icon = string(cmd, "icon")?.map(|path| pixmap(app_dir, path)).transpose()?;
  }
  if let Some(template) = flag(cmd, "iconAsTemplate")? {
    tray.template = template;
  }
  if cmd.get("title").is_some() {
    tray.title = string(cmd, "title")?.unwrap_or("").to_string();
  }
  if cmd.get("tooltip").is_some() {
    tray.tooltip = string(cmd, "tooltip")?.map(str::to_string);
  }
  match cmd.get("menu") {
    None => {}
    Some(V::Null) => tray.menu = None,
    Some(items) => tray.menu = Some(chrome::parse(items, app_name)?),
  }
  if let Some(v) = flag(cmd, "menuOnLeftClick")? {
    tray.menu_on_left_click = v;
  }
  tray.entries = layout(tray.menu.as_ref());
  tray.revision += 1;
  Ok(())
}

/// Tells the panel what changed; it reads the properties again.
fn announce(tray: &Tray) {
  for name in ["NewIcon", "NewTitle", "NewToolTip"] {
    signal(tray, name, None);
  }
  layout_updated(tray);
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

fn remove(tray: Tray) {
  signal(&tray, "NewStatus", Some(&("Passive",).to_variant()));
  let Some(bus) = tray.bus else { return };
  for registration in bus.registrations {
    let _ = bus.conn.unregister_object(registration);
  }
  (bus.unwatch)();
  gio::bus_unown_name(bus.owner);
  // The unique name goes with the connection, and the watcher drops the item.
  bus.conn.close(None::<&gio::Cancellable>, |_| {});
}

/// tray.* shell ops; None for other ops.
pub fn shell_op(op: &str, cmd: &V, app_dir: &Path, app_name: &str) -> Option<Result<String, String>> {
  if !op.starts_with("tray.") {
    return None;
  }
  super::menu::set_app_name(app_name);
  load_app_icon(app_dir);
  Some(run(op, cmd, app_dir, app_name))
}

fn run(op: &str, cmd: &V, app_dir: &Path, app_name: &str) -> Result<String, String> {
  if op == "tray.list" {
    return TRAYS.with(|t| {
      let trays = t.borrow();
      let mut ids: Vec<&String> = trays.keys().collect();
      ids.sort();
      Ok(format!("[{}]", ids.iter().map(|id| tray_json(id, &trays[*id])).collect::<Vec<_>>().join(",")))
    });
  }
  let id = string(cmd, "id")?.filter(|s| !s.is_empty()).ok_or("id is required")?.to_string();
  match op {
    "tray.create" if !TRAYS.with(|t| t.borrow().contains_key(&id)) => {
      if string(cmd, "icon")?.is_none() && string(cmd, "title")?.is_none_or(str::is_empty) {
        return Err("a tray needs an icon or a title".into());
      }
      // Everything the page gave is checked before anything is exported.
      let mut tray = Tray {
        bus: None,
        title: String::new(),
        tooltip: None,
        icon: None,
        template: false,
        menu: None,
        entries: layout(None),
        revision: 0,
        menu_on_left_click: true,
      };
      apply(&mut tray, cmd, app_dir, app_name)?;
      // D-Bus calls reach the tray from the main loop, after it is stored.
      tray.bus = Some(export(&id)?);
      let json = tray_json(&id, &tray);
      TRAYS.with(|t| t.borrow_mut().insert(id, tray));
      Ok(json)
    }
    // Creating an existing id updates it (a reloaded page creates its tray again).
    "tray.create" | "tray.update" => TRAYS.with(|t| {
      let mut trays = t.borrow_mut();
      let tray = trays.get_mut(&id).ok_or_else(|| format!("no tray {id}"))?;
      apply(tray, cmd, app_dir, app_name)?;
      announce(tray);
      Ok(tray_json(&id, tray))
    }),
    "tray.remove" => {
      if let Some(tray) = TRAYS.with(|t| t.borrow_mut().remove(&id)) {
        remove(tray);
      }
      Ok("null".into())
    }
    // A synthetic click (tests): the event only, no menu.
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
