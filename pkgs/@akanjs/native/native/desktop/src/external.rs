//! The external-view plugin (plugins/external-view): a third-party page shown first-party inside an app
//! window, as signage needs it. Nothing of the app reaches it: no init script, no IPC, no app scheme. It runs
//! in a browser profile of its own (a data folder on Windows, a data store on macOS 14+), so its storage is
//! neither the app's nor cleared with it, and it navigates only to the origins it was opened for; popups,
//! downloads and device permissions are refused. Its web process ending reloads it (UserEvent::ExternalGone).

use std::{
  collections::HashMap,
  path::{Path, PathBuf},
  sync::Arc,
  time::{Duration, Instant},
};

use tao::dpi::{LogicalPosition, LogicalSize};
use wry::{NewWindowResponse, PageLoadEvent, PermissionResponse, Rect, WebView, WebViewBuilder};

use crate::{json, push_event, send, UserEvent};

#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) enum Bounds {
  /// The window's whole content area, kept so as the window resizes.
  Fill,
  At { x: f64, y: f64, width: f64, height: f64 },
}

pub(crate) struct View {
  /// Before the context it was built in: dropped first.
  webview: WebView,
  _context: wry::WebContext,
  pub(crate) window: u32,
  bounds: Bounds,
  allow: Arc<Vec<String>>,
  url: String,
  visible: bool,
  /// Times its web process ended and the view loaded its page again.
  restarts: u32,
  /// Ends in a row, each within a minute of the one before.
  gone_streak: u32,
  gone_at: Option<Instant>,
  /// Its browser process ended, which takes the webview with it: it is built again, not reloaded.
  dead: bool,
  init_script: Option<String>,
  muted: bool,
  autoplay: bool,
  console: bool,
  /// Its window hides the pointer (window.setCursorVisible): the view does too, in every document it loads.
  cursor_hidden: bool,
  cursor: platform::Cursor,
}

#[derive(Default)]
pub(crate) struct Views {
  map: HashMap<String, View>,
}

pub(crate) struct OpenOptions {
  pub view: String,
  pub window: u32,
  pub url: String,
  pub allow: Vec<String>,
  pub bounds: Bounds,
  pub init_script: Option<String>,
  pub muted: bool,
  pub autoplay: bool,
  pub console: bool,
}

/// `scheme://host[:port]` of an http(s) URL, lower-cased and without the scheme's default port.
pub(crate) fn origin_of(url: &str) -> Option<String> {
  let (scheme, rest) = url.split_once("://")?;
  let scheme = scheme.to_ascii_lowercase();
  if scheme != "https" && scheme != "http" {
    return None;
  }
  let end = rest.find(['/', '?', '#']).unwrap_or(rest.len());
  let mut host = rest[..end].to_ascii_lowercase();
  if host.is_empty() || host.contains('@') {
    return None;
  }
  let default = if scheme == "https" { ":443" } else { ":80" };
  if host.ends_with(default) {
    host.truncate(host.len() - default.len());
  }
  Some(format!("{scheme}://{host}"))
}

pub(crate) fn allowed(allow: &[String], url: &str) -> bool {
  url == "about:blank" || origin_of(url).is_some_and(|origin| allow.contains(&origin))
}

/// A view id as a folder name: letters, digits, `-` and `_` only (the plugin checks the id before it gets here).
fn folder(view: &str) -> String {
  view.chars().map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '_' }).collect()
}

/// Stable across builds (std's hasher is not): the same view id finds the same macOS data store every launch.
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
fn store_id(view: &str) -> [u8; 16] {
  let fnv = |basis: u64| view.bytes().fold(basis, |hash, byte| (hash ^ byte as u64).wrapping_mul(0x0000_0100_0000_01b3));
  let mut id = [0u8; 16];
  id[..8].copy_from_slice(&fnv(0xcbf2_9ce4_8422_2325).to_le_bytes());
  id[8..].copy_from_slice(&fnv(0x84222325_cbf29ce4).to_le_bytes());
  id
}

fn rect(bounds: Bounds, inner: LogicalSize<f64>) -> Rect {
  let (x, y, width, height) = match bounds {
    Bounds::Fill => (0.0, 0.0, inner.width, inner.height),
    Bounds::At { x, y, width, height } => (x, y, width, height),
  };
  Rect { position: LogicalPosition::new(x, y).into(), size: LogicalSize::new(width, height).into() }
}

fn event(view: &str, window: u32, rest: &str) -> String {
  format!(r#"{{"type":"externalView","view":{},"window":{window},{rest}}}"#, json::quote(view))
}

/// Where its page is now, links followed included; the last URL it was sent to while the engine cannot say.
fn current_url(view: &View) -> String {
  //? A view answers about:blank until its first navigation commits.
  view.webview.url().ok().filter(|u| !u.is_empty() && u != "about:blank").unwrap_or_else(|| view.url.clone())
}

fn state(id: &str, view: &View) -> String {
  format!(
    r#"{{"view":{},"window":{},"url":{},"visible":{},"restarts":{}}}"#,
    json::quote(id),
    view.window,
    json::quote(&current_url(view)),
    view.visible,
    view.restarts
  )
}

impl Views {
  pub(crate) fn get(&self, view: &str) -> Result<&View, String> {
    self.map.get(view).ok_or_else(|| format!("NOT_FOUND: no external view {view}"))
  }

  fn get_mut(&mut self, view: &str) -> Result<&mut View, String> {
    self.map.get_mut(view).ok_or_else(|| format!("NOT_FOUND: no external view {view}"))
  }

  pub(crate) fn list(&self) -> String {
    let mut ids: Vec<&String> = self.map.keys().collect();
    ids.sort();
    format!("[{}]", ids.iter().map(|id| state(id, &self.map[*id])).collect::<Vec<_>>().join(","))
  }

  /// Opens the view, or brings an open one to these options: a page that mounts again finds its view as it left it.
  pub(crate) fn open(
    &mut self,
    window: &tao::window::Window,
    inner: LogicalSize<f64>,
    data_root: &Path,
    devtools: bool,
    opts: OpenOptions,
  ) -> Result<String, String> {
    if let Some(view) = self.map.get_mut(&opts.view) {
      if view.window != opts.window {
        return Err(format!("view {} is open in window {}", opts.view, view.window));
      }
      view.allow = Arc::new(opts.allow);
      view.bounds = opts.bounds;
      if view.muted != opts.muted {
        platform::set_muted(&view.webview, opts.muted)?;
        view.muted = opts.muted;
      }
      view.webview.set_bounds(rect(view.bounds, inner)).map_err(|e| e.to_string())?;
      if view.url != opts.url {
        view.webview.load_url(&opts.url).map_err(|e| e.to_string())?;
        view.url = opts.url;
      }
      return Ok(state(&opts.view, view));
    }
    let view = build(window, inner, data_root, devtools, &opts)?;
    let answer = state(&opts.view, &view);
    self.map.insert(opts.view, view);
    Ok(answer)
  }

  pub(crate) fn close(&mut self, view: &str) -> Result<String, String> {
    let closed = self.map.remove(view).ok_or_else(|| format!("NOT_FOUND: no external view {view}"))?;
    let _ = closed.webview.set_visible(false);
    let _ = closed.webview.load_url("about:blank");
    push_event(&event(view, closed.window, r#""event":"closed""#));
    Ok("null".into())
  }

  /// The views of a window that is going away.
  pub(crate) fn close_window(&mut self, window: u32) {
    let ids: Vec<String> = self.map.iter().filter(|(_, v)| v.window == window).map(|(id, _)| id.clone()).collect();
    for id in ids {
      let _ = self.close(&id);
    }
  }

  /// A window resized: its filling views follow.
  pub(crate) fn fit(&self, window: u32, inner: LogicalSize<f64>) {
    for view in self.map.values().filter(|v| v.window == window && v.bounds == Bounds::Fill) {
      let _ = view.webview.set_bounds(rect(Bounds::Fill, inner));
    }
  }

  pub(crate) fn navigate(&mut self, view: &str, url: &str) -> Result<String, String> {
    let v = self.get_mut(view)?;
    if !allowed(&v.allow, url) {
      return Err(format!("NOT_ALLOWED: {url} is not on an origin view {view} was opened for"));
    }
    v.webview.load_url(url).map_err(|e| e.to_string())?;
    v.url = url.to_string();
    Ok("null".into())
  }

  pub(crate) fn reload(&self, view: &str) -> Result<String, String> {
    self.get(view)?.webview.reload().map_err(|e| e.to_string())?;
    Ok("null".into())
  }

  pub(crate) fn set_visible(&mut self, view: &str, visible: bool) -> Result<String, String> {
    let v = self.get_mut(view)?;
    v.webview.set_visible(visible).map_err(|e| e.to_string())?;
    v.visible = visible;
    Ok("null".into())
  }

  pub(crate) fn set_bounds(&mut self, view: &str, bounds: Bounds, inner: LogicalSize<f64>) -> Result<String, String> {
    let v = self.get_mut(view)?;
    v.webview.set_bounds(rect(bounds, inner)).map_err(|e| e.to_string())?;
    v.bounds = bounds;
    Ok("null".into())
  }

  pub(crate) fn clear_data(&self, view: &str) -> Result<String, String> {
    self.get(view)?.webview.clear_all_browsing_data().map_err(|e| e.to_string())?;
    Ok("null".into())
  }

  pub(crate) fn set_muted(&mut self, view: &str, muted: bool) -> Result<String, String> {
    let v = self.get_mut(view)?;
    platform::set_muted(&v.webview, muted)?;
    v.muted = muted;
    Ok("null".into())
  }

  /// The script's completion value as JSON (a promise is not awaited), answered from the engine's callback.
  pub(crate) fn evaluate(&self, view: &str, script: &str, done: impl FnOnce(Result<String, String>) + Send + 'static) -> Result<(), String> {
    //? wry takes an `Fn`; the engine calls it once.
    let done = std::sync::Mutex::new(Some(done));
    let callback = move |value: String| {
      if let Some(done) = done.lock().unwrap_or_else(|e| e.into_inner()).take() {
        done(Ok(value));
      }
    };
    self.get(view)?.webview.evaluate_script_with_callback(script, callback).map_err(|e| e.to_string())
  }

  /// A Chrome DevTools Protocol method on the view's page: trusted input, a screenshot (Windows only).
  pub(crate) fn cdp(&self, view: &str, method: &str, params: &str, done: impl FnOnce(Result<String, String>) + 'static) -> Result<(), String> {
    platform::cdp(&self.get(view)?.webview, method, params, done)
  }

  /// Its web process ended: report it with the count so far, and load the page again after recovery_wait.
  pub(crate) fn gone(&mut self, view: &str, reason: &str) {
    let Some(v) = self.map.get_mut(view) else { return };
    let now = Instant::now();
    let again = v.gone_at.is_some_and(|t| now.duration_since(t) < Duration::from_secs(60));
    v.gone_streak = if again { v.gone_streak + 1 } else { 0 };
    v.gone_at = Some(now);
    v.restarts += 1;
    v.dead |= reason == "browserExited";
    push_event(&event(view, v.window, &format!(r#""event":"gone","reason":"{reason}","restarts":{}"#, v.restarts)));
    let id = view.to_string();
    match crate::recovery_wait(v.gone_streak) {
      None => send(UserEvent::ExternalReload(id)),
      Some(wait) => {
        log!("external view {view}: its page stopped again ({reason}); loading it again in {} s", wait.as_secs());
        std::thread::spawn(move || {
          std::thread::sleep(wait);
          send(UserEvent::ExternalReload(id));
        });
      }
    }
  }

  /// After `gone`: a reload, or a new webview where the old one's browser process ended.
  pub(crate) fn recover(&mut self, view: &str, window: &tao::window::Window, inner: LogicalSize<f64>, data_root: &Path, devtools: bool) -> Result<(), String> {
    let Some(v) = self.map.get(view) else { return Ok(()) };
    if !v.dead {
      return v.webview.reload().map_err(|e| e.to_string());
    }
    let old = self.map.remove(view).expect("looked up above");
    let opts = OpenOptions {
      view: view.to_string(),
      window: old.window,
      url: current_url(&old),
      allow: (*old.allow).clone(),
      bounds: old.bounds,
      init_script: old.init_script.clone(),
      muted: old.muted,
      autoplay: old.autoplay,
      console: old.console,
    };
    let kept = (old.restarts, old.gone_streak, old.gone_at, old.visible);
    let cursor_hidden = old.cursor_hidden;
    drop(old);
    let mut fresh = build(window, inner, data_root, devtools, &opts)?;
    (fresh.restarts, fresh.gone_streak, fresh.gone_at, fresh.visible) = kept;
    if !fresh.visible {
      let _ = fresh.webview.set_visible(false);
    }
    if cursor_hidden {
      fresh.cursor_hidden = true;
      platform::set_cursor_hidden(&fresh.webview, true, &fresh.cursor);
    }
    self.map.insert(view.to_string(), fresh);
    Ok(())
  }

  /// The window hid or showed its pointer: its views follow, and keep doing so across their navigations (Windows).
  pub(crate) fn set_cursor_hidden(&mut self, window: u32, hidden: bool) {
    for view in self.map.values_mut().filter(|v| v.window == window && v.cursor_hidden != hidden) {
      view.cursor_hidden = hidden;
      platform::set_cursor_hidden(&view.webview, hidden, &view.cursor);
    }
  }

  /// The id of the window a view is in.
  pub(crate) fn window_of(&self, view: &str) -> Option<u32> {
    self.map.get(view).map(|v| v.window)
  }
}

fn build(window: &tao::window::Window, inner: LogicalSize<f64>, data_root: &Path, devtools: bool, opts: &OpenOptions) -> Result<View, String> {
  #[cfg(target_os = "linux")]
  {
    let _ = (window, inner, data_root, devtools, opts);
    return Err("UNSUPPORTED: external views are not on Linux yet".into());
  }
  #[cfg(not(target_os = "linux"))]
  {
    let data: PathBuf = data_root.join(folder(&opts.view));
    let mut context = wry::WebContext::new(Some(data));
    let allow = Arc::new(opts.allow.clone());
    let nav_allow = allow.clone();
    let (view_id, window_id) = (opts.view.clone(), opts.window);
    let nav_view = view_id.clone();
    let mut builder = WebViewBuilder::new_with_web_context(&mut context)
      .with_url(&opts.url)
      .with_bounds(rect(opts.bounds, inner))
      .with_autoplay(opts.autoplay)
      .with_devtools(devtools)
      .with_navigation_handler(move |url| {
        let ok = allowed(&nav_allow, &url);
        if !ok {
          log!("external view {nav_view}: refused a navigation to {url}, which is on no origin it was opened for");
        }
        ok
      })
      .with_new_window_req_handler(|_, _| NewWindowResponse::Deny)
      .with_download_started_handler(|_, _| false)
      .with_permission_handler(|_| PermissionResponse::Deny)
      .with_on_page_load_handler(move |ev, url| {
        let state = match ev {
          PageLoadEvent::Started => "started",
          PageLoadEvent::Finished => "finished",
        };
        push_event(&event(&view_id, window_id, &format!(r#""event":"load","state":"{state}","url":{}"#, json::quote(&url))));
      });
    if let Some(script) = &opts.init_script {
      builder = builder.with_initialization_script_for_main_only(script.clone(), true);
    }
    #[cfg(target_os = "macos")]
    {
      use wry::WebViewBuilderExtDarwin;
      builder = builder.with_data_store_identifier(store_id(&opts.view));
    }
    let webview = builder.build_as_child(window).map_err(|e| format!("external view: {e}"))?;
    platform::watch(&webview, &opts.view, opts.window, opts.console);
    if opts.muted {
      platform::set_muted(&webview, true)?;
    }
    Ok(View {
      webview,
      _context: context,
      window: opts.window,
      bounds: opts.bounds,
      allow,
      url: opts.url.clone(),
      visible: true,
      restarts: 0,
      gone_streak: 0,
      gone_at: None,
      dead: false,
      init_script: opts.init_script.clone(),
      muted: opts.muted,
      autoplay: opts.autoplay,
      console: opts.console,
      cursor_hidden: false,
      cursor: platform::Cursor::default(),
    })
  }
}

#[cfg(target_os = "windows")]
mod platform {
  use std::{cell::RefCell, rc::Rc};

  use webview2_com::{
    take_pwstr, AddScriptToExecuteOnDocumentCreatedCompletedHandler, CallDevToolsProtocolMethodCompletedHandler,
    DevToolsProtocolEventReceivedEventHandler, Microsoft::Web::WebView2::Win32::*, NavigationCompletedEventHandler,
    ProcessFailedEventHandler,
  };
  use windows::core::{Interface, BOOL, HSTRING, PWSTR};
  use wry::{WebView, WebViewExtWindows};

  use super::event;
  use crate::{json, push_event, send, UserEvent};

  const HIDE: &str = r#"(()=>{const id="__akan_cursor_none";const add=()=>{if(document.getElementById(id))return;const s=document.createElement("style");s.id=id;s.textContent="*,*::before,*::after{cursor:none!important}";(document.head||document.documentElement).appendChild(s);};if(document.documentElement)add();else document.addEventListener("DOMContentLoaded",add,{once:true});})();"#;
  const SHOW: &str = r#"document.getElementById("__akan_cursor_none")?.remove();"#;

  /// The script WebView2 runs in each new document while the pointer is hidden, by the id it was registered under.
  #[derive(Default)]
  pub(crate) struct CursorScript {
    id: Option<String>,
    wanted: bool,
  }

  pub(crate) type Cursor = Rc<RefCell<CursorScript>>;

  //? The view's own browser process draws its pointer, so the window's hidden one returns over it; a style in each of
  //? its documents (iframes included) hides it there, registered while hidden and removed when shown again.
  pub(super) fn set_cursor_hidden(webview: &WebView, hidden: bool, cursor: &Cursor) {
    let core = webview.webview();
    let _ = webview.evaluate_script(if hidden { HIDE } else { SHOW });
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

  pub(super) fn set_muted(webview: &WebView, muted: bool) -> Result<(), String> {
    let wv: ICoreWebView2_8 = webview.webview().cast().map_err(|e| format!("UNSUPPORTED: this WebView2 Runtime has no per-view mute ({e})"))?;
    unsafe { wv.SetIsMuted(muted) }.map_err(|e| e.to_string())
  }

  pub(super) fn cdp(webview: &WebView, method: &str, params: &str, done: impl FnOnce(Result<String, String>) + 'static) -> Result<(), String> {
    let name = method.to_string();
    let handler = CallDevToolsProtocolMethodCompletedHandler::create(Box::new(move |result, value| {
      done(result.map(|_| value).map_err(|e| format!("{name}: {e}")));
      Ok(())
    }));
    unsafe { webview.webview().CallDevToolsProtocolMethod(&HSTRING::from(method), &HSTRING::from(params), &handler) }
      .map_err(|e| e.to_string())
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
  pub(super) fn watch(webview: &WebView, view: &str, window: u32, console: bool) {
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
    if let Err(e) = cdp(webview, "Runtime.enable", "{}", |_| {}) {
      log!("external view {view}: Runtime.enable: {e}");
    }
  }
}

#[cfg(not(target_os = "windows"))]
mod platform {
  use wry::WebView;

  pub(crate) type Cursor = ();

  pub(super) fn set_cursor_hidden(_webview: &WebView, _hidden: bool, _cursor: &Cursor) {}

  pub(super) fn set_muted(_webview: &WebView, _muted: bool) -> Result<(), String> {
    Err("UNSUPPORTED: a view is muted on Windows only".into())
  }

  pub(super) fn cdp(_webview: &WebView, method: &str, _params: &str, _done: impl FnOnce(Result<String, String>) + 'static) -> Result<(), String> {
    Err(format!("UNSUPPORTED: {method} reaches a view on Windows only"))
  }

  #[cfg_attr(target_os = "linux", allow(dead_code))]
  pub(super) fn watch(_webview: &WebView, _view: &str, _window: u32, _console: bool) {}
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn an_origin_is_scheme_and_host_without_the_default_port() {
    assert_eq!(origin_of("https://Design.Example.com/screen/1?x=2").as_deref(), Some("https://design.example.com"));
    assert_eq!(origin_of("https://design.example.com:443/").as_deref(), Some("https://design.example.com"));
    assert_eq!(origin_of("http://10.0.0.5:8080/a").as_deref(), Some("http://10.0.0.5:8080"));
    assert_eq!(origin_of("https://user@evil.example/"), None);
    assert_eq!(origin_of("file:///C:/a"), None);
    assert_eq!(origin_of("javascript:alert(1)"), None);
  }

  #[test]
  fn navigation_stays_on_the_origins_a_view_was_opened_for() {
    let allow = vec!["https://design.example.com".to_string()];
    assert!(allowed(&allow, "https://design.example.com/screen/1/2"));
    assert!(allowed(&allow, "about:blank"));
    assert!(!allowed(&allow, "https://design.example.com.evil.example/"));
    assert!(!allowed(&allow, "https://other.example/"));
    assert!(!allowed(&allow, "app://localhost/"));
  }

  #[test]
  fn a_view_id_makes_a_safe_folder_and_a_stable_store_id() {
    assert_eq!(folder("cus-board_1"), "cus-board_1");
    assert_eq!(folder("../x"), "___x");
    assert_eq!(store_id("cus"), store_id("cus"));
    assert_ne!(store_id("cus"), store_id("cus2"));
  }
}
