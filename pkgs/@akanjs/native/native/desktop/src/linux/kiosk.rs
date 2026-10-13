//! What a page of an unattended app (desktop.recovery "reload") cannot open on Linux: WebKitGTK's file chooser and its
//! print dialog, which prints to a file through one. lib.rs refuses the links a page hands the shell.

use webkit2gtk::{FileChooserRequestExt, WebViewExt};
use wry::WebViewExtUnix;

pub fn lock(webview: &wry::WebView) {
  let view = webview.webview();
  view.connect_run_file_chooser(|_, request| {
    log!("a page's file input opened no file chooser: an unattended app opens none");
    request.cancel();
    true
  });
  view.connect_print(|_, _| {
    log!("a page's print opened no print dialog: an unattended app opens none");
    true
  });
}
