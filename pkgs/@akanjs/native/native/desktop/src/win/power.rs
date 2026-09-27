//! Keeping the display and the system awake on Windows (keep-awake plugin).
//!   power.preventSleep → null   a power request: display required + system required
//!   power.allowSleep   → null   clears and closes it
//! These are the two assertions caffeinate -d -i makes on macOS. A power request belongs to the
//! process (unlike SetThreadExecutionState, which belongs to the calling thread and ends with it,
//! keepawake-rs src/sys/windows.rs), the system ends it with the process, and
//! `powercfg /requests` lists it with its reason.

use std::sync::Mutex;

use windows::core::{HSTRING, PWSTR};
use windows::Win32::Foundation::{CloseHandle, HANDLE};
use windows::Win32::System::Power::{PowerClearRequest, PowerCreateRequest, PowerSetRequest, PowerRequestDisplayRequired, PowerRequestSystemRequired};
use windows::Win32::System::Threading::{POWER_REQUEST_CONTEXT_SIMPLE_STRING, REASON_CONTEXT, REASON_CONTEXT_0};

/// The open power request (a HANDLE as isize: raw pointers are not Send).
static REQUEST: Mutex<Option<isize>> = Mutex::new(None);

fn prevent(reason: &str) -> Result<(), String> {
  let mut request = REQUEST.lock().unwrap();
  if request.is_some() {
    return Ok(());
  }
  let reason = HSTRING::from(reason);
  let context = REASON_CONTEXT {
    Version: 0, // POWER_REQUEST_CONTEXT_VERSION
    Flags: POWER_REQUEST_CONTEXT_SIMPLE_STRING,
    // Only read during the call.
    Reason: REASON_CONTEXT_0 { SimpleReasonString: PWSTR(reason.as_ptr() as *mut u16) },
  };
  let handle = unsafe { PowerCreateRequest(&context) }.map_err(|e| format!("INTERNAL: PowerCreateRequest failed: {}", e.message()))?;
  let set = unsafe { PowerSetRequest(handle, PowerRequestDisplayRequired).and_then(|()| PowerSetRequest(handle, PowerRequestSystemRequired)) };
  if let Err(e) = set {
    unsafe {
      let _ = CloseHandle(handle);
    }
    return Err(format!("INTERNAL: PowerSetRequest failed: {}", e.message()));
  }
  *request = Some(handle.0 as isize);
  Ok(())
}

fn allow() {
  if let Some(raw) = REQUEST.lock().unwrap().take() {
    let handle = HANDLE(raw as *mut _);
    unsafe {
      let _ = PowerClearRequest(handle, PowerRequestDisplayRequired);
      let _ = PowerClearRequest(handle, PowerRequestSystemRequired);
      let _ = CloseHandle(handle);
    }
  }
}

/// `power.*` ops; None for other ops. `app` names the app in the request's reason.
pub fn shell_op(op: &str, app: &str) -> Option<Result<String, String>> {
  match op {
    "power.preventSleep" => Some(prevent(&format!("{app} keeps the display on")).map(|()| "null".into())),
    "power.allowSleep" => {
      allow();
      Some(Ok("null".into()))
    }
    _ => None,
  }
}
