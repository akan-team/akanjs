//! The external-view plugin (plugins/external-view): a third-party page shown first-party inside an app
//! window, as signage needs it. Nothing of the app reaches it: no init script, no IPC, no app scheme. It runs
//! in a browser profile of its own (a data folder on Windows, a data store on macOS 14+), so its storage is
//! neither the app's nor cleared with it, and its top level navigates only to the origins it was opened for
//! (frames load web content from anywhere); popups, downloads, device permissions and a link another program
//! would open are refused. Its web process ending reloads it (UserEvent::ExternalGone).

use std::{
  cell::{Cell, RefCell},
  collections::HashMap,
  path::Path,
  rc::Rc,
  sync::{Arc, Mutex},
  time::{Duration, Instant},
};

use tao::dpi::{LogicalPosition, LogicalSize};
use wry::{Rect, WebView, RGBA};

use crate::{json, push_event, send, UserEvent};
#[cfg(target_os = "windows")]
use crate::win::external as platform;

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
  /// Shared with its navigation handler, so the list a later open brings holds for the links the page follows.
  allow: Rc<RefCell<Vec<String>>>,
  url: String,
  visible: bool,
  /// Times its web process ended and the view loaded its page again.
  restarts: u32,
  /// Ends in a row, each within a minute of the load before.
  gone_streak: u32,
  /// When its page was last loaded again after an end.
  reloaded_at: Option<Instant>,
  /// A reload is waiting out recovery_wait: ends reported meanwhile (an unresponsive page repeats its report) are
  /// the same end, and must neither raise the streak nor start a second wait.
  reload_pending: bool,
  /// Its browser process ended, which takes the webview with it: it is built again, not reloaded.
  dead: bool,
  /// Off once discarded: wry keeps a dropped WKWebView, page and all, and its events would still name this view.
  live: Rc<Cell<bool>>,
  init_script: Option<String>,
  muted: bool,
  autoplay: bool,
  console: bool,
  /// Its window hides the pointer (window.setCursorVisible): the view does too, in every document it loads.
  cursor_hidden: bool,
  cursor: platform::Cursor,
}

/// What a view built again in an old one's place keeps: restarts, streak, last reload, visible, pointer hidden.
type Kept = (u32, u32, Option<Instant>, bool, bool);

impl View {
  fn kept(&self) -> Kept {
    (self.restarts, self.gone_streak, self.reloaded_at, self.visible, self.cursor_hidden)
  }

  fn restore(&mut self, (restarts, gone_streak, reloaded_at, visible, cursor_hidden): Kept) {
    (self.restarts, self.gone_streak, self.reloaded_at, self.visible) = (restarts, gone_streak, reloaded_at, visible);
    if !visible {
      let _ = self.webview.set_visible(false);
    }
    if cursor_hidden {
      self.cursor_hidden = true;
      platform::set_cursor_hidden(&self.webview, true, &self.cursor);
    }
  }
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

impl Bounds {
  /// An external view's `bounds`: "fill" (left out too), or `{ x, y, width, height }` in logical pixels.
  pub(crate) fn from_cmd(cmd: &json::V) -> Result<Self, String> {
    match cmd.get("bounds") {
      None => Ok(Bounds::Fill),
      Some(v) if v.as_str() == Some("fill") => Ok(Bounds::Fill),
      Some(v) => {
        let num = |k: &str| {
          let name = format!("bounds.{k}");
          v.get(k).and_then(|n| n.as_f64()).ok_or_else(|| format!("{name} must be a number")).and_then(|n| crate::placement::logical(&name, n))
        };
        let (x, y, width, height) = (num("x")?, num("y")?, num("width")?, num("height")?);
        if !(width > 0.0 && height > 0.0) {
          return Err("bounds.width and bounds.height must be positive".into());
        }
        Ok(Bounds::At { x, y, width, height })
      }
    }
  }
}

impl OpenOptions {
  /// externalView.open's arguments, for a view in `window`.
  pub(crate) fn from_cmd(cmd: &json::V, window: u32) -> Result<Self, String> {
    let url = cmd.get("url").and_then(|v| v.as_str()).ok_or("url must be a string")?.to_string();
    let allow: Vec<String> = cmd
      .get("allowOrigins")
      .and_then(|v| v.as_array())
      .ok_or("allowOrigins must be a list of origins")?
      .iter()
      .map(|o| o.as_str().and_then(origin_of).ok_or("allowOrigins holds an origin that is not http(s)"))
      .collect::<Result<_, _>>()?;
    if !allowed(&allow, &url) {
      return Err(format!("NOT_ALLOWED: {url} is on none of allowOrigins"));
    }
    Ok(Self {
      view: cmd.get("view").and_then(|v| v.as_str()).map(str::to_string).ok_or("view must be a string")?,
      window,
      url,
      allow,
      bounds: Bounds::from_cmd(cmd)?,
      init_script: cmd.get("initScript").and_then(|v| v.as_str()).map(str::to_string),
      muted: cmd.get("muted").and_then(|v| v.as_bool()).unwrap_or(false),
      autoplay: cmd.get("autoplay").and_then(|v| v.as_bool()).unwrap_or(true),
      console: cmd.get("console").and_then(|v| v.as_bool()).unwrap_or(false),
    })
  }
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

#[cfg_attr(target_os = "linux", allow(dead_code))]
pub(crate) fn admits(allow: &[String], url: &str, sub_frame: bool) -> bool {
  if sub_frame {
    crate::navigation::scheme(url).is_some_and(|s| crate::contract::FRAME_SCHEMES.contains(&s.as_str()))
  } else {
    allowed(allow, url)
  }
}

/// Frames load web content from anywhere. WebView2 asks wry's handler about the top level only: platform::guard_frames
/// checks its frames.
#[cfg_attr(target_os = "linux", allow(dead_code))]
fn navigation_handler(view: String, allow: Rc<RefCell<Vec<String>>>) -> impl Fn(String) -> bool {
  move |url| {
    //? WKWebView asks about every frame; navigation.rs marks a frame's request for every wry webview, this one included.
    #[cfg(target_os = "macos")]
    let sub_frame = crate::navigation::mac::in_sub_frame();
    #[cfg(not(target_os = "macos"))]
    let sub_frame = false;
    let ok = admits(&allow.borrow(), &url, sub_frame);
    if !ok && sub_frame {
      log!("external view {view}: refused a frame navigation to {}", crate::navigation::shown(&url));
    } else if !ok {
      log!("external view {view}: refused a navigation to {url}, which is on no origin it was opened for");
    }
    ok
  }
}

//? WebView2 runs a document-created script in every frame (wry's main-frame-only flag is WebKit's). Run first, this
//? marks a frame's window so that the init script, declaring the same name, fails before it declares anything: a throw
//? or a wrapper would leave its let bindings uninitialized there, or change their scope. That error goes unreported.
#[cfg_attr(target_os = "linux", allow(dead_code))]
const TOP_ONLY: &str = r#"if(window.top!==window.self){Object.defineProperty(window,"__akanTopOnly",{value:true});addEventListener("error",e=>{e.preventDefault();e.stopImmediatePropagation()},{capture:true,once:true})}"#;

/// The init script, declaring the name TOP_ONLY marks a frame with: on a line of its own after the script's last.
#[cfg_attr(target_os = "linux", allow(dead_code))]
fn top_only(script: &str) -> String {
  format!("{script}\n;let __akanTopOnly;")
}

#[cfg_attr(target_os = "linux", allow(dead_code))]
fn fnv1a(view: &str, basis: u64) -> u64 {
  view.bytes().fold(basis, |hash, byte| (hash ^ byte as u64).wrapping_mul(0x0000_0100_0000_01b3))
}

/// A view's data folder: its id hashed (FNV-1a, stable where std's hasher is not), so ids differing only in case and
/// device names (CON, NUL) get folders of their own, and a long id no long path. XOR-folded to 32 bits, as FNV's
/// authors fold a hash: WebView2's profile path must fit MAX_PATH below the app's own.
#[cfg_attr(target_os = "linux", allow(dead_code))]
fn folder(view: &str) -> String {
  let hash = fnv1a(view, 0xcbf2_9ce4_8422_2325);
  format!("{:08x}", (hash >> 32) as u32 ^ hash as u32)
}

/// Stable across builds (std's hasher is not): the same view id finds the same macOS data store every launch.
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
fn store_id(view: &str) -> [u8; 16] {
  let mut id = [0u8; 16];
  id[..8].copy_from_slice(&fnv1a(view, 0xcbf2_9ce4_8422_2325).to_le_bytes());
  id[8..].copy_from_slice(&fnv1a(view, 0x84222325_cbf29ce4).to_le_bytes());
  id
}

fn rect(bounds: Bounds, inner: LogicalSize<f64>) -> Rect {
  let (x, y, width, height) = match bounds {
    Bounds::Fill => (0.0, 0.0, inner.width, inner.height),
    Bounds::At { x, y, width, height } => (x, y, width, height),
  };
  Rect { position: LogicalPosition::new(x, y).into(), size: LogicalSize::new(width, height).into() }
}

pub(crate) fn event(view: &str, window: u32, rest: &str) -> String {
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

/// Hidden and unloaded before it is dropped: wry keeps a dropped WKWebView alive (wkwebview/mod.rs, its Drop).
fn discard(view: View) {
  view.live.set(false);
  let _ = view.webview.set_visible(false);
  let _ = view.webview.load_url("about:blank");
}

/// Ends in a row: an end within a minute of the last reload follows the one before (lib.rs WebviewGone).
fn streak_after(streak: u32, reloaded_at: Option<Instant>, now: Instant) -> u32 {
  if reloaded_at.is_some_and(|t| now.duration_since(t) < Duration::from_secs(60)) {
    streak.saturating_add(1)
  } else {
    0
  }
}

/// One engine call's answer: sent once, and an error should the engine drop the call unanswered.
pub(crate) struct Reply(Option<Box<dyn FnOnce(Result<String, String>) + Send>>);

impl Reply {
  pub(crate) fn new(done: impl FnOnce(Result<String, String>) + Send + 'static) -> Self {
    Self(Some(Box::new(done)))
  }

  pub(crate) fn send(mut self, result: Result<String, String>) {
    if let Some(done) = self.0.take() {
      done(result);
    }
  }
}

impl Drop for Reply {
  fn drop(&mut self) {
    if let Some(done) = self.0.take() {
      done(Err("CANCELLED: the view's engine dropped the call unanswered: its page went away".into()));
    }
  }
}

#[cfg_attr(target_os = "macos", allow(dead_code))]
fn wry_evaluate(webview: &WebView, script: &str, reply: Reply) {
  //? wry takes an `Fn` that is Send; the engine calls it once.
  let reply = Arc::new(Mutex::new(Some(reply)));
  let engine = reply.clone();
  let started = webview.evaluate_script_with_callback(script, move |value| {
    let reply = engine.lock().unwrap_or_else(|e| e.into_inner()).take();
    if let Some(reply) = reply {
      reply.send(Ok(value));
    }
  });
  if let Err(e) = started {
    let reply = reply.lock().unwrap_or_else(|e| e.into_inner()).take();
    if let Some(reply) = reply {
      reply.send(Err(e.to_string()));
    }
  }
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
    page: &WebView,
    data_root: &Path,
    devtools: bool,
    background: RGBA,
    opts: OpenOptions,
  ) -> Result<String, String> {
    #[cfg(not(target_os = "windows"))]
    if opts.muted {
      return Err(platform::NO_MUTE.into());
    }
    let inner = crate::inner_size(window, Some(page));
    let Some(open) = self.map.get(&opts.view) else {
      let view = build(window, inner, data_root, devtools, background, &opts).inspect_err(|_| platform::reclaim(page))?;
      let answer = state(&opts.view, &view);
      self.map.insert(opts.view, view);
      return Ok(answer);
    };
    if open.window != opts.window {
      return Err(format!("view {} is open in window {}", opts.view, open.window));
    }
    //? WebView2 takes autoplay as a browser argument, and a profile folder's browser runs with one set of them.
    #[cfg(target_os = "windows")]
    if open.autoplay != opts.autoplay {
      return Err(format!("UNSUPPORTED: view {} keeps the autoplay it was opened with", opts.view));
    }
    //? Only WebView2 reports a page's console (platform::watch): elsewhere a new level needs no new webview.
    let console = cfg!(target_os = "windows") && open.console != opts.console;
    if open.init_script != opts.init_script || open.autoplay != opts.autoplay || console {
      let mut fresh = build(window, inner, data_root, devtools, background, &opts).inspect_err(|_| platform::reclaim(page))?;
      let old = self.map.remove(&opts.view).expect("looked up above");
      let kept = old.kept();
      discard(old);
      platform::reclaim(page);
      fresh.restore(kept);
      let answer = state(&opts.view, &fresh);
      self.map.insert(opts.view, fresh);
      return Ok(answer);
    }
    let view = self.map.get_mut(&opts.view).expect("looked up above");
    *view.allow.borrow_mut() = opts.allow;
    view.bounds = opts.bounds;
    view.console = opts.console;
    if view.muted != opts.muted {
      platform::set_muted(&view.webview, opts.muted)?;
      view.muted = opts.muted;
    }
    view.webview.set_bounds(rect(view.bounds, inner)).map_err(|e| e.to_string())?;
    if view.url != opts.url {
      view.webview.load_url(&opts.url).map_err(|e| e.to_string())?;
      view.url = opts.url;
    }
    Ok(state(&opts.view, view))
  }

  pub(crate) fn close(&mut self, view: &str, page: &WebView) -> Result<String, String> {
    let closed = self.map.remove(view).ok_or_else(|| format!("NOT_FOUND: no external view {view}"))?;
    let window = closed.window;
    discard(closed);
    platform::reclaim(page);
    push_event(&event(view, window, r#""event":"closed""#));
    Ok("null".into())
  }

  pub(crate) fn close_window(&mut self, window: u32, page: &WebView) {
    let ids: Vec<String> = self.map.iter().filter(|(_, v)| v.window == window).map(|(id, _)| id.clone()).collect();
    for id in ids {
      let _ = self.close(&id, page);
    }
  }

  /// A window resized or changed its scale: its views follow.
  pub(crate) fn fit(&self, window: u32, inner: LogicalSize<f64>) {
    //? WebView2 keeps a child's physical rect when the window's DPI changes: fixed bounds are applied again too.
    for view in self.map.values().filter(|v| v.window == window) {
      let _ = view.webview.set_bounds(rect(view.bounds, inner));
    }
  }

  pub(crate) fn navigate(&mut self, view: &str, url: &str) -> Result<String, String> {
    let v = self.get_mut(view)?;
    if !allowed(&v.allow.borrow(), url) {
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
    let webview = &self.get(view)?.webview;
    #[cfg(target_os = "macos")]
    mac::evaluate(webview, script, Reply::new(done));
    #[cfg(not(target_os = "macos"))]
    wry_evaluate(webview, script, Reply::new(done));
    Ok(())
  }

  /// A Chrome DevTools Protocol method on the view's page: trusted input, a screenshot (Windows only).
  pub(crate) fn cdp(&self, view: &str, method: &str, params: &str, done: impl FnOnce(Result<String, String>) + Send + 'static) -> Result<(), String> {
    platform::cdp(&self.get(view)?.webview, method, params, Reply::new(done));
    Ok(())
  }

  /// Its web process ended: report it with the count so far, and load the page again after recovery_wait.
  pub(crate) fn gone(&mut self, view: &str, reason: &str) {
    let Some(v) = self.map.get_mut(view) else { return };
    v.dead |= reason == "browserExited";
    if v.reload_pending {
      log!("external view {view}: its page stopped ({reason}) while its reload waits");
      return;
    }
    v.gone_streak = streak_after(v.gone_streak, v.reloaded_at, Instant::now());
    v.restarts += 1;
    v.reload_pending = true;
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
  pub(crate) fn recover(
    &mut self,
    view: &str,
    window: &tao::window::Window,
    page: &WebView,
    data_root: &Path,
    devtools: bool,
    background: RGBA,
  ) -> Result<(), String> {
    let Some(v) = self.map.get_mut(view).filter(|v| v.reload_pending) else { return Ok(()) };
    v.reload_pending = false;
    v.reloaded_at = Some(Instant::now());
    if !v.dead {
      return v.webview.reload().map_err(|e| e.to_string());
    }
    let old = self.map.remove(view).expect("looked up above");
    let opts = OpenOptions {
      view: view.to_string(),
      window: old.window,
      url: current_url(&old),
      allow: old.allow.borrow().clone(),
      bounds: old.bounds,
      init_script: old.init_script.clone(),
      muted: old.muted,
      autoplay: old.autoplay,
      console: old.console,
    };
    let kept = old.kept();
    discard(old);
    let built = build(window, crate::inner_size(window, Some(page)), data_root, devtools, background, &opts);
    platform::reclaim(page);
    let mut fresh = built.inspect_err(|_| {
      push_event(&event(view, opts.window, &format!(r#""event":"gone","reason":"rebuildFailed","restarts":{}"#, kept.0)));
    })?;
    fresh.restore(kept);
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

  pub(crate) fn window_of(&self, view: &str) -> Option<u32> {
    self.map.get(view).map(|v| v.window)
  }
}

fn build(
  window: &tao::window::Window,
  inner: LogicalSize<f64>,
  data_root: &Path,
  devtools: bool,
  background: RGBA,
  opts: &OpenOptions,
) -> Result<View, String> {
  #[cfg(target_os = "linux")]
  {
    let _ = (window, inner, data_root, devtools, background, opts);
    Err("UNSUPPORTED: external views are not on Linux yet".into())
  }
  #[cfg(not(target_os = "linux"))]
  {
    use wry::{NewWindowResponse, PageLoadEvent, PermissionResponse, WebViewBuilder};
    let data = data_root.join(folder(&opts.view));
    let mut context = wry::WebContext::new(Some(data));
    let allow = Rc::new(RefCell::new(opts.allow.clone()));
    let live = Rc::new(Cell::new(true));
    let (view_id, window_id, loaded) = (opts.view.clone(), opts.window, live.clone());
    let mut builder = WebViewBuilder::new_with_web_context(&mut context)
      .with_url(&opts.url)
      .with_bounds(rect(opts.bounds, inner))
      // WebView2 paints a new view white until the remote page's first frame; the app's backgroundColor covers that gap.
      .with_background_color(background)
      .with_autoplay(opts.autoplay)
      .with_devtools(devtools)
      //? wry focuses a new webview on Windows: the remote page would take the keys meant for the app (a scanner, a PIN).
      .with_focused(false)
      .with_navigation_handler(navigation_handler(opts.view.clone(), allow.clone()))
      .with_new_window_req_handler(|_, _| NewWindowResponse::Deny)
      .with_download_started_handler(|_, _| false)
      .with_permission_handler(|_| PermissionResponse::Deny)
      .with_on_page_load_handler(move |ev, url| {
        if !loaded.get() {
          return;
        }
        let state = match ev {
          PageLoadEvent::Started => "started",
          PageLoadEvent::Finished => "finished",
        };
        push_event(&event(&view_id, window_id, &format!(r#""event":"load","state":"{state}","url":{}"#, json::quote(&url))));
      });
    #[cfg(any(target_os = "windows", target_os = "macos"))]
    if crate::unattended() {
      builder = builder.with_initialization_script_for_main_only(crate::KIOSK_SCRIPT, false);
    }
    if let Some(script) = opts.init_script.as_deref().filter(|s| !s.is_empty()) {
      builder = builder.with_initialization_script_for_main_only(TOP_ONLY, true).with_initialization_script_for_main_only(top_only(script), true);
    }
    #[cfg(target_os = "windows")]
    {
      use wry::WebViewBuilderExtWindows;
      // The browser's keys (Ctrl+P, F5, zoom, F12) are off, as on the app's own page (lib.rs open_window).
      builder = builder.with_browser_accelerator_keys(false);
    }
    #[cfg(target_os = "macos")]
    {
      use wry::WebViewBuilderExtDarwin;
      let (gone_view, alive) = (opts.view.clone(), live.clone());
      builder = builder.with_data_store_identifier(store_id(&opts.view)).with_on_web_content_process_terminate_handler(move || {
        if alive.get() {
          send(UserEvent::ExternalGone { view: gone_view.clone(), reason: "terminated" });
        }
      });
    }
    let webview = builder.build_as_child(window).map_err(|e| format!("external view: {e}"))?;
    platform::watch(&webview, &opts.view, opts.window, opts.console);
    #[cfg(target_os = "windows")]
    {
      platform::guard_frames(&webview, &opts.view);
      if crate::unattended() {
        crate::win::kiosk::lock(&webview, &format!("external view {}", opts.view));
      }
    }
    // Release builds: no Print, Save as or Inspect in its right-click menu either.
    #[cfg(target_os = "windows")]
    crate::page_menu::install(devtools, &webview);
    if opts.muted {
      platform::set_muted(&webview, true)?;
    }
    let view = View {
      webview,
      _context: context,
      window: opts.window,
      bounds: opts.bounds,
      allow,
      url: opts.url.clone(),
      visible: true,
      restarts: 0,
      gone_streak: 0,
      reloaded_at: None,
      reload_pending: false,
      dead: false,
      live,
      init_script: opts.init_script.clone(),
      muted: opts.muted,
      autoplay: opts.autoplay,
      console: opts.console,
      cursor_hidden: false,
      cursor: platform::Cursor::default(),
    };
    platform::track_frames(&view.webview, &opts.view, &view.cursor);
    Ok(view)
  }
}

#[cfg(not(target_os = "windows"))]
mod platform {
  use wry::WebView;

  use super::Reply;

  pub(crate) type Cursor = ();

  pub(super) const NO_MUTE: &str = "UNSUPPORTED: a view is muted on Windows only";

  pub(super) fn reclaim(_page: &WebView) {}

  pub(super) fn set_cursor_hidden(_webview: &WebView, _hidden: bool, _cursor: &Cursor) {}

  #[cfg_attr(target_os = "linux", allow(dead_code))]
  pub(super) fn track_frames(_webview: &WebView, _view: &str, _cursor: &Cursor) {}

  pub(super) fn set_muted(_webview: &WebView, _muted: bool) -> Result<(), String> {
    Err(NO_MUTE.into())
  }

  pub(super) fn cdp(_webview: &WebView, method: &str, _params: &str, reply: Reply) {
    reply.send(Err(format!("UNSUPPORTED: {method} reaches a view on Windows only")));
  }

  #[cfg_attr(target_os = "linux", allow(dead_code))]
  pub(super) fn watch(_webview: &WebView, _view: &str, _window: u32, _console: bool) {}
}

#[cfg(target_os = "macos")]
mod mac {
  use std::{cell::Cell, ffi::c_void};

  use block2::RcBlock;
  use objc2::{
    msg_send,
    rc::{autoreleasepool, Retained},
    runtime::{AnyClass, AnyObject},
  };
  use objc2_foundation::NSString;
  use wry::{WebView, WebViewExtMacOS};

  use super::Reply;
  use crate::json::{self, V};

  /// Deeper nesting answers null: each level is a recursive call on the main thread.
  const MAX_DEPTH: usize = 128;

  const NS_UTF16_LITTLE_ENDIAN: usize = 0x9400_0100;

  //? Not wry's evaluate_script_with_callback: it unwraps NSJSONSerialization, which raises on a Date, NaN or a cycle
  //? (an abort in release builds), answers "" for undefined, and drops the callback of a script sent before the
  //? first navigation commits.
  pub(super) fn evaluate(webview: &WebView, script: &str, reply: Reply) {
    let reply = Cell::new(Some(reply));
    let handler = RcBlock::new(move |value: *mut AnyObject, error: *mut AnyObject| {
      let answer = autoreleasepool(|_| match (unsafe { value.as_ref() }, unsafe { error.as_ref() }) {
        (Some(value), _) => Ok(json_of(value)),
        (None, Some(error)) => failure(error),
        (None, None) => Ok("null".into()),
      });
      if let Some(reply) = reply.take() {
        reply.send(answer);
      }
    });
    let source = NSString::from_str(script);
    let _: () = unsafe { msg_send![&*webview.webview(), evaluateJavaScript: &*source, completionHandler: &*handler] };
  }

  /// An exception, or a value JSON has no form for, answers null as WebView2's ExecuteScript does.
  fn failure(error: &AnyObject) -> Result<String, String> {
    let code: isize = unsafe { msg_send![error, code] };
    let domain: Option<Retained<AnyObject>> = unsafe { msg_send![error, domain] };
    //? WKErrorJavaScriptExceptionOccurred (4), WKErrorJavaScriptResultTypeIsUnsupported (5).
    if matches!(code, 4 | 5) && domain.is_some_and(|d| text(&d) == "WKErrorDomain") {
      return Ok("null".into());
    }
    let description: Option<Retained<AnyObject>> = unsafe { msg_send![error, localizedDescription] };
    Err(format!("INTERNAL: {}", description.map_or_else(|| format!("WebKit error {code}"), |d| text(&d))))
  }

  struct Kinds {
    null: &'static AnyClass,
    string: &'static AnyClass,
    number: &'static AnyClass,
    date: &'static AnyClass,
    array: &'static AnyClass,
    dictionary: &'static AnyClass,
    yes: Retained<AnyObject>,
    no: Retained<AnyObject>,
  }

  impl Kinds {
    fn get() -> Option<Self> {
      let number = AnyClass::get(c"NSNumber")?;
      Some(Self {
        null: AnyClass::get(c"NSNull")?,
        string: AnyClass::get(c"NSString")?,
        date: AnyClass::get(c"NSDate")?,
        array: AnyClass::get(c"NSArray")?,
        dictionary: AnyClass::get(c"NSDictionary")?,
        yes: unsafe { msg_send![number, numberWithBool: true] },
        no: unsafe { msg_send![number, numberWithBool: false] },
        number,
      })
    }
  }

  /// What JSON.stringify writes for the value, as WebView2 answers: null for a cycle or what JSON has no form for.
  pub(super) fn json_of(value: &AnyObject) -> String {
    Kinds::get().and_then(|kinds| value_of(&kinds, value, &mut Vec::new())).map_or_else(|| "null".into(), |v| json::stringify(&v))
  }

  fn value_of(kinds: &Kinds, object: &AnyObject, path: &mut Vec<*const AnyObject>) -> Option<V> {
    let is = |class: &AnyClass| -> bool { unsafe { msg_send![object, isKindOfClass: class] } };
    let at: *const AnyObject = object;
    if is(kinds.null) {
      return Some(V::Null);
    }
    if is(kinds.string) {
      return Some(V::Str(text(object)));
    }
    if is(kinds.number) {
      //? A JavaScript boolean arrives as one of the two CFBoolean singletons, a number as any other NSNumber.
      let (yes, no) = (Retained::as_ptr(&kinds.yes), Retained::as_ptr(&kinds.no));
      if at == yes || at == no {
        return Some(V::Bool(at == yes));
      }
      return Some(V::Num(unsafe { msg_send![object, doubleValue] }));
    }
    if is(kinds.date) {
      let seconds: f64 = unsafe { msg_send![object, timeIntervalSince1970] };
      return Some(iso_date(seconds * 1000.0).map_or(V::Null, V::Str));
    }
    if path.len() == MAX_DEPTH || path.contains(&at) {
      return None;
    }
    path.push(at);
    let value = if is(kinds.array) {
      let count: usize = unsafe { msg_send![object, count] };
      let mut items = Vec::with_capacity(count);
      for i in 0..count {
        let item: Option<Retained<AnyObject>> = unsafe { msg_send![object, objectAtIndex: i] };
        items.push(value_of(kinds, &*item?, path)?);
      }
      V::Arr(items)
    } else if is(kinds.dictionary) {
      let keys: Option<Retained<AnyObject>> = unsafe { msg_send![object, allKeys] };
      let keys = keys?;
      let count: usize = unsafe { msg_send![&*keys, count] };
      let mut entries = Vec::with_capacity(count);
      for i in 0..count {
        let key: Option<Retained<AnyObject>> = unsafe { msg_send![&*keys, objectAtIndex: i] };
        let key = key?;
        let string: bool = unsafe { msg_send![&*key, isKindOfClass: kinds.string] };
        if !string {
          return None;
        }
        let item: Option<Retained<AnyObject>> = unsafe { msg_send![object, objectForKey: &*key] };
        entries.push((text(&key), value_of(kinds, &*item?, path)?));
      }
      V::Obj(entries)
    } else {
      return None;
    };
    path.pop();
    Some(value)
  }

  //? Not NSString's UTF8String (objc2's to_string): it is NULL for a lone surrogate, which a page's string can hold.
  pub(super) fn text(string: &AnyObject) -> String {
    let data: Option<Retained<AnyObject>> = unsafe { msg_send![string, dataUsingEncoding: NS_UTF16_LITTLE_ENDIAN] };
    let Some(data) = data else { return String::new() };
    let bytes: *const c_void = unsafe { msg_send![&*data, bytes] };
    let length: usize = unsafe { msg_send![&*data, length] };
    if bytes.is_null() {
      return String::new();
    }
    let bytes = unsafe { std::slice::from_raw_parts(bytes.cast::<u8>(), length) };
    String::from_utf16_lossy(&bytes.chunks_exact(2).map(|b| u16::from_le_bytes([b[0], b[1]])).collect::<Vec<_>>())
  }

  /// What Date.prototype.toISOString writes for a time in ms since the epoch; None for an invalid date.
  pub(super) fn iso_date(ms: f64) -> Option<String> {
    if !ms.is_finite() || ms.abs() > 8.64e15 {
      return None;
    }
    let ms = ms.round() as i64;
    let (days, rest) = (ms.div_euclid(86_400_000), ms.rem_euclid(86_400_000));
    //? Days to a proleptic Gregorian date: Howard Hinnant's civil_from_days.
    let z = days + 719_468;
    let (era, doe) = (z.div_euclid(146_097), z.rem_euclid(146_097));
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + i64::from(month <= 2);
    let year = if (0..=9999).contains(&year) { format!("{year:04}") } else { format!("{}{:06}", if year < 0 { '-' } else { '+' }, year.abs()) };
    let (hours, minutes, seconds, millis) = (rest / 3_600_000, rest / 60_000 % 60, rest / 1000 % 60, rest % 1000);
    Some(format!("{year}-{month:02}-{day:02}T{hours:02}:{minutes:02}:{seconds:02}.{millis:03}Z"))
  }

  #[cfg(test)]
  mod tests {
    use std::ffi::CStr;

    use objc2::{
      msg_send,
      rc::{autoreleasepool, Retained},
      runtime::{AnyClass, AnyObject},
    };
    use objc2_foundation::NSString;

    use super::{iso_date, json_of, text, MAX_DEPTH};

    fn class(name: &CStr) -> &'static AnyClass {
      AnyClass::get(name).expect("a Foundation class")
    }

    fn list(items: &[&AnyObject]) -> Retained<AnyObject> {
      let list: Retained<AnyObject> = unsafe { msg_send![class(c"NSMutableArray"), array] };
      for item in items {
        let _: () = unsafe { msg_send![&*list, addObject: *item] };
      }
      list
    }

    fn number(value: f64) -> Retained<AnyObject> {
      unsafe { msg_send![class(c"NSNumber"), numberWithDouble: value] }
    }

    #[test]
    fn a_value_json_has_no_form_for_answers_null_and_raises_nothing() {
      autoreleasepool(|_| {
        let date: Retained<AnyObject> = unsafe { msg_send![class(c"NSDate"), dateWithTimeIntervalSince1970: 1_728_912_345.678f64] };
        let state: Retained<AnyObject> = unsafe { msg_send![class(c"NSMutableDictionary"), dictionary] };
        let key = NSString::from_str("at");
        let _: () = unsafe { msg_send![&*state, setObject: &*date, forKey: &*key] };
        assert_eq!(json_of(&state), r#"{"at":"2024-10-14T13:25:45.678Z"}"#);
        let own = NSString::from_str("self");
        let _: () = unsafe { msg_send![&*state, setObject: &*state, forKey: &*own] };
        assert_eq!(json_of(&state), "null");
        let _: () = unsafe { msg_send![&*state, removeAllObjects] };
        let yes: Retained<AnyObject> = unsafe { msg_send![class(c"NSNumber"), numberWithBool: true] };
        let one: Retained<AnyObject> = unsafe { msg_send![class(c"NSNumber"), numberWithInt: 1i32] };
        let null: Retained<AnyObject> = unsafe { msg_send![class(c"NSNull"), null] };
        let (nan, infinity, half) = (number(f64::NAN), number(f64::INFINITY), number(2.5));
        assert_eq!(json_of(&list(&[&yes, &one, &half, &nan, &infinity, &null])), "[true,1,2.5,null,null,null]");
        assert_eq!(json_of(&nan), "null");
        let shared = list(&[&one]);
        assert_eq!(json_of(&list(&[&shared, &shared])), "[[1],[1]]");
        let cycle = list(&[&one]);
        let _: () = unsafe { msg_send![&*cycle, addObject: &*cycle] };
        assert_eq!(json_of(&cycle), "null");
        let _: () = unsafe { msg_send![&*cycle, removeAllObjects] };
        let url = NSString::from_str("https://board.example/");
        let unsupported: Retained<AnyObject> = unsafe { msg_send![class(c"NSURL"), URLWithString: &*url] };
        assert_eq!(json_of(&unsupported), "null");
      });
    }

    #[test]
    fn nesting_past_the_limit_answers_null() {
      autoreleasepool(|_| {
        let mut nested = list(&[]);
        for _ in 1..MAX_DEPTH {
          nested = list(&[&nested]);
        }
        assert!(json_of(&nested).starts_with("[[[["));
        assert_eq!(json_of(&list(&[&nested])), "null");
      });
    }

    #[test]
    fn a_string_with_a_lone_surrogate_reads_without_a_null_pointer() {
      autoreleasepool(|_| {
        let units = [0x41u16, 0xd800, 0x42];
        let string: Retained<AnyObject> = unsafe { msg_send![class(c"NSString"), stringWithCharacters: units.as_ptr(), length: units.len()] };
        assert_eq!(text(&string), "A\u{fffd}B");
        assert_eq!(json_of(&string), "\"A\u{fffd}B\"");
        assert_eq!(text(&NSString::from_str("")), "");
      });
    }

    #[test]
    fn a_date_is_what_to_iso_string_writes() {
      assert_eq!(iso_date(0.0).as_deref(), Some("1970-01-01T00:00:00.000Z"));
      assert_eq!(iso_date(-1.0).as_deref(), Some("1969-12-31T23:59:59.999Z"));
      assert_eq!(iso_date(951_868_799_999.0).as_deref(), Some("2000-02-29T23:59:59.999Z"));
      assert_eq!(iso_date(-62_167_219_200_000.0).as_deref(), Some("0000-01-01T00:00:00.000Z"));
      assert_eq!(iso_date(-62_198_755_200_000.0).as_deref(), Some("-000001-01-01T00:00:00.000Z"));
      assert_eq!(iso_date(253_402_300_800_000.0).as_deref(), Some("+010000-01-01T00:00:00.000Z"));
      assert_eq!(iso_date(8.64e15).as_deref(), Some("+275760-09-13T00:00:00.000Z"));
      assert_eq!(iso_date(-8.64e15).as_deref(), Some("-271821-04-20T00:00:00.000Z"));
      assert_eq!(iso_date(8.64e15 + 1.0), None);
      assert_eq!(iso_date(f64::NAN), None);
    }
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn bounds_fill_the_window_or_stay_in_range() {
    let bounds = |s: &str| Bounds::from_cmd(&json::parse(s).unwrap());
    assert_eq!(bounds(r#"{"bounds":"fill"}"#), Ok(Bounds::Fill));
    assert_eq!(bounds(r#"{"bounds":{"x":-20,"y":0,"width":30.5,"height":10}}"#), Ok(Bounds::At { x: -20.0, y: 0.0, width: 30.5, height: 10.0 }));
    for bad in [r#"{"bounds":{"x":0,"y":0,"width":3e9,"height":10}}"#, r#"{"bounds":{"x":-2e9,"y":0,"width":30,"height":10}}"#, r#"{"bounds":{"x":0,"y":0,"width":0,"height":10}}"#] {
      assert!(bounds(bad).is_err(), "{bad}");
    }
  }

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
  fn a_new_allow_list_holds_for_the_links_the_page_follows() {
    let allow = Rc::new(RefCell::new(vec!["https://a.example".to_string()]));
    let handler = navigation_handler("board".into(), allow.clone());
    assert!(handler("https://a.example/1".into()));
    *allow.borrow_mut() = vec!["https://b.example".to_string()];
    assert!(!handler("https://a.example/1".into()));
    assert!(handler("https://b.example/2".into()));
  }

  #[test]
  fn frames_load_web_content_from_anywhere_and_open_nothing() {
    let allow = vec!["https://board.example".to_string()];
    assert!(admits(&allow, "https://www.youtube.com/embed/x", true));
    assert!(admits(&allow, "about:srcdoc", true));
    assert!(admits(&allow, "data:text/html,x", true));
    assert!(!admits(&allow, "https://www.youtube.com/embed/x", false));
    for url in ["mailto:a@example.com", "file:///etc/passwd", "otherapp://x", "javascript:alert(1)"] {
      assert!(!admits(&allow, url, true), "{url}");
    }
  }

  #[test]
  fn an_init_script_keeps_its_text_and_ends_with_the_name_its_guard_marks_a_frame_with() {
    let script = "'use strict';\nlet a = 1; // last line";
    let guarded = top_only(script);
    // Its directive, lines and columns stay as written.
    assert!(guarded.starts_with(script));
    assert_eq!(&guarded[script.len()..], "\n;let __akanTopOnly;");
    assert!(TOP_ONLY.contains(r#"Object.defineProperty(window,"__akanTopOnly",{value:true})"#));
  }

  #[test]
  fn the_streak_counts_from_the_last_reload_so_the_longest_wait_does_not_reset_it() {
    let reloaded = Instant::now();
    let after = |secs| reloaded + Duration::from_secs(secs);
    assert_eq!(streak_after(0, None, after(1)), 0);
    assert_eq!(streak_after(2, Some(reloaded), after(5)), 3);
    // Seven ends in a row wait 60 s (recovery_wait); one 5 s after that reload is the eighth.
    assert_eq!(streak_after(7, Some(reloaded), after(5)), 8);
    assert_eq!(streak_after(7, Some(reloaded), after(61)), 0);
  }

  #[test]
  fn a_call_the_engine_drops_is_answered_once_with_an_error() {
    let answers = Arc::new(Mutex::new(Vec::<Result<String, String>>::new()));
    let sink = || {
      let answers = answers.clone();
      move |result: Result<String, String>| answers.lock().unwrap().push(result)
    };
    Reply::new(sink()).send(Ok("1".into()));
    drop(Reply::new(sink()));
    let answers = answers.lock().unwrap();
    assert_eq!(answers.len(), 2);
    assert_eq!(answers[0], Ok("1".to_string()));
    assert!(answers[1].as_ref().is_err_and(|e| e.starts_with("CANCELLED: ")));
  }

  #[test]
  fn a_view_id_makes_a_short_folder_and_a_stable_store_id() {
    // FNV-1a's published vectors (a: af63dc4c8601ec8c, foobar: 85944171f73967e8), their halves XORed.
    assert_eq!(folder("a"), "296230c0");
    assert_eq!(folder("foobar"), "72ad2699");
    assert_ne!(folder("Board"), folder("board"));
    assert!(folder("CON").bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)));
    assert_eq!(folder(&"x".repeat(64)).len(), 8);
    assert_eq!(store_id("cus"), [98, 139, 193, 12, 25, 252, 185, 245, 217, 51, 56, 75, 247, 222, 42, 141]);
    assert_ne!(store_id("cus"), store_id("cus2"));
  }
}
