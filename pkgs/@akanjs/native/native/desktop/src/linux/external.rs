//! The external-view plugin on WebKitGTK (external.rs). A view lies on a GtkOverlay over its window's page: wry's
//! build_as_child is X11 only. WebKitGTK has no DevTools Protocol, so `cdp` answers the screenshot and the key events
//! desktop.ts asks for through GTK, a visible view also holds the keyboard focus for the user's own keys, and frames are
//! told apart at their responses, as navigation.rs does for the page.

use std::{
  cell::{Cell, RefCell},
  collections::HashMap,
  rc::Rc,
};

use gtk::{gdk, gio, glib, prelude::*};
use javascriptcore::{ContextExt, ValueExt};
use webkit2gtk::{
  JavascriptError, LoadEvent, NavigationPolicyDecision, NavigationPolicyDecisionExt, NetworkError, PolicyDecisionExt, PolicyDecisionType, PolicyError, ResponsePolicyDecision,
  ResponsePolicyDecisionExt, SettingsExt, SnapshotOptions, SnapshotRegion, URIRequestExt, URIResponseExt, WebContextExt, WebProcessTerminationReason, WebResourceExt,
  WebViewExt, WebsiteDataManagerExtManual, WebsiteDataTypes,
};
use wry::{WebView, WebViewBuilder, WebViewBuilderExtUnix, WebViewExtUnix};

use crate::{
  external::{admits, event, json_answer, Bounds, Reply},
  json,
  navigation::{scheme, shown},
  push_event, send, UserEvent,
};

pub(crate) type Cursor = ();

/// The page's container: tao's GTK box holds it, and every external view of the window lies on it.
pub(crate) fn page_layer(vbox: &gtk::Box) -> gtk::Overlay {
  let overlay = gtk::Overlay::new();
  vbox.pack_start(&overlay, true, true, 0);
  overlay.show();
  static SNOOPER: std::sync::Once = std::sync::Once::new();
  // SAFETY: page_layer runs on GTK's thread once GTK is up, and the snooper stays for the process.
  SNOOPER.call_once(|| unsafe {
    gtk::ffi::gtk_key_snooper_install(Some(hand_back), std::ptr::null_mut());
  });
  overlay
}

//? WebKit hands a key the page left unhandled back through gtk_main_do_event, which gives it to the window's page, or
//? to an app dialog holding a grab, and leaves the view to drop its next key. Key snoopers run before either: a sent
//? key goes back to its own view, which takes it as the one handed back.
unsafe extern "C" fn hand_back(_grab: *mut gtk::ffi::GtkWidget, key: *mut gdk::ffi::GdkEventKey, _: glib::ffi::gpointer) -> std::os::raw::c_int {
  use glib::translate::FromGlibPtrBorrow;
  let event = gdk::Event::from_glib_borrow(key.cast::<gdk::ffi::GdkEvent>());
  let Some(window) = event.window().filter(|_| event.is_send_event()) else { return 0 };
  let mut copy = (*event).clone();
  let Some(view) = gtk::event_widget(&mut copy).and_then(|widget| widget.downcast::<webkit2gtk::WebView>().ok()) else { return 0 };
  // SAFETY: only key_window sets KEY_WINDOW, always to a gdk::Window.
  if unsafe { view.data::<gdk::Window>(KEY_WINDOW) }.is_none_or(|own| unsafe { own.as_ref() } != &window) {
    return 0;
  }
  view.event(&copy);
  1
}

/// The view in a box of its own on the window's overlay, laid out at `bounds`.
pub(crate) fn build(builder: WebViewBuilder, window: &tao::window::Window, bounds: Bounds) -> Result<WebView, String> {
  use tao::platform::unix::WindowExtUnix;
  let overlay = window
    .default_vbox()
    .and_then(|vbox| vbox.children().into_iter().find_map(|child| child.downcast::<gtk::Overlay>().ok()))
    .ok_or("external view: the window has no page overlay")?;
  let holder = gtk::Box::new(gtk::Orientation::Vertical, 0);
  //? tao's window.show_all() (its first show, window.show, a reopen) would show a view the page hid.
  holder.set_no_show_all(true);
  overlay.add_overlay(&holder);
  lay_out(&holder, bounds);
  holder.show();
  let webview = builder.build_gtk(&holder).map_err(|e| {
    overlay.remove(&holder);
    format!("external view: {e}")
  })?;
  keep_open(&webview);
  Ok(webview)
}

//? wry destroys a webview on `close`, which WebKit sends for window.close() in a top frame with no history: the view
//? would go and leave its box over the page, taking its clicks. Windows and macOS ignore the call, so the view does too.
fn keep_open(webview: &WebView) {
  use glib::translate::IntoGlib;
  let wv = webview.webview();
  // SAFETY: `wv` is a live WebKitWebView, and "close" is a signal of its class.
  unsafe {
    let close = glib::gobject_ffi::g_signal_lookup(b"close\0".as_ptr().cast(), webkit2gtk::WebView::static_type().into_glib());
    glib::gobject_ffi::g_signal_handlers_disconnect_matched(
      wv.as_ptr().cast(),
      glib::gobject_ffi::G_SIGNAL_MATCH_ID,
      close,
      0,
      std::ptr::null_mut(),
      std::ptr::null_mut(),
      std::ptr::null_mut(),
    );
  }
}

fn holder_of(webview: &WebView) -> Option<gtk::Box> {
  webview.webview().parent().and_then(|parent| parent.downcast::<gtk::Box>().ok())
}

//? GtkOverlay sizes an aligned child to its size request: a filling one follows the window, a placed one stays put.
fn lay_out(holder: &gtk::Box, bounds: Bounds) {
  let (align, x, y, width, height) = match bounds {
    Bounds::Fill => (gtk::Align::Fill, 0, 0, -1, -1),
    Bounds::At { x, y, width, height } => (gtk::Align::Start, x.round() as i32, y.round() as i32, width.round().max(1.0) as i32, height.round().max(1.0) as i32),
  };
  holder.set_halign(align);
  holder.set_valign(align);
  holder.set_margin_start(x);
  holder.set_margin_top(y);
  holder.set_size_request(width, height);
}

pub(crate) fn place(webview: &WebView, bounds: Bounds) {
  if let Some(holder) = holder_of(webview) {
    lay_out(&holder, bounds);
  }
}

//? The overlay gives each child a window of its own: a hidden view's box would still take the clicks meant for the page.
pub(crate) fn set_visible(webview: &WebView, visible: bool) {
  if let Some(holder) = holder_of(webview) {
    holder.set_visible(visible);
  }
}

/// Off the overlay, its calls answered CANCELLED; wry destroys the webview itself when it is dropped.
pub(crate) fn discard(webview: &WebView) {
  // SAFETY: only `calls` sets CALLS, always to a Calls.
  if let Some(calls) = unsafe { webview.webview().data::<Calls>(CALLS) } {
    let pending = std::mem::take(&mut *unsafe { calls.as_ref() }.pending.borrow_mut());
    for reply in pending.into_values() {
      reply.send(Err("CANCELLED: the view was closed or built again before its page answered".into()));
    }
  }
  let Some(holder) = holder_of(webview) else { return };
  if let Some(overlay) = holder.parent().and_then(|parent| parent.downcast::<gtk::Container>().ok()) {
    overlay.remove(&holder);
  }
}

pub(crate) fn reclaim(_page: &WebView) {}

pub(crate) fn set_cursor_hidden(_webview: &WebView, _hidden: bool, _cursor: &Cursor) {}

pub(crate) fn track_frames(_webview: &WebView, _view: &str, _cursor: &Cursor) {}

pub(crate) fn set_muted(webview: &WebView, muted: bool) -> Result<(), String> {
  webview.webview().set_is_muted(muted);
  Ok(())
}

//? wry's clear_all_browsing_data does not wait for WebKit: a reload right after it would still find the old storage.
pub(crate) fn clear_data(webview: &WebView, reply: Reply) {
  let Some(manager) = webview.webview().context().and_then(|context| context.website_data_manager()) else {
    return reply.send(Err("clearData: the view has no data of its own".into()));
  };
  manager.clear(WebsiteDataTypes::ALL, glib::TimeSpan::from_seconds(0), None::<&gtk::gio::Cancellable>, move |done| {
    reply.send(done.map(|()| "null".into()).map_err(|e| format!("clearData: {e}")));
  });
}

const CALLS: &str = "akan-calls";

//? Not wry's evaluate_script_with_callback: before the first navigation commits it queues the script, runs it at the
//? commit and drops the callback, and it answers "" for a value JSON has no form for.
pub(crate) fn evaluate(webview: &WebView, script: &str, reply: Reply) {
  let wv = webview.webview();
  let calls = calls(&wv);
  let id = calls.next.get();
  calls.next.set(id + 1);
  calls.pending.borrow_mut().insert(id, reply);
  let (pending, before, ends) = (Rc::downgrade(&calls.pending), calls.ends.get(), calls.ends);
  wv.evaluate_javascript(script, None, None, None::<&gio::Cancellable>, move |result| {
    //? WebKit answers a call its web process ended under before it emits web-process-terminated.
    glib::idle_add_local_once(move || {
      let reply = pending.upgrade().and_then(|pending| pending.borrow_mut().remove(&id));
      if let Some(reply) = reply {
        reply.send(answer(result, ends.get() != before));
      }
    });
  });
}

/// A view's evaluate calls not yet answered, and the times its web process ended.
#[derive(Clone)]
struct Calls {
  //? WebKit never answers a call whose page loops, even once the view is closed: discard answers them instead.
  pending: Rc<RefCell<HashMap<u64, Reply>>>,
  next: Rc<Cell<u64>>,
  //? WebKit answers a call its web process ended under as it answers a script that threw: null, where macOS errs.
  ends: Rc<Cell<u64>>,
}

fn calls(wv: &webkit2gtk::WebView) -> Calls {
  // SAFETY: only `calls` sets CALLS, always to a Calls.
  if let Some(calls) = unsafe { wv.data::<Calls>(CALLS) } {
    return unsafe { calls.as_ref() }.clone();
  }
  let calls = Calls { pending: Rc::default(), next: Rc::default(), ends: Rc::default() };
  let ends = calls.ends.clone();
  wv.connect_web_process_terminated(move |_, _| ends.set(ends.get() + 1));
  unsafe { wv.set_data(CALLS, calls.clone()) };
  calls
}

/// The answer mac::evaluate gives: null for an exception or a value WebKit passes no result for, an error for a call
/// its web process ended under.
fn answer(result: Result<javascriptcore::Value, glib::Error>, ended: bool) -> Result<String, String> {
  if ended {
    return Err("INTERNAL: the view's web process ended before its page answered".into());
  }
  let error = match result {
    Ok(value) => {
      let text = value.to_json(0);
      //? jsc_value_to_json leaves JSON.stringify's TypeError (a cycle, a BigInt) on WebKit's shared result context.
      if text.is_none() {
        if let Some(context) = value.context() {
          context.clear_exception();
        }
      }
      return Ok(json_answer(text.as_deref()));
    }
    Err(error) => error,
  };
  match error.kind::<JavascriptError>() {
    Some(JavascriptError::ScriptFailed | JavascriptError::InvalidResult) => Ok("null".into()),
    _ => Err(format!("INTERNAL: {error}")),
  }
}

/// The top level stays on `allow`, checked once its response says it is the top-level document; frames load web
/// content from anywhere; any other scheme (mailto:, another app's) goes nowhere, in any frame.
pub(crate) fn guard(webview: &WebView, view: &str, allow: Rc<RefCell<Vec<String>>>) {
  let wv = webview.webview();
  //? A history load restored from the page cache commits with no response to check below.
  if let Some(settings) = WebViewExt::settings(&wv) {
    settings.set_enable_page_cache(false);
  }
  //? A failed load's error page commits at the failing URL with no response to check below, and runs the init script
  //? there; one with TLS errors would also report its URL. Both are connected before watch's, so they stop it too.
  let (failed_allow, failed_view) = (allow.clone(), view.to_string());
  wv.connect_load_failed(move |_, _, url, error| {
    if admits(&failed_allow.borrow(), url, false) {
      return false;
    }
    if !error.matches(PolicyError::FrameLoadInterruptedByPolicyChange) && !error.matches(NetworkError::Cancelled) {
      log!("external view {failed_view}: refused the error page of {}, which is on no origin it was opened for", shown(url));
    }
    true
  });
  let tls_allow = allow.clone();
  wv.connect_load_failed_with_tls_errors(move |_, url, _, _| !admits(&tls_allow.borrow(), url, false));
  let view = view.to_string();
  wv.connect_decide_policy(move |_, decision, kind| match kind {
    PolicyDecisionType::NavigationAction => {
      let Some(action) = decision.dynamic_cast_ref::<NavigationPolicyDecision>().and_then(|d| d.navigation_action()) else { return false };
      let url = action.request().and_then(|r| r.uri()).map(|u| u.to_string()).unwrap_or_default();
      if scheme(&url).is_some_and(|s| crate::contract::FRAME_SCHEMES.contains(&s.as_str())) {
        return false;
      }
      log!("external view {view}: refused a navigation to {}", shown(&url));
      decision.ignore();
      true
    }
    PolicyDecisionType::Response => {
      let Some(response) = decision.dynamic_cast_ref::<ResponsePolicyDecision>() else { return false };
      let url = response.response().and_then(|r| r.uri()).map(|u| u.to_string()).unwrap_or_default();
      if !response.is_main_frame_main_resource() || admits(&allow.borrow(), &url, false) {
        return false;
      }
      log!("external view {view}: refused a navigation to {url}, which is on no origin it was opened for");
      decision.ignore();
      true
    }
    _ => false,
  });
}

/// A navigation that failed (the network, DNS, a certificate, a server's error status) and the web process ending.
/// WebKitGTK reports no console without a script in the page, which the view never runs.
pub(crate) fn watch(webview: &WebView, view: &str, window: u32, _console: bool) {
  let wv = webview.webview();
  let failed = move |view: &str, url: &str, code: &str| {
    push_event(&event(view, window, &format!(r#""event":"loadFailed","url":{},"errorCode":"{code}""#, json::quote(url))));
  };
  let failed_view = view.to_string();
  wv.connect_load_failed(move |_, _, url, error| {
    //? A navigation refused above and one a newer navigation replaced end so: neither is a failure.
    //? WebKit sends one with TLS errors here too, once load-failed-with-tls-errors below has reported it.
    if error.matches(PolicyError::FrameLoadInterruptedByPolicyChange) || error.matches(NetworkError::Cancelled) || error.kind::<gtk::gio::TlsError>().is_some() {
      return false;
    }
    failed(&failed_view, url, &error_name(error));
    false
  });
  let tls_view = view.to_string();
  wv.connect_load_failed_with_tls_errors(move |_, url, _, _| {
    failed(&tls_view, url, "certificate");
    false
  });
  let status_view = view.to_string();
  wv.connect_load_changed(move |wv, load| {
    if load != LoadEvent::Finished {
      return;
    }
    let Some(response) = wv.main_resource().and_then(|r| r.response()) else { return };
    let status = response.status_code();
    if status >= 400 {
      let url = response.uri().map(|u| u.to_string()).unwrap_or_default();
      failed(&status_view, &url, &format!("http{status}"));
    }
  });
  let gone_view = view.to_string();
  wv.connect_web_process_terminated(move |_, reason| {
    let reason = match reason {
      WebProcessTerminationReason::ExceededMemoryLimit => "oom",
      WebProcessTerminationReason::TerminatedByApi => "killed",
      _ => "crashed",
    };
    send(UserEvent::ExternalGone { view: gone_view.clone(), reason });
  });
}

/// The names WebView2's statuses get on Windows (win/external.rs), for the failures WebKitGTK tells apart.
fn error_name(error: &glib::Error) -> String {
  use gtk::gio::{IOErrorEnum, ResolverError};
  if error.kind::<ResolverError>().is_some() {
    return "hostNameNotResolved".into();
  }
  match error.kind::<IOErrorEnum>() {
    Some(IOErrorEnum::ConnectionRefused) => "cannotConnect".into(),
    Some(IOErrorEnum::TimedOut) => "timeout".into(),
    Some(IOErrorEnum::HostUnreachable | IOErrorEnum::NetworkUnreachable) => "serverUnreachable".into(),
    Some(IOErrorEnum::BrokenPipe) => "connectionReset".into(),
    _ => {
      log!("external view: a load failed: {error}");
      "unknown".into()
    }
  }
}

/// The DevTools Protocol methods desktop.ts sends, answered through GTK.
pub(crate) fn cdp(webview: &WebView, method: &str, params: &str, reply: Reply) {
  match method {
    "Page.captureScreenshot" => capture(webview, reply),
    "Input.dispatchKeyEvent" => match json::parse(params).and_then(|params| send_key(webview, &params)) {
      //? Answered once a script sent after the key has run: WebKit gives the page a key only after its answer to the one
      //? before, so no sent key waits behind another, and a Tab's take-focus reaches GTK before its hold ends.
      Ok(hold) => {
        let hold = glib::thread_guard::ThreadGuard::new(hold);
        evaluate(
          webview,
          "0",
          Reply::new(move |answered| {
            drop(hold);
            reply.send(answered.map(|_| "{}".into()));
          }),
        );
      }
      Err(error) => reply.send(Err(error)),
    },
    _ => reply.send(Err(format!("UNSUPPORTED: {method} reaches no view on Linux"))),
  }
}

/// What the view shows, as Page.captureScreenshot answers it: a base64 PNG in `data`.
fn capture(webview: &WebView, reply: Reply) {
  webview.webview().snapshot(SnapshotRegion::Visible, SnapshotOptions::NONE, None::<&gtk::gio::Cancellable>, move |shot| {
    let png = shot.map_err(|e| format!("capture: {e}")).and_then(|surface| {
      let image = gtk::cairo::ImageSurface::try_from(surface).map_err(|_| "capture: the view answered no image".to_string())?;
      let pixbuf = gdk::pixbuf_get_from_surface(&image, 0, 0, image.width(), image.height()).ok_or("capture: the view answered an empty image")?;
      pixbuf.save_to_bufferv("png", &[]).map_err(|e| format!("capture: {e}"))
    });
    reply.send(png.map(|bytes| format!(r#"{{"data":"{}"}}"#, glib::base64_encode(&bytes))));
  });
}

/// The X keysym of a KeyboardEvent.code a key's text does not name: every key desktop.ts's virtualKey knows.
pub(crate) fn keysym(code: &str) -> Option<String> {
  if let Some(n) = code.strip_prefix('F').and_then(|n| n.parse::<u8>().ok()).filter(|n| (1..=24).contains(n)) {
    return Some(format!("F{n}"));
  }
  if let Some(digit) = code.strip_prefix("Numpad").filter(|d| d.len() == 1 && d.as_bytes()[0].is_ascii_digit()) {
    return Some(format!("KP_{digit}"));
  }
  let name = match code {
    "Enter" => "Return",
    "NumpadEnter" => "KP_Enter",
    "Escape" => "Escape",
    "Tab" => "Tab",
    "Backspace" => "BackSpace",
    "Delete" => "Delete",
    "ArrowLeft" => "Left",
    "ArrowUp" => "Up",
    "ArrowRight" => "Right",
    "ArrowDown" => "Down",
    "Home" => "Home",
    "End" => "End",
    "PageUp" => "Page_Up",
    "PageDown" => "Page_Down",
    "Space" => "space",
    _ => return None,
  };
  Some(name.into())
}

//? WebKitGTK reads KeyboardEvent.code off the hardware keycode (evdev + 8), so it comes from `code`, never the layout.
pub(crate) fn evdev(code: &str) -> Option<u16> {
  const LETTERS: &[u8; 26] = b"\x1e\x30\x2e\x20\x12\x21\x22\x23\x17\x24\x25\x26\x32\x31\x18\x19\x10\x13\x1f\x14\x16\x2f\x11\x2d\x15\x2c";
  if let Some(letter) = code.strip_prefix("Key").filter(|l| l.len() == 1 && l.as_bytes()[0].is_ascii_uppercase()) {
    return Some(u16::from(LETTERS[usize::from(letter.as_bytes()[0] - b'A')]));
  }
  if let Some(digit) = code.strip_prefix("Digit").filter(|d| d.len() == 1 && d.as_bytes()[0].is_ascii_digit()) {
    let d = digit.as_bytes()[0] - b'0';
    return Some(if d == 0 { 11 } else { u16::from(d) + 1 });
  }
  if let Some(digit) = code.strip_prefix("Numpad").filter(|d| d.len() == 1 && d.as_bytes()[0].is_ascii_digit()) {
    return Some([82, 79, 80, 81, 75, 76, 77, 71, 72, 73][usize::from(digit.as_bytes()[0] - b'0')]);
  }
  if let Some(n) = code.strip_prefix('F').and_then(|n| n.parse::<u16>().ok()).filter(|n| (1..=24).contains(n)) {
    return Some(match n {
      1..=10 => 58 + n,
      11 | 12 => 76 + n,
      _ => 170 + n,
    });
  }
  Some(match code {
    "Escape" => 1,
    "Minus" => 12,
    "Equal" => 13,
    "Backspace" => 14,
    "Tab" => 15,
    "BracketLeft" => 26,
    "BracketRight" => 27,
    "Enter" => 28,
    "Semicolon" => 39,
    "Quote" => 40,
    "Backquote" => 41,
    "Backslash" => 43,
    "Comma" => 51,
    "Period" => 52,
    "Slash" => 53,
    "Space" => 57,
    "NumpadEnter" => 96,
    "Home" => 102,
    "ArrowUp" => 103,
    "PageUp" => 104,
    "ArrowLeft" => 105,
    "ArrowRight" => 106,
    "End" => 107,
    "ArrowDown" => 108,
    "PageDown" => 109,
    "Delete" => 111,
    _ => return None,
  })
}

/// The keysym the page reads `key` off: `code`'s own when it types the same text (a numpad digit) or is the same key on
/// the keypad (NumpadEnter), else `key`'s.
fn keyval(key: &str, code: &str) -> Option<u32> {
  let named = |name: &str| keysym(name).map(|sym| gdk::keys::Key::from_name(&sym));
  let mut chars = key.chars();
  let sym = match (chars.next(), chars.next()) {
    (Some(c), None) => named(code).filter(|sym| sym.to_unicode() == Some(c)).unwrap_or_else(|| gdk::keys::Key::from_unicode(c)),
    _ if code.strip_prefix("Numpad") == Some(key) => named(code)?,
    //? WebKitGTK names a keysym it has no name or text for "Unidentified".
    _ if key == "Unidentified" => gdk::keys::constants::VoidSymbol,
    _ => named(key)?,
  };
  Some(*sym)
}

//? IBus's IBUS_IGNORED_MASK and Fcitx's FcitxKeyState_IgnoredMask: both commit such a key's own text, where a
//? composing input method (Hangul, Pinyin) would make a sent `z` part of a syllable.
const IM_PASS_THROUGH: u32 = 1 << 25;
const KEY_WINDOW: &str = "akan-key-window";

//? Sent to the view's widget, not the display: it reaches that view alone, focused, hidden or not, and counts as trusted.
fn send_key(webview: &WebView, params: &json::V) -> Result<Option<FocusHold>, String> {
  let field = |k: &str| params.get(k).and_then(|v| v.as_str()).unwrap_or("");
  let kind = match field("type") {
    "keyDown" | "rawKeyDown" => gdk::EventType::KeyPress,
    "keyUp" => gdk::EventType::KeyRelease,
    other => return Err(format!("INVALID_ARGS: no key event of type {other}")),
  };
  let (key, code) = (field("key"), field("code"));
  //? GTK's input method takes a dead keysym as the start of a compose: the page sees a composition keydown, not
  //? "Dead", and the next key typed as one character with it.
  if key == "Dead" {
    return Err("INVALID_ARGS: key Dead is not one sendKey sends on Linux, whose input method composes it with the next key".into());
  }
  let keyval = keyval(key, code).ok_or_else(|| format!("INVALID_ARGS: key {key} is not one sendKey sends on Linux"))?;
  let keycode = evdev(code).ok_or_else(|| format!("INVALID_ARGS: code {code} is not a key sendKey knows"))? + 8;
  //? GTK's key bindings read a key off its keycode and state: a numpad digit without NumLock (Mod2) is Home, End, ….
  let num_lock = if code.starts_with("Numpad") { gdk::ModifierType::MOD2_MASK.bits() } else { 0 };
  let wv = webview.webview();
  wv.realize();
  let window = key_window(&wv)?;
  if !window.is_viewable() {
    return Err("UNSUPPORTED: sendKey on Linux needs the view's window shown".into());
  }
  let display = window.display();
  let mut native = gdk::Event::new(kind);
  native.set_device(display.default_seat().and_then(|seat| seat.keyboard()).as_ref());
  // SAFETY: Event::new(KeyPress|KeyRelease) allocated a GdkEventKey, which releases the window reference with itself.
  unsafe {
    use glib::translate::{ToGlibPtr, ToGlibPtrMut};
    let raw = ToGlibPtrMut::<*mut gdk::ffi::GdkEvent>::to_glib_none_mut(&mut native).0 as *mut gdk::ffi::GdkEventKey;
    (*raw).window = window.to_glib_full();
    (*raw).time = (glib::monotonic_time() / 1000) as u32;
    (*raw).send_event = 1;
    (*raw).state = IM_PASS_THROUGH | num_lock;
    (*raw).keyval = keyval;
    (*raw).hardware_keycode = keycode;
  }
  let hold = (kind == gdk::EventType::KeyPress && keyval == *gdk::keys::constants::Tab).then(|| FocusHold::new(&wv));
  wv.event(&native);
  Ok(hold)
}

const FOCUS_HOLDS: &str = "akan-focus-holds";

/// A sent Tab on its way through a view's page, which keeps the window's keyboard focus where it is meanwhile.
struct FocusHold(Rc<Cell<u32>>);

//? A Tab past a page's last element ends in WebKit's take-focus, which grabs the GTK focus for a view without it, and
//? from a view with it moves the focus on through the window (the toplevel's `focus`).
impl FocusHold {
  fn new(wv: &webkit2gtk::WebView) -> Self {
    if let Some(top) = wv.toplevel().and_then(|top| top.downcast::<gtk::Window>().ok()) {
      // SAFETY: only FocusHold::new sets FOCUS_HOLDS on a window, always to ().
      if unsafe { top.data::<()>(FOCUS_HOLDS) }.is_none() {
        unsafe { top.set_data(FOCUS_HOLDS, ()) };
        top.connect_focus(|top, _| {
          let from = top.focused_widget().and_then(|widget| widget.downcast::<webkit2gtk::WebView>().ok());
          // SAFETY: only focus_holds sets FOCUS_HOLDS on a view, always to an Rc<Cell<u32>>.
          if from.is_some_and(|wv| unsafe { wv.data::<Rc<Cell<u32>>>(FOCUS_HOLDS) }.is_some_and(|holds| unsafe { holds.as_ref() }.get() > 0)) {
            glib::Propagation::Stop
          } else {
            glib::Propagation::Proceed
          }
        });
      }
    }
    let holds = focus_holds(wv);
    holds.set(holds.get() + 1);
    Self(holds)
  }
}

impl Drop for FocusHold {
  fn drop(&mut self) {
    self.0.set(self.0.get() - 1);
  }
}

fn focus_holds(wv: &webkit2gtk::WebView) -> Rc<Cell<u32>> {
  // SAFETY: only focus_holds sets FOCUS_HOLDS on a view, always to an Rc<Cell<u32>>.
  if let Some(holds) = unsafe { wv.data::<Rc<Cell<u32>>>(FOCUS_HOLDS) } {
    return unsafe { holds.as_ref() }.clone();
  }
  let holds = Rc::new(Cell::new(0));
  let grabs = holds.clone();
  wv.connect_grab_focus(move |wv| {
    if grabs.get() > 0 && !wv.is_focus() {
      wv.stop_signal_emission_by_name("grab-focus");
    }
  });
  unsafe { wv.set_data(FOCUS_HOLDS, holds.clone()) };
  holds
}

//? GTK drops a key press on a window not viewable, a hidden view's own: keys go through an off-screen one routed to it.
fn key_window(wv: &webkit2gtk::WebView) -> Result<gdk::Window, String> {
  use glib::translate::ToGlibPtr;
  // SAFETY: only key_window sets KEY_WINDOW, always to a gdk::Window.
  if let Some(window) = unsafe { wv.data::<gdk::Window>(KEY_WINDOW) } {
    return Ok(unsafe { window.as_ref() }.clone());
  }
  let top = wv.toplevel().and_then(|top| top.window()).ok_or("UNSUPPORTED: sendKey on Linux needs the view's window shown")?;
  let attrs = gdk::WindowAttr {
    x: Some(-1),
    y: Some(-1),
    width: 1,
    height: 1,
    wclass: gdk::WindowWindowClass::InputOnly,
    window_type: gdk::WindowType::Child,
    ..Default::default()
  };
  let window = gdk::Window::new(Some(&top), &attrs);
  // SAFETY: the window names the view as its widget only while the view lives: the view's destroy destroys it.
  unsafe {
    gdk::ffi::gdk_window_set_user_data(window.to_glib_none().0, wv.upcast_ref::<glib::Object>().as_ptr() as *mut _);
    wv.set_data(KEY_WINDOW, window.clone());
  }
  window.show();
  let destroyed = window.clone();
  wv.connect_destroy(move |_| destroyed.destroy());
  Ok(window)
}

//? A visible view takes the user's own keys too: their way to a view is the keyboard focus.
pub(crate) fn focus(webview: &WebView) {
  let wv = webview.webview();
  //? A sent Tab's hold stops WebKit's take-focus, not the app's own moves of the keyboard.
  let holds = focus_holds(&wv);
  let held = holds.replace(0);
  wv.grab_focus();
  holds.set(held);
}

/// The page of the window `any` (the page itself or a view over it) takes the keyboard back.
pub(crate) fn focus_page(any: &WebView) {
  let page = any.webview().ancestor(gtk::Overlay::static_type()).and_then(|o| o.downcast::<gtk::Overlay>().ok()).and_then(|o| o.child());
  if let Some(page) = page {
    page.grab_focus();
  }
}

#[cfg(test)]
mod tests {
  use super::{answer, evdev, keysym, keyval};
  use gtk::{gdk::keys::constants as k, glib};
  use javascriptcore::ContextExt;
  use webkit2gtk::JavascriptError;

  #[test]
  fn what_json_has_no_form_for_and_an_exception_answer_null_as_on_macos() {
    let context = javascriptcore::Context::new();
    let run = |script: &str| answer(Ok(context.evaluate(script).expect("a value")), false);
    for script in ["undefined", "(function () {})", "Symbol('s')", "1n", "NaN", "(() => { const a = {}; a.a = a; return a; })()"] {
      assert_eq!(run(script), Ok("null".to_string()), "{script}");
    }
    assert!(context.exception().is_none());
    assert_eq!(run("({ a: undefined, d: new Date(0), s: 'A\\ud800B', n: [1, 2.5, true, null] })"), Ok("{\"d\":\"1970-01-01T00:00:00.000Z\",\"s\":\"A\u{fffd}B\",\"n\":[1,2.5,true,null]}".to_string()));
    for kind in [JavascriptError::ScriptFailed, JavascriptError::InvalidResult] {
      assert_eq!(answer(Err(glib::Error::new(kind, "x")), false), Ok("null".to_string()));
      assert!(answer(Err(glib::Error::new(kind, "x")), true).is_err_and(|e| e.starts_with("INTERNAL: ")));
    }
    assert!(answer(Ok(context.evaluate("undefined").expect("a value")), true).is_err_and(|e| e.starts_with("INTERNAL: ")));
    assert!(answer(Err(glib::Error::new(JavascriptError::InvalidParameter, "x")), false).is_err_and(|e| e.starts_with("INTERNAL: ")));
  }

  #[test]
  fn the_page_reads_key_and_a_numpad_digit_keeps_its_place() {
    assert_eq!(keyval("z", "KeyZ"), Some(*k::z));
    assert_eq!(keyval("Z", "KeyZ"), Some(*k::Z));
    assert_eq!(keyval(" ", "Space"), Some(*k::space));
    assert_eq!(keyval("7", "Numpad7"), Some(*k::KP_7));
    assert_eq!(keyval("7", "Digit7"), Some(*k::_7));
    assert_eq!(keyval("ArrowLeft", "Numpad4"), Some(*k::Left));
    assert_eq!(keyval("Enter", "NumpadEnter"), Some(*k::KP_Enter));
    assert_eq!(keyval("Enter", "Enter"), Some(*k::Return));
    assert_eq!(keyval("F5", "F5"), Some(*k::F5));
    assert_eq!(keyval("Unidentified", "KeyA"), Some(*k::VoidSymbol));
    assert_eq!(keyval("Process", "KeyA"), None);
    assert_eq!(keyval("Dead", "Quote"), None);
  }

  #[test]
  fn every_key_virtual_key_knows_but_text_has_a_keysym() {
    for code in ["Enter", "NumpadEnter", "Escape", "Tab", "Backspace", "Delete", "ArrowLeft", "ArrowUp", "ArrowRight", "ArrowDown", "Home", "End", "PageUp", "PageDown", "Space"] {
      assert!(keysym(code).is_some(), "{code}");
    }
    assert_eq!(keysym("F1").as_deref(), Some("F1"));
    assert_eq!(keysym("F24").as_deref(), Some("F24"));
    assert_eq!(keysym("Numpad7").as_deref(), Some("KP_7"));
    for code in ["F0", "F25", "Numpad", "KeyA", "Digit1", "Fn"] {
      assert_eq!(keysym(code), None, "{code}");
    }
  }

  #[test]
  fn every_key_virtual_key_knows_has_its_evdev_keycode() {
    let known = [("KeyA", 30), ("KeyQ", 16), ("KeyZ", 44), ("Digit1", 2), ("Digit0", 11), ("Numpad0", 82), ("Numpad9", 73), ("F1", 59), ("F10", 68), ("F11", 87), ("F12", 88), ("F13", 183), ("F24", 194)];
    for (code, keycode) in known {
      assert_eq!(evdev(code), Some(keycode), "{code}");
    }
    assert_eq!([evdev("Space"), evdev("BracketLeft"), evdev("ArrowLeft"), evdev("Enter")], [Some(57), Some(26), Some(105), Some(28)]);
    let named = ["Space", "Enter", "NumpadEnter", "Escape", "Tab", "Backspace", "Delete", "ArrowLeft", "ArrowUp", "ArrowRight", "ArrowDown", "Home", "End", "PageUp", "PageDown", "Slash", "Minus", "Equal", "Period", "Comma", "Semicolon", "Quote", "BracketLeft", "BracketRight", "Backslash", "Backquote"];
    let letters = ('A'..='Z').map(|c| format!("Key{c}"));
    for code in named.map(String::from).into_iter().chain(letters).chain((0..10).map(|d| format!("Digit{d}"))) {
      assert!(evdev(&code).is_some(), "{code}");
    }
    for code in ["F0", "F25", "Keya", "KeyAA", "Digit", "Numpad10", "ShiftLeft"] {
      assert_eq!(evdev(code), None, "{code}");
    }
  }
}
