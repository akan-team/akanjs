//! Launch at login on Windows (autostart plugin, plugins.md §5): a value under
//! HKCU\Software\Microsoft\Windows\CurrentVersion\Run that starts this .exe. The ops and answers
//! are macOS's (autostart.rs), so the plugin's desktop.ts stays one file:
//!   autostart.status        {id} → {"status"}
//!   autostart.enable        {id} → {"status","error"}
//!   autostart.disable       {id} → {"status","error"}
//!   autostart.openSettings       → null   Settings › Apps › Startup
//! `id` (the app id) names the value. status: enabled | notRegistered | requiresApproval.
//! error: null, or {"reason":"other","code":<Win32 error>,"domain":"Win32","message"}.
//!
//! Task Manager's and Settings' Startup switch lives in
//! ...\Explorer\StartupApproved\Run: a REG_BINARY value of the same name whose first byte is odd
//! when the user switched the app off (03, with the time it happened in the last 8 bytes) and even
//! when it is on (02), or no value at all (on). Electron reads the first byte the same way
//! (electron/shell/browser/browser_win.cc GetLoginItemSettingsHelper); auto-launch 0.5, which
//! Tauri's plugin uses, overwrites it with "on" at every enable
//! (auto-launch src/windows.rs:37-57). Like macOS's requiresApproval, the shell leaves the user's
//! choice alone: enable() then reports it, and openSettings() opens the page to switch it back on.
//! disable() removes both values, so that a later enable() starts over.
//! The exe path is quoted, as Electron's FormatCommandLineString does (auto-launch does not, which
//! breaks paths with spaces).

use super::registry::{self, HKEY_CURRENT_USER};
use crate::json;

const RUN: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
const APPROVED: &str = r"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run";

fn status(id: &str) -> Result<&'static str, String> {
  let describe = |e| format!("INTERNAL: cannot read the Run key: {}", registry::describe(e));
  if registry::read_string(HKEY_CURRENT_USER, RUN, id).map_err(describe)?.is_none() {
    return Ok("notRegistered");
  }
  let approved = registry::read_binary(HKEY_CURRENT_USER, APPROVED, id).unwrap_or(None);
  Ok(if approved.and_then(|b| b.first().copied()).is_some_and(|b| b & 1 == 1) { "requiresApproval" } else { "enabled" })
}

fn command_line() -> Result<String, String> {
  let exe = std::env::current_exe().map_err(|e| format!("INTERNAL: the app's path is unknown: {e}"))?;
  Ok(format!("\"{}\"", exe.display()))
}

fn error_json(code: windows::Win32::Foundation::WIN32_ERROR) -> String {
  let message = windows::core::Error::from(code.to_hresult()).message();
  format!(r#"{{"reason":"other","code":{},"domain":"Win32","message":{}}}"#, code.0, json::quote(&message))
}

fn change(op: &str, id: &str) -> Result<String, String> {
  let result = match op {
    "autostart.enable" if status(id)? == "requiresApproval" => Ok(()), // the user's choice (see above)
    "autostart.enable" => registry::write_string(HKEY_CURRENT_USER, RUN, id, &command_line()?),
    _ => registry::delete_value(HKEY_CURRENT_USER, RUN, id).and_then(|()| registry::delete_value(HKEY_CURRENT_USER, APPROVED, id)),
  };
  let error = result.err().map_or_else(|| "null".to_string(), error_json);
  Ok(format!(r#"{{"status":"{}","error":{error}}}"#, status(id)?))
}

/// `autostart.*` ops; None for other ops.
pub fn shell_op(op: &str, cmd: &json::V) -> Option<Result<String, String>> {
  if !op.starts_with("autostart.") {
    return None;
  }
  if op == "autostart.openSettings" {
    // Settings › Apps › Startup (ms-settings:startupapps, Windows 10 1803 and later).
    return Some(if super::open_url("ms-settings:startupapps") { Ok("null".into()) } else { Err("INTERNAL: cannot open Settings".into()) });
  }
  let id = match cmd.get("id").and_then(|v| v.as_str()) {
    // The value name: no path separators (a backslash would name a subkey in some APIs).
    Some(id) if !id.is_empty() && !id.contains(['\\', '/']) && !id.chars().any(char::is_control) => id,
    _ => return Some(Err("id must be the app id".into())),
  };
  Some(match op {
    "autostart.status" => status(id).map(|s| format!(r#"{{"status":"{s}"}}"#)),
    "autostart.enable" | "autostart.disable" => change(op, id),
    _ => Err(format!("unknown op {op}")),
  })
}
