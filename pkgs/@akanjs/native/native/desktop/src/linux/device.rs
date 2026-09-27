//! What the device plugin cannot read from files on Linux.
//!   webview.version → {"version"}   the WebKitGTK version (wry::webview_version: webkit_get_*_version)

use crate::json;

/// `webview.version`; None for other ops.
pub fn shell_op(op: &str) -> Option<Result<String, String>> {
  (op == "webview.version").then(|| Ok(format!(r#"{{"version":{}}}"#, wry::webview_version().map_or("null".into(), |v| json::quote(&v)))))
}
