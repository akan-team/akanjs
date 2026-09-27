//! Plain text on the Windows clipboard (clipboard plugin), on the main thread.
//!   clipboard.writeText {text} → null
//!   clipboard.readText         → {"text"}   "" when the clipboard holds no text
//! CF_UNICODETEXT (UTF-16; Windows converts to and from CF_TEXT for older readers). Learned from
//! arboard's Windows backend (src/platform/windows.rs: open with retries, a few ms apart, because
//! another app may hold the clipboard for a moment) and electrobun's
//! (package/src/native/win/nativeWrapper.cpp:12549-12625: the system owns the memory only after
//! SetClipboardData succeeded). The calling window owns what the app copies: Microsoft documents
//! that SetClipboardData fails after EmptyClipboard of a clipboard opened without an owner.

use windows::Win32::Foundation::{GlobalFree, HANDLE, HGLOBAL, HWND};
use windows::Win32::System::DataExchange::{CloseClipboard, EmptyClipboard, GetClipboardData, IsClipboardFormatAvailable, OpenClipboard, SetClipboardData};
use windows::Win32::System::Memory::{GlobalAlloc, GlobalLock, GlobalSize, GlobalUnlock, GMEM_MOVEABLE};
use windows::Win32::System::Ole::CF_UNICODETEXT;

use crate::json;

const ATTEMPTS: u32 = 10;

/// Opens the clipboard and closes it when dropped.
struct Open;

impl Open {
  fn new(owner: HWND) -> Result<Open, String> {
    let mut last = String::new();
    for attempt in 0..ATTEMPTS {
      match unsafe { OpenClipboard(Some(owner)) } {
        Ok(()) => return Ok(Open),
        Err(e) => last = e.message(),
      }
      if attempt + 1 < ATTEMPTS {
        std::thread::sleep(std::time::Duration::from_millis(5));
      }
    }
    Err(format!("INTERNAL: another app holds the clipboard: {last}"))
  }
}

impl Drop for Open {
  fn drop(&mut self) {
    unsafe {
      let _ = CloseClipboard();
    }
  }
}

fn read(owner: HWND) -> Result<String, String> {
  let format = CF_UNICODETEXT.0 as u32;
  let _open = Open::new(owner)?;
  if unsafe { IsClipboardFormatAvailable(format) }.is_err() {
    return Ok(String::new()); // an image, files, or nothing
  }
  let handle = unsafe { GetClipboardData(format) }.map_err(|e| format!("INTERNAL: GetClipboardData failed: {}", e.message()))?;
  let memory = HGLOBAL(handle.0);
  let data = unsafe { GlobalLock(memory) } as *const u16;
  if data.is_null() {
    return Err("INTERNAL: the clipboard's text cannot be read".into());
  }
  // Up to the terminating NUL, never past the block.
  let units = unsafe { GlobalSize(memory) } / 2;
  let wide = unsafe { std::slice::from_raw_parts(data, units) };
  let end = wide.iter().position(|&c| c == 0).unwrap_or(units);
  let text = String::from_utf16_lossy(&wide[..end]);
  unsafe {
    let _ = GlobalUnlock(memory); // "fails" with NO_ERROR once unlocked
  }
  Ok(text)
}

fn write(owner: HWND, text: &str) -> Result<(), String> {
  let wide: Vec<u16> = text.encode_utf16().chain(std::iter::once(0)).collect();
  let memory = unsafe { GlobalAlloc(GMEM_MOVEABLE, wide.len() * 2) }.map_err(|e| format!("INTERNAL: GlobalAlloc failed: {}", e.message()))?;
  unsafe {
    let data = GlobalLock(memory) as *mut u16;
    if data.is_null() {
      let _ = GlobalFree(Some(memory));
      return Err("INTERNAL: GlobalLock failed".into());
    }
    std::ptr::copy_nonoverlapping(wide.as_ptr(), data, wide.len());
    let _ = GlobalUnlock(memory);
  }
  let result = Open::new(owner).and_then(|_open| {
    unsafe { EmptyClipboard() }.map_err(|e| format!("INTERNAL: EmptyClipboard failed: {}", e.message()))?;
    unsafe { SetClipboardData(CF_UNICODETEXT.0 as u32, Some(HANDLE(memory.0))) }.map_err(|e| format!("INTERNAL: SetClipboardData failed: {}", e.message()))?;
    Ok(())
  });
  if result.is_err() {
    unsafe {
      let _ = GlobalFree(Some(memory)); // still ours
    }
  }
  result
}

/// `clipboard.*` ops with the calling window as the owner; None for other ops.
pub fn window_op(op: &str, cmd: &json::V, hwnd: isize) -> Option<Result<String, String>> {
  let owner = HWND(hwnd as *mut _);
  match op {
    "clipboard.readText" => Some(read(owner).map(|text| format!(r#"{{"text":{}}}"#, json::quote(&text)))),
    "clipboard.writeText" => Some(match cmd.get("text").and_then(|v| v.as_str()) {
      Some(text) => write(owner, text).map(|()| "null".into()),
      None => Err("text must be a string".into()),
    }),
    _ => None,
  }
}
