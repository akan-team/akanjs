//! Global shortcuts on Windows (global-shortcut plugin, plugins.md §5): RegisterHotKey on the
//! helper window (msgwin.rs), with the ops and events of hotkey.rs.
//!
//! - The hotkeys belong to the helper window, not to the thread: WM_HOTKEY without a window is a
//!   thread message, which modal loops (menus, dialogs, window moves) drop (msgwin.rs).
//! - MOD_NOREPEAT: holding the keys reports one press (tao's old implementation did the same,
//!   tao/CHANGELOG.md:615; Electrobun nativeWrapper.cpp:13926). RegisterHotKey refuses a
//!   combination another app registered; some system shortcuts (Win+L, Ctrl+Alt+Del) never reach
//!   an app at all.
//! - Keys are US-layout virtual-key codes; CmdOrCtrl is Control, Cmd the Windows key
//!   (accelerator.rs).

use std::cell::{Cell, RefCell};

use windows::Win32::Foundation::ERROR_HOTKEY_ALREADY_REGISTERED;
use windows::Win32::UI::Input::KeyboardAndMouse::{RegisterHotKey, UnregisterHotKey, HOT_KEY_MODIFIERS, MOD_NOREPEAT};

use crate::{accelerator, json, push_event};

struct Entry {
  id: i32,
  /// RegisterHotKey modifiers and virtual key.
  combo: (u32, u32),
  /// As the page wrote it; `pressed` reports this.
  accelerator: String,
}

thread_local! {
  static HOTKEYS: RefCell<Vec<Entry>> = const { RefCell::new(Vec::new()) };
  static NEXT_ID: Cell<i32> = const { Cell::new(1) };
}

/// msgwin.rs: WM_HOTKEY.
pub fn pressed(id: i32) {
  let accelerator = HOTKEYS.with(|h| h.borrow().iter().find(|e| e.id == id).map(|e| e.accelerator.clone()));
  if let Some(accelerator) = accelerator {
    push_event(&format!(r#"{{"type":"hotkey","accelerator":{}}}"#, json::quote(&accelerator)));
  }
}

fn combo(text: &str) -> Result<(accelerator::Accelerator, (u32, u32)), String> {
  let accel = accelerator::parse(text)?;
  let vk = accel.win_vk().ok_or_else(|| format!("{text} has no key on Windows"))?;
  let mods = accel.win_hotkey_modifiers();
  Ok((accel, (mods, vk as u32)))
}

/// Registers a shortcut; one this app already has succeeds. Returns the canonical spelling.
fn register(text: &str) -> Result<String, String> {
  let (accel, combo) = combo(text)?;
  if HOTKEYS.with(|h| h.borrow().iter().any(|e| e.combo == combo)) {
    return Ok(accel.canonical());
  }
  let hwnd = super::msgwin::hwnd()?;
  let id = NEXT_ID.with(|n| n.replace(n.get() + 1));
  let (mods, vk) = combo;
  if let Err(e) = unsafe { RegisterHotKey(Some(hwnd), id, HOT_KEY_MODIFIERS(mods) | MOD_NOREPEAT, vk) } {
    return Err(if e.code() == ERROR_HOTKEY_ALREADY_REGISTERED.to_hresult() { format!("{text} is already taken by another app") } else { format!("cannot register {text}: {e}") });
  }
  HOTKEYS.with(|h| h.borrow_mut().push(Entry { id, combo, accelerator: text.to_string() }));
  Ok(accel.canonical())
}

fn release(entry: &Entry) {
  if let Ok(hwnd) = super::msgwin::hwnd() {
    unsafe {
      let _ = UnregisterHotKey(Some(hwnd), entry.id);
    }
  }
}

fn unregister(text: &str) -> Result<bool, String> {
  let (_, combo) = combo(text)?;
  let removed = HOTKEYS.with(|h| {
    let mut hotkeys = h.borrow_mut();
    let index = hotkeys.iter().position(|e| e.combo == combo)?;
    Some(hotkeys.remove(index))
  });
  if let Some(entry) = &removed {
    release(entry);
  }
  Ok(removed.is_some())
}

fn is_registered(text: &str) -> Result<bool, String> {
  let (_, combo) = combo(text)?;
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
    "hotkey.unregisterAll" => {
      for entry in HOTKEYS.with(|h| std::mem::take(&mut *h.borrow_mut())) {
        release(&entry);
      }
      Ok("null".into())
    }
    "hotkey.isRegistered" => accelerator_arg(cmd).and_then(is_registered).map(|r| format!(r#"{{"registered":{r}}}"#)),
    "hotkey.list" => Ok(HOTKEYS.with(|h| format!("[{}]", h.borrow().iter().map(|e| json::quote(&e.accelerator)).collect::<Vec<_>>().join(",")))),
    _ => return None,
  };
  Some(result)
}
