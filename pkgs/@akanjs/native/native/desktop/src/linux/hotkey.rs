//! Global shortcuts on Linux (global-shortcut plugin, plugins.md §5): XGrabKey on the X root
//! window, with the ops and events of hotkey.rs. libX11 and GDK's X11 calls are declared here
//! (no crate); the display is GDK's own, so key presses arrive through GDK's event source on the
//! main thread, like every other event.
//!
//! Know-how from the references:
//! - Electrobun grabs every combination four times, plain and with NumLock (Mod2) and CapsLock
//!   (Lock), since X matches the modifier state exactly (electrobun/package/src/native/linux/
//!   nativeWrapper.cpp:11910-11922; tao's old implementation did the same, tao/CHANGELOG.md:641-646).
//!   It opens a second display on a polling thread and never sees a failed grab (:11917-11925);
//!   here GDK's error trap around XSync reports BadAccess, a combination another client holds,
//!   and a GDK filter on the root window takes the key events (the way the keybinder library does).
//! - owner_events False: the press is always reported on the root window, also when one of the
//!   app's own windows has the focus.
//! - GDK turns on detectable auto-repeat, so a held key sends presses without releases: only the
//!   first press of a hold is reported, as with MOD_NOREPEAT on Windows.
//! - Wayland has no global grabs. GNOME and KDE offer shortcuts there only through the
//!   GlobalShortcuts portal, which asks the user to approve every binding: UNSUPPORTED for now.
//!
//! Keys are keysyms turned into the current layout's key codes (accelerator.rs keysym).

use std::{
  cell::RefCell,
  ffi::{c_int, c_uchar, c_uint, c_ulong, c_void},
};

use gtk::{gdk, glib::translate::ToGlibPtr, prelude::*};

use crate::{accelerator, json, push_event};

type XDisplay = c_void;

/// XKeyEvent (X11/Xlib.h); KeyPress and KeyRelease share it.
#[repr(C)]
struct XKeyEvent {
  kind: c_int,
  serial: c_ulong,
  send_event: c_int,
  display: *mut XDisplay,
  window: c_ulong,
  root: c_ulong,
  subwindow: c_ulong,
  time: c_ulong,
  x: c_int,
  y: c_int,
  x_root: c_int,
  y_root: c_int,
  state: c_uint,
  keycode: c_uint,
  same_screen: c_int,
}

#[link(name = "X11")]
extern "C" {
  fn XGrabKey(display: *mut XDisplay, keycode: c_int, modifiers: c_uint, grab_window: c_ulong, owner_events: c_int, pointer_mode: c_int, keyboard_mode: c_int) -> c_int;
  fn XUngrabKey(display: *mut XDisplay, keycode: c_int, modifiers: c_uint, grab_window: c_ulong) -> c_int;
  fn XKeysymToKeycode(display: *mut XDisplay, keysym: c_ulong) -> c_uchar;
  fn XDefaultRootWindow(display: *mut XDisplay) -> c_ulong;
  fn XSync(display: *mut XDisplay, discard: c_int) -> c_int;
}

#[link(name = "gdk-3")]
extern "C" {
  fn gdk_x11_display_get_xdisplay(display: *mut gdk::ffi::GdkDisplay) -> *mut XDisplay;
  fn gdk_x11_display_error_trap_push(display: *mut gdk::ffi::GdkDisplay);
  fn gdk_x11_display_error_trap_pop(display: *mut gdk::ffi::GdkDisplay) -> c_int;
}

const KEY_PRESS: c_int = 2;
const KEY_RELEASE: c_int = 3;
const GRAB_MODE_ASYNC: c_int = 1;
const BAD_ACCESS: c_int = 10;
const LOCK_MASK: c_uint = 1 << 1;
const MOD2_MASK: c_uint = 1 << 4; // NumLock on nearly every keyboard map
/// The modifiers a shortcut is made of (accelerator.rs x11_modifiers).
const MODIFIERS: c_uint = 1 | 4 | 8 | 64;
const IGNORED: [c_uint; 4] = [0, LOCK_MASK, MOD2_MASK, LOCK_MASK | MOD2_MASK];

struct Entry {
  /// X key code and modifier state.
  combo: (c_uint, c_uint),
  /// As the page wrote it; `pressed` reports this.
  accelerator: String,
  /// Down now (auto-repeat sends more presses).
  down: bool,
}

thread_local! {
  static HOTKEYS: RefCell<Vec<Entry>> = const { RefCell::new(Vec::new()) };
  static FILTER: std::cell::Cell<bool> = const { std::cell::Cell::new(false) };
}

/// GDK's X display, or why there is none.
fn x11() -> Result<(gdk::Display, *mut XDisplay), String> {
  let display = gdk::Display::default().ok_or("there is no display")?;
  if display.type_().name() != "GdkX11Display" {
    return Err("UNSUPPORTED: global shortcuts need X11; Wayland offers them only through the GlobalShortcuts portal, which akan-native does not use yet".into());
  }
  let xdisplay = unsafe { gdk_x11_display_get_xdisplay(display.to_glib_none().0) };
  Ok((display, xdisplay))
}

unsafe extern "C" fn filter(xevent: *mut gdk::ffi::GdkXEvent, _event: *mut gdk::ffi::GdkEvent, _data: *mut c_void) -> gdk::ffi::GdkFilterReturn {
  let key = &*(xevent as *const XKeyEvent);
  if key.kind != KEY_PRESS && key.kind != KEY_RELEASE {
    return gdk::ffi::GDK_FILTER_CONTINUE;
  }
  let combo = (key.keycode, key.state & MODIFIERS);
  let pressed = HOTKEYS.with(|h| {
    let mut hotkeys = h.borrow_mut();
    let entry = hotkeys.iter_mut().find(|e| e.combo == combo)?;
    let first = key.kind == KEY_PRESS && !entry.down;
    entry.down = key.kind == KEY_PRESS;
    Some(first.then(|| entry.accelerator.clone()))
  });
  match pressed {
    None => gdk::ffi::GDK_FILTER_CONTINUE,
    Some(accelerator) => {
      if let Some(accelerator) = accelerator {
        push_event(&format!(r#"{{"type":"hotkey","accelerator":{}}}"#, json::quote(&accelerator)));
      }
      gdk::ffi::GDK_FILTER_REMOVE
    }
  }
}

fn ensure_filter(display: &gdk::Display) {
  if FILTER.with(|f| f.replace(true)) {
    return;
  }
  let root = display.default_screen().root_window();
  unsafe { gdk::ffi::gdk_window_add_filter(root.to_glib_none().0, Some(filter), std::ptr::null_mut()) };
}

fn combo(text: &str, xdisplay: *mut XDisplay) -> Result<(accelerator::Accelerator, (c_uint, c_uint)), String> {
  let accel = accelerator::parse(text)?;
  let keysym = accel.keysym().ok_or_else(|| format!("{text} has no key on Linux"))?;
  let code = unsafe { XKeysymToKeycode(xdisplay, keysym as c_ulong) };
  if code == 0 {
    return Err(format!("{text}: the keyboard layout has no such key"));
  }
  Ok((accel.clone(), (code as c_uint, accel.x11_modifiers())))
}

fn grab(display: &gdk::Display, xdisplay: *mut XDisplay, (code, mods): (c_uint, c_uint), on: bool) -> c_int {
  let gdk_display = display.to_glib_none().0;
  unsafe {
    let root = XDefaultRootWindow(xdisplay);
    gdk_x11_display_error_trap_push(gdk_display);
    for extra in IGNORED {
      if on {
        XGrabKey(xdisplay, code as c_int, mods | extra, root, 0, GRAB_MODE_ASYNC, GRAB_MODE_ASYNC);
      } else {
        XUngrabKey(xdisplay, code as c_int, mods | extra, root);
      }
    }
    XSync(xdisplay, 0);
    gdk_x11_display_error_trap_pop(gdk_display)
  }
}

/// Registers a shortcut; one this app already has succeeds. Returns the canonical spelling.
fn register(text: &str) -> Result<String, String> {
  let (display, xdisplay) = x11()?;
  let (accel, combo) = combo(text, xdisplay)?;
  if HOTKEYS.with(|h| h.borrow().iter().any(|e| e.combo == combo)) {
    return Ok(accel.canonical());
  }
  ensure_filter(&display);
  match grab(&display, xdisplay, combo, true) {
    0 => {}
    error => {
      grab(&display, xdisplay, combo, false); // the variants that did succeed
      return Err(if error == BAD_ACCESS { format!("{text} is already taken by another app") } else { format!("cannot register {text} (X error {error})") });
    }
  }
  HOTKEYS.with(|h| h.borrow_mut().push(Entry { combo, accelerator: text.to_string(), down: false }));
  Ok(accel.canonical())
}

fn unregister(text: &str) -> Result<bool, String> {
  let (display, xdisplay) = x11()?;
  let (_, combo) = combo(text, xdisplay)?;
  let removed = HOTKEYS.with(|h| {
    let mut hotkeys = h.borrow_mut();
    let index = hotkeys.iter().position(|e| e.combo == combo)?;
    Some(hotkeys.remove(index))
  });
  if removed.is_some() {
    grab(&display, xdisplay, combo, false);
  }
  Ok(removed.is_some())
}

fn unregister_all() -> Result<(), String> {
  let entries = HOTKEYS.with(|h| std::mem::take(&mut *h.borrow_mut()));
  if entries.is_empty() {
    return Ok(());
  }
  let (display, xdisplay) = x11()?;
  for entry in entries {
    grab(&display, xdisplay, entry.combo, false);
  }
  Ok(())
}

fn is_registered(text: &str) -> Result<bool, String> {
  let (_, xdisplay) = x11()?;
  let (_, combo) = combo(text, xdisplay)?;
  Ok(HOTKEYS.with(|h| h.borrow().iter().any(|e| e.combo == combo)))
}

fn accelerator_arg(cmd: &json::V) -> Result<&str, String> {
  cmd.get("accelerator").and_then(|v| v.as_str()).ok_or_else(|| "accelerator must be a string".to_string())
}

/// hotkey.* shell ops; None for other ops.
pub fn shell_op(op: &str, cmd: &json::V) -> Option<Result<String, String>> {
  let result = match op {
    "hotkey.register" => accelerator_arg(cmd).and_then(register).map(|c| format!(r#"{{"accelerator":{}}}"#, json::quote(&c))),
    "hotkey.unregister" => accelerator_arg(cmd).and_then(unregister).map(|removed| format!(r#"{{"removed":{removed}}}"#)),
    "hotkey.unregisterAll" => unregister_all().map(|()| "null".into()),
    "hotkey.isRegistered" => accelerator_arg(cmd).and_then(is_registered).map(|r| format!(r#"{{"registered":{r}}}"#)),
    "hotkey.list" => Ok(HOTKEYS.with(|h| format!("[{}]", h.borrow().iter().map(|e| json::quote(&e.accelerator)).collect::<Vec<_>>().join(",")))),
    _ => return None,
  };
  Some(result)
}
