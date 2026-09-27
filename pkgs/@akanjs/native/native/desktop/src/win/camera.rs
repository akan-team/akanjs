//! Camera permission for the camera plugin on Windows, answered like macOS's camera.rs with an
//! AVAuthorizationStatus number (0 notDetermined, 1 restricted, 2 denied, 3 authorized):
//!   camera.status  → {"status"}
//!   camera.request → {"status"}   the same: desktop apps have no system prompt to show
//! The switches of Settings › Privacy & security › Camera are the capability consent store,
//! ...\CapabilityAccessManager\ConsentStore\webcam, whose "Value" is "Allow" or "Deny":
//!   HKLM webcam            "Camera access" for the whole device (an administrator) → 1
//!   HKCU webcam            "Camera access" for this user                           → 2
//!   HKCU webcam\NonPackaged "Let desktop apps access your camera"                  → 2
//! Otherwise WebView2 asks the user itself at getUserMedia and remembers the answer per origin
//! (lib.rs permission handler), so the state is "prompt" (0) until then.

use super::registry::{self, HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};

const STORE: &str = r"Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\webcam";

fn denied(root: windows::Win32::System::Registry::HKEY, key: &str) -> bool {
  registry::read_string(root, key, "Value").ok().flatten().is_some_and(|v| v.eq_ignore_ascii_case("Deny"))
}

pub fn status() -> u32 {
  if denied(HKEY_LOCAL_MACHINE, STORE) {
    1
  } else if denied(HKEY_CURRENT_USER, STORE) || denied(HKEY_CURRENT_USER, &format!(r"{STORE}\NonPackaged")) {
    2
  } else {
    0
  }
}

/// `camera.*` ops; None for other ops.
pub fn shell_op(op: &str) -> Option<Result<String, String>> {
  matches!(op, "camera.status" | "camera.request").then(|| Ok(format!(r#"{{"status":{}}}"#, status())))
}
