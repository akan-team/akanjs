//! The external-view plugin's Windows side (external.rs), on WebView2's own API: the pointer over a view and its
//! frames, frame navigations, mute, the DevTools protocol, and failed loads and web processes.

use std::{
  cell::{Cell, RefCell},
  rc::Rc,
};

use webview2_com::{
  take_pwstr, AddScriptToExecuteOnDocumentCreatedCompletedHandler, CallDevToolsProtocolMethodCompletedHandler,
  DevToolsProtocolEventReceivedEventHandler, ExecuteScriptCompletedHandler, FrameChildFrameCreatedEventHandler,
  FrameCreatedEventHandler, FrameDOMContentLoadedEventHandler, FrameDestroyedEventHandler,
  Microsoft::Web::WebView2::Win32::*, NavigationCompletedEventHandler, NavigationStartingEventHandler,
  ProcessFailedEventHandler,
};
use windows::core::{Interface, BOOL, HSTRING, PWSTR};
use windows::Win32::UI::WindowsAndMessaging::{GetParent, SetWindowPos, HWND_BOTTOM, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE};
use wry::{WebView, WebViewExtWindows};

use crate::external::{admits, event, Reply};
use crate::{json, push_event, send, UserEvent};

const HIDE: &str = r#"(()=>{const id="__akan_cursor_none";const add=()=>{if(document.getElementById(id))return;const s=document.createElement("style");s.id=id;s.textContent="*,*::before,*::after{cursor:none!important}";(document.head||document.documentElement).appendChild(s);};if(document.documentElement)add();else document.addEventListener("DOMContentLoaded",add,{once:true});})();"#;
const SHOW: &str = r#"document.getElementById("__akan_cursor_none")?.remove();"#;

/// The script WebView2 runs in each new document while the pointer is hidden, by the id it was registered under, and
/// the page's frames alive now, by the number each was given when it was created.
#[derive(Default)]
pub(crate) struct CursorScript {
  id: Option<String>,
  wanted: bool,
  frames: Vec<(u64, ICoreWebView2Frame2)>,
  created: u64,
}

pub(crate) type Cursor = Rc<RefCell<CursorScript>>;

//? wry's drop of any webview (webview2/mod.rs, Drop for InnerWebView) removes the window's resize and focus subclass,
//? which is the page's own webview's: reparenting the page to its window attaches it again.
pub(crate) fn reclaim(page: &WebView) {
  let container = page.hwnd();
  let Ok(parent) = (unsafe { GetParent(container) }) else { return };
  if let Err(e) = page.reparent(parent.0 as isize) {
    log!("the page no longer follows its window's size and focus: {e}");
    return;
  }
  //? SetParent raised the page over the external views; it goes back under them.
  let _ = unsafe { SetWindowPos(container, Some(HWND_BOTTOM), 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE) };
}

//? The view's own browser process draws its pointer, so the window's hidden one returns over it; a style in each of
//? its documents (iframes included) hides it there, registered while hidden and removed when shown again. A document
//? loaded already gets it or loses it at once: ExecuteScript reaches the top one only, so each live frame is run too.
pub(crate) fn set_cursor_hidden(webview: &WebView, hidden: bool, cursor: &Cursor) {
  let core = webview.webview();
  let script = if hidden { HIDE } else { SHOW };
  let _ = webview.evaluate_script(script);
  let frames: Vec<ICoreWebView2Frame2> = cursor.borrow().frames.iter().map(|(_, frame)| frame.clone()).collect();
  for frame in &frames {
    run(frame, script);
  }
  let mut state = cursor.borrow_mut();
  state.wanted = hidden;
  if !hidden {
    if let Some(id) = state.id.take() {
      let _ = unsafe { core.RemoveScriptToExecuteOnDocumentCreated(&HSTRING::from(id)) };
    }
    return;
  }
  if state.id.is_some() {
    return;
  }
  let (shared, owner) = (cursor.clone(), core.clone());
  let handler = AddScriptToExecuteOnDocumentCreatedCompletedHandler::create(Box::new(move |result, id| {
    if result.is_err() {
      return Ok(());
    }
    let mut state = shared.borrow_mut();
    //? Shown again before the registration landed: undo it rather than keep a stale one.
    if state.wanted && state.id.is_none() {
      state.id = Some(id);
    } else {
      let _ = unsafe { owner.RemoveScriptToExecuteOnDocumentCreated(&HSTRING::from(id)) };
    }
    Ok(())
  }));
  let _ = unsafe { core.AddScriptToExecuteOnDocumentCreated(&HSTRING::from(HIDE), &handler) };
}

fn run(frame: &ICoreWebView2Frame2, script: &str) {
  let done = ExecuteScriptCompletedHandler::create(Box::new(|_, _| Ok(())));
  let _ = unsafe { frame.ExecuteScript(&HSTRING::from(script), &done) };
}

//? ICoreWebView2_4 names the frames of the top document; ICoreWebView2Frame7, on runtimes that have it, a frame's own.
pub(crate) fn track_frames(webview: &WebView, view: &str, cursor: &Cursor) {
  let tracked = Rc::downgrade(cursor);
  let created = FrameCreatedEventHandler::create(Box::new(move |_, args| {
    if let (Some(args), Some(cursor)) = (args, tracked.upgrade()) {
      adopt(&cursor, unsafe { args.Frame()? });
    }
    Ok(())
  }));
  let mut token = 0;
  let added = webview.webview().cast::<ICoreWebView2_4>().and_then(|core| unsafe { core.add_FrameCreated(&created, &mut token) });
  if let Err(e) = added {
    log!("external view {view}: its frames keep the pointer they loaded with: {e}");
  }
}

//? Its handlers hold the state weakly: the state's frame list holds the frame, and the frame its handlers.
fn adopt(cursor: &Cursor, frame: ICoreWebView2Frame) {
  let Ok(document) = frame.cast::<ICoreWebView2Frame2>() else { return };
  let Ok(mut state) = cursor.try_borrow_mut() else { return };
  state.created += 1;
  let number = state.created;
  state.frames.push((number, document.clone()));
  let hidden = state.wanted;
  drop(state);
  if hidden {
    run(&document, HIDE);
  }
  let mut token = 0;
  let tracked = Rc::downgrade(cursor);
  let destroyed = FrameDestroyedEventHandler::create(Box::new(move |_, _| {
    if let Some(cursor) = tracked.upgrade() {
      if let Ok(mut state) = cursor.try_borrow_mut() {
        state.frames.retain(|(n, _)| *n != number);
      }
    }
    Ok(())
  }));
  let _ = unsafe { frame.add_Destroyed(&destroyed, &mut token) };
  let tracked = Rc::downgrade(cursor);
  let loaded = FrameDOMContentLoadedEventHandler::create(Box::new(move |sender, _| {
    let hidden = tracked.upgrade().is_some_and(|cursor| cursor.try_borrow().is_ok_and(|state| state.wanted));
    if let Some(document) = sender.filter(|_| hidden).and_then(|frame| frame.cast::<ICoreWebView2Frame2>().ok()) {
      run(&document, HIDE);
    }
    Ok(())
  }));
  let _ = unsafe { document.add_DOMContentLoaded(&loaded, &mut token) };
  if let Ok(parent) = frame.cast::<ICoreWebView2Frame7>() {
    let tracked = Rc::downgrade(cursor);
    let child = FrameChildFrameCreatedEventHandler::create(Box::new(move |_, args| {
      if let (Some(args), Some(cursor)) = (args, tracked.upgrade()) {
        adopt(&cursor, unsafe { args.Frame()? });
      }
      Ok(())
    }));
    let _ = unsafe { parent.add_FrameCreated(&child, &mut token) };
  }
}

//? wry asks the navigation handler about the top level only here, so a frame's navigation is checked on its own: a
//? scheme another program registered would otherwise reach WebView2's launch prompt.
pub(crate) fn guard_frames(webview: &WebView, view: &str) {
  let refusing = view.to_string();
  let starting = NavigationStartingEventHandler::create(Box::new(move |_, args| {
    let Some(args) = args else { return Ok(()) };
    let mut uri = PWSTR::null();
    unsafe { args.Uri(&mut uri)? };
    let uri = take_pwstr(uri);
    if !admits(&[], &uri, true) {
      log!("external view {refusing}: refused a frame navigation to {}", crate::navigation::shown(&uri));
      unsafe { args.SetCancel(true)? };
    }
    Ok(())
  }));
  let mut token = 0;
  if let Err(e) = unsafe { webview.webview().add_FrameNavigationStarting(&starting, &mut token) } {
    log!("external view {view}: its frames' navigations are not checked: {e}");
  }
  crate::navigation::refuse_launches(webview, &format!("external view {view}"));
}

pub(crate) fn set_muted(webview: &WebView, muted: bool) -> Result<(), String> {
  let wv: ICoreWebView2_8 = webview.webview().cast().map_err(|e| format!("UNSUPPORTED: this WebView2 Runtime has no per-view mute ({e})"))?;
  unsafe { wv.SetIsMuted(muted) }.map_err(|e| e.to_string())
}

pub(crate) fn cdp(webview: &WebView, method: &str, params: &str, reply: Reply) {
  let name = method.to_string();
  let reply = Rc::new(Cell::new(Some(reply)));
  let engine = reply.clone();
  let handler = CallDevToolsProtocolMethodCompletedHandler::create(Box::new(move |result, value| {
    if let Some(reply) = engine.take() {
      reply.send(result.map(|_| value).map_err(|e| format!("{name}: {e}")));
    }
    Ok(())
  }));
  let started = unsafe { webview.webview().CallDevToolsProtocolMethod(&HSTRING::from(method), &HSTRING::from(params), &handler) };
  if let Err(e) = started {
    if let Some(reply) = reply.take() {
      reply.send(Err(e.to_string()));
    }
  }
}

fn error_name(status: COREWEBVIEW2_WEB_ERROR_STATUS) -> String {
  match status {
    COREWEBVIEW2_WEB_ERROR_STATUS_CANNOT_CONNECT => "cannotConnect".into(),
    COREWEBVIEW2_WEB_ERROR_STATUS_HOST_NAME_NOT_RESOLVED => "hostNameNotResolved".into(),
    COREWEBVIEW2_WEB_ERROR_STATUS_DISCONNECTED => "disconnected".into(),
    COREWEBVIEW2_WEB_ERROR_STATUS_TIMEOUT => "timeout".into(),
    COREWEBVIEW2_WEB_ERROR_STATUS_SERVER_UNREACHABLE => "serverUnreachable".into(),
    COREWEBVIEW2_WEB_ERROR_STATUS_CONNECTION_ABORTED => "connectionAborted".into(),
    COREWEBVIEW2_WEB_ERROR_STATUS_CONNECTION_RESET => "connectionReset".into(),
    COREWEBVIEW2_WEB_ERROR_STATUS_REDIRECT_FAILED => "redirectFailed".into(),
    COREWEBVIEW2_WEB_ERROR_STATUS_CERTIFICATE_EXPIRED
    | COREWEBVIEW2_WEB_ERROR_STATUS_CERTIFICATE_IS_INVALID
    | COREWEBVIEW2_WEB_ERROR_STATUS_CERTIFICATE_REVOKED
    | COREWEBVIEW2_WEB_ERROR_STATUS_CERTIFICATE_COMMON_NAME_IS_INCORRECT => "certificate".into(),
    COREWEBVIEW2_WEB_ERROR_STATUS_UNEXPECTED_ERROR => "unexpected".into(),
    //? What WebView2 reports for a refused connection, too (verified on 127.0.0.1).
    COREWEBVIEW2_WEB_ERROR_STATUS_UNKNOWN => "unknown".into(),
    other => format!("status{}", other.0),
  }
}

/// A navigation that failed (the network, DNS, a certificate) and the web process ending; with `console`, the
/// page's console calls and uncaught exceptions as the protocol's own events.
pub(crate) fn watch(webview: &WebView, view: &str, window: u32, console: bool) {
  let core = webview.webview();
  let failed_view = view.to_string();
  let navigation = NavigationCompletedEventHandler::create(Box::new(move |sender, args| {
    let (Some(sender), Some(args)) = (sender, args) else { return Ok(()) };
    let mut ok = BOOL::default();
    unsafe { args.IsSuccess(&mut ok)? };
    if ok.as_bool() {
      return Ok(());
    }
    let mut status = COREWEBVIEW2_WEB_ERROR_STATUS_UNKNOWN;
    unsafe { args.WebErrorStatus(&mut status)? };
    //? A refused navigation (navigation handler) and one a newer navigation replaced end as cancelled: not a failure.
    if status == COREWEBVIEW2_WEB_ERROR_STATUS_OPERATION_CANCELED {
      return Ok(());
    }
    let mut uri = PWSTR::null();
    unsafe { sender.Source(&mut uri)? };
    let url = take_pwstr(uri);
    //? A server's error page is a failure too, and its status says more than WebErrorStatus does (Runtime 1.0.1245+).
    let mut http = 0;
    if let Ok(args2) = args.cast::<ICoreWebView2NavigationCompletedEventArgs2>() {
      let _ = unsafe { args2.HttpStatusCode(&mut http) };
    }
    let code = if http >= 400 { format!("http{http}") } else { error_name(status) };
    push_event(&event(
      &failed_view,
      window,
      &format!(r#""event":"loadFailed","url":{},"errorCode":"{code}""#, json::quote(&url)),
    ));
    Ok(())
  }));
  let mut token = 0;
  if let Err(e) = unsafe { core.add_NavigationCompleted(&navigation, &mut token) } {
    log!("external view {view}: failed navigations are not watched: {e}");
  }
  let gone_view = view.to_string();
  let process = ProcessFailedEventHandler::create(Box::new(move |_, args| {
    let Some(args) = args else { return Ok(()) };
    let mut kind = COREWEBVIEW2_PROCESS_FAILED_KIND_RENDER_PROCESS_EXITED;
    unsafe { args.ProcessFailedKind(&mut kind)? };
    let reason = match kind {
      COREWEBVIEW2_PROCESS_FAILED_KIND_BROWSER_PROCESS_EXITED => "browserExited",
      COREWEBVIEW2_PROCESS_FAILED_KIND_RENDER_PROCESS_EXITED => "crashed",
      COREWEBVIEW2_PROCESS_FAILED_KIND_RENDER_PROCESS_UNRESPONSIVE => "unresponsive",
      _ => return Ok(()),
    };
    send(UserEvent::ExternalGone { view: gone_view.clone(), reason });
    Ok(())
  }));
  let mut token = 0;
  if let Err(e) = unsafe { core.add_ProcessFailed(&process, &mut token) } {
    log!("external view {view}: web process failures are not watched: {e}");
  }
  if !console {
    return;
  }
  for method in ["Runtime.consoleAPICalled", "Runtime.exceptionThrown"] {
    let (cdp_view, name) = (view.to_string(), method.to_string());
    let handler = DevToolsProtocolEventReceivedEventHandler::create(Box::new(move |_, args| {
      let Some(args) = args else { return Ok(()) };
      let mut params = PWSTR::null();
      unsafe { args.ParameterObjectAsJson(&mut params)? };
      let params = take_pwstr(params);
      push_event(&event(&cdp_view, window, &format!(r#""event":"cdp","method":"{name}","params":{params}"#)));
      Ok(())
    }));
    let receiver = unsafe { core.GetDevToolsProtocolEventReceiver(&HSTRING::from(method)) };
    let mut token = 0;
    if let Err(e) = receiver.and_then(|r| unsafe { r.add_DevToolsProtocolEventReceived(&handler, &mut token) }) {
      log!("external view {view}: {method} is not watched: {e}");
    }
  }
  let enabled_view = view.to_string();
  cdp(
    webview,
    "Runtime.enable",
    "{}",
    Reply::new(move |result| {
      if let Err(e) = result {
        log!("external view {enabled_view}: Runtime.enable: {e}");
      }
    }),
  );
}
