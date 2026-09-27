//! Local notifications on Linux: the desktop's notification server (org.freedesktop.Notifications,
//! Desktop Notifications Specification 1.2) on the session bus, through GDBus from gtk-rs (no
//! notify-rust or libnotify binding). tauri-plugins-workspace/plugins/notification goes through
//! notify-rust, which makes the same Notify call. The server only shows: it keeps no schedule
//! (notify_schedule.rs does) and cannot list what it shows, so the shown ones are remembered here
//! until the server reports them closed.
//!   notify.status / notify.request → {"status": 2} while a server answers: showing needs no
//!     permission and there is nothing to ask. UNSUPPORTED when the session has no server (not
//!     even a D-Bus activatable one) or no session bus.
//!   notify.add / notify.pending / notify.removePending → notify_schedule.rs
//!   notify.delivered → the shown ones, with the time they were shown
//!   notify.removeDelivered {ids} → CloseNotification
//! Argument `app` {id, name}: the name is the notification's app_name.
//! Events: "received" when one is shown, "action" when its body is clicked (the "default" action).
//! A clicked notification is then closed, as on macOS and Windows: servers close it themselves
//! (spec: unless it is "resident"), but not all do (dunstctl action, checked), so the shell asks too.

use std::collections::HashMap;
use std::path::Path;
use std::sync::{Mutex, Once, OnceLock};

use gtk::gio;
use gtk::glib::{self, ToVariant, Variant, VariantTy};

use crate::json;
use crate::notify_schedule::{self as schedule, Item};

const NAME: &str = "org.freedesktop.Notifications";
const PATH: &str = "/org/freedesktop/Notifications";
/// Per call, D-Bus activation of the server included.
const TIMEOUT_MS: i32 = 10_000;
/// Side of the image sent with each notification (the app icon, downscaled from icon.rgba).
const IMAGE_SIDE: u32 = 64;

struct Shown {
  /// The server's id for it.
  server: u32,
  item: Item,
  date: f64,
}

static SHOWN: Mutex<Vec<Shown>> = Mutex::new(Vec::new());
static APP_NAME: Mutex<String> = Mutex::new(String::new());
static IMAGE: OnceLock<Option<Variant>> = OnceLock::new();
static SUBSCRIBE: Once = Once::new();

fn bus() -> Result<gio::DBusConnection, String> {
  gio::bus_get_sync(gio::BusType::Session, None::<&gio::Cancellable>).map_err(|e| format!("UNSUPPORTED: no D-Bus session bus ({e})"))
}

/// The D-Bus error name of a failed call ("GDBus.Error:<name>: <message>").
fn remote_error(e: &glib::Error) -> Option<String> {
  let rest = e.message().strip_prefix("GDBus.Error:")?;
  Some(rest.split_once(':').map_or(rest, |(name, _)| name).to_string())
}

fn call(conn: &gio::DBusConnection, method: &str, args: Option<&Variant>, reply: &str) -> Result<Variant, glib::Error> {
  let reply = VariantTy::new(reply).expect("a D-Bus reply type");
  conn.call_sync(Some(NAME), PATH, NAME, method, args, Some(reply), gio::DBusCallFlags::NONE, TIMEOUT_MS, None::<&gio::Cancellable>)
}

fn status() -> Result<String, String> {
  let conn = bus()?;
  match call(&conn, "GetServerInformation", None, "(ssss)") {
    Ok(_) => Ok(r#"{"status":2}"#.into()),
    Err(e) => match remote_error(&e).as_deref() {
      Some(name) if name == "org.freedesktop.DBus.Error.ServiceUnknown" || name == "org.freedesktop.DBus.Error.NameHasNoOwner" || name.starts_with("org.freedesktop.DBus.Error.Spawn.") => {
        Err(format!("UNSUPPORTED: this session has no notification server ({NAME}): {}", e.message()))
      }
      _ => Err(format!("INTERNAL: the notification server did not answer: {}", e.message())),
    },
  }
}

/// The app icon as the "image-data" hint (iiibiiay), from the CLI's icon.rgba next to the app
/// folder.
fn image(resources: &Path) -> Option<Variant> {
  let (side, rgba) = super::app_icon(resources, IMAGE_SIDE)?;
  let side = side as i32;
  Some(Variant::tuple_from_iter([
    side.to_variant(),
    side.to_variant(),
    (side * 4).to_variant(),
    true.to_variant(),
    8i32.to_variant(),
    4i32.to_variant(),
    Variant::array_from_fixed_array(&rgba),
  ]))
}

fn event(kind: &str, item: &Item) {
  crate::push_event(&format!(r#"{{"type":"notification","event":"{kind}","notification":{}}}"#, item.json(None)));
}

fn show(item: &Item) -> Result<(), String> {
  let conn = bus()?;
  let mut hints: HashMap<String, Variant> = HashMap::new();
  if let Some(image) = IMAGE.get().and_then(Option::as_ref) {
    hints.insert("image-data".into(), image.clone());
  }
  let app_name = APP_NAME.lock().unwrap().clone();
  // Held across the call, so a NotificationClosed for the new id cannot be handled before it is known.
  let mut shown = SHOWN.lock().unwrap();
  // The same id again replaces the one on screen, as a request with the same identifier does on macOS.
  let replaces = shown.iter().find(|s| s.item.id == item.id).map_or(0, |s| s.server);
  // "default" is the click on the body (spec: the action key of the default action).
  let args = (app_name, replaces, "", item.title.as_str(), item.body.as_str(), vec!["default", "Open"], hints, -1i32).to_variant();
  let reply = call(&conn, "Notify", Some(&args), "(u)").map_err(|e| format!("the notification server refused it: {}", e.message()))?;
  let (server,) = reply.get::<(u32,)>().ok_or("Notify answered no id")?;
  shown.retain(|s| s.item.id != item.id && s.server != server);
  shown.push(Shown { server, item: item.clone(), date: schedule::now_ms() });
  drop(shown);
  event("received", item);
  Ok(())
}

fn on_signal(member: &str, params: &Variant) {
  match member {
    "ActionInvoked" => {
      let Some((server, key)) = params.get::<(u32, String)>() else { return };
      if key != "default" {
        return;
      }
      let item = {
        let mut shown = SHOWN.lock().unwrap();
        let item = shown.iter().find(|s| s.server == server).map(|s| s.item.clone());
        shown.retain(|s| s.server != server);
        item
      };
      let Some(item) = item else { return };
      event("action", &item);
      // From the main loop, like this callback; nothing waits for the answer.
      if let Ok(conn) = bus() {
        let args = (server,).to_variant();
        conn.call(Some(NAME), PATH, NAME, "CloseNotification", Some(&args), None, gio::DBusCallFlags::NONE, TIMEOUT_MS, None::<&gio::Cancellable>, |_| {});
      }
    }
    "NotificationClosed" => {
      if let Some((server, _reason)) = params.get::<(u32, u32)>() {
        SHOWN.lock().unwrap().retain(|s| s.server != server);
      }
    }
    _ => {}
  }
}

/// Local days through GLib's calendar arithmetic (g_date_time_add_days keeps the time of day).
fn add_days(ms: f64, days: i64) -> f64 {
  let secs = (ms / 1000.0).floor();
  let local = glib::DateTime::from_unix_local(secs as i64).and_then(|d| d.add_days(days as i32));
  match local {
    Ok(d) => d.to_unix() as f64 * 1000.0 + (ms - secs * 1000.0),
    Err(_) => ms + days as f64 * 86_400_000.0,
  }
}

fn run(op: &str, cmd: &json::V) -> Result<String, String> {
  if let Some(name) = cmd.get("app").and_then(|a| a.get("name")).and_then(|v| v.as_str()) {
    *APP_NAME.lock().unwrap() = name.to_string();
  }
  if let Some(result) = schedule::op(op, cmd) {
    return result;
  }
  match op {
    "notify.status" | "notify.request" => status(),
    "notify.delivered" => {
      let shown = SHOWN.lock().unwrap();
      Ok(format!("[{}]", shown.iter().map(|s| s.item.json(Some(s.date))).collect::<Vec<_>>().join(",")))
    }
    "notify.removeDelivered" => {
      let ids = schedule::ids(cmd)?;
      let servers: Vec<u32> = {
        let mut shown = SHOWN.lock().unwrap();
        let servers = shown.iter().filter(|s| ids.contains(&s.item.id)).map(|s| s.server).collect();
        shown.retain(|s| !ids.contains(&s.item.id));
        servers
      };
      if !servers.is_empty() {
        let conn = bus()?;
        for server in servers {
          // Already closed by the user or expired meanwhile: nothing to do.
          let _ = call(&conn, "CloseNotification", Some(&(server,).to_variant()), "()");
        }
      }
      Ok("null".into())
    }
    _ => Err(format!("unknown op {op}")),
  }
}

/// notify.* ops, answered from a thread (a D-Bus call can wait for the server to start).
/// `app_dir`: the shell's app folder, next to the CLI's icon.rgba.
pub fn async_op(id: u64, json_text: &str, app_dir: &Path) -> bool {
  if !json_text.contains("\"notify.") {
    return false;
  }
  let Ok(cmd) = json::parse(json_text) else { return false };
  let Some(op) = cmd.get("op").and_then(|v| v.as_str()).filter(|op| op.starts_with("notify.")) else { return false };
  IMAGE.get_or_init(|| app_dir.parent().and_then(image));
  schedule::start(schedule::Host { show, add_days });
  // On the main thread: GDBus runs signal callbacks on the context of the thread that subscribed,
  // here the main loop (GTK's, which tao runs).
  if let Ok(conn) = bus() {
    SUBSCRIBE.call_once(|| {
      conn.signal_subscribe(Some(NAME), Some(NAME), None, Some(PATH), None, gio::DBusSignalFlags::NONE, |_, _, _, _, member, params| on_signal(member, params));
    });
  }
  let op = op.to_string();
  std::thread::spawn(move || crate::reply(id, run(&op, &cmd)));
  true
}
