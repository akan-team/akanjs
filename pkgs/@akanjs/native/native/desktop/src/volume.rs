//! The system output volume on macOS (volume plugin): the default output device's volume and mute,
//! through CoreAudio's AudioObject API. The few C calls are declared here; the framework ships with macOS.
//!   volume.get   → {"level":0…1|null,"muted":bool,"settable":bool}
//!   volume.set   {level} → the same, after the change
//!   volume.mute  {muted} → the same
//!   volume.watch → null. From then on the shell sends {"type":"volume","event":"changed"} when the
//!                  default output device changes, or its volume or mute does; the plugin host reads
//!                  volume.get again.
//!
//! - The level is the device's virtual main volume ('vmvc'), which CoreAudio spreads over the channels
//!   as the volume keys do. A device without one (HDMI or DisplayPort audio, many USB interfaces)
//!   answers level null and settable false, and volume.set refuses: the volume keys do nothing there.
//! - Listeners run on a CoreAudio thread; push_event is thread-safe. A device that stops being the
//!   default keeps its listeners, and the host drops the events that change nothing.

use std::{collections::HashSet, ffi::c_void, ptr, sync::Mutex};

use crate::{json, push_event};

#[repr(C)]
struct Address {
  selector: u32,
  scope: u32,
  element: u32,
}

type Listener = extern "C" fn(u32, u32, *const Address, *mut c_void) -> i32;

#[link(name = "CoreAudio", kind = "framework")]
extern "C" {
  fn AudioObjectGetPropertyData(id: u32, address: *const Address, qualifier_size: u32, qualifier: *const c_void, size: *mut u32, data: *mut c_void) -> i32;
  fn AudioObjectSetPropertyData(id: u32, address: *const Address, qualifier_size: u32, qualifier: *const c_void, size: u32, data: *const c_void) -> i32;
  fn AudioObjectHasProperty(id: u32, address: *const Address) -> u8;
  fn AudioObjectIsPropertySettable(id: u32, address: *const Address, settable: *mut u8) -> i32;
  fn AudioObjectAddPropertyListener(id: u32, address: *const Address, listener: Listener, client: *mut c_void) -> i32;
}

const fn code(s: &[u8; 4]) -> u32 {
  u32::from_be_bytes(*s)
}

/// kAudioObjectSystemObject
const SYSTEM: u32 = 1;
/// kAudioHardwarePropertyDefaultOutputDevice
const DEFAULT_OUTPUT: Address = Address { selector: code(b"dOut"), scope: code(b"glob"), element: 0 };
/// kAudioHardwareServiceDeviceProperty_VirtualMainVolume on the output scope's main element
const VOLUME: Address = Address { selector: code(b"vmvc"), scope: code(b"outp"), element: 0 };
/// kAudioDevicePropertyMute
const MUTE: Address = Address { selector: code(b"mute"), scope: code(b"outp"), element: 0 };

static WATCHED: Mutex<Option<HashSet<u32>>> = Mutex::new(None);

fn default_output() -> Result<u32, String> {
  let mut id = 0u32;
  let mut size = size_of::<u32>() as u32;
  let status = unsafe { AudioObjectGetPropertyData(SYSTEM, &DEFAULT_OUTPUT, 0, ptr::null(), &mut size, &mut id as *mut u32 as *mut c_void) };
  if status != 0 || id == 0 {
    return Err("NOT_FOUND: there is no audio output".into());
  }
  Ok(id)
}

fn read<T: Default>(device: u32, address: &Address) -> Option<T> {
  if unsafe { AudioObjectHasProperty(device, address) } == 0 {
    return None;
  }
  let mut value = T::default();
  let mut size = size_of::<T>() as u32;
  let status = unsafe { AudioObjectGetPropertyData(device, address, 0, ptr::null(), &mut size, &mut value as *mut T as *mut c_void) };
  (status == 0).then_some(value)
}

fn write<T>(device: u32, address: &Address, value: T, what: &str) -> Result<(), String> {
  let status = unsafe { AudioObjectSetPropertyData(device, address, 0, ptr::null(), size_of::<T>() as u32, &value as *const T as *const c_void) };
  if status != 0 {
    return Err(format!("INTERNAL: cannot set the {what} (OSStatus {status})"));
  }
  Ok(())
}

fn settable(device: u32, address: &Address) -> bool {
  let mut flag = 0u8;
  unsafe { AudioObjectHasProperty(device, address) != 0 && AudioObjectIsPropertySettable(device, address, &mut flag) == 0 && flag != 0 }
}

/// A level with the float noise of f32 taken off (0.5 reads back as 0.49999997).
pub fn level_json(level: Option<f32>) -> String {
  level.map_or("null".into(), |v| format!("{}", (f64::from(v) * 1000.0).round() / 1000.0))
}

pub fn state_json(level: Option<f32>, muted: bool, settable: bool) -> String {
  format!(r#"{{"level":{},"muted":{},"settable":{}}}"#, level_json(level), muted, settable && level.is_some())
}

fn state(device: u32) -> String {
  let level = read::<f32>(device, &VOLUME);
  let muted = read::<u32>(device, &MUTE).is_some_and(|m| m != 0);
  state_json(level, muted, settable(device, &VOLUME))
}

fn set(cmd: &json::V) -> Result<String, String> {
  let level = cmd.get("level").and_then(|v| v.as_f64()).filter(|v| (0.0..=1.0).contains(v)).ok_or("level must be a number from 0 to 1")?;
  let device = default_output()?;
  if !settable(device, &VOLUME) {
    return Err("UNSUPPORTED: this audio output takes no volume from the computer".into());
  }
  write(device, &VOLUME, level as f32, "volume")?;
  Ok(state(device))
}

fn mute(cmd: &json::V) -> Result<String, String> {
  let muted = cmd.get("muted").and_then(|v| v.as_bool()).ok_or("muted must be a boolean")?;
  let device = default_output()?;
  if !settable(device, &MUTE) {
    return Err("UNSUPPORTED: this audio output cannot be muted from the computer".into());
  }
  write(device, &MUTE, u32::from(muted), "mute")?;
  Ok(state(device))
}

extern "C" fn changed(_id: u32, _count: u32, _addresses: *const Address, _client: *mut c_void) -> i32 {
  if let Ok(device) = default_output() {
    listen(device);
  }
  push_event(r#"{"type":"volume","event":"changed"}"#);
  0
}

/// Listens to a device's volume and mute once; the lock is not held while CoreAudio is called.
fn listen(device: u32) {
  let fresh = WATCHED.lock().unwrap_or_else(|e| e.into_inner()).get_or_insert_with(HashSet::new).insert(device);
  if fresh {
    for address in [&VOLUME, &MUTE] {
      unsafe { AudioObjectAddPropertyListener(device, address, changed, ptr::null_mut()) };
    }
  }
}

fn watch() -> Result<String, String> {
  let first = {
    let mut watched = WATCHED.lock().unwrap_or_else(|e| e.into_inner());
    let first = watched.is_none();
    watched.get_or_insert_with(HashSet::new);
    first
  };
  if first {
    unsafe { AudioObjectAddPropertyListener(SYSTEM, &DEFAULT_OUTPUT, changed, ptr::null_mut()) };
  }
  if let Ok(device) = default_output() {
    listen(device);
  }
  Ok("null".into())
}

/// volume.* shell ops; None for other ops.
pub fn shell_op(op: &str, cmd: &json::V) -> Option<Result<String, String>> {
  let result = match op {
    "volume.get" => default_output().map(state),
    "volume.set" => set(cmd),
    "volume.mute" => mute(cmd),
    "volume.watch" => watch(),
    _ if op.starts_with("volume.") => Err(format!("unknown op {op}")),
    _ => return None,
  };
  Some(result)
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn state_shape() {
    assert_eq!(state_json(Some(0.49999997), false, true), r#"{"level":0.5,"muted":false,"settable":true}"#);
    assert_eq!(state_json(None, true, true), r#"{"level":null,"muted":true,"settable":false}"#);
    assert!(json::parse(&state_json(Some(1.0), false, false)).is_ok());
  }

  #[test]
  fn four_char_codes() {
    assert_eq!(code(b"dOut"), 0x644f_7574);
    assert_eq!(code(b"vmvc"), 0x766d_7663);
  }
}
