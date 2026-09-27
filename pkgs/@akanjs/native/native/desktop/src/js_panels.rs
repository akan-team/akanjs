//! D7: JavaScript alert / confirm / prompt on macOS. WRY's WKUIDelegate (the objc class
//! `WryWebViewUIDelegate`, wry/src/wkwebview/class/wry_web_view_ui_delegate.rs) has no JavaScript
//! panel methods, so WebKit returned at once (confirm false, prompt null) without showing anything.
//! The three methods are added to that class at runtime, like D4 adds applicationShouldTerminate:
//! to TAO's delegate, and show NSAlert sheets on the page's window.
//!
//! As on iOS (native/ios AkanNativeViewController, S7): no page URL in the title, prompt keeps its
//! default text, and a panel that cannot be shown completes at once: a completion handler that is
//! never called hangs the page.

use std::sync::{
  atomic::{AtomicBool, Ordering},
  Once,
};

use block2::{Block, RcBlock};
use objc2::{
  msg_send,
  rc::Retained,
  runtime::{AnyClass, AnyObject, Bool, Imp, Sel},
  sel, MainThreadMarker,
};
use objc2_app_kit::{NSAlertFirstButtonReturn, NSModalResponse, NSWindow};
use objc2_foundation::NSString;

use crate::panels::{end_alert_later, make_alert, TestAnswers};

static DEV: AtomicBool = AtomicBool::new(false);

/// Adds the panel methods to the class of the webview's UI delegate (WRY's `WryWebViewUIDelegate`,
/// registered by objc2 under a versioned module path) once, then sets the delegate again: WebKit
/// reads which delegate methods exist when the delegate is set, so this webview would not see them.
pub fn install(dev: bool, webview: &wry::WebView) {
  use wry::WebViewExtMacOS;
  let wk = webview.webview();
  let delegate: *mut AnyObject = unsafe { msg_send![&*wk, UIDelegate] };
  let Some(delegate_ref) = (unsafe { delegate.as_ref() }) else {
    log!("the webview has no UI delegate: JavaScript alert/confirm/prompt stay silent");
    return;
  };
  add_methods(dev, delegate_ref.class());
  unsafe {
    let _: () = msg_send![&*wk, setUIDelegate: delegate];
  }
}

fn add_methods(dev: bool, class: &'static AnyClass) {
  static ONCE: Once = Once::new();
  ONCE.call_once(|| {
    DEV.store(dev, Ordering::Relaxed);
    let alert = alert_panel as extern "C-unwind" fn(&AnyObject, Sel, *mut AnyObject, *mut NSString, *mut AnyObject, *mut Block<dyn Fn()>);
    let confirm = confirm_panel as extern "C-unwind" fn(&AnyObject, Sel, *mut AnyObject, *mut NSString, *mut AnyObject, *mut Block<dyn Fn(Bool)>);
    let prompt = prompt_panel as extern "C-unwind" fn(&AnyObject, Sel, *mut AnyObject, *mut NSString, *mut NSString, *mut AnyObject, *mut Block<dyn Fn(*mut NSString)>);
    // Safety: each signature matches its type encoding (void; self, _cmd, objects, a block).
    unsafe {
      add(class, sel!(webView:runJavaScriptAlertPanelWithMessage:initiatedByFrame:completionHandler:), std::mem::transmute::<_, Imp>(alert), c"v@:@@@@?");
      add(class, sel!(webView:runJavaScriptConfirmPanelWithMessage:initiatedByFrame:completionHandler:), std::mem::transmute::<_, Imp>(confirm), c"v@:@@@@?");
      add(class, sel!(webView:runJavaScriptTextInputPanelWithPrompt:defaultText:initiatedByFrame:completionHandler:), std::mem::transmute::<_, Imp>(prompt), c"v@:@@@@@?");
    }
  });
}

/// Never replaces a method the class (or a superclass) already has: a newer WRY may implement it.
unsafe fn add(class: &AnyClass, sel: Sel, imp: Imp, types: &std::ffi::CStr) {
  if class.instance_method(sel).is_some() {
    log!("{} already implements {}; keeping it", class.name().to_string_lossy(), sel.name().to_string_lossy());
    return;
  }
  objc2::ffi::class_addMethod(class as *const AnyClass as *mut AnyClass, sel, imp, types.as_ptr());
}

fn text(s: *mut NSString) -> String {
  unsafe { s.as_ref() }.map(|s| s.to_string()).unwrap_or_default()
}

/// Shows the alert as a sheet on the webview's window and calls `done(button, text)` once.
/// Without a visible window it answers `None` at once.
fn show(webview: *mut AnyObject, message: &str, buttons: &[(&str, &str)], input: Option<&str>, done: impl Fn(Option<isize>, Option<String>) + 'static) {
  let window: Option<Retained<NSWindow>> = unsafe { webview.as_ref() }.and_then(|w| unsafe { msg_send![w, window] });
  let (Some(mtm), Some(window)) = (MainThreadMarker::new(), window) else { return done(None, None) };
  if !window.isVisible() {
    return done(None, None);
  }
  let buttons: Vec<(String, String)> = buttons.iter().map(|(t, s)| (t.to_string(), s.to_string())).collect();
  let (alert, field) = make_alert(mtm, "", message, &buttons, input.map(|t| (t, "")));
  let f = field.clone();
  let handler = RcBlock::new(move |response: NSModalResponse| {
    done(Some(response - NSAlertFirstButtonReturn), f.as_ref().map(|f| f.stringValue().to_string()));
  });
  alert.beginSheetModalForWindow_completionHandler(&window, Some(&handler));
  if let Some(t) = TestAnswers::get(DEV.load(Ordering::Relaxed)) {
    end_alert_later(t, &window, &alert, field);
  }
}

extern "C-unwind" fn alert_panel(_this: &AnyObject, _cmd: Sel, webview: *mut AnyObject, message: *mut NSString, _frame: *mut AnyObject, handler: *mut Block<dyn Fn()>) {
  let Some(handler) = (unsafe { RcBlock::copy(handler) }) else { return };
  show(webview, &text(message), &[("OK", "default")], None, move |_, _| handler.call(()));
}

extern "C-unwind" fn confirm_panel(_this: &AnyObject, _cmd: Sel, webview: *mut AnyObject, message: *mut NSString, _frame: *mut AnyObject, handler: *mut Block<dyn Fn(Bool)>) {
  let Some(handler) = (unsafe { RcBlock::copy(handler) }) else { return };
  show(webview, &text(message), &[("OK", "default"), ("Cancel", "cancel")], None, move |button, _| handler.call((Bool::new(button == Some(0)),)));
}

extern "C-unwind" fn prompt_panel(
  _this: &AnyObject,
  _cmd: Sel,
  webview: *mut AnyObject,
  prompt: *mut NSString,
  default_text: *mut NSString,
  _frame: *mut AnyObject,
  handler: *mut Block<dyn Fn(*mut NSString)>,
) {
  let Some(handler) = (unsafe { RcBlock::copy(handler) }) else { return };
  let default_text = text(default_text);
  show(webview, &text(prompt), &[("OK", "default"), ("Cancel", "cancel")], Some(&default_text), move |button, typed| {
    if button == Some(0) {
      let value = NSString::from_str(&typed.unwrap_or_default());
      handler.call((Retained::as_ptr(&value) as *mut NSString,));
    } else {
      handler.call((std::ptr::null_mut(),));
    }
  });
}
