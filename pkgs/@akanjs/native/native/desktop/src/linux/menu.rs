//! Menus on Linux (menu plugin, plugins.md §5): a GtkMenuBar at the top of every window and
//! context menus, from the item trees and roles of chrome.rs, with the ops and events of menu.rs.
//! Also the shell's windows as the chrome plugins see them (menu bars, dock.rs taskbar hints).
//!
//! Know-how from the references:
//! - tao puts a vertical GtkBox into its ApplicationWindow (tao-0.37.0/src/platform_impl/linux/
//!   window.rs:165-171) and wry packs the WebKitWebView into it with expand (wry-0.57.0/src/
//!   webkitgtk/mod.rs:683-721). The menu bar goes into the same box, on top: Tauri and Dioxus add
//!   theirs before the webview (tauri-runtime-wry/src/lib.rs:4583-4617, dioxus/packages/desktop/
//!   src/webview.rs:500-537); a bar set later is moved up with reorder_child. A widget has one
//!   parent, so every window builds its own bar.
//! - One GtkAccelGroup per window. GTK activates accelerators before the focused widget, which is
//!   why the page's editing keys are only shown (chrome.rs).
//! - Context menus: gtk_menu_popup_at_pointer without a trigger event has no position (an IPC call
//!   has no current event), so the menu pops up at a rectangle of the window: the page position,
//!   or the pointer's. GTK shows it without a nested loop; the op answers once the menu is hidden.
//!   GTK hides the menu before it activates the chosen item, so the answer waits for an idle
//!   callback, after the click event.
//! - Electrobun has neither an app menu nor context menus on Linux (electrobun/package/src/native/
//!   linux/nativeWrapper.cpp:6127-6145, 10533-10540).
//!
//! No app menu by default: a Linux window has no menu bar unless the app sets one (macOS needs
//! its default menu for Cmd+C/V; WebKitGTK handles Ctrl+C/V itself).

use std::{
  cell::{Cell, RefCell},
  ffi::{c_char, c_void, CString},
  rc::Rc,
  time::Duration,
};

use gtk::{gdk, glib, prelude::*};
use tao::platform::unix::WindowExtUnix;

use crate::{
  chrome::{self, Clicked, Command, Edit, Node, Role, Source, Tree},
  json::V,
};

#[link(name = "webkit2gtk-4.1")]
extern "C" {
  /// WebKitGTK's editing commands ("Copy", "Paste", …) on a WebKitWebView; wry links the library.
  fn webkit_web_view_execute_editing_command(web_view: *mut c_void, command: *const c_char);
}

/// One shell window.
struct Window {
  id: u32,
  gtk: glib::WeakRef<gtk::ApplicationWindow>,
  vbox: glib::WeakRef<gtk::Box>,
  bar: Option<Bar>,
}

/// A window's menu bar: its widgets and accel group.
struct Bar {
  menubar: gtk::MenuBar,
  group: gtk::AccelGroup,
  /// Items by command index (menu.trigger, check marks).
  items: Vec<(usize, gtk::MenuItem)>,
}

thread_local! {
  static WINDOWS: RefCell<Vec<Window>> = const { RefCell::new(Vec::new()) };
  /// The app menu; None: no menu bar (the default).
  static APP: RefCell<Option<Tree>> = const { RefCell::new(None) };
  static APP_NAME: RefCell<String> = const { RefCell::new(String::new()) };
  /// Showing a toggle in the other windows: gtk_check_menu_item_set_active emits "activate" itself.
  static SYNCING: Cell<bool> = const { Cell::new(false) };
}

// ───────────────────────── windows ─────────────────────────

/// lib.rs open_window, for every window: the app menu and the dock's taskbar hint.
pub fn window_opened(id: u32, window: &tao::window::Window) {
  let Some(vbox) = window.default_vbox() else { return };
  let gtk_window = window.gtk_window();
  let mut entry = Window { id, gtk: gtk_window.downgrade(), vbox: vbox.downgrade(), bar: None };
  APP.with(|app| {
    if let Some(tree) = app.borrow().as_ref() {
      entry.bar = Some(install(&entry, tree));
    }
  });
  WINDOWS.with(|w| {
    let mut windows = w.borrow_mut();
    windows.retain(|w| w.gtk.upgrade().is_some());
    windows.push(entry);
  });
}

/// The shell's GTK windows (dock.rs), with their ids.
pub fn gtk_windows() -> Vec<(u32, gtk::ApplicationWindow)> {
  WINDOWS.with(|w| w.borrow().iter().filter_map(|w| Some((w.id, w.gtk.upgrade()?))).collect())
}

fn gtk_window_of(id: u32) -> Option<gtk::ApplicationWindow> {
  WINDOWS.with(|w| w.borrow().iter().find(|w| w.id == id).and_then(|w| w.gtk.upgrade()))
}

// ───────────────────────── building ─────────────────────────

/// What a click on an item acts on.
#[derive(Clone)]
enum Owner {
  /// The app menu of window `u32`.
  App(u32),
  /// A context menu of window `u32`, with its own tree.
  Popup(u32, Rc<RefCell<Tree>>),
}

fn append(shell: &impl IsA<gtk::MenuShell>, nodes: &[Node], owner: &Owner, group: Option<&gtk::AccelGroup>, items: &mut Vec<(usize, gtk::MenuItem)>) {
  for node in nodes {
    let widget: gtk::MenuItem = match node {
      Node::Separator => gtk::SeparatorMenuItem::new().upcast(),
      Node::Submenu { label, children, .. } => {
        let item = gtk::MenuItem::with_label(label);
        let menu = gtk::Menu::new();
        if let Some(group) = group {
          menu.set_accel_group(Some(group));
        }
        append(&menu, children, owner, group, items);
        item.set_submenu(Some(&menu));
        item
      }
      Node::Command(c) => {
        let item = command_item(c, owner, group);
        items.push((c.index, item.clone()));
        item
      }
    };
    shell.append(&widget);
  }
}

fn command_item(c: &Command, owner: &Owner, group: Option<&gtk::AccelGroup>) -> gtk::MenuItem {
  let item: gtk::MenuItem = match c.checked() {
    Some(on) => {
      let check = gtk::CheckMenuItem::with_label(&c.label);
      check.set_active(on);
      check.upcast()
    }
    None => gtk::MenuItem::with_label(&c.label),
  };
  item.set_sensitive(c.enabled);
  if let Some((key, mods)) = c.accelerator.as_ref().and_then(|a| Some((a.keysym()?, gdk::ModifierType::from_bits_truncate(a.gdk_modifiers())))) {
    match (c.key(), group) {
      (Some(_), Some(group)) => item.add_accelerator("activate", group, key, mods, gtk::AccelFlags::VISIBLE),
      // Shown only: the page's editing keys, and context menus (their keys work nowhere else either).
      _ => {
        if let Some(label) = item.child().and_then(|w| w.downcast::<gtk::AccelLabel>().ok()) {
          label.set_accel(key, mods);
        }
      }
    }
  }
  let index = c.index;
  let owner = owner.clone();
  item.connect_activate(move |_| clicked(&owner, index));
  item
}

/// Builds `tree` as the window's menu bar, above the webview.
fn install(window: &Window, tree: &Tree) -> Bar {
  let group = gtk::AccelGroup::new();
  let menubar = gtk::MenuBar::new();
  let mut items = Vec::new();
  append(&menubar, &tree.nodes, &Owner::App(window.id), Some(&group), &mut items);
  if let (Some(gtk_window), Some(vbox)) = (window.gtk.upgrade(), window.vbox.upgrade()) {
    gtk_window.add_accel_group(&group);
    vbox.pack_start(&menubar, false, false, 0);
    vbox.reorder_child(&menubar, 0);
    menubar.show_all();
  }
  Bar { menubar, group, items }
}

fn uninstall(window: &Window, bar: Bar) {
  if let Some(gtk_window) = window.gtk.upgrade() {
    gtk_window.remove_accel_group(&bar.group);
  }
  if let Some(vbox) = window.vbox.upgrade() {
    vbox.remove(&bar.menubar);
  }
}

/// Replaces every window's menu bar (None: no menu bar).
fn set_app(tree: Option<Tree>) {
  WINDOWS.with(|w| {
    for window in w.borrow_mut().iter_mut() {
      if let Some(bar) = window.bar.take() {
        uninstall(window, bar);
      }
      if let Some(tree) = &tree {
        window.bar = Some(install(window, tree));
      }
    }
  });
  APP.with(|a| *a.borrow_mut() = tree);
}

// ───────────────────────── clicks ─────────────────────────

fn clicked(owner: &Owner, index: usize) {
  if SYNCING.with(Cell::get) {
    return;
  }
  match owner {
    Owner::App(window) => {
      let result = APP.with(|a| a.borrow_mut().as_mut().map(|t| t.click(index, &Source::App)));
      match result {
        // Every window's bar shows the new state (GTK toggled the chosen item already).
        Some(Clicked::Item { checked: Some(on) }) => {
          SYNCING.with(|s| s.set(true));
          WINDOWS.with(|w| {
            for bar in w.borrow().iter().filter_map(|w| w.bar.as_ref()) {
              for (_, item) in bar.items.iter().filter(|(i, _)| *i == index) {
                if let Some(check) = item.downcast_ref::<gtk::CheckMenuItem>() {
                  check.set_active(on);
                }
              }
            }
          });
          SYNCING.with(|s| s.set(false));
        }
        // Window 0: triggered while no window has the bar.
        Some(Clicked::Role(role)) => perform(role, (*window != 0).then_some(*window)),
        _ => {}
      }
    }
    Owner::Popup(window, tree) => {
      let result = tree.borrow_mut().click(index, &Source::Context(*window));
      if let Clicked::Role(role) = result {
        perform(role, Some(*window));
      }
    }
  }
}

/// A standard item of window `window` (None: a tray menu).
pub fn perform(role: Role, window: Option<u32>) {
  let gtk_window = window.and_then(gtk_window_of);
  match role {
    Role::Quit => chrome::request_quit(),
    Role::About => about(gtk_window.as_ref()),
    r if r.is_window_role() => chrome::defer_window_role(r, window),
    r => {
      if let (Some(edit), Some(gtk_window)) = (r.edit(), gtk_window) {
        edit_command(&gtk_window, edit);
      }
    }
  }
}

/// `menu.windowRole` (chrome.rs defer_window_role).
pub fn window_role(cmd: &V, window: &tao::window::Window) -> Result<String, String> {
  chrome::window_role(cmd, window, || window.gtk_window().close())
}

fn about(parent: Option<&gtk::ApplicationWindow>) {
  let name = app_name();
  let dialog = gtk::AboutDialog::new();
  dialog.set_program_name(&name);
  dialog.set_title(&format!("About {name}"));
  if let Some(parent) = parent {
    dialog.set_transient_for(Some(parent));
    dialog.set_modal(true);
    if let Some(icon) = parent.icon() {
      dialog.set_logo(Some(&icon));
    }
  }
  dialog.connect_response(|dialog, _| dialog.close());
  dialog.present();
}

/// The window's WebKitWebView.
fn webview_widget(window: &gtk::ApplicationWindow) -> Option<gtk::Widget> {
  let webkit = glib::Type::from_name("WebKitWebView")?;
  fn find(widget: &gtk::Widget, webkit: glib::Type) -> Option<gtk::Widget> {
    if widget.type_().is_a(webkit) {
      return Some(widget.clone());
    }
    widget.downcast_ref::<gtk::Container>()?.children().iter().find_map(|child| find(child, webkit))
  }
  find(window.upcast_ref(), webkit)
}

fn edit_command(window: &gtk::ApplicationWindow, edit: Edit) {
  let command = match edit {
    Edit::Undo => "Undo",
    Edit::Redo => "Redo",
    Edit::Cut => "Cut",
    Edit::Copy => "Copy",
    Edit::Paste => "Paste",
    Edit::PastePlain => "PasteAsPlainText",
    Edit::Delete => "Delete",
    Edit::SelectAll => "SelectAll",
  };
  let Some(webview) = webview_widget(window) else { return };
  let command = CString::new(command).unwrap();
  // Safety: a live WebKitWebView (checked by type) and a NUL-terminated command name.
  unsafe { webkit_web_view_execute_editing_command(webview.as_ptr() as *mut c_void, command.as_ptr()) };
}

// ───────────────────────── ops ─────────────────────────

fn trigger(id: &str) -> Result<(), String> {
  let index = APP.with(|a| a.borrow().as_ref().and_then(|t| t.find(id))).ok_or_else(|| format!("no menu item {id:?}"))?;
  // As if the user chose it in the most recently opened window: GTK toggles a check item first.
  let item = WINDOWS.with(|w| w.borrow().iter().rev().filter_map(|w| w.bar.as_ref()).find_map(|b| b.items.iter().find(|(i, _)| *i == index).map(|(_, item)| item.clone())));
  match item {
    Some(item) => {
      item.activate();
    }
    None => clicked(&Owner::App(0), index),
  }
  Ok(())
}

/// The app's name, for "About <app>" (kept from the ops, which have the shell config).
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

/// menu.* shell ops that need no window; None for other ops (menu.popup: popup).
pub fn shell_op(op: &str, cmd: &V, app_name: &str) -> Option<Result<String, String>> {
  set_app_name(app_name);
  let result = match op {
    "menu.setApp" => cmd.get("items").ok_or_else(|| "items is required".to_string()).and_then(|items| chrome::parse_app_menu(items, app_name)).map(|tree| {
      set_app(Some(tree));
      "null".to_string()
    }),
    "menu.reset" => {
      set_app(None);
      Ok("null".into())
    }
    "menu.get" => Ok(APP.with(|a| a.borrow().as_ref().map_or_else(|| "[]".to_string(), Tree::to_json))),
    "menu.trigger" => match cmd.get("id").and_then(|v| v.as_str()) {
      Some(id) => trigger(id).map(|()| "null".into()),
      None => Err("id must be a string".into()),
    },
    _ => return None,
  };
  Some(result)
}

/// menu.popup { items, x?, y?, closeAfterMs?, window }, answered once the menu is closed.
pub fn async_op(id: u64, json: &str, windows: &crate::Windows) -> bool {
  if !json.contains("\"menu.popup\"") {
    return false;
  }
  let Ok(cmd) = crate::json::parse(json) else { return false };
  if cmd.get("op").and_then(|v| v.as_str()) != Some("menu.popup") {
    return false;
  }
  if let Err(e) = show_popup(id, &cmd, windows) {
    crate::reply(id, Err(e));
  }
  true
}

fn show_popup(id: u64, cmd: &V, windows: &crate::Windows) -> Result<(), String> {
  use wry::WebViewExtUnix;
  let wid = match crate::window_arg(cmd)? {
    Some(w) => w,
    None => windows.primary().ok_or("there is no window")?,
  };
  let win = windows.map.get(&wid).ok_or_else(|| format!("no window {wid}"))?;
  let tree = chrome::parse(cmd.get("items").ok_or("items is required")?, &windows.shell.title)?;
  let at = match (cmd.get("x").and_then(|v| v.as_f64()), cmd.get("y").and_then(|v| v.as_f64())) {
    (Some(x), Some(y)) if x.is_finite() && y.is_finite() => Some((x, y)),
    (None, None) => None,
    _ => return Err("give both x and y (CSS px), or neither for the mouse position".into()),
  };
  let close_after = cmd.get("closeAfterMs").and_then(|v| v.as_f64()).filter(|ms| ms.is_finite() && *ms >= 0.0);

  let toplevel = win.window.gtk_window();
  let surface = toplevel.window().ok_or("the window is not shown")?;
  let webview: gtk::Widget = win.webview.webview().upcast();
  // The rectangle: the page position (webview coordinates) or the pointer, in the toplevel's GdkWindow.
  let (x, y) = match at {
    Some((x, y)) => webview.translate_coordinates(toplevel, x as i32, y as i32).ok_or("the webview is not in its window")?,
    None => {
      let pointer = gdk::Display::default().and_then(|d| d.default_seat()).and_then(|s| s.pointer()).ok_or("there is no pointer")?;
      let (_, x, y, _) = surface.device_position(&pointer);
      (x, y)
    }
  };

  let menu = gtk::Menu::new();
  let owner = Owner::Popup(wid, Rc::new(RefCell::new(tree)));
  if let Owner::Popup(_, tree) = &owner {
    append(&menu, &tree.borrow().nodes, &owner, None, &mut Vec::new());
  }
  // Attached to the webview: the popup's parent surface on Wayland, and it lives as long as that.
  unsafe {
    use gtk::glib::translate::ToGlibPtr;
    gtk::ffi::gtk_menu_attach_to_widget(menu.to_glib_none().0, webview.to_glib_none().0, None);
  }
  menu.show_all();
  let answered = Rc::new(Cell::new(false));
  let answer = {
    let answered = answered.clone();
    move || {
      if !answered.replace(true) {
        crate::reply(id, Ok("null".into()));
      }
    }
  };
  let answer = Rc::new(answer);
  {
    let answer = answer.clone();
    // After the chosen item's activate (GTK hides the menu first), then let the menu go.
    menu.connect_hide(move |menu| {
      let answer = answer.clone();
      let menu = menu.clone();
      glib::idle_add_local_once(move || {
        answer();
        menu.detach();
      });
    });
  }
  let rect = gdk::Rectangle::new(x, y, 1, 1);
  menu.popup_at_rect(&surface, &rect, gdk::Gravity::NorthWest, gdk::Gravity::NorthWest, None);
  if !menu.is_visible() {
    answered.set(true);
    menu.detach();
    return Err("INTERNAL: GTK could not show the menu (no pointer grab)".into());
  }
  if let Some(ms) = close_after {
    let menu = menu.downgrade();
    glib::timeout_add_local_once(Duration::from_millis(ms as u64), move || {
      if let Some(menu) = menu.upgrade() {
        menu.deactivate();
      }
    });
  }
  Ok(())
}
