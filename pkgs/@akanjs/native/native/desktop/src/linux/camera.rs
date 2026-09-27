//! Camera permission for the camera plugin on Linux, answered like macOS's camera.rs with an
//! AVAuthorizationStatus number:
//!   camera.status, camera.request → {"status":3}   authorized
//! An unsandboxed app has no camera permission of the system to ask for (Flatpak's
//! org.freedesktop.portal.Camera is for sandboxed apps), and the shell allows WebKitGTK's camera
//! requests itself (lib.rs permission handler); a missing camera is getUserMedia's NotFoundError.

/// `camera.*` ops; None for other ops.
pub fn shell_op(op: &str) -> Option<Result<String, String>> {
  matches!(op, "camera.status" | "camera.request").then(|| Ok(r#"{"status":3}"#.to_string()))
}
