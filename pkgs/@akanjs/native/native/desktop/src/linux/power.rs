//! Keeping the display and the system awake on Linux (keep-awake plugin), over the session bus.
//!   power.preventSleep → null   an inhibitor, answered once the desktop granted it
//!   power.allowSleep   → null
//! Tried in order:
//! 1. The desktop portal: org.freedesktop.portal.Inhibit.Inhibit("", idle | suspend, {reason}) →
//!    a Request handle, released with org.freedesktop.portal.Request.Close. The portal forwards to
//!    GNOME's session manager, KDE's PowerDevil and the others, sandboxed or not.
//! 2. org.freedesktop.ScreenSaver.Inhibit(app, reason) → a cookie, released with UnInhibit (KDE,
//!    GNOME's gsd-screensaver-proxy, Xfce, Cinnamon). Idle only: the desktop's idle suspend follows it.
//! Both end when the app's bus connection closes, so a killed app never leaves the machine awake,
//! as caffeinate -w does on macOS. No service (a bare X server, the test container's D-Bus
//! session): UNSUPPORTED. Firefox tries the same services (widget/gtk/WakeLockListener.cpp); none of
//! the reference frameworks keep a Linux desktop awake. GTK's gtk_application_inhibit needs a
//! registered application id, which TAO does not set.

use std::cell::RefCell;

use gtk::{gio, glib, prelude::*};

/// Inhibit flags of the portal: 4 suspend, 8 idle (org.freedesktop.portal.Inhibit).
const SUSPEND_AND_IDLE: u32 = 4 | 8;
const TIMEOUT_MS: i32 = 10_000;

enum Held {
  None,
  /// Asking; these calls wait for the answer. `release`: allowSleep came meanwhile.
  Pending { waiting: Vec<u64>, release: bool },
  Portal(String),
  ScreenSaver(u32),
}

thread_local! {
  static HELD: RefCell<Held> = const { RefCell::new(Held::None) };
}

fn session() -> Result<gio::DBusConnection, String> {
  gio::bus_get_sync(gio::BusType::Session, gio::Cancellable::NONE).map_err(|e| format!("UNSUPPORTED: no D-Bus session bus: {e}"))
}

fn call(conn: &gio::DBusConnection, dest: &str, path: &str, iface: &str, method: &str, args: glib::Variant, reply: &str, done: impl FnOnce(Result<glib::Variant, glib::Error>) + 'static) {
  conn.call(Some(dest), path, iface, method, Some(&args), glib::VariantTy::new(reply).ok(), gio::DBusCallFlags::NONE, TIMEOUT_MS, gio::Cancellable::NONE, done);
}

fn release(conn: &gio::DBusConnection, held: Held) {
  let ignore = |r: Result<glib::Variant, glib::Error>| {
    if let Err(e) = r {
      log!("keep-awake: releasing the inhibitor failed: {e}");
    }
  };
  match held {
    Held::Portal(handle) => call(conn, "org.freedesktop.portal.Desktop", &handle, "org.freedesktop.portal.Request", "Close", glib::Variant::tuple_from_iter([] as [glib::Variant; 0]), "()", ignore),
    Held::ScreenSaver(cookie) => call(conn, "org.freedesktop.ScreenSaver", "/org/freedesktop/ScreenSaver", "org.freedesktop.ScreenSaver", "UnInhibit", (cookie,).to_variant(), "()", ignore),
    Held::None | Held::Pending { .. } => {}
  }
}

/// The inhibitor arrived (or not): answer every waiting call, or release it at once when
/// allowSleep came meanwhile.
fn settle(conn: &gio::DBusConnection, result: Result<Held, String>) {
  let pending = HELD.with(|h| std::mem::replace(&mut *h.borrow_mut(), Held::None));
  let Held::Pending { waiting, release: released } = pending else { return };
  let answer = match result {
    Ok(held) if released => {
      release(conn, held);
      Ok("null".to_string())
    }
    Ok(held) => {
      HELD.with(|h| *h.borrow_mut() = held);
      Ok("null".to_string())
    }
    Err(e) => Err(e),
  };
  for id in waiting {
    crate::reply(id, answer.clone());
  }
}

fn prevent(id: u64, app: &str) {
  let conn = match session() {
    Ok(conn) => conn,
    Err(e) => return crate::reply(id, Err(e)),
  };
  let started = HELD.with(|h| {
    let mut held = h.borrow_mut();
    match &mut *held {
      Held::Portal(_) | Held::ScreenSaver(_) => {
        crate::reply(id, Ok("null".into()));
        false
      }
      Held::Pending { waiting, release } => {
        waiting.push(id);
        *release = false;
        false
      }
      Held::None => {
        *held = Held::Pending { waiting: vec![id], release: false };
        true
      }
    }
  });
  if !started {
    return;
  }
  let reason = format!("{app} keeps the display on");
  let options = glib::VariantDict::new(None);
  options.insert_value("reason", &reason.to_variant());
  let args = glib::Variant::tuple_from_iter(["".to_variant(), SUSPEND_AND_IDLE.to_variant(), options.end()]);
  let (app, portal_conn) = (app.to_string(), conn.clone());
  call(&conn, "org.freedesktop.portal.Desktop", "/org/freedesktop/portal/desktop", "org.freedesktop.portal.Inhibit", "Inhibit", args, "(o)", move |result| {
    match result.map(|reply| reply.child_value(0).str().map(str::to_string)) {
      Ok(Some(handle)) => settle(&portal_conn, Ok(Held::Portal(handle))),
      portal => {
        let portal_error = portal.err().map_or_else(|| "no request handle".to_string(), |e| e.to_string());
        let conn = portal_conn.clone();
        call(&portal_conn, "org.freedesktop.ScreenSaver", "/org/freedesktop/ScreenSaver", "org.freedesktop.ScreenSaver", "Inhibit", (app.as_str(), reason.as_str()).to_variant(), "(u)", move |result| {
          let held = result.map(|reply| Held::ScreenSaver(reply.child_value(0).get::<u32>().unwrap_or(0))).map_err(|e| {
            format!("UNSUPPORTED: no inhibit service on the session bus (xdg-desktop-portal: {portal_error}; org.freedesktop.ScreenSaver: {e})")
          });
          settle(&conn, held);
        });
      }
    }
  });
}

fn allow(id: u64) {
  let held = HELD.with(|h| {
    let mut held = h.borrow_mut();
    if let Held::Pending { release, .. } = &mut *held {
      *release = true;
      return Held::None;
    }
    std::mem::replace(&mut *held, Held::None)
  });
  if !matches!(held, Held::None) {
    if let Ok(conn) = session() {
      release(&conn, held);
    }
  }
  crate::reply(id, Ok("null".into()));
}

/// `power.*` ops, answered through crate::reply; false for other ops. `app` names the app to the desktop.
pub fn async_op(id: u64, json_text: &str, app: &str) -> bool {
  if !json_text.contains("\"power.") {
    return false;
  }
  let Ok(cmd) = crate::json::parse(json_text) else { return false };
  match cmd.get("op").and_then(|v| v.as_str()) {
    Some("power.preventSleep") => prevent(id, app),
    Some("power.allowSleep") => allow(id),
    _ => return false,
  }
  true
}
