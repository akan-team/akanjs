//! Launch at login on macOS (autostart plugin, plugins.md §5) with SMAppService.mainAppService
//! (ServiceManagement, macOS 13+). The class is looked up by name and called with `msg_send!`; the
//! framework is only linked (plugins.md Q-P6: no objc2-service-management crate).
//!   autostart.status        → {"status"}
//!   autostart.enable        → {"status","error"}   registerAndReturnError:
//!   autostart.disable       → {"status","error"}   unregisterAndReturnError:
//!   autostart.openSettings  → null                 System Settings › General › Login Items
//! status: notRegistered | enabled | requiresApproval | notFound (SMAppService.h, SMAppServiceStatus 0–3).
//! error: null, or {"reason","code","domain","message"}; reason is alreadyRegistered | notRegistered |
//! deniedByUser | invalidSignature | other (SMErrors.h). The shell never fails these ops for an
//! SMAppService error: the plugin decides what an error means (enable of an enabled app is fine).
//!
//! Why SMAppService (tauri-plugins-workspace/plugins/autostart/src/lib.rs:25-37, 229-250, via the
//! auto-launch crate): Tauri's default writes a launch agent plist to ~/Library/LaunchAgents that
//! runs the executable, which macOS lists as a "Unix executable" background item rather than the
//! app (lib.rs:235-238); its other option drives System Events with AppleScript, which asks for the
//! Automation permission. The main-app login item is the app itself under "Open at Login", needs
//! no permission and no helper, and the user can turn it off in System Settings (then status is
//! requiresApproval, and register fails with kSMErrorLaunchDeniedByUser).
//!
//! Status and register talk to the background task management daemon over XPC, so they run off
//! the main thread and answer through `crate::reply` (like notify.rs and camera.rs).
//! Observed (macOS 26, read-only probes, nothing registered): a process that never registered — a
//! plain executable, or an ad-hoc signed bundle outside /Applications — reads notFound, not
//! notRegistered, and unregister then fails with SMAppServiceErrorDomain 1 "Operation not
//! permitted" rather than kSMErrorJobNotFound. So the plugin judges by the status afterwards.

use objc2::{
  msg_send,
  rc::{autoreleasepool, Retained},
  runtime::{AnyClass, AnyObject, Bool},
};
use objc2_foundation::NSString;

use crate::json;

#[link(name = "ServiceManagement", kind = "framework")]
extern "C" {}

pub fn status_name(code: isize) -> &'static str {
  match code {
    0 => "notRegistered",
    1 => "enabled",
    2 => "requiresApproval",
    _ => "notFound", // 3, or a status newer than this code
  }
}

/// SMErrors.h codes, when the error comes from ServiceManagement (SMAppServiceErrorDomain and the
/// kSMErrorDomain* domains; the strings equal the constant names).
pub fn error_reason(domain: &str, code: isize) -> &'static str {
  if domain != "SMAppServiceErrorDomain" && !domain.starts_with("kSMErrorDomain") {
    return "other";
  }
  match code {
    12 => "alreadyRegistered", // kSMErrorAlreadyRegistered
    6 => "notRegistered",      // kSMErrorJobNotFound: unregister of an app that is not registered
    11 => "deniedByUser",      // kSMErrorLaunchDeniedByUser: turned off in System Settings
    3 => "invalidSignature",   // kSMErrorInvalidSignature
    _ => "other",
  }
}

fn service() -> Result<Retained<AnyObject>, String> {
  let class = AnyClass::get(c"SMAppService").ok_or("SMAppService is not available (macOS 13 or later)")?;
  let service: Option<Retained<AnyObject>> = unsafe { msg_send![class, mainAppService] };
  service.ok_or_else(|| "SMAppService.mainAppService is nil".into())
}

fn status(service: &AnyObject) -> isize {
  unsafe { msg_send![service, status] }
}

fn text(obj: Option<Retained<NSString>>) -> String {
  obj.map(|s| s.to_string()).unwrap_or_default()
}

fn error_json(error: &AnyObject) -> String {
  let code: isize = unsafe { msg_send![error, code] };
  let domain = text(unsafe { msg_send![error, domain] });
  let message = text(unsafe { msg_send![error, localizedDescription] });
  format!(
    r#"{{"reason":"{}","code":{code},"domain":{},"message":{}}}"#,
    error_reason(&domain, code),
    json::quote(&domain),
    json::quote(&message)
  )
}

fn run(op: &str) -> Result<String, String> {
  autoreleasepool(|_| {
    let service = service()?;
    let error = match op {
      "autostart.status" => return Ok(format!(r#"{{"status":"{}"}}"#, status_name(status(&service)))),
      "autostart.enable" | "autostart.disable" => {
        let mut error: Option<Retained<AnyObject>> = None;
        let ok: Bool = if op == "autostart.enable" {
          unsafe { msg_send![&*service, registerAndReturnError: &mut error] }
        } else {
          unsafe { msg_send![&*service, unregisterAndReturnError: &mut error] }
        };
        match (ok.as_bool(), error) {
          (true, _) => "null".to_string(),
          (false, Some(e)) => error_json(&e),
          (false, None) => r#"{"reason":"other","code":0,"domain":"","message":"unknown error"}"#.to_string(),
        }
      }
      _ => return Err(format!("unknown op {op}")),
    };
    Ok(format!(r#"{{"status":"{}","error":{error}}}"#, status_name(status(&service))))
  })
}

/// Handles `autostart.*` ops; false for anything else. The answer goes through `crate::reply`.
pub fn shell_op(id: u64, json_text: &str) -> bool {
  if !json_text.contains("\"autostart.") {
    return false;
  }
  let Ok(cmd) = json::parse(json_text) else { return false };
  let Some(op) = cmd.get("op").and_then(|v| v.as_str()).filter(|op| op.starts_with("autostart.")) else { return false };
  if op == "autostart.openSettings" {
    // UI: stays on the main thread.
    crate::reply(
      id,
      AnyClass::get(c"SMAppService").ok_or_else(|| "SMAppService is not available (macOS 13 or later)".to_string()).map(|class| {
        let _: () = unsafe { msg_send![class, openSystemSettingsLoginItems] };
        "null".to_string()
      }),
    );
    return true;
  }
  let op = op.to_string();
  std::thread::spawn(move || crate::reply(id, run(&op)));
  true
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn statuses() {
    let names: Vec<&str> = (0..4).map(status_name).collect();
    assert_eq!(names, ["notRegistered", "enabled", "requiresApproval", "notFound"]);
  }

  #[test]
  fn error_reasons() {
    assert_eq!(error_reason("SMAppServiceErrorDomain", 12), "alreadyRegistered");
    assert_eq!(error_reason("kSMErrorDomainFramework", 6), "notRegistered");
    assert_eq!(error_reason("SMAppServiceErrorDomain", 11), "deniedByUser");
    assert_eq!(error_reason("kSMErrorDomainLaunchd", 3), "invalidSignature");
    assert_eq!(error_reason("SMAppServiceErrorDomain", 2), "other");
    // Same numbers in other domains mean other things (POSIX 6 = ENXIO, 12 = ENOMEM).
    assert_eq!(error_reason("NSPOSIXErrorDomain", 12), "other");
    assert_eq!(error_reason("NSOSStatusErrorDomain", 6), "other");
  }
}
