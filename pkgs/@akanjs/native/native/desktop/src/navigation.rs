//! Where a page's navigations may go (SH-4). The app stays on its own origin: a top-level
//! navigation anywhere else is cancelled, and a link the OS has a handler for opens there
//! (http and https in the system browser, mailto and tel in the mail and phone apps, like Tauri's
//! opener allow-default-urls). Every other scheme (file:, smb:, search-ms:, another app's scheme,
//! data:, blob:) goes nowhere: the page reaches other programs only through the opener plugin and
//! its capabilities. Frames inside the page may load web content from anywhere (embedded video,
//! maps, payment forms) but never open anything outside the app.
//!
//! The engines tell frames apart differently:
//! - WebView2 asks wry's navigation handler only about the top level (NavigationStarting);
//!   `install` handles frames (FrameNavigationStarting).
//! - WKWebView asks about every frame and wry passes on only the URL, so `mac` marks sub-frame
//!   requests before wry's navigation delegate runs.
//! - WebKitGTK also asks about every frame, and its navigation request does not say which frame
//!   it is for. `linux` lets http(s), data: and blob: loads start and decides when the response
//!   arrives, which does say whether it is the top-level document.

use crate::contract;
#[cfg(target_os = "linux")]
use crate::in_app;
use std::sync::OnceLock;

#[derive(Debug, PartialEq, Eq)]
pub enum Decision {
  Load,
  /// Cancel, and hand the URL to the OS.
  Open,
  Drop,
}

/// The lowercase scheme of a URL, or None when it has none (kernel.ts schemeOf).
pub fn scheme(url: &str) -> Option<String> {
  let (s, _) = url.split_once(':')?;
  let mut chars = s.chars();
  (chars.next().is_some_and(|c| c.is_ascii_alphabetic()) && chars.all(|c| c.is_ascii_alphanumeric() || "+.-".contains(c))).then(|| s.to_ascii_lowercase())
}

/// Schemes the app added to the external list (shell.json `externalSchemes`, security.shell).
static EXTRA_SCHEMES: OnceLock<Vec<String>> = OnceLock::new();

pub fn set_extra_schemes(schemes: Vec<String>) {
  let _ = EXTRA_SCHEMES.set(schemes);
}

fn extra_schemes() -> &'static [String] {
  EXTRA_SCHEMES.get().map_or(&[], |v| v.as_slice())
}

/// Whether the OS may be handed a URL of this scheme: the contract's, and what the app added (never
/// the forbidden ones).
fn external(scheme: &str, extra: &[String]) -> bool {
  contract::EXTERNAL_SCHEMES.contains(&scheme) || (extra.iter().any(|s| s.eq_ignore_ascii_case(scheme)) && !contract::NEVER_EXTERNAL_SCHEMES.contains(&scheme))
}

/// External opens of the page's navigations (links, window.open) happen at most
/// EXTERNAL_OPENS_PER_SECOND times a second (L0): a page cannot flood the OS with other apps.
/// Plugins' opens (opener, browser, auth-session) have the same limit in the plugin host.
pub fn external_open_allowed() -> bool {
  use std::sync::Mutex;
  use std::time::{Duration, Instant};
  static LAST: Mutex<Option<Instant>> = Mutex::new(None);
  let mut last = LAST.lock().unwrap_or_else(|e| e.into_inner());
  let now = Instant::now();
  if last.is_some_and(|t| now.duration_since(t) < Duration::from_millis(1000 / contract::EXTERNAL_OPENS_PER_SECOND as u64)) {
    return false;
  }
  *last = Some(now);
  true
}

/// Whether the OS may open `url` for the page (links, window.open, target=_blank).
pub fn opens_externally(url: &str) -> bool {
  scheme(url).is_some_and(|s| external(&s, extra_schemes()))
}

pub fn decide(url: &str, top_level: bool) -> Decision {
  decide_for(url, top_level, crate::ORIGIN, extra_schemes())
}

/// kernel.ts decideNavigation: the app's own pages (and about:) load; a top-level navigation opens
/// in the OS when its scheme is external and is dropped otherwise; a frame loads web content only.
pub fn decide_for(url: &str, top_level: bool, origin: &str, extra: &[String]) -> Decision {
  let scheme = scheme(url);
  if let Some(rest) = url.strip_prefix(origin).filter(|rest| rest.is_empty() || rest.starts_with(['/', '?', '#'])) {
    // The app's /__akan_native/* paths never become a document of its origin (kernel.ts decideNavigation);
    // a frame may show a FileRef, which is served sandboxed.
    let path = rest.split(['?', '#']).next().filter(|p| !p.is_empty()).unwrap_or("/");
    if !crate::routes::is_host_path(path) {
      return Decision::Load;
    }
    return if !top_level && matches!(crate::routes::route(path, |_| false), crate::routes::Route::File(_)) { Decision::Load } else { Decision::Drop };
  }
  match scheme.as_deref() {
    Some("about") => Decision::Load,
    None => Decision::Drop,
    Some(s) if !top_level => {
      if contract::FRAME_SCHEMES.contains(&s) { Decision::Load } else { Decision::Drop }
    }
    Some(s) => {
      if external(s, extra) { Decision::Open } else { Decision::Drop }
    }
  }
}

/// A URL for a log line: data: URLs can be megabytes.
pub fn shown(url: &str) -> String {
  if url.len() <= 120 {
    return url.to_string();
  }
  let mut end = 120;
  while !url.is_char_boundary(end) {
    end -= 1;
  }
  format!("{}…", &url[..end])
}

/// wry's navigation handler. `false` cancels the navigation.
#[cfg(not(target_os = "linux"))]
pub fn allow(url: &str) -> bool {
  #[cfg(target_os = "macos")]
  let top_level = !mac::in_sub_frame();
  #[cfg(not(target_os = "macos"))]
  let top_level = true;
  match decide(url, top_level) {
    Decision::Load => true,
    Decision::Open => {
      crate::open_external(url);
      false
    }
    Decision::Drop => {
      log!("blocked a {} navigation to {}", if top_level { "page" } else { "frame" }, shown(url));
      false
    }
  }
}

/// Navigation and media policy for a new webview (macOS: both delegates' methods, once per class).
#[cfg(target_os = "macos")]
pub fn install(webview: &wry::WebView) {
  mac::install(webview);
  mac::install_media(webview);
}

/// Frames inside the page: WebView2 would otherwise let them start apps by scheme (with its own
/// prompt).
#[cfg(target_os = "windows")]
pub fn install(webview: &wry::WebView) {
  use webview2_com::{take_pwstr, NavigationStartingEventHandler};
  use windows::core::PWSTR;
  use wry::WebViewExtWindows;
  let handler = NavigationStartingEventHandler::create(Box::new(|_, args| {
    let Some(args) = args else { return Ok(()) };
    unsafe {
      let mut uri = PWSTR::null();
      args.Uri(&mut uri)?;
      let uri = take_pwstr(uri);
      if decide(&uri, false) == Decision::Drop {
        log!("blocked a frame navigation to {}", shown(&uri));
        args.SetCancel(true)?;
      }
    }
    Ok(())
  }));
  let mut token = 0;
  if let Err(e) = unsafe { webview.webview().add_FrameNavigationStarting(&handler, &mut token) } {
    log!("frames inside the page are not checked: {e}");
  }
}

#[cfg(target_os = "macos")]
pub mod mac {
  use std::cell::Cell;
  use std::sync::OnceLock;

  use objc2::{
    msg_send,
    runtime::{AnyObject, Imp, Sel},
    sel,
  };

  type Decide = extern "C-unwind" fn(&AnyObject, Sel, *mut AnyObject, *mut AnyObject, *mut AnyObject);

  /// wry's own webView:decidePolicyForNavigationAction:decisionHandler:, which calls the handler.
  static ORIGINAL: OnceLock<Option<usize>> = OnceLock::new();

  thread_local! {
    static SUB_FRAME: Cell<bool> = const { Cell::new(false) };
  }

  /// Whether the request wry's handler is being asked about is for a frame inside the page.
  pub fn in_sub_frame() -> bool {
    SUB_FRAME.get()
  }

  /// Wraps the navigation delegate's policy method (once for its class): the call is marked as a
  /// sub-frame request when WKNavigationAction.targetFrame is not the main frame. A new window
  /// request has no target frame and is a top-level request.
  pub fn install(webview: &wry::WebView) {
    use wry::WebViewExtMacOS;
    let original = ORIGINAL.get_or_init(|| unsafe {
      let wk = webview.webview();
      let delegate: *mut AnyObject = msg_send![&*wk, navigationDelegate];
      let method = delegate.as_ref()?.class().instance_method(sel!(webView:decidePolicyForNavigationAction:decisionHandler:))?;
      // Safety: `decide` has the method's signature (void; self, _cmd, three objects).
      let original = method.set_implementation(std::mem::transmute::<Decide, Imp>(decide));
      Some(original as usize)
    });
    if original.is_none() {
      log!("the navigation delegate has no decidePolicyForNavigationAction: frames inside the page are treated as pages");
    }
  }

  type MediaRequest = extern "C-unwind" fn(&AnyObject, Sel, *mut AnyObject, *mut AnyObject, *mut AnyObject, isize, *mut AnyObject);

  /// wry's webView:requestMediaCapturePermissionForOrigin:initiatedByFrame:type:decisionHandler:.
  static MEDIA_ORIGINAL: OnceLock<Option<usize>> = OnceLock::new();

  thread_local! {
    static MEDIA_TRUSTED: Cell<bool> = const { Cell::new(false) };
  }

  /// Whether the camera or microphone request wry's permission handler is being asked about comes
  /// from the app origin's main frame (L0: never from a frame inside the page, whatever it loaded).
  pub fn media_trusted() -> bool {
    MEDIA_TRUSTED.get()
  }

  /// Wraps the UI delegate's media capture method (once for its class) to mark the requests that
  /// come from app://localhost's main frame; wry only passes the kind on.
  pub fn install_media(webview: &wry::WebView) {
    use wry::WebViewExtMacOS;
    let original = MEDIA_ORIGINAL.get_or_init(|| unsafe {
      let wk = webview.webview();
      let delegate: *mut AnyObject = msg_send![&*wk, UIDelegate];
      let method = delegate.as_ref()?.class().instance_method(sel!(webView:requestMediaCapturePermissionForOrigin:initiatedByFrame:type:decisionHandler:))?;
      // Safety: `media` has the method's signature (void; self, _cmd, three objects, NSInteger, block).
      let original = method.set_implementation(std::mem::transmute::<MediaRequest, Imp>(media));
      Some(original as usize)
    });
    if original.is_none() {
      log!("the UI delegate has no media capture method: camera and microphone requests are denied");
    }
  }

  extern "C-unwind" fn media(this: &AnyObject, cmd: Sel, webview: *mut AnyObject, origin: *mut AnyObject, frame: *mut AnyObject, kind: isize, handler: *mut AnyObject) {
    let Some(Some(original)) = MEDIA_ORIGINAL.get() else { return };
    let trusted = unsafe {
      use objc2_foundation::NSString;
      let scheme: *mut NSString = msg_send![origin, protocol];
      let host: *mut NSString = msg_send![origin, host];
      let port: isize = msg_send![origin, port];
      let main: bool = frame.as_ref().is_some_and(|f| msg_send![f, isMainFrame]);
      main && port == 0 && scheme.as_ref().is_some_and(|s| s.to_string() == "app") && host.as_ref().is_some_and(|h| h.to_string() == "localhost")
    };
    // Safety: the implementation this one replaced, with the same signature.
    let original = unsafe { std::mem::transmute::<usize, MediaRequest>(*original) };
    MEDIA_TRUSTED.set(trusted);
    original(this, cmd, webview, origin, frame, kind, handler);
    MEDIA_TRUSTED.set(false);
  }

  extern "C-unwind" fn decide(this: &AnyObject, cmd: Sel, webview: *mut AnyObject, action: *mut AnyObject, handler: *mut AnyObject) {
    let Some(Some(original)) = ORIGINAL.get() else { return };
    let sub_frame = unsafe {
      let frame: *mut AnyObject = msg_send![action, targetFrame];
      match frame.as_ref() {
        Some(frame) => {
          let main: bool = msg_send![frame, isMainFrame];
          !main
        }
        None => false,
      }
    };
    // Safety: the implementation this one replaced, with the same signature.
    let original = unsafe { std::mem::transmute::<usize, Decide>(*original) };
    SUB_FRAME.set(sub_frame);
    original(this, cmd, webview, action, handler);
    SUB_FRAME.set(false);
  }
}

#[cfg(target_os = "linux")]
pub fn install(webview: &wry::WebView) {
  use webkit2gtk::{
    glib::prelude::*, NavigationPolicyDecision, NavigationPolicyDecisionExt, NetworkError, PolicyDecisionExt, PolicyDecisionType, PolicyError, ResponsePolicyDecision,
    ResponsePolicyDecisionExt, URIRequestExt, URIResponseExt, WebViewExt,
  };
  use wry::WebViewExtUnix;
  let view = webview.webview();
  // true: decided here.
  view.connect_decide_policy(|_, decision, kind| match kind {
    PolicyDecisionType::NavigationAction => {
      let Some(action) = decision.dynamic_cast_ref::<NavigationPolicyDecision>().and_then(|d| d.navigation_action()) else { return false };
      let url = action.request().and_then(|r| r.uri()).map(|u| u.to_string()).unwrap_or_default();
      let scheme = scheme(&url).unwrap_or_default();
      if in_app(&url) || contract::FRAME_SCHEMES.contains(&scheme.as_str()) {
        return false; // decided at the response, or loads
      }
      // mailto:, tel: and every other scheme, in any frame: only a click may open a mail or phone app.
      if opens_externally(&url) && action.is_user_gesture() {
        crate::open_external(&url);
      } else {
        log!("blocked a navigation to {}", shown(&url));
      }
      decision.ignore();
      true
    }
    PolicyDecisionType::Response => {
      let Some(response) = decision.dynamic_cast_ref::<ResponsePolicyDecision>() else { return false };
      // Only documents get here: the page's top-level one, or a frame's (which never opens anything).
      let top_level = response.is_main_frame_main_resource();
      let url = response.response().and_then(|r| r.uri()).map(|u| u.to_string()).unwrap_or_default();
      match decide(&url, top_level) {
        Decision::Load => false,
        Decision::Open => {
          decision.ignore();
          crate::open_external(&url);
          true
        }
        Decision::Drop => {
          log!("blocked a {} navigation to {}", if top_level { "page" } else { "frame" }, shown(&url));
          decision.ignore();
          true
        }
      }
    }
    _ => false,
  });
  // A top-level load that fails before its response (offline, unknown host) would replace the app
  // with WebKit's error page: the link goes to the browser instead, which shows the error.
  // true: no error page.
  view.connect_load_failed(|_, _, url, error| {
    if in_app(url) {
      return false;
    }
    // Ignored above (already opened), or stopped.
    let ended_here = error.matches(PolicyError::FrameLoadInterruptedByPolicyChange) || error.matches(NetworkError::Cancelled);
    if !ended_here && opens_externally(url) {
      crate::open_external(url);
    }
    true
  });
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn pages_stay_in_the_app_and_links_go_to_the_os() {
    #[cfg(target_os = "windows")]
    let app = "https://app.localhost/settings";
    #[cfg(not(target_os = "windows"))]
    let app = "app://localhost/settings";
    assert_eq!(decide(app, true), Decision::Load);
    assert_eq!(decide("about:blank", true), Decision::Load);
    for url in ["https://example.com/", "HTTP://example.com", "mailto:a@example.com", "tel:+123"] {
      assert_eq!(decide(url, true), Decision::Open, "{url}");
    }
    for url in ["file:///etc/passwd", "smb://host/share", "search-ms:query=x", "otherapp://x", "data:text/html,x", "blob:app://localhost/1", "javascript:alert(1)", "nothing"] {
      assert_eq!(decide(url, true), Decision::Drop, "{url}");
    }
  }

  #[test]
  fn frames_load_web_content_but_open_nothing() {
    for url in ["https://www.youtube.com/embed/x", "http://example.com", "data:text/html,x", "blob:https://example.com/1", "about:srcdoc"] {
      assert_eq!(decide(url, false), Decision::Load, "{url}");
    }
    for url in ["mailto:a@example.com", "tel:1", "smb://host/share", "otherapp://x", "file:///etc/passwd"] {
      assert_eq!(decide(url, false), Decision::Drop, "{url}");
    }
  }

  #[test]
  fn long_urls_are_shortened_for_logs() {
    let url = format!("data:text/plain,{}", "é".repeat(100));
    assert!(shown(&url).len() <= 124 && shown(&url).ends_with('…'));
    assert_eq!(shown("https://example.com"), "https://example.com");
  }
}
