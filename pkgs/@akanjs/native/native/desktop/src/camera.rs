//! Camera permission for the camera plugin on macOS (plugins.md Q9): the TCC state through
//! AVCaptureDevice, called with `msg_send!` (no objc2-av-foundation crate; the framework is linked).
//!   camera.status  → {"status": AVAuthorizationStatus}  (0 notDetermined, 1 restricted, 2 denied, 3 authorized)
//!   camera.request → shows the system prompt if undetermined, then {"status": …}

use block2::RcBlock;
use objc2::rc::Retained;
use objc2::runtime::{AnyClass, AnyObject, Bool};
use objc2::msg_send;
use objc2_foundation::NSString;

use crate::json;

#[link(name = "AVFoundation", kind = "framework")]
extern "C" {
  static AVMediaTypeVideo: &'static NSString;
}

fn status() -> Result<isize, String> {
  let device = AnyClass::get(c"AVCaptureDevice").ok_or("AVCaptureDevice is not available")?;
  Ok(unsafe { msg_send![device, authorizationStatusForMediaType: AVMediaTypeVideo] })
}

/// Asking without NSCameraUsageDescription gets the app killed by TCC (same check as the iOS plugin).
fn has_usage_description() -> bool {
  let Some(bundle_class) = AnyClass::get(c"NSBundle") else { return false };
  let bundle: Retained<AnyObject> = unsafe { msg_send![bundle_class, mainBundle] };
  let key = NSString::from_str("NSCameraUsageDescription");
  let value: Option<Retained<AnyObject>> = unsafe { msg_send![&*bundle, objectForInfoDictionaryKey: &*key] };
  value.is_some()
}

/// Handles `camera.*` ops; false for anything else. The answer goes through `crate::reply`.
pub fn shell_op(id: u64, json_text: &str) -> bool {
  let Ok(cmd) = json::parse(json_text) else { return false };
  match cmd.get("op").and_then(|v| v.as_str()) {
    Some("camera.status") => crate::reply(id, status().map(|s| format!(r#"{{"status":{s}}}"#))),
    Some("camera.request") => {
      if !has_usage_description() {
        crate::reply(id, Err("Info.plist has no NSCameraUsageDescription".into()));
        return true;
      }
      let Some(device) = AnyClass::get(c"AVCaptureDevice") else {
        crate::reply(id, Err("AVCaptureDevice is not available".into()));
        return true;
      };
      let block = RcBlock::new(move |_granted: Bool| crate::reply(id, status().map(|s| format!(r#"{{"status":{s}}}"#))));
      let _: () = unsafe { msg_send![device, requestAccessForMediaType: AVMediaTypeVideo, completionHandler: &*block] };
    }
    _ => return false,
  }
  true
}
