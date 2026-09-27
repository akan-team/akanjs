//! The dock plugin (and the badge plugin's count) on Linux, with the ops and state of dock.rs:
//!   dock.setBadge    → the launcher entry's count: com.canonical.Unity.LauncherEntry
//!   dock.setProgress → its progress bar (paused and error draw like normal)
//!   dock.setVisible  → the windows' skip-taskbar and skip-pager hints
//!   dock.getState
//!
//! The LauncherEntry API is a D-Bus signal, Update(s app_uri, a{sv} properties), which docks and
//! task managers that support it (Ubuntu's dock, Dash to Dock, KDE Plasma's task manager) match to
//! the app's desktop entry. tao reaches it through libunity with dlopen and only while Unity itself
//! runs (tao-0.37.0/src/platform_impl/linux/taskbar.rs:52-97); here GDBus emits the signal on the
//! session bus directly, and the object also answers Query() for a dock that starts later. Tauri
//! names the entry "<package>.desktop" (tauri/crates/tauri/src/window/mod.rs:2406-2440); akan-native uses
//! the app id, "application://<app id>.desktop", so the app's desktop file must be named so.
//! Without such a desktop entry (a plain `akan-native run`), nothing shows, but the state is kept.
//!
//! A launcher shows a count, not text: labels other than a whole number are UNSUPPORTED.

use std::cell::RefCell;

use gtk::{
  gio,
  glib::{self, ToVariant, Variant},
  prelude::*,
};

use crate::{
  chrome::{self, Progress},
  json::V,
};

const PATH: &str = "/com/canonical/unity/launcherentry/akan_native";
const INTERFACE: &str = "com.canonical.Unity.LauncherEntry";
const XML: &str = r#"<node><interface name="com.canonical.Unity.LauncherEntry">
<method name="Query"><arg type="s" name="app_uri" direction="out"/><arg type="a{sv}" name="properties" direction="out"/></method>
<signal name="Update"><arg type="s" name="app_uri"/><arg type="a{sv}" name="properties"/></signal>
</interface></node>"#;

#[derive(Default)]
struct State {
  badge: Option<String>,
  progress: Option<Progress>,
  hidden: bool,
  app_uri: String,
  conn: Option<gio::DBusConnection>,
}

thread_local! {
  static STATE: RefCell<State> = RefCell::new(State::default());
}

fn properties(state: &State) -> Variant {
  let dict = glib::VariantDict::new(None);
  let count = state.badge.as_deref().and_then(|b| b.parse::<i64>().ok());
  dict.insert_value("count", &count.unwrap_or(0).to_variant());
  dict.insert_value("count-visible", &count.is_some().to_variant());
  dict.insert_value("progress", &state.progress.map_or(0.0, |p| p.value).to_variant());
  dict.insert_value("progress-visible", &state.progress.is_some().to_variant());
  dict.end()
}

/// The session bus, with the launcher entry object exported once.
fn connection(state: &mut State) -> Result<gio::DBusConnection, String> {
  if let Some(conn) = &state.conn {
    return Ok(conn.clone());
  }
  let conn = gio::bus_get_sync(gio::BusType::Session, None::<&gio::Cancellable>).map_err(|e| format!("UNSUPPORTED: no D-Bus session bus for the launcher entry: {e}"))?;
  let info = gio::DBusNodeInfo::for_xml(XML).ok().and_then(|n| n.lookup_interface(INTERFACE)).expect("valid introspection XML");
  let registered = conn.register_object(
    PATH,
    &info,
    |_, _, _, _, _, _, invocation| {
      let reply = STATE.with(|s| {
        let state = s.borrow();
        Variant::tuple_from_iter([state.app_uri.to_variant(), properties(&state)])
      });
      invocation.return_value(Some(&reply));
    },
    |_, _, _, _, _| "".to_variant(),
    |_, _, _, _, _, _| false,
  );
  if let Err(e) = registered {
    log!("launcher entry: {e}"); // the signal works without the object
  }
  state.conn = Some(conn.clone());
  Ok(conn)
}

fn update(state: &mut State) -> Result<(), String> {
  let conn = connection(state)?;
  let args = Variant::tuple_from_iter([state.app_uri.to_variant(), properties(state)]);
  conn.emit_signal(None, PATH, INTERFACE, "Update", Some(&args)).map_err(|e| format!("INTERNAL: launcher entry: {e}"))
}

/// A new window gets the app's taskbar hint (lib.rs open_window → menu.rs window_opened).
pub fn window_opened(window: &gtk::ApplicationWindow) {
  if STATE.with(|s| s.borrow().hidden) {
    hide(window, true);
  }
}

fn hide(window: &gtk::ApplicationWindow, hidden: bool) {
  window.set_skip_taskbar_hint(hidden);
  window.set_skip_pager_hint(hidden);
}

fn state_json(state: &State) -> String {
  chrome::dock_state_json(state.badge.as_deref(), !state.hidden, state.progress)
}

/// dock.* shell ops; None for other ops.
pub fn shell_op(op: &str, cmd: &V, app_id: &str) -> Option<Result<String, String>> {
  if !op.starts_with("dock.") {
    return None;
  }
  Some(STATE.with(|s| {
    let mut state = s.borrow_mut();
    // Without an app id (a bare shell), the executable's name.
    let exe = || std::env::current_exe().ok().and_then(|p| p.file_stem().map(|s| s.to_string_lossy().into_owned())).unwrap_or_default();
    state.app_uri = format!("application://{}.desktop", if app_id.is_empty() { exe() } else { app_id.to_string() });
    match op {
      "dock.getState" => {}
      "dock.setBadge" => {
        let label = chrome::parse_label(cmd)?;
        if let Some(text) = &label {
          if text.parse::<i64>().map_or(true, |n| n < 0) {
            return Err(format!("UNSUPPORTED: Linux launchers show a count; {text:?} is not a whole number"));
          }
        }
        state.badge = label;
        update(&mut state)?;
      }
      "dock.setProgress" => {
        state.progress = chrome::parse_progress(cmd)?;
        update(&mut state)?;
      }
      "dock.setVisible" => {
        state.hidden = !chrome::parse_visible(cmd)?;
        for (_, window) in super::menu::gtk_windows() {
          hide(&window, state.hidden);
        }
      }
      _ => return Err(format!("unknown op {op}")),
    }
    Ok(state_json(&state))
  }))
}
