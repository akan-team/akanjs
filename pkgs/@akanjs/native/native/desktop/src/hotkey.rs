//! Global shortcuts on macOS (global-shortcut plugin, plugins.md §5) with Carbon's
//! RegisterEventHotKey, declared here and linked from Carbon.framework (no crate).
//!
//! Why Carbon and not an NSEvent global monitor (electrobun nativeWrapper.mm:9171): a global
//! monitor sees no events while the app itself is frontmost and needs the accessibility
//! permission. RegisterEventHotKey fires in every case and needs no permission; global-hotkey
//! (Tauri) and most macOS apps use it. Its handler runs on the main thread from the app's event
//! loop (the application event target).
//!
//! Limits: key codes are ANSI-layout positions (accelerator.rs); RegisterEventHotKey only refuses
//! a combination another process registered exclusively, so a system shortcut such as Cmd+Space
//! may register and never fire.

use std::{
  ffi::c_void,
  ptr,
  sync::{
    atomic::{AtomicU32, Ordering},
    Mutex,
  },
};

use crate::{accelerator, json, push_event};

type OSStatus = i32;
type EventTargetRef = *mut c_void;
type EventHandlerRef = *mut c_void;
type EventHotKeyRef = *mut c_void;
type EventRef = *mut c_void;
type EventHandlerCallRef = *mut c_void;
type EventHandlerUPP = extern "C" fn(EventHandlerCallRef, EventRef, *mut c_void) -> OSStatus;

#[repr(C)]
#[derive(Clone, Copy)]
struct EventHotKeyID {
  signature: u32,
  id: u32,
}

#[repr(C)]
struct EventTypeSpec {
  event_class: u32,
  event_kind: u32,
}

#[link(name = "Carbon", kind = "framework")]
extern "C" {
  fn GetApplicationEventTarget() -> EventTargetRef;
  fn InstallEventHandler(
    target: EventTargetRef,
    handler: EventHandlerUPP,
    num_types: usize,
    list: *const EventTypeSpec,
    user_data: *mut c_void,
    out_ref: *mut EventHandlerRef,
  ) -> OSStatus;
  fn RegisterEventHotKey(code: u32, modifiers: u32, id: EventHotKeyID, target: EventTargetRef, options: u32, out_ref: *mut EventHotKeyRef) -> OSStatus;
  fn UnregisterEventHotKey(hotkey: EventHotKeyRef) -> OSStatus;
  fn GetEventParameter(
    event: EventRef,
    name: u32,
    desired_type: u32,
    actual_type: *mut u32,
    buffer_size: usize,
    actual_size: *mut usize,
    data: *mut c_void,
  ) -> OSStatus;
}

const fn four_cc(code: &[u8; 4]) -> u32 {
  u32::from_be_bytes(*code)
}

const SIGNATURE: u32 = four_cc(b"akan");
const K_EVENT_CLASS_KEYBOARD: u32 = four_cc(b"keyb");
const K_EVENT_HOT_KEY_PRESSED: u32 = 5;
const K_EVENT_PARAM_DIRECT_OBJECT: u32 = four_cc(b"----");
const TYPE_EVENT_HOT_KEY_ID: u32 = four_cc(b"hkid");
const EVENT_NOT_HANDLED: OSStatus = -9874;
const EVENT_HOT_KEY_EXISTS: OSStatus = -9878;

struct Entry {
  /// Key code and Carbon modifiers: Cmd+K and CmdOrCtrl+K are the same shortcut on macOS.
  combo: (u32, u32),
  /// As the page wrote it; `pressed` reports this.
  accelerator: String,
  /// EventHotKeyRef (main thread only; stored as an address).
  hotkey: usize,
}

static HOTKEYS: Mutex<Vec<(u32, Entry)>> = Mutex::new(Vec::new());
static NEXT_ID: AtomicU32 = AtomicU32::new(1);
static HANDLER: Mutex<bool> = Mutex::new(false);

extern "C" fn on_hot_key(_call: EventHandlerCallRef, event: EventRef, _data: *mut c_void) -> OSStatus {
  let mut id = EventHotKeyID { signature: 0, id: 0 };
  let status = unsafe {
    GetEventParameter(
      event,
      K_EVENT_PARAM_DIRECT_OBJECT,
      TYPE_EVENT_HOT_KEY_ID,
      ptr::null_mut(),
      std::mem::size_of::<EventHotKeyID>(),
      ptr::null_mut(),
      &mut id as *mut EventHotKeyID as *mut c_void,
    )
  };
  if status != 0 || id.signature != SIGNATURE {
    return EVENT_NOT_HANDLED;
  }
  let hotkeys = HOTKEYS.lock().unwrap();
  match hotkeys.iter().find(|(key, _)| *key == id.id) {
    Some((_, entry)) => {
      push_event(&format!(r#"{{"type":"hotkey","accelerator":{}}}"#, json::quote(&entry.accelerator)));
      0
    }
    None => EVENT_NOT_HANDLED,
  }
}

fn ensure_handler() -> Result<(), String> {
  let mut installed = HANDLER.lock().unwrap();
  if *installed {
    return Ok(());
  }
  let spec = EventTypeSpec { event_class: K_EVENT_CLASS_KEYBOARD, event_kind: K_EVENT_HOT_KEY_PRESSED };
  let mut handler: EventHandlerRef = ptr::null_mut();
  let status = unsafe { InstallEventHandler(GetApplicationEventTarget(), on_hot_key, 1, &spec, ptr::null_mut(), &mut handler) };
  if status != 0 {
    return Err(format!("cannot install the hot key handler (OSStatus {status})"));
  }
  *installed = true;
  Ok(())
}

/// Registers a shortcut. Registering one this app already has succeeds (a reloaded page
/// registers again). Returns the canonical spelling.
fn combo(text: &str) -> Result<(accelerator::Accelerator, (u32, u32)), String> {
  let accel = accelerator::parse(text)?;
  let code = accel.mac_key_code().ok_or_else(|| format!("{text} has no key code on macOS"))?;
  let mods = accel.carbon_modifiers();
  Ok((accel, (code, mods)))
}

pub fn register(text: &str) -> Result<String, String> {
  let (accel, combo) = combo(text)?;
  let canonical = accel.canonical();
  if HOTKEYS.lock().unwrap().iter().any(|(_, e)| e.combo == combo) {
    return Ok(canonical);
  }
  let (code, _) = combo;
  ensure_handler()?;
  let id = NEXT_ID.fetch_add(1, Ordering::Relaxed);
  let mut hotkey: EventHotKeyRef = ptr::null_mut();
  let status = unsafe {
    RegisterEventHotKey(code, accel.carbon_modifiers(), EventHotKeyID { signature: SIGNATURE, id }, GetApplicationEventTarget(), 0, &mut hotkey)
  };
  match status {
    0 => {}
    EVENT_HOT_KEY_EXISTS => return Err(format!("{text} is already taken by another app")),
    _ => return Err(format!("cannot register {text} (OSStatus {status})")),
  }
  HOTKEYS.lock().unwrap().push((id, Entry { combo, accelerator: text.to_string(), hotkey: hotkey as usize }));
  Ok(canonical)
}

/// Returns whether the shortcut was registered.
pub fn unregister(text: &str) -> Result<bool, String> {
  let (_, combo) = combo(text)?;
  let mut hotkeys = HOTKEYS.lock().unwrap();
  let Some(index) = hotkeys.iter().position(|(_, e)| e.combo == combo) else { return Ok(false) };
  let (_, entry) = hotkeys.remove(index);
  unsafe { UnregisterEventHotKey(entry.hotkey as EventHotKeyRef) };
  Ok(true)
}

pub fn unregister_all() {
  for (_, entry) in HOTKEYS.lock().unwrap().drain(..) {
    unsafe { UnregisterEventHotKey(entry.hotkey as EventHotKeyRef) };
  }
}

pub fn is_registered(text: &str) -> Result<bool, String> {
  let (_, combo) = combo(text)?;
  Ok(HOTKEYS.lock().unwrap().iter().any(|(_, e)| e.combo == combo))
}

fn accelerator_arg(cmd: &json::V) -> Result<&str, String> {
  cmd.get("accelerator").and_then(|v| v.as_str()).ok_or_else(|| "accelerator must be a string".to_string())
}

/// hotkey.* shell ops; None for other ops.
pub fn shell_op(op: &str, cmd: &json::V) -> Option<Result<String, String>> {
  let result = match op {
    "hotkey.register" => accelerator_arg(cmd).and_then(register).map(|c| format!(r#"{{"accelerator":{}}}"#, json::quote(&c))),
    "hotkey.unregister" => accelerator_arg(cmd).and_then(unregister).map(|removed| format!(r#"{{"removed":{removed}}}"#)),
    "hotkey.unregisterAll" => {
      unregister_all();
      Ok("null".into())
    }
    "hotkey.isRegistered" => accelerator_arg(cmd).and_then(is_registered).map(|r| format!(r#"{{"registered":{r}}}"#)),
    "hotkey.list" => {
      let hotkeys = HOTKEYS.lock().unwrap();
      Ok(format!("[{}]", hotkeys.iter().map(|(_, e)| json::quote(&e.accelerator)).collect::<Vec<_>>().join(",")))
    }
    _ => return None,
  };
  Some(result)
}
