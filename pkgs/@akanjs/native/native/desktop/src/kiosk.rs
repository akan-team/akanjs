//! An unattended app (desktop.recovery "reload") on macOS: a page's file input opens no panel. wry's UI delegate would
//! run an NSOpenPanel, a way into the file system and, through Quick Look and Open With, to other apps. WKWebView
//! ignores a page's window.print() by itself, and lib.rs refuses the print and the links a page hands the shell.

use std::sync::OnceLock;

use objc2::{
  msg_send,
  runtime::{AnyObject, Imp, Sel},
  sel,
};

type OpenPanel = extern "C-unwind" fn(&AnyObject, Sel, *mut AnyObject, *mut AnyObject, *mut AnyObject, *mut block2::Block<dyn Fn(*const AnyObject)>);

static INSTALLED: OnceLock<bool> = OnceLock::new();

/// Once for wry's UI delegate class, which every webview of the app shares, external views included.
pub fn install(webview: &wry::WebView) {
  use wry::WebViewExtMacOS;
  let installed = INSTALLED.get_or_init(|| unsafe {
    let wk = webview.webview();
    let delegate: *mut AnyObject = msg_send![&*wk, UIDelegate];
    let Some(method) = delegate.as_ref().and_then(|d| d.class().instance_method(sel!(webView:runOpenPanelWithParameters:initiatedByFrame:completionHandler:))) else {
      return false;
    };
    // Safety: `refuse` has the method's signature (void; self, _cmd, three objects, the completion block).
    method.set_implementation(std::mem::transmute::<OpenPanel, Imp>(refuse));
    true
  });
  if !installed {
    log!("the UI delegate runs no open panel of its own: a page's file input is left to WebKit");
  }
}

extern "C-unwind" fn refuse(_this: &AnyObject, _cmd: Sel, _webview: *mut AnyObject, _parameters: *mut AnyObject, _frame: *mut AnyObject, done: *mut block2::Block<dyn Fn(*const AnyObject)>) {
  log!("a page's file input opened no panel: an unattended app opens none");
  //? WebKit raises when the completion handler is never called: nil is the user's cancel.
  if let Some(done) = unsafe { done.as_ref() } {
    done.call((std::ptr::null(),));
  }
}
