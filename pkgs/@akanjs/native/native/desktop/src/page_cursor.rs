//! window.setCursorVisible over the page on macOS: tao hides the pointer with a cursor rect on its own content view,
//! which wry replaces (wry wkwebview/mod.rs), and WebKit sets the pointer itself over the page. A style hides it in the
//! current document's frames and, through a user script, in every document loaded while hidden: a constructed
//! stylesheet, since a Content-Security-Policy style-src refuses a <style> element but not the CSSOM.

use block2::RcBlock;
use objc2::{msg_send, rc::Retained, runtime::AnyClass, runtime::AnyObject, sel};
use objc2_foundation::NSString;
use wry::{WebView, WebViewExtMacOS};

const HIDE: &str = r#"(()=>{const on=w=>{try{const d=w.document;let s=d.__akanCursorNone;if(!s){s=new w.CSSStyleSheet();s.replaceSync("*,*::before,*::after{cursor:none!important}");d.__akanCursorNone=s;d.adoptedStyleSheets=[...d.adoptedStyleSheets,s];}s.disabled=false;}catch{}for(let i=0;i<w.frames.length;i++)on(w.frames[i]);};on(window);})();"#;
const SHOW: &str = r#"(()=>{const off=w=>{try{const s=w.document.__akanCursorNone;if(s)s.disabled=true;}catch{}for(let i=0;i<w.frames.length;i++)off(w.frames[i]);};off(window);})();"#;
const AT_DOCUMENT_START: isize = 0;
/// WKErrorJavaScriptInvalidFrameTarget: the frame a script was sent to is gone.
const FRAME_GONE: isize = 12;

pub fn set_hidden(webview: &WebView, hidden: bool) {
  let script = if hidden { HIDE } else { SHOW };
  let _ = webview.evaluate_script(script);
  let wk = webview.webview();
  in_frames(&wk, script);
  // Safety: main thread (a shell op); WKWebView's, WKUserContentController's and NSArray's public API.
  unsafe {
    let config: Retained<AnyObject> = msg_send![&*wk, configuration];
    let controller: Retained<AnyObject> = msg_send![&*config, userContentController];
    let list: Retained<AnyObject> = msg_send![&*controller, userScripts];
    let count: usize = msg_send![&*list, count];
    let scripts: Vec<Retained<AnyObject>> = (0..count).filter_map(|i| msg_send![&*list, objectAtIndex: i]).collect();
    let ours = |script: &AnyObject| {
      let source: Option<Retained<NSString>> = msg_send![script, source];
      source.is_some_and(|s| s.to_string() == HIDE)
    };
    let present = scripts.iter().any(|s| ours(s));
    if hidden && !present {
      let Some(class) = AnyClass::get(c"WKUserScript") else { return };
      let script: Option<Retained<AnyObject>> = msg_send![msg_send![class, alloc], initWithSource: &*NSString::from_str(HIDE), injectionTime: AT_DOCUMENT_START, forMainFrameOnly: false];
      match script {
        Some(script) => msg_send![&*controller, addUserScript: &*script],
        None => log!("the page's next documents show the pointer: WebKit made no user script"),
      }
    } else if !hidden && present {
      //? WKUserContentController removes its user scripts all at once only: wry's own go back in, in their order.
      let _: () = msg_send![&*controller, removeAllUserScripts];
      for script in scripts.iter().filter(|s| !ours(s)) {
        let _: () = msg_send![&*controller, addUserScript: &**script];
      }
    }
  }
}

//? The top document's script reaches its same-origin frames only: each frame the page's navigations named runs it too.
fn in_frames(wk: &AnyObject, script: &str) {
  // Safety: main thread (a shell op); WKWebView's (macOS 11+) and WKContentWorld's public API.
  unsafe {
    let can: bool = msg_send![wk, respondsToSelector: sel!(evaluateJavaScript:inFrame:inContentWorld:completionHandler:)];
    let Some(worlds) = AnyClass::get(c"WKContentWorld").filter(|_| can) else { return };
    let world: Retained<AnyObject> = msg_send![worlds, pageWorld];
    let source = NSString::from_str(script);
    for frame in crate::navigation::mac::frames_of(wk) {
      let sent = frame.clone();
      let done = RcBlock::new(move |_: *mut AnyObject, error: *mut AnyObject| {
        let Some(error) = error.as_ref() else { return };
        let code: isize = msg_send![error, code];
        let domain: Option<Retained<NSString>> = msg_send![error, domain];
        if code == FRAME_GONE && domain.is_some_and(|d| d.to_string() == "WKErrorDomain") {
          crate::navigation::mac::forget(&sent);
        }
      });
      let _: () = msg_send![wk, evaluateJavaScript: &*source, inFrame: &*frame, inContentWorld: &*world, completionHandler: &*done];
    }
  }
}
