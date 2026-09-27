//! What the device plugin reads on Windows through native code.
//!   device.info     → {"manufacturer","model"}   the BIOS's SMBIOS names (HKLM\HARDWARE\DESCRIPTION\System\BIOS)
//!   device.language → {"tag"}                   the first display language, GetUserPreferredUILanguages
//!                                               (MUI_LANGUAGE_NAME), as sys-locale does for the Tauri os plugin
//!   device.battery  → {"level","charging"}      GetSystemPowerStatus
//!   webview.version → {"version"}               the WebView2 runtime, as wry's webview_version
//!                                               (wry/src/webview2/mod.rs:1927-1931; gated behind a Linux feature)
//! Unknown values are null.

use webview2_com::Microsoft::Web::WebView2::Win32::GetAvailableCoreWebView2BrowserVersionString;
use windows::core::{PCWSTR, PWSTR};
use windows::Win32::Globalization::{GetUserPreferredUILanguages, MUI_LANGUAGE_NAME};
use windows::Win32::System::Power::{GetSystemPowerStatus, SYSTEM_POWER_STATUS};

use super::registry::{self, HKEY_LOCAL_MACHINE};
use crate::json;

const BIOS: &str = r"HARDWARE\DESCRIPTION\System\BIOS";

fn quoted(value: Option<String>) -> String {
  value.map(|v| v.trim().to_string()).filter(|v| !v.is_empty()).map_or_else(|| "null".into(), |v| json::quote(&v))
}

fn info() -> String {
  let read = |name| registry::read_string(HKEY_LOCAL_MACHINE, BIOS, name).ok().flatten();
  format!(r#"{{"manufacturer":{},"model":{}}}"#, quoted(read("SystemManufacturer")), quoted(read("SystemProductName")))
}

/// The user's display languages, most preferred first ("ko-KR", "en-US").
fn languages() -> Vec<String> {
  let (mut count, mut size) = (0u32, 0u32);
  if unsafe { GetUserPreferredUILanguages(MUI_LANGUAGE_NAME, &mut count, None, &mut size) }.is_err() || size == 0 {
    return Vec::new();
  }
  let mut buffer = vec![0u16; size as usize];
  if unsafe { GetUserPreferredUILanguages(MUI_LANGUAGE_NAME, &mut count, Some(PWSTR(buffer.as_mut_ptr())), &mut size) }.is_err() {
    return Vec::new();
  }
  // A double-NUL-terminated list.
  buffer.split(|&c| c == 0).filter(|s| !s.is_empty()).map(String::from_utf16_lossy).collect()
}

/// SYSTEM_POWER_STATUS: BatteryFlag 128 = no system battery, 255 = unknown; BatteryLifePercent
/// 255 = unknown; ACLineStatus 0 offline, 1 online, 255 unknown (WinBase.h).
pub fn battery_json(status: &SYSTEM_POWER_STATUS) -> String {
  if status.BatteryFlag == 255 || status.BatteryFlag & 128 != 0 {
    return r#"{"level":null,"charging":null}"#.into();
  }
  let level = if status.BatteryLifePercent <= 100 { format!("{}", f64::from(status.BatteryLifePercent) / 100.0) } else { "null".into() };
  let charging = match status.ACLineStatus {
    0 => "false",
    1 => "true",
    _ => "null",
  };
  format!(r#"{{"level":{level},"charging":{charging}}}"#)
}

fn battery() -> Result<String, String> {
  let mut status = SYSTEM_POWER_STATUS::default();
  unsafe { GetSystemPowerStatus(&mut status) }.map_err(|e| format!("INTERNAL: GetSystemPowerStatus failed: {}", e.message()))?;
  Ok(battery_json(&status))
}

/// The installed WebView2 runtime's version, e.g. "140.0.3485.54".
pub(crate) fn webview_version() -> Option<String> {
  let mut version = PWSTR::null();
  unsafe { GetAvailableCoreWebView2BrowserVersionString(PCWSTR::null(), &mut version) }.ok()?;
  Some(webview2_com::take_pwstr(version))
}

/// `device.*` and `webview.version`; None for other ops.
pub fn shell_op(op: &str) -> Option<Result<String, String>> {
  Some(match op {
    "device.info" => Ok(info()),
    "device.language" => Ok(format!(r#"{{"tag":{}}}"#, quoted(languages().into_iter().next()))),
    "device.battery" => battery(),
    "webview.version" => Ok(format!(r#"{{"version":{}}}"#, quoted(webview_version()))),
    _ => return None,
  })
}
