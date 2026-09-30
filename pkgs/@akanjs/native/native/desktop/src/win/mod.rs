//! Windows parts of the shell: the plugins' native side (as menu.rs, tray.rs, … are on macOS).
//! Win32 is reached through windows-rs, the crate tao and wry already use (only features are
//! added, like objc2 on macOS). lib.rs calls four entry points:
//!   shell_op   app-wide ops, answered at once on the main thread
//!   window_op  ops on one window (the `window` argument, else the primary window)
//!   async_op   ops answered later through crate::reply (dialogs, notifications, threads)
//!   msg_hook   every Win32 message before tao dispatches it (hotkeys, tray icon callbacks)

pub mod appearance;
pub mod autostart;
pub mod camera;
pub mod clipboard;
pub mod device;
pub mod dialogs;
mod dock;
mod hotkey;
pub mod keychain;
mod menu;
pub(crate) mod msgwin;
pub mod notify;
pub mod open;
pub mod power;
pub mod registry;
mod screen;
mod volume;
mod tray;

use std::ffi::c_void;

use tao::event_loop::EventLoopWindowTarget;
use windows::core::{HSTRING, PCWSTR};
use windows::Win32::UI::Shell::ShellExecuteW;
use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

use crate::{json, Shell, UserEvent, Win, Windows};

/// App-wide ops. None: not one of this OS's ops.
pub fn shell_op(op: &str, cmd: &json::V, target: &EventLoopWindowTarget<UserEvent>, shell: &Shell) -> Option<Result<String, String>> {
  // shell.handler: opener; power.*: keep-awake; autostart.*; camera.*; device.*, webview.version: device
  open::shell_op(op, cmd)
    .or_else(|| power::shell_op(op, &shell.title))
    .or_else(|| autostart::shell_op(op, cmd))
    .or_else(|| camera::shell_op(op))
    .or_else(|| device::shell_op(op))
    // keychain.*: secure-storage (the Credential Manager)
    .or_else(|| keychain::shell_op(op, cmd))
    // menu.*, tray.*, hotkey.*: global-shortcut; dock.*: dock and badge; screen.*; volume.*
    .or_else(|| menu::shell_op(op, cmd, &shell.title))
    .or_else(|| tray::shell_op(op, cmd, &shell.app_dir, &shell.title))
    .or_else(|| hotkey::shell_op(op, cmd))
    .or_else(|| dock::shell_op(op, cmd))
    .or_else(|| screen::shell_op(op, target))
    .or_else(|| volume::shell_op(op, cmd))
}

/// Ops on one window. None: not handled here.
pub fn window_op(op: &str, cmd: &json::V, id: u32, win: &Win) -> Option<Result<String, String>> {
  use tao::platform::windows::WindowExtWindows;
  // menu.popup: context menus; menu.windowRole: a menu item's minimize, zoom, full screen or close
  match op {
    "menu.popup" => return Some(menu::popup(cmd, id, win)),
    "menu.windowRole" => return Some(menu::window_role(cmd, &win.window)),
    _ => {}
  }
  // clipboard.*: the window owns what the app copies
  clipboard::window_op(op, cmd, win.window.hwnd())
}

/// Ops answered later through crate::reply. true: taken.
pub fn async_op(id: u64, json: &str, windows: &Windows) -> bool {
  // shell.open: opener, browser, auth-session (ShellExecuteEx on a thread)
  open::async_op(id, json)
    // notify.*: local-notifications (toasts)
    || notify::async_op(id, json, &windows.shell.app_dir)
    // alert.* and panel.*: dialog and file-picker plugins
    || dialogs::async_op(id, json, windows)
}

/// lib.rs open_window, for every window: the app menu bar, menu accelerators and taskbar state.
pub fn window_opened(id: u32, window: &tao::window::Window, webview: &wry::WebView) {
  // menu.rs: the app menu bar, its accelerators in the page, the taskbar button's dock state
  menu::window_opened(id, window, webview);
  // The theme the app set (appearance plugin), for prefers-color-scheme in the new window.
  appearance::apply(webview);
}

/// Every message of the main thread's queue before tao dispatches it. true: consumed.
pub fn msg_hook(msg: *const c_void) -> bool {
  // App menu accelerators while a window of the app itself has the focus (menu.rs)
  menu::translate(msg as *const windows::Win32::UI::WindowsAndMessaging::MSG)
}

/// Opens a URL (or file) with its default handler: the system browser for http and https.
pub fn open_url(url: &str) -> bool {
  let result = unsafe { ShellExecuteW(None, &HSTRING::from("open"), &HSTRING::from(url), PCWSTR::null(), PCWSTR::null(), SW_SHOWNORMAL) };
  // ShellExecute returns a value greater than 32 on success.
  let ok = result.0 as isize > 32;
  if !ok {
    log!("cannot open {url}: ShellExecute returned {}", result.0 as isize);
  }
  ok
}
