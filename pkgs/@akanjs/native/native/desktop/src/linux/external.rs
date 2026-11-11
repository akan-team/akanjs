//! The external-view plugin on WebKitGTK (external.rs). A view lies on a GtkOverlay over its window's page: wry's
//! build_as_child is X11 only. WebKitGTK has no DevTools Protocol, so `cdp` answers the screenshot desktop.ts asks for
//! through GTK, a visible view holds the keyboard focus in place of sendKey, and frames are told apart at their
//! responses, as navigation.rs does for the page.

use std::{cell::RefCell, rc::Rc};

use gtk::{gdk, glib, prelude::*};
use webkit2gtk::{
  LoadEvent, NavigationPolicyDecision, NavigationPolicyDecisionExt, NetworkError, PolicyDecisionExt, PolicyDecisionType, PolicyError, ResponsePolicyDecision,
  ResponsePolicyDecisionExt, SettingsExt, SnapshotOptions, SnapshotRegion, URIRequestExt, URIResponseExt, WebContextExt, WebProcessTerminationReason, WebResourceExt,
  WebViewExt, WebsiteDataManagerExtManual, WebsiteDataTypes,
};
use wry::{WebView, WebViewBuilder, WebViewBuilderExtUnix, WebViewExtUnix};

use crate::{
  external::{admits, event, Bounds, Reply},
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
  overlay
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

/// Off the overlay; wry destroys the webview itself when it is dropped.
pub(crate) fn discard(webview: &WebView) {
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

/// The one DevTools Protocol method desktop.ts sends here: sendKey is not declared on Linux (focus, below).
pub(crate) fn cdp(webview: &WebView, method: &str, _params: &str, reply: Reply) {
  match method {
    "Page.captureScreenshot" => capture(webview, reply),
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

//? WebKitGTK has no trusted input to send a view, so keys reach it as the user's own: through the keyboard focus.
pub(crate) fn focus(webview: &WebView) {
  webview.webview().grab_focus();
}

/// The page of the window `any` (the page itself or a view over it) takes the keyboard back.
pub(crate) fn focus_page(any: &WebView) {
  let page = any.webview().ancestor(gtk::Overlay::static_type()).and_then(|o| o.downcast::<gtk::Overlay>().ok()).and_then(|o| o.child());
  if let Some(page) = page {
    page.grab_focus();
  }
}
