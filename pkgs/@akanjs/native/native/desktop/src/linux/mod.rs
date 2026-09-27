//! Linux parts of the shell: the plugins' native side (as menu.rs, tray.rs, … are on macOS).
//! GTK, GLib and GIO (including GDBus for desktop services) are reached through gtk-rs, the crates
//! tao and wry already use (only features are added, like objc2 on macOS). lib.rs calls three
//! entry points:
//!   shell_op   app-wide ops, answered at once on the main thread
//!   window_op  ops on one window (the `window` argument, else the primary window)
//!   async_op   ops answered later through crate::reply (dialogs, D-Bus calls, threads)

pub mod appearance;
pub mod camera;
pub mod clipboard;
pub mod device;
pub mod dialogs;
mod dock;
mod hotkey;
pub mod keychain;
mod menu;
pub mod notify;
pub mod open;
pub mod power;
mod screen;
mod tray;

use std::path::Path;

use gtk::gio;
use tao::event_loop::EventLoopWindowTarget;

use crate::{json, Shell, UserEvent, Win, Windows};

/// The app icon from the CLI's icon.rgba in `resources` ([u32 width LE][u32 height LE][RGBA]),
/// downscaled by averaging to at most `side` pixels square: (side, RGBA). For notifications and
/// for trays without an icon of their own.
pub fn app_icon(resources: &Path, side: u32) -> Option<(u32, Vec<u8>)> {
  let bytes = std::fs::read(resources.join("icon.rgba")).ok()?;
  let (w, h) = (u32::from_le_bytes(bytes.get(0..4)?.try_into().ok()?), u32::from_le_bytes(bytes.get(4..8)?.try_into().ok()?));
  let rgba = bytes.get(8..)?;
  if w == 0 || h == 0 || rgba.len() != (w * h * 4) as usize {
    return None;
  }
  let side = side.min(w).min(h);
  let mut out = Vec::with_capacity((side * side * 4) as usize);
  for y in 0..side {
    for x in 0..side {
      let (x0, x1, y0, y1) = (x * w / side, ((x + 1) * w / side).max(x * w / side + 1), y * h / side, ((y + 1) * h / side).max(y * h / side + 1));
      let mut sum = [0u32; 4];
      for sy in y0..y1 {
        for sx in x0..x1 {
          let p = ((sy * w + sx) * 4) as usize;
          for c in 0..4 {
            sum[c] += rgba[p + c] as u32;
          }
        }
      }
      let n = (x1 - x0) * (y1 - y0);
      out.extend(sum.iter().map(|s| (s / n) as u8));
    }
  }
  Some((side, out))
}

/// App-wide ops. None: not one of this OS's ops.
pub fn shell_op(op: &str, cmd: &json::V, target: &EventLoopWindowTarget<UserEvent>, shell: &Shell) -> Option<Result<String, String>> {
  let _ = (target, shell);
  // shell.handler: opener; clipboard.writeText; camera.*; webview.version: device
  open::shell_op(op, cmd)
    .or_else(|| clipboard::shell_op(op, cmd))
    .or_else(|| camera::shell_op(op))
    .or_else(|| device::shell_op(op))
    // menu.*, tray.*, hotkey.*: global-shortcut; dock.*: dock and badge; screen.*
    .or_else(|| menu::shell_op(op, cmd, &shell.title))
    .or_else(|| tray::shell_op(op, cmd, &shell.app_dir, &shell.title))
    .or_else(|| hotkey::shell_op(op, cmd))
    .or_else(|| dock::shell_op(op, cmd, &shell.app_id))
    .or_else(|| screen::shell_op(op))
}

/// Ops on one window. None: not handled here.
pub fn window_op(op: &str, cmd: &json::V, id: u32, win: &Win) -> Option<Result<String, String>> {
  let _ = id;
  // menu.windowRole: a menu item's minimize, zoom, full screen or close (chrome.rs)
  (op == "menu.windowRole").then(|| menu::window_role(cmd, &win.window))
}

/// Ops answered later through crate::reply. true: taken.
pub fn async_op(id: u64, json: &str, windows: &Windows) -> bool {
  // alert.* and panel.*: dialog and file-picker plugins
  dialogs::async_op(id, json, windows)
    // menu.popup: answered when the context menu closes
    || menu::async_op(id, json, windows)
    // notify.*: local-notifications; keychain.*: secure-storage (the Secret Service)
    || notify::async_op(id, json, &windows.shell.app_dir)
    || keychain::async_op(id, json)
    // shell.open: opener, browser, auth-session; clipboard.readText; power.*: keep-awake
    || open::async_op(id, json)
    || clipboard::async_op(id, json)
    || power::async_op(id, json, &windows.shell.title)
}

/// lib.rs open_window, for every window: the app menu bar and the dock's taskbar hint.
pub fn window_opened(id: u32, window: &tao::window::Window) {
  use tao::platform::unix::WindowExtUnix;
  menu::window_opened(id, window);
  dock::window_opened(window.gtk_window());
}

/// Opens a URL (or file) with its default handler (xdg-open's database, through GIO).
pub fn open_url(url: &str) -> bool {
  match gio::AppInfo::launch_default_for_uri(url, None::<&gio::AppLaunchContext>) {
    Ok(()) => true,
    Err(e) => {
      log!("cannot open {url}: {e}");
      false
    }
  }
}
