//! akan-native desktop shell: TAO window + WRY webview behind a C ABI for bun:ffi (docs/architecture.md §3.3, §9).
//!
//! Threads
//! - akan_native_run: process main thread only. Never returns (tao run → process::exit).
//! - every other akan_native_*: any thread. UI work goes to the main thread through EventLoopProxy.
//! - native → JS: messages are queued and a data-less wake() is called; JS drains with akan_native_poll.
//!   The wake callback is a Bun threadsafe JSCallback: it runs on the Worker that created it and
//!   never blocks the caller (verified, docs/research/desktop-macos.md §1 Q3).
#![allow(clippy::missing_safety_doc)]

// Before the modules, so that they can use it too.
macro_rules! log {
  ($($arg:tt)*) => { eprintln!("[akan-native native] {}", format!($($arg)*)) };
}

mod contract;
mod devproxy;
mod json;
mod navigation;
mod page_menu;
mod placement;
mod routes;
#[cfg(test)]
mod vectors;
#[cfg(target_os = "macos")]
mod notify;
// The local notifications' schedule on Windows and Linux (win/notify.rs, linux/notify.rs).
#[cfg(not(target_os = "macos"))]
mod notify_schedule;
#[cfg(target_os = "macos")]
mod camera;
#[cfg(target_os = "macos")]
mod js_panels;
#[cfg(target_os = "macos")]
mod panels;
mod dialog_args;
mod accelerator;
// Menu trees, roles and dock arguments of the Windows and Linux shells (unit tested everywhere).
mod chrome;
#[cfg(target_os = "macos")]
mod hotkey;
#[cfg(target_os = "macos")]
mod menu;
#[cfg(target_os = "macos")]
mod tray;
#[cfg(target_os = "macos")]
mod dock;
#[cfg(target_os = "macos")]
mod screen;
#[cfg(target_os = "macos")]
mod volume;
#[cfg(target_os = "macos")]
mod autostart;
#[cfg(target_os = "macos")]
mod keychain;
#[cfg(target_os = "windows")]
mod win;
#[cfg(target_os = "linux")]
mod linux;

use std::{
  collections::{HashMap, VecDeque},
  ffi::{c_char, CStr},
  path::{Component, Path, PathBuf},
  sync::{
    atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering},
    Arc, LazyLock, Mutex, OnceLock, RwLock,
  },
  time::Duration,
};

use routes::{asset_mime, is_host_path, parse_range, route, RangeAnswer, Route};
use tao::{
  dpi::LogicalSize,
  event::{Event, StartCause, WindowEvent},
  event_loop::{ControlFlow, EventLoopBuilder, EventLoopProxy, EventLoopWindowTarget},
  window::WindowBuilder,
};
use wry::{
  http::{header::CONTENT_TYPE, Request, Response},
  DragDropEvent, NewWindowResponse, PageLoadEvent, PermissionKind, PermissionResponse, RequestAsyncResponder, WebView, WebViewBuilder,
};

/// The page origin (WV-1). WebView2 has no custom schemes of its own: wry serves app://localhost
/// as https://app.localhost with with_https_scheme (webview2/mod.rs custom_protocol_workaround),
/// the same origin as on Android. WebKit (macOS, WebKitGTK) serves the scheme itself.
#[cfg(target_os = "windows")]
const ORIGIN: &str = "https://app.localhost";
#[cfg(not(target_os = "windows"))]
const ORIGIN: &str = "app://localhost";
/// What windows load: wry rewrites it to ORIGIN on Windows.
const START_URL: &str = "app://localhost";

/// `url` is ORIGIN itself or a path, query or fragment on it.
fn on_origin(url: &str) -> bool {
  url.strip_prefix(ORIGIN).is_some_and(|rest| rest.is_empty() || rest.starts_with(['/', '?', '#']))
}

// ───────────────────────── native → JS queue ─────────────────────────
// Frame (little endian): [u8 kind][u64 reqId][u32 webviewId][body...]
//   kind 1 = IPC request (body = the bytes the page POSTed)
//   kind 2 = native event (body = JSON text). reqId is 0, or a watch id (see push_watched).
const KIND_IPC: u8 = 1;
const KIND_EVENT: u8 = 2;

struct Queue {
  items: VecDeque<Vec<u8>>,
  wake_pending: bool,
}

static QUEUE: Mutex<Queue> = Mutex::new(Queue { items: VecDeque::new(), wake_pending: false });
static WAKE: AtomicUsize = AtomicUsize::new(0);

/// The idle wake budget (architecture review stage 5): how often native code woke the Worker, how
/// often it polled, frames in and out, the deepest the queue got. The dev shell op `debug.stats`
/// reads them; an idle app should wake the Worker zero times.
struct Stats {
  wakes: AtomicU64,
  polls: AtomicU64,
  frames_in: AtomicU64,
  frames_out: AtomicU64,
  max_depth: AtomicU64,
}
static STATS: Stats = Stats { wakes: AtomicU64::new(0), polls: AtomicU64::new(0), frames_in: AtomicU64::new(0), frames_out: AtomicU64::new(0), max_depth: AtomicU64::new(0) };

fn stats_json() -> String {
  let queued = QUEUE.lock().unwrap().items.len();
  let pending = PENDING.lock().unwrap().len();
  format!(
    r#"{{"wakes":{},"polls":{},"framesIn":{},"framesOut":{},"maxDepth":{},"queued":{queued},"pending":{pending}}}"#,
    STATS.wakes.load(Ordering::Relaxed),
    STATS.polls.load(Ordering::Relaxed),
    STATS.frames_in.load(Ordering::Relaxed),
    STATS.frames_out.load(Ordering::Relaxed),
    STATS.max_depth.load(Ordering::Relaxed),
  )
}
/// reqId → (webview id, responder). A webview's entries are dropped on the main thread when its
/// page starts loading a new document (they can never be answered) or its window is destroyed.
static PENDING: LazyLock<Mutex<HashMap<u64, (u32, RequestAsyncResponder)>>> = LazyLock::new(|| Mutex::new(HashMap::new()));
static NEXT_REQ: AtomicU64 = AtomicU64::new(1);
/// Calls waiting for the host (and frames waiting for it to poll) beyond which IPC is answered 503.
const MAX_PENDING: usize = 10_000;
/// Files registered by plugins: id → (path, mime). Served at /__akan_native/file/<id>.
static FILES: LazyLock<Mutex<HashMap<String, (PathBuf, String)>>> = LazyLock::new(|| Mutex::new(HashMap::new()));
static PROXY: OnceLock<Mutex<EventLoopProxy<UserEvent>>> = OnceLock::new();

// Quit flow (plugins.md D4). AppKit asks applicationShouldTerminate: (Cmd+Q, Dock, AppleScript,
// logout); the shell cancels, the host runs its sequence (page veto, plugin cleanup) and calls
// akan_native_quit, which ends the TAO loop without asking AppKit again.
/// akan_native_quit was called (or the watchdog fired): a terminate: from now on proceeds.
static QUITTING: AtomicBool = AtomicBool::new(false);
/// applicationShouldTerminate: answered NSTerminateLater (logout, restart, shutdown), so the host's
/// decision goes back through replyToApplicationShouldTerminate:.
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
static TERMINATE_LATER: AtomicBool = AtomicBool::new(false);
/// Events the host must act on (quitRequested, closeRequested) carry a watch id in the frame's
/// reqId; akan_native_poll records the highest id the Worker took.
static WATCH_SEQ: AtomicU64 = AtomicU64::new(0);
static WATCH_TAKEN: AtomicU64 = AtomicU64::new(0);
const WATCH_TIMEOUT: Duration = Duration::from_millis(2000);

fn frame(kind: u8, req_id: u64, webview_id: u32, body: &[u8]) -> Vec<u8> {
  let mut v = Vec::with_capacity(13 + body.len());
  v.push(kind);
  v.extend_from_slice(&req_id.to_le_bytes());
  v.extend_from_slice(&webview_id.to_le_bytes());
  v.extend_from_slice(body);
  v
}

/// Held (shared) while the wake callback is being called: akan_native_set_wake takes it exclusively, so
/// once it returns no thread still calls the callback the host is about to close.
static WAKE_CALLS: RwLock<()> = RwLock::new(());

fn call_wake() {
  let _calling = WAKE_CALLS.read().unwrap_or_else(|e| e.into_inner());
  let f = WAKE.load(Ordering::Acquire);
  if f != 0 {
    STATS.wakes.fetch_add(1, Ordering::Relaxed);
    let f: extern "C" fn() = unsafe { std::mem::transmute(f) };
    f();
  }
}

/// Queues a message and wakes JS once per batch (coalesced wakes keep the Worker queue small).
fn push(msg: Vec<u8>) {
  let need_wake = {
    let mut q = QUEUE.lock().unwrap();
    q.items.push_back(msg);
    STATS.frames_in.fetch_add(1, Ordering::Relaxed);
    STATS.max_depth.fetch_max(q.items.len() as u64, Ordering::Relaxed);
    let need = !q.wake_pending;
    q.wake_pending = true;
    need
  };
  if need_wake {
    call_wake();
  }
}

fn push_event(json: &str) {
  push(frame(KIND_EVENT, 0, 0, json.as_bytes()));
}

/// Pushes an event the host must act on and acts by itself if the Worker has not taken it within
/// WATCH_TIMEOUT: a hung plugin host must never make the app impossible to quit or a window
/// impossible to close. Once taken, the decision is the host's, which may wait for the user (an
/// unsaved-changes dialog in the page). A window's close request (`window`) only closes that
/// window, unless it is the last one: a Worker busy with a long synchronous call (a big query, a
/// large file copy) looks the same as a hung one, and closing a second window must not end the app.
fn push_watched(json: &str, window: Option<u32>) {
  let id = WATCH_SEQ.fetch_add(1, Ordering::AcqRel) + 1;
  push(frame(KIND_EVENT, id, 0, json.as_bytes()));
  let json = json.to_string();
  std::thread::spawn(move || {
    std::thread::sleep(WATCH_TIMEOUT);
    if WATCH_TAKEN.load(Ordering::Acquire) < id && !QUITTING.load(Ordering::Acquire) {
      match window {
        Some(window) => send(UserEvent::CloseUntaken { watch: id, window }),
        None => {
          log!("the plugin host did not take {json} within {WATCH_TIMEOUT:?}; quitting");
          akan_native_quit(0);
        }
      }
    }
  });
}

// ───────────────────────── SIGTERM ─────────────────────────

/// SIGTERM (`akan-native run`/`akan-native test` stopping the app, `kill`, launchd) ended the app without its
/// quit hooks: a Bun Worker gets no signal handlers while the main thread is inside akan_native_run
/// (verified), so window-state could not flush and single-instance left its socket behind.
/// The handler only writes a byte to a pipe (async-signal-safe); a thread turns it into a
/// `signal` event, and the host quits through its lifecycle (onQuit hooks, no veto, then
/// akan_native_quit). A second SIGTERM, a Worker that does not take the event (push_watched) or a quit
/// that has not happened after 5 s ends the process directly. libc is declared here, no crate.
#[cfg(unix)]
mod sigterm {
  use std::sync::atomic::{AtomicI32, Ordering};
  use std::time::Duration;

  extern "C" {
    fn pipe(fds: *mut i32) -> i32;
    fn read(fd: i32, buf: *mut u8, count: usize) -> isize;
    fn write(fd: i32, buf: *const u8, count: usize) -> isize;
    fn signal(signum: i32, handler: extern "C" fn(i32)) -> usize;
  }
  const SIGHUP: i32 = 1;
  const SIGINT: i32 = 2;
  const SIGTERM: i32 = 15;
  static WRITE_FD: AtomicI32 = AtomicI32::new(-1);

  /// The signal number goes through the pipe (async-signal-safe: one write).
  extern "C" fn on_signal(signum: i32) {
    let fd = WRITE_FD.load(Ordering::Relaxed);
    if fd >= 0 {
      let byte = signum as u8;
      unsafe { write(fd, &byte, 1) };
    }
  }

  /// SIGTERM (a service manager, `akan-native run`), SIGINT (Ctrl+C in a terminal) and SIGHUP (the
  /// terminal closed) all quit through the host's quit hooks (N5); a second signal or 5 s: exit.
  pub fn install() {
    let mut fds = [0i32; 2];
    if unsafe { pipe(fds.as_mut_ptr()) } != 0 {
      return;
    }
    WRITE_FD.store(fds[1], Ordering::Relaxed);
    let read_fd = fds[0];
    std::thread::spawn(move || {
      let mut byte = 0u8;
      let mut count = 0;
      while unsafe { read(read_fd, &mut byte, 1) } == 1 {
        count += 1;
        let (name, code) = match byte as i32 {
          SIGINT => ("SIGINT", 130),
          SIGHUP => ("SIGHUP", 129),
          _ => ("SIGTERM", 143),
        };
        if count > 1 || super::WAKE.load(Ordering::Acquire) == 0 {
          std::process::exit(code);
        }
        super::push_watched(&format!(r#"{{"type":"signal","signal":"{name}"}}"#), None);
        std::thread::spawn(move || {
          std::thread::sleep(Duration::from_secs(5));
          std::process::exit(code);
        });
      }
    });
    for signum in [SIGTERM, SIGINT, SIGHUP] {
      unsafe { signal(signum, on_signal) };
    }
  }
}

/// Windows has no SIGTERM: `akan-native run`/`akan-native test` stop the app with TerminateProcess, which skips
/// the quit hooks. So when the CLI starts the app it sets AKAN_NATIVE_QUIT_ON_STDIN=1 and gives it a pipe
/// as stdin: a line "quit", or the pipe closing (the CLI is gone), becomes the same `signal` event
/// as a SIGTERM on macOS and Linux, with the same fallbacks (a second request or 5 s: exit).
#[cfg(target_os = "windows")]
mod stdin_quit {
  use std::io::BufRead;
  use std::time::Duration;

  pub fn install() {
    if std::env::var_os("AKAN_NATIVE_QUIT_ON_STDIN").is_none_or(|v| v != "1") {
      return;
    }
    std::thread::spawn(|| {
      let mut lines = std::io::stdin().lock().lines();
      let mut requested = false;
      loop {
        let line = lines.next();
        let quit = match &line {
          Some(Ok(text)) => text.trim() == "quit",
          _ => true, // closed or unreadable
        };
        if quit {
          if requested || super::WAKE.load(std::sync::atomic::Ordering::Acquire) == 0 {
            std::process::exit(143);
          }
          requested = true;
          super::push_watched(r#"{"type":"signal","signal":"SIGTERM"}"#, None);
          std::thread::spawn(|| {
            std::thread::sleep(Duration::from_secs(5));
            std::process::exit(143);
          });
        }
        if !matches!(line, Some(Ok(_))) {
          return;
        }
      }
    });
  }
}

/// Answer to applicationShouldTerminate: (AppKit, main thread). `session_end`: logout, restart or
/// shutdown, where NSTerminateLater keeps the system waiting for the host instead of aborting the logout.
#[cfg(target_os = "macos")]
fn should_terminate(session_end: bool) -> macos::TerminateReply {
  if QUITTING.load(Ordering::Acquire) || WAKE.load(Ordering::Acquire) == 0 {
    return macos::TerminateReply::Now;
  }
  let reason = if session_end { "session" } else { "user" };
  push_watched(&format!(r#"{{"type":"quitRequested","reason":"{reason}"}}"#), None);
  if session_end {
    TERMINATE_LATER.store(true, Ordering::Release);
    macos::TerminateReply::Later
  } else {
    macos::TerminateReply::Cancel
  }
}

fn send(ev: UserEvent) {
  if let Some(p) = PROXY.get() {
    let _ = p.lock().unwrap().send_event(ev);
  }
}

enum UserEvent {
  Respond(RequestAsyncResponder, Response<Vec<u8>>),
  Emit { webview_id: u32, js: String },
  Quit(i32),
  /// A window's first page load finished (or the fallback timer fired): show it (D2).
  Show(u32),
  /// A shell command from the plugin host (window plugin, app plugin); answered with a
  /// `shellReply` event carrying the same id.
  Shell { id: u64, json: String },
  /// The host kept the app running after a logout asked it to quit (akan_native_quit_cancel).
  CancelTerminate,
  /// A destroyed window's page is unloaded (about:blank finished, or the fallback timer): drop it.
  Unloaded(u32),
  /// The host did not take a window's close request in time (push_watched).
  CloseUntaken { watch: u64, window: u32 },
  /// What the windows draw changed without a TAO ThemeChanged (Linux: GTK's settings, the desktop
  /// portal; linux/appearance.rs): repaint them and report themeChanged.
  #[cfg_attr(not(target_os = "linux"), allow(dead_code))]
  ThemeChanged,
  /// A window's web content process ended (crashed, killed, out of memory): its document is gone (N2).
  WebviewGone { window: u32, reason: &'static str },
  /// desktop.recovery "reload": the wait after a window's page ended in a row is over; load it again.
  ReloadGone(u32),
}

// ───────────────────────── C ABI ─────────────────────────

/// Registers the wake callback (a threadsafe JSCallback). NULL = the host is gone: pending and
/// later IPC fail with 503 instead of calling a dead callback (which segfaults the process).
#[no_mangle]
pub extern "C" fn akan_native_set_wake(f: Option<extern "C" fn()>) {
  {
    let _no_calls = WAKE_CALLS.write().unwrap_or_else(|e| e.into_inner());
    WAKE.store(f.map_or(0, |f| f as usize), Ordering::Release);
  }
  if f.is_none() {
    let pending: Vec<_> = PENDING.lock().unwrap().drain().collect();
    for (_, (_, r)) in pending {
      send(UserEvent::Respond(r, text(503, "akan-native host is not running")));
    }
    return;
  }
  let need = {
    let mut q = QUEUE.lock().unwrap();
    let need = !q.items.is_empty();
    q.wake_pending |= need;
    need
  };
  if need {
    call_wake();
  }
}

/// Copies the next message into buf. 0 = empty. A message larger than cap is not consumed and its
/// size is returned. Every call clears the wake flag, so a drain that stopped halfway (exception)
/// still gets woken by the next push.
#[no_mangle]
pub unsafe extern "C" fn akan_native_poll(buf: *mut u8, cap: u32) -> u32 {
  let mut q = QUEUE.lock().unwrap();
  q.wake_pending = false;
  STATS.polls.fetch_add(1, Ordering::Relaxed);
  match q.items.front() {
    None => 0,
    Some(m) if m.len() > cap as usize => m.len() as u32,
    Some(_) => {
      let m = q.items.pop_front().unwrap();
      if m[0] == KIND_EVENT {
        let watch = u64::from_le_bytes(m[1..9].try_into().unwrap());
        if watch != 0 {
          WATCH_TAKEN.fetch_max(watch, Ordering::AcqRel);
        }
      }
      std::ptr::copy_nonoverlapping(m.as_ptr(), buf, m.len());
      STATS.frames_out.fetch_add(1, Ordering::Relaxed);
      m.len() as u32
    }
  }
}

/// Completes a pending IPC request. Returns at once; the response is delivered on the main thread
/// (responding from the Worker would block it while the main thread is busy).
#[no_mangle]
pub unsafe extern "C" fn akan_native_respond(req_id: u64, status: u16, content_type: *const c_char, body: *const u8, len: u32) {
  let Some((_, responder)) = PENDING.lock().unwrap().remove(&req_id) else {
    return; // the page reloaded meanwhile
  };
  let ct = if content_type.is_null() { "application/json".to_string() } else { CStr::from_ptr(content_type).to_string_lossy().into_owned() };
  let body = if len == 0 || body.is_null() { Vec::new() } else { std::slice::from_raw_parts(body, len as usize).to_vec() };
  // A panic here would abort the process (extern "C"): a bad status or header is a 500 instead.
  let resp = Response::builder()
    .status(status)
    .header(CONTENT_TYPE, ct)
    .header("Cache-Control", "no-store")
    .body(body)
    .unwrap_or_else(|e| text(500, &e.to_string()));
  send(UserEvent::Respond(responder, resp));
}

/// Evaluates JS in a webview (main thread). Used for host → page events.
#[no_mangle]
pub unsafe extern "C" fn akan_native_emit(webview_id: u32, js: *const c_char) {
  if js.is_null() {
    return;
  }
  let js = CStr::from_ptr(js).to_string_lossy().into_owned();
  send(UserEvent::Emit { webview_id, js });
}

/// Serves `path` at /__akan_native/file/<id> for the rest of the session.
#[no_mangle]
pub unsafe extern "C" fn akan_native_register_file(id: *const c_char, path: *const c_char, mime: *const c_char) {
  if id.is_null() || path.is_null() {
    return;
  }
  let id = CStr::from_ptr(id).to_string_lossy().into_owned();
  let path = PathBuf::from(CStr::from_ptr(path).to_string_lossy().into_owned());
  let mime = if mime.is_null() { asset_mime(&id) } else { CStr::from_ptr(mime).to_string_lossy().into_owned() };
  FILES.lock().unwrap().insert(id, (path, mime));
}

/// Stops serving a FileRef ($bridge.release, ABI 0.2). 1 when the id was registered.
#[no_mangle]
pub unsafe extern "C" fn akan_native_unregister_file(id: *const c_char) -> u8 {
  if id.is_null() {
    return 0;
  }
  let id = CStr::from_ptr(id).to_string_lossy().into_owned();
  u8::from(FILES.lock().unwrap().remove(&id).is_some())
}

/// Ends the app. Also the host's "yes" to a quit request (quitRequested).
#[no_mangle]
pub extern "C" fn akan_native_quit(code: i32) {
  QUITTING.store(true, Ordering::Release);
  send(UserEvent::Quit(code));
}

/// The host's "no" to a quitRequested with reason "session": AppKit cancels the logout, restart or
/// shutdown. For other quit requests the shell already said no to AppKit, so this does nothing.
/// The C ABI version (docs/architecture.md §9): major << 16 | minor. main.ts refuses a library of
/// another major version right after loading it.
pub const ABI: u32 = 2; // 0.2: akan_native_unregister_file

#[no_mangle]
pub extern "C" fn akan_native_abi() -> u32 {
  ABI
}

/// Why akan_native_run failed, for the message main.ts shows (and the crash marker later).
static LAST_ERROR: Mutex<String> = Mutex::new(String::new());

fn set_last_error(message: &str) {
  *LAST_ERROR.lock().unwrap_or_else(|e| e.into_inner()) = message.to_string();
}

/// Copies the last error (UTF-8, not NUL-terminated) into `buf`; returns its full length.
///
/// # Safety
/// `buf` must hold `cap` writable bytes (or be null with `cap` 0).
#[no_mangle]
pub unsafe extern "C" fn akan_native_last_error(buf: *mut u8, cap: usize) -> usize {
  let text = LAST_ERROR.lock().unwrap_or_else(|e| e.into_inner()).clone();
  if !buf.is_null() {
    std::ptr::copy_nonoverlapping(text.as_ptr(), buf, text.len().min(cap));
  }
  text.len()
}

/// Called by main.ts before it starts the plugin host Worker, so no other akan-native thread runs yet.
/// Release builds (`dev` 0) drop the engines' debugging variables: a WEBVIEW2_* or WEBKIT_* setting
/// in the user's environment would open a debugger port or switch off WebKit's sandbox, and
/// SSLKEYLOGFILE would log TLS keys (Tauri CEF #15995). The debug port is never taken from argv.
#[no_mangle]
pub extern "C" fn akan_native_init(dev: u8) -> i32 {
  if dev == 0 {
    let dropped: Vec<String> = std::env::vars_os()
      .filter_map(|(k, _)| k.into_string().ok())
      .filter(|k| k.starts_with("WEBVIEW2_") || k.starts_with("WEBKIT_INSPECTOR") || k.starts_with("WEBKIT_DISABLE_SANDBOX") || k == "WEBKIT_FORCE_SANDBOX" || k == "SSLKEYLOGFILE")
      .collect();
    for key in &dropped {
      std::env::remove_var(key);
    }
    if !dropped.is_empty() {
      log!("release build: ignoring the engine settings {}", dropped.join(", "));
    }
  }
  0
}

#[no_mangle]
pub extern "C" fn akan_native_quit_cancel() {
  send(UserEvent::CancelTerminate);
}

/// 1 when an external open may happen now (and counts it), 0 when the one-per-second limit (L0)
/// was reached. The page's links and the plugins' opens share this one limit.
#[no_mangle]
pub extern "C" fn akan_native_external_open_allowed() -> u8 {
  navigation::external_open_allowed() as u8
}

/// Runs a shell command on the main thread: `{"op":"window.setTitle","title":"…"}` etc.
/// The answer arrives as a native event `{"type":"shellReply","id":…,"ok":…,"result"|"error":…}`.
#[no_mangle]
pub unsafe extern "C" fn akan_native_shell(id: u64, json: *const c_char) {
  if json.is_null() {
    return;
  }
  let json = CStr::from_ptr(json).to_string_lossy().into_owned();
  send(UserEvent::Shell { id, json });
}

fn reply(id: u64, result: Result<String, String>) {
  match result {
    Ok(value) => push_event(&format!(r#"{{"type":"shellReply","id":{id},"ok":true,"result":{value}}}"#)),
    Err(message) => push_event(&format!(r#"{{"type":"shellReply","id":{id},"ok":false,"error":{}}}"#, json::quote(&message))),
  }
}

/// Window state as JSON, in logical pixels (CSS px). tao applies several setters asynchronously on
/// macOS (set_title, set_inner_size, …), so a state read right after a setter can still show the old
/// value; `title` lets setTitle report what it set.
fn window_state(window: &tao::window::Window, webview: Option<&WebView>) -> String {
  window_state_with(window, webview, &Requested::default())
}

/// The window's minimum inner size, logical points.
const MIN_INNER: (f64, f64) = (320.0, 240.0);

/// What a shell op just asked for. On macOS tao applies titles, sizes, positions, zoom and full
/// screen asynchronously on the main queue (tao/src/platform_impl/macos/util/async.rs), so the
/// window still reports the old values right after the call; the reply shows the requested ones.
/// (A maximize reports maximized: true; the zoomed frame is only known once it happened.)
#[derive(Default)]
struct Requested<'a> {
  title: Option<&'a str>,
  size: Option<(f64, f64)>,
  position: Option<(f64, f64)>,
  maximized: Option<bool>,
  minimized: Option<bool>,
  fullscreen: Option<bool>,
}

/// Logical inner size. On macOS wry replaces the window's content view with its own parent
/// view, so tao's inner_size() (and the size in its Resized events) keeps reporting the size
/// the window was created with. The webview fills the window, so its frame is the inner size;
/// tauri-runtime-wry does the same (src/lib.rs:578-590, 5314-5329).
fn inner_size(window: &tao::window::Window, webview: Option<&WebView>) -> LogicalSize<f64> {
  #[cfg(target_os = "macos")]
  if let Some(wv) = webview {
    use wry::WebViewExtMacOS;
    let frame = wv.webview().frame();
    return LogicalSize::new(frame.size.width, frame.size.height);
  }
  let _ = webview;
  window.inner_size().to_logical(window.scale_factor())
}

fn theme_name(theme: tao::window::Theme) -> &'static str {
  match theme {
    tao::window::Theme::Dark => "dark",
    _ => "light",
  }
}

/// The theme a window is drawn in. Linux: TAO's answer is Light unless the app set one (its portal
/// code needs its dbus feature), so the shell's own reading of GTK and the portal counts.
fn window_theme(window: &tao::window::Window) -> tao::window::Theme {
  #[cfg(target_os = "linux")]
  {
    let _ = window;
    linux::appearance::theme()
  }
  #[cfg(not(target_os = "linux"))]
  window.theme()
}

fn window_state_with(window: &tao::window::Window, webview: Option<&WebView>, req: &Requested) -> String {
  let scale = window.scale_factor();
  let (width, height) = req.size.unwrap_or_else(|| {
    let size = inner_size(window, webview);
    (size.width, size.height)
  });
  let (x, y) = req
    .position
    .or_else(|| window.outer_position().ok().map(|p| { let l = p.to_logical::<f64>(scale); (l.x, l.y) }))
    .unwrap_or((0.0, 0.0));
  format!(
    r#"{{"x":{x},"y":{y},"width":{width},"height":{height},"maximized":{},"minimized":{},"fullscreen":{},"focused":{},"visible":{},"theme":"{}","title":{}}}"#,
    req.maximized.unwrap_or_else(|| window.is_maximized()),
    req.minimized.unwrap_or_else(|| window.is_minimized()),
    req.fullscreen.unwrap_or_else(|| window.fullscreen().is_some()),
    window.is_focused(),
    window.is_visible(),
    theme_name(window_theme(window)),
    json::quote(req.title.map(str::to_string).unwrap_or_else(|| window.title()).as_str())
  )
}

/// One window's shell op: everything but the ops on the set of windows (Windows::shell).
fn window_op(window: &tao::window::Window, webview: Option<&WebView>, cmd: &json::V, op: &str) -> Result<String, String> {
  let num = |k: &str| cmd.get(k).and_then(|v| v.as_f64()).ok_or_else(|| format!("{k} must be a number"));
  let flag = |k: &str| cmd.get(k).and_then(|v| v.as_bool()).ok_or_else(|| format!("{k} must be a boolean"));
  let mut req = Requested::default();
  match op {
    "window.getState" => return Ok(window_state(window, webview)),
    "window.setTitle" => {
      let title = cmd.get("title").and_then(|v| v.as_str()).ok_or("title must be a string")?;
      window.set_title(title);
      req.title = Some(title);
    }
    "window.setSize" => {
      let (w, h) = (num("width")?, num("height")?);
      if !(w >= 1.0 && h >= 1.0) {
        return Err("width and height must be positive".into());
      }
      window.set_inner_size(LogicalSize::new(w, h));
      req.size = Some((w.max(MIN_INNER.0), h.max(MIN_INNER.1)));
    }
    "window.setPosition" => {
      let (x, y) = (num("x")?, num("y")?);
      window.set_outer_position(tao::dpi::LogicalPosition::new(x, y));
      req.position = Some((x, y));
    }
    "window.center" => {
      if let Some(monitor) = window.current_monitor() {
        let scale = window.scale_factor();
        let screen = monitor.size().to_logical::<f64>(monitor.scale_factor());
        let origin = monitor.position().to_logical::<f64>(monitor.scale_factor());
        let size = window.outer_size().to_logical::<f64>(scale);
        let (x, y) = (origin.x + (screen.width - size.width) / 2.0, origin.y + (screen.height - size.height) / 2.0);
        window.set_outer_position(tao::dpi::LogicalPosition::new(x, y));
        req.position = Some((x, y));
      }
    }
    "window.minimize" => {
      window.set_minimized(true);
      req.minimized = Some(true);
    }
    "window.maximize" => {
      window.set_maximized(true);
      req.maximized = Some(true);
    }
    "window.unmaximize" => {
      window.set_maximized(false);
      req.maximized = Some(false);
    }
    "window.restore" => {
      window.set_minimized(false);
      window.set_maximized(false);
      window.set_focus();
      (req.minimized, req.maximized) = (Some(false), Some(false));
    }
    "window.setFullscreen" => {
      let value = flag("value")?;
      window.set_fullscreen(if value { Some(tao::window::Fullscreen::Borderless(None)) } else { None });
      req.fullscreen = Some(value);
    }
    "window.setAlwaysOnTop" => window.set_always_on_top(flag("value")?),
    "window.show" => window.set_visible(true),
    "window.hide" => window.set_visible(false),
    "window.focus" => window.set_focus(),
    // Unlike window.restore, keeps a maximized window maximized (single-instance).
    "window.unminimize" => {
      window.set_minimized(false);
      req.minimized = Some(false);
    }
    // D3: must run while the left button is still down (tao drag_window docs); the page calls it on mousedown.
    "window.startDragging" => window.drag_window().map_err(|e| e.to_string())?,
    _ => return Err(format!("unknown op {op}")),
  }
  Ok(window_state_with(window, webview, &req))
}

// ───────────────────────── config ─────────────────────────

struct Config {
  title: String,
  width: f64,
  height: f64,
  app_dir: PathBuf,
  init_js: String,
  devtools: bool,
  menu: bool,
  background_light: (u8, u8, u8, u8),
  background_dark: (u8, u8, u8, u8),
  /// "regular" | "prohibited" (tests: do not steal focus)
  activation: String,
  /// Saved outer position from the launch phase (window-state), logical points.
  position: Option<(f64, f64)>,
  maximized: bool,
  /// akan-native dev --hmr (dev builds only, main.ts): pages come from this gateway (devproxy.rs).
  dev_server: Option<String>,
  /// The main window's first page (dev builds only, main.ts), e.g. the page a framework's dev server answers.
  start_path: String,
  /// Where the webview keeps its storage and cache (Windows, Linux; WKWebView picks its own).
  data_dir: Option<PathBuf>,
  /// Window icon (Windows, Linux): [u32 width LE][u32 height LE][RGBA], written by the CLI.
  icon: Option<PathBuf>,
  /// app.id (Linux: the desktop entry the dock plugin's launcher badge names).
  app_id: String,
  /// security.shell.externalSchemes (L0): schemes links may also hand to the OS (navigation.rs).
  external_schemes: Vec<String>,
  /// desktop.recovery "reload": a page that ends is always loaded again, and a browser process that ends
  /// is the host's to relaunch (host.ts), instead of an error page and a quit.
  recovery_reload: bool,
  /// The main window from its first frame (desktop.window, or the launch phase): borderless fullscreen on
  /// the display it is placed on, and no taskbar button (Windows, Linux).
  fullscreen: bool,
  skip_taskbar: bool,
  /// desktop.screenCapture "auto" (Windows): the page captures the first screen without the picker.
  screen_capture_auto: bool,
}

#[derive(Clone, Copy, PartialEq)]
struct Colors {
  light: (u8, u8, u8, u8),
  dark: (u8, u8, u8, u8),
}

/// SH-3 background for the current appearance, on the window and the webview.
fn paint(window: &tao::window::Window, webview: Option<&WebView>, colors: &Colors, dark: bool) {
  let c = if dark { colors.dark } else { colors.light };
  window.set_background_color(Some(c));
  if let Some(wv) = webview {
    let _ = wv.set_background_color(c);
  }
}

fn parse_color(s: &str) -> Option<(u8, u8, u8, u8)> {
  let hex = s.strip_prefix('#')?;
  let byte = |i: usize| u8::from_str_radix(hex.get(i..i + 2)?, 16).ok();
  match hex.len() {
    6 => Some((byte(0)?, byte(2)?, byte(4)?, 255)),
    8 => Some((byte(0)?, byte(2)?, byte(4)?, byte(6)?)),
    _ => None,
  }
}

fn parse_config(s: &str) -> Result<Config, String> {
  let j = json::parse(s)?;
  let get_s = |k: &str| j.get(k).and_then(|v| v.as_str()).map(str::to_string);
  let get_n = |k: &str, d: f64| j.get(k).and_then(|v| v.as_f64()).unwrap_or(d);
  let get_b = |k: &str, d: bool| j.get(k).and_then(|v| v.as_bool()).unwrap_or(d);
  let light = get_s("backgroundColor").and_then(|c| parse_color(&c)).unwrap_or((255, 255, 255, 255));
  Ok(Config {
    title: get_s("title").unwrap_or_else(|| "akan-native".into()),
    width: get_n("width", 1024.0),
    height: get_n("height", 720.0),
    app_dir: PathBuf::from(get_s("appDir").ok_or("appDir is required")?),
    init_js: get_s("initJs").ok_or("initJs is required")?,
    devtools: get_b("devtools", false),
    menu: get_b("menu", true),
    background_light: light,
    background_dark: get_s("backgroundColorDark").and_then(|c| parse_color(&c)).unwrap_or(light),
    activation: get_s("activation").unwrap_or_else(|| "regular".into()),
    position: match (j.get("x").and_then(|v| v.as_f64()), j.get("y").and_then(|v| v.as_f64())) {
      (Some(x), Some(y)) if x.is_finite() && y.is_finite() => Some((x, y)),
      _ => None,
    },
    maximized: get_b("maximized", false),
    dev_server: get_s("devServer"),
    start_path: match get_s("startPath") {
      Some(path) if is_app_path(&path) => path,
      Some(path) => return Err(format!("startPath must be an app path like /settings, not {path:?}")),
      None => "/".into(),
    },
    data_dir: get_s("dataDir").map(PathBuf::from),
    icon: get_s("icon").map(PathBuf::from),
    app_id: get_s("appId").unwrap_or_default(),
    external_schemes: match j.get("externalSchemes") {
      Some(json::V::Arr(a)) => a.iter().filter_map(|v| v.as_str().map(str::to_string)).collect(),
      _ => Vec::new(),
    },
    recovery_reload: match get_s("recovery").as_deref() {
      None | Some("errorPage") => false,
      Some("reload") => true,
      Some(other) => return Err(format!("recovery must be \"errorPage\" or \"reload\", not {other:?}")),
    },
    fullscreen: get_b("fullscreen", false),
    skip_taskbar: get_b("skipTaskbar", false),
    screen_capture_auto: match get_s("screenCapture").as_deref() {
      None | Some("picker") => false,
      Some("auto") => true,
      Some(other) => return Err(format!("screenCapture must be \"picker\" or \"auto\", not {other:?}")),
    },
  })
}

// ───────────────────────── custom protocol ─────────────────────────

fn text(status: u16, body: &str) -> Response<Vec<u8>> {
  Response::builder().status(status).header(CONTENT_TYPE, "text/plain; charset=utf-8").body(body.as_bytes().to_vec()).unwrap()
}

/// Reads a file off the main thread, then responds on the main thread. A Range request reads only
/// that part (at most contract::MAX_RANGE_BYTES, Tauri's 1000 KiB: media elements ask for the rest,
/// so a large video is read piece by piece); a request without one gets the whole file.
fn respond_file(responder: RequestAsyncResponder, path: PathBuf, mime: String, kind: Served, range: Option<String>) {
  std::thread::spawn(move || {
    let resp = match read_file(&path, &mime, kind, range.as_deref()) {
      Ok(resp) => resp,
      Err(e) if e.kind() == std::io::ErrorKind::NotFound => text(404, "not found"),
      Err(e) => text(500, &e.to_string()),
    };
    send(UserEvent::Respond(responder, resp));
  });
}

/// What a file response is: an app asset (index.html is not cached) or a FileRef, which a plugin
/// registered and whose content the app does not control.
#[derive(Clone, Copy, PartialEq, Eq)]
enum Served {
  Asset,
  Index,
  FileRef,
}

/// A FileRef bigger than this, requested without Range, gets a warning (read_file).
const LARGE_WHOLE_FILE: u64 = 32 << 20;

fn read_file(path: &Path, mime: &str, kind: Served, range: Option<&str>) -> std::io::Result<Response<Vec<u8>>> {
  use std::io::{Read, Seek, SeekFrom};
  let mut file = std::fs::File::open(path)?;
  let total = file.metadata()?.len();
  let mut b = Response::builder().header(CONTENT_TYPE, mime).header("Accept-Ranges", "bytes");
  if kind == Served::Index {
    b = b.header("Cache-Control", "no-cache");
  }
  // A FileRef (a picked, downloaded or written file) is never the app's document: no MIME sniffing,
  // not embeddable by other origins, and anything but plain media opens sandboxed, with an opaque
  // origin that neither the bridge nor the page trusts (kernel.ts fileRefSandboxed; N1).
  if kind == Served::FileRef {
    b = b.header("X-Content-Type-Options", "nosniff").header("Cross-Origin-Resource-Policy", "same-origin");
    if routes::file_ref_sandboxed(mime) {
      b = b.header("Content-Security-Policy", "sandbox");
    }
  }
  // A header that is not one supported range is ignored (kernel.ts parseRange): the whole file.
  let (b, body) = match parse_range(range, total) {
    RangeAnswer::Whole => {
      // WRY has no streaming responses: a whole file is read into memory. Big FileRefs should be
      // read in Range pieces (fileStream / fileBlob in @akanjs/native/core; architecture review stage 4).
      if kind == Served::FileRef && total > LARGE_WHOLE_FILE {
        eprintln!("[akan-native] {} ({} MB) was requested whole: read big files with fileStream() from @akanjs/native/core (Range requests)", path.display(), total >> 20);
      }
      let mut bytes = Vec::with_capacity((total as usize).min(64 << 20));
      file.read_to_end(&mut bytes)?;
      (b.status(200), bytes)
    }
    RangeAnswer::Part(start, end) => {
      let mut bytes = vec![0; (end - start + 1) as usize];
      file.seek(SeekFrom::Start(start))?;
      file.read_exact(&mut bytes)?;
      (b.status(206).header("Content-Range", format!("bytes {start}-{end}/{total}")), bytes)
    }
    RangeAnswer::Unsatisfiable => (b.status(416).header("Content-Range", format!("bytes */{total}")), Vec::new()),
  };
  // A registered file's type comes from a plugin: one that is no valid header value is a 500, not a panic.
  Ok(b.body(body).unwrap_or_else(|e| text(500, &e.to_string())))
}

/// SEC-1: WebKit sends no Origin header on same-origin fetch POSTs to a custom scheme, only a
/// Referer; opaque-origin frames send `Origin: null` or `Referer: about:srcdoc`. Custom schemes
/// get no CORS preflight, so the header check is the gate (docs/research/desktop-macos.md §4.4).
fn ipc_allowed(req: &Request<Vec<u8>>) -> bool {
  let header = |name: &str| req.headers().get(name).and_then(|v| v.to_str().ok()).unwrap_or("");
  let origin = header("origin");
  // WebView2 (Chromium) always sends Origin on a POST; WebKit only a Referer on the same origin.
  let origin_ok = if origin.is_empty() { header("referer").strip_prefix(ORIGIN).is_some_and(|path| path.is_empty() || path.starts_with('/')) } else { origin == ORIGIN };
  origin_ok && req.headers().contains_key("x-akan-native-ipc")
}

/// Request headers the dev gateway does not get: devproxy writes the framing ones itself, and no validators, since
/// the answer is never a 304. Everything else goes, authorization included, as the iOS and Android hosts pass it.
const DEV_SKIP: [&str; 8] = [
  "host",
  "connection",
  "keep-alive",
  "content-length",
  "transfer-encoding",
  "accept-encoding",
  "if-none-match",
  "if-modified-since",
];
/// Hop-by-hop and framing headers of the gateway's reply: WebKit gets the decoded body as it is.
const DEV_DROP: [&str; 5] = ["connection", "keep-alive", "transfer-encoding", "content-length", "content-encoding"];
static DEV_WARNED: AtomicBool = AtomicBool::new(false);

/// Fetches an app:// request from the dev gateway (akan-native dev --hmr). Runs on its own thread.
fn dev_fetch(base: &str, req: &Request<Vec<u8>>) -> Result<Response<Vec<u8>>, String> {
  use wry::http::header::{HeaderName, HeaderValue};
  let authority = devproxy::authority(base).ok_or_else(|| format!("devServer {base:?} is not http://127.0.0.1:<port>"))?;
  let target = req.uri().path_and_query().map_or("/", |p| p.as_str());
  let headers: Vec<(String, String)> = req
    .headers()
    .iter()
    .filter(|(name, _)| !DEV_SKIP.contains(&name.as_str()))
    .filter_map(|(name, value)| Some((name.as_str().to_string(), value.to_str().ok()?.to_string())))
    .collect();
  let reply = devproxy::fetch(authority, req.method().as_str(), target, &headers, req.body())?;
  let mut builder = Response::builder().status(reply.status);
  for (name, value) in reply.headers {
    if DEV_DROP.iter().any(|d| name.eq_ignore_ascii_case(d)) {
      continue;
    }
    if let (Ok(name), Ok(value)) = (HeaderName::from_bytes(name.as_bytes()), HeaderValue::from_str(&value)) {
      builder = builder.header(name, value);
    }
  }
  builder.body(reply.body).map_err(|e| e.to_string())
}

fn handle_request(app_dir: &PathBuf, init_js: &str, dev_server: Option<&str>, webview_id: u32, req: Request<Vec<u8>>, responder: RequestAsyncResponder) {
  let path = req.uri().path().to_string();
  let range = req.headers().get("range").and_then(|v| v.to_str().ok()).map(str::to_string);
  // akan-native dev --hmr: everything outside /__akan_native/* comes from the dev gateway; the page stays on
  // app://localhost. Without the gateway (akan-native dev ended) the bundled files are served.
  if let Some(base) = dev_server.filter(|_| !is_host_path(&path)) {
    let (base, app_dir) = (base.to_string(), app_dir.clone());
    std::thread::spawn(move || match dev_fetch(&base, &req) {
      Ok(resp) => send(UserEvent::Respond(responder, resp)),
      Err(e) => {
        if !DEV_WARNED.swap(true, Ordering::AcqRel) {
          log!("dev server {base}: {e}; serving the bundled files");
        }
        match route(&path, |rel| asset_path(&app_dir, rel).is_some_and(|p| p.is_file())) {
          Route::Asset(rel) => {
            let mime = asset_mime(&rel);
            respond_asset(responder, &app_dir, &rel, mime, range);
          }
          _ => send(UserEvent::Respond(responder, text(404, "not found"))),
        }
      }
    });
    return;
  }
  let exists = |rel: &str| asset_path(app_dir, rel).is_some_and(|p| p.is_file());
  match route(&path, exists) {
    // Every window gets the same boot data plus its own id (Tauri injects the current window
    // label the same way, tauri/crates/tauri/src/manager/webview.rs:186-191).
    Route::Init => responder.respond(
      Response::builder()
        .status(200)
        .header(CONTENT_TYPE, "text/javascript; charset=utf-8")
        .header("Cache-Control", "no-cache")
        .body(format!("{init_js}window.__AKAN_NATIVE__.windowId={webview_id};{}\n", engine_info()).into_bytes())
        .unwrap(),
    ),
    Route::Ipc => {
      if req.method() != "POST" {
        return responder.respond(text(405, "POST only"));
      }
      if !ipc_allowed(&req) {
        log!("IPC rejected: origin={:?} referer={:?}", req.headers().get("origin"), req.headers().get("referer"));
        return responder.respond(text(403, "forbidden"));
      }
      if WAKE.load(Ordering::Acquire) == 0 {
        return responder.respond(text(503, "akan-native host is not running"));
      }
      // A page calling in a loop faster than the host answers must not grow memory without end.
      if PENDING.lock().unwrap().len() >= MAX_PENDING || QUEUE.lock().unwrap().items.len() >= MAX_PENDING {
        return responder.respond(text(503, "the plugin host is busy"));
      }
      let id = NEXT_REQ.fetch_add(1, Ordering::Relaxed);
      PENDING.lock().unwrap().insert(id, (webview_id, responder));
      push(frame(KIND_IPC, id, webview_id, req.body()));
    }
    Route::File(id) => {
      let entry = FILES.lock().unwrap().get(&id).cloned();
      match entry {
        Some((path, mime)) => respond_file(responder, path, mime, Served::FileRef, range),
        None => responder.respond(text(404, "not found")),
      }
    }
    Route::Asset(rel) => {
      let mime = asset_mime(&rel);
      respond_asset(responder, app_dir, &rel, mime, range);
    }
    Route::Hello | Route::NotFound => responder.respond(text(404, "not found")),
  }
}

/// `rel` (from route()) inside `app_dir`, or None unless it is only plain names. A second guard
/// behind route(): Path::join drops the base for an absolute path, and on Windows for a drive
/// prefix ("C:/Users/…"), which would serve any file the user can read.
fn asset_path(app_dir: &Path, rel: &str) -> Option<PathBuf> {
  let path = Path::new(rel);
  path.components().all(|c| matches!(c, Component::Normal(_))).then(|| app_dir.join(path))
}

fn respond_asset(responder: RequestAsyncResponder, app_dir: &Path, rel: &str, mime: String, range: Option<String>) {
  match asset_path(app_dir, rel) {
    Some(path) => respond_file(responder, path, mime, if rel == "index.html" { Served::Index } else { Served::Asset }, range),
    None => send(UserEvent::Respond(responder, text(404, "not found"))),
  }
}

fn in_app(url: &str) -> bool {
  on_origin(url) || url.starts_with("about:")
}

/// Hands a link to the OS (navigation.rs): http(s) to the browser, mailto and tel to their apps.
/// Any other scheme is refused, so the page cannot start other programs this way.
fn open_external(url: &str) {
  if !navigation::opens_externally(url) {
    log!("not opening {}: only http, https, mailto, tel and security.shell.externalSchemes links leave the app", navigation::shown(url));
    return;
  }
  if !navigation::external_open_allowed() {
    log!("not opening {}: at most one link per second leaves the app", navigation::shown(url));
    return;
  }
  push_event(&format!(r#"{{"type":"external","url":{}}}"#, json::quote(url)));
  #[cfg(target_os = "macos")]
  macos::open_url(url);
  #[cfg(target_os = "windows")]
  win::open_url(url);
  #[cfg(target_os = "linux")]
  linux::open_url(url);
}

/// Op families of the plugins' native parts (menu.rs, tray.rs, … on macOS; win/, linux/).
#[cfg(not(target_os = "macos"))]
const PLATFORM_OPS: [&str; 12] = ["menu.", "tray.", "hotkey.", "dock.", "screen.", "notify.", "camera.", "panel.", "alert.", "autostart.", "keychain.", "clipboard."];
#[cfg(target_os = "windows")]
const OS_NAME: &str = "Windows";
#[cfg(target_os = "linux")]
const OS_NAME: &str = "Linux";

// ───────────────────────── windows ─────────────────────────
// SH-6 multi-window. Window ids are u32; the window akan_native_run opens is 1, window.create hands out
// 2, 3, … (never reused). A window and its webview share the id: the webview id is the frame's
// webviewId, the `window` field of native events and the `window` argument of shell ops.

/// What every window is built from.
struct Shell {
  app_dir: PathBuf,
  init_js: Arc<str>,
  dev_server: Option<Arc<str>>,
  devtools: bool,
  colors: Colors,
  title: String,
  size: (f64, f64),
  /// false: `akan-native test` runs; showing a window does not take focus from the user's app.
  activate: bool,
  icon: Option<tao::window::Icon>,
  #[cfg_attr(not(target_os = "linux"), allow(dead_code))]
  app_id: String,
  recovery_reload: bool,
  #[cfg_attr(not(target_os = "windows"), allow(dead_code))]
  screen_capture_auto: bool,
}

/// The CLI's icon.rgba (icons.ts windowIcon) as a tao icon.
fn read_icon(path: &std::path::Path) -> Option<tao::window::Icon> {
  let bytes = std::fs::read(path).map_err(|e| log!("icon {}: {e}", path.display())).ok()?;
  let size = |at: usize| bytes.get(at..at + 4).map(|b| u32::from_le_bytes(b.try_into().unwrap()));
  let (width, height) = (size(0)?, size(4)?);
  tao::window::Icon::from_rgba(bytes[8..].to_vec(), width, height).map_err(|e| log!("icon {}: {e}", path.display())).ok()
}

struct WindowOptions {
  /// App path, e.g. "/settings?tab=2" (always on the app origin).
  path: String,
  title: Option<String>,
  size: Option<(f64, f64)>,
  position: Option<(f64, f64)>,
  maximized: bool,
  fullscreen: bool,
  /// macOS has no taskbar: its Dock shows apps, not windows.
  #[cfg_attr(target_os = "macos", allow(dead_code))]
  skip_taskbar: bool,
}

/// One window. The webview is declared first so that it is dropped before its window.
struct Win {
  webview: WebView,
  window: tao::window::Window,
  /// When its page was last loaded again after its web content process ended: an end within a minute
  /// of that shows an error page (a page that crashes on load would loop), or with desktop.recovery
  /// "reload" waits longer before the next load (recovery_wait).
  reloaded_at: Option<std::time::Instant>,
  /// Ends in a row, each within a minute of the load before (desktop.recovery "reload").
  gone_streak: u32,
  /// A reload is waiting out recovery_wait: ends reported meanwhile (an unresponsive page repeats its report) are
  /// the same end, and must neither raise the streak nor start a second wait.
  reload_pending: bool,
}

struct Windows {
  shell: Shell,
  /// Shared by all webviews: one data directory, and on Linux one registration of the app scheme.
  web_context: wry::WebContext,
  map: HashMap<u32, Win>,
  /// Destroyed, hidden, and unloading their page before they are dropped (Windows::destroy).
  closing: HashMap<u32, Win>,
  ids: HashMap<tao::window::WindowId, u32>,
  /// Ids by last focus, most recent last.
  focus: Vec<u32>,
  next: u32,
}

fn is_dark() -> bool {
  #[cfg(target_os = "macos")]
  return macos::is_dark_mode();
  #[cfg(not(target_os = "macos"))]
  false
}

fn monitors(target: &EventLoopWindowTarget<UserEvent>) -> Vec<placement::Rect> {
  target.available_monitors().map(|m| logical_rect(&m)).collect()
}

fn logical_rect(m: &tao::monitor::MonitorHandle) -> placement::Rect {
  let scale = m.scale_factor();
  let (p, s) = (m.position().to_logical::<f64>(scale), m.size().to_logical::<f64>(scale));
  placement::Rect { x: p.x, y: p.y, width: s.width, height: s.height }
}

/// The display holding a logical point.
fn monitor_at(target: &EventLoopWindowTarget<UserEvent>, x: f64, y: f64) -> Option<tao::monitor::MonitorHandle> {
  target.available_monitors().find(|m| {
    let r = logical_rect(m);
    x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height
  })
}

/// desktop.recovery "reload": how long to wait before loading a page again after `streak` ends in a
/// row. The first end reloads at once; then 1 s, doubling to a minute.
fn recovery_wait(streak: u32) -> Option<std::time::Duration> {
  (streak > 0).then(|| std::time::Duration::from_secs((1u64 << (streak - 1).min(6)).min(60)))
}

/// Drops the webview's pending bridge calls (main thread): its document is gone.
/// Each window's current top-level page (Linux: its permission requests do not say which frame asks).
#[cfg(target_os = "linux")]
static TOP_URLS: Mutex<Option<HashMap<u32, String>>> = Mutex::new(None);

/// The web content's permission requests (L0: the app origin's main frame only).
fn permission_for(id: u32, kind: PermissionKind) -> PermissionResponse {
  let _ = id;
  match kind {
    // macOS already asked the user (TCC prompt, NSCameraUsageDescription) before this runs, and
    // only the app origin's main frame gets it (navigation.rs mac::media_trusted).
    #[cfg(target_os = "macos")]
    PermissionKind::Camera | PermissionKind::Microphone => {
      if navigation::mac::media_trusted() { PermissionResponse::Allow } else { PermissionResponse::Deny }
    }
    // WebKitGTK does not say which frame asks: allow only while the window's page is the app's
    // (navigation.rs keeps it there); WebKit's Permissions Policy keeps camera and microphone
    // from cross-origin frames unless the page grants them with allow=. Linux has no OS prompt.
    #[cfg(target_os = "linux")]
    PermissionKind::Camera | PermissionKind::Microphone => {
      let top = TOP_URLS.lock().unwrap_or_else(|e| e.into_inner()).as_ref().and_then(|m| m.get(&id).cloned()).unwrap_or_default();
      if on_origin(&top) { PermissionResponse::Allow } else { PermissionResponse::Deny }
    }
    // Screen sharing is never given on its own, nor anything this code does not know.
    #[cfg(target_os = "linux")]
    PermissionKind::DisplayCapture | PermissionKind::Other => PermissionResponse::Deny,
    // WebView2 asks the user itself, naming the origin, and remembers the answer (Default).
    _ => PermissionResponse::Default,
  }
}

/// init.js's tail: the shell's origin and engine, one value every origin comparison uses
/// (`__AKAN_NATIVE__.origin`), and what the page runs in.
fn engine_info() -> &'static str {
  static INFO: std::sync::OnceLock<String> = std::sync::OnceLock::new();
  INFO.get_or_init(|| {
    let engine = if cfg!(target_os = "windows") { "webview2" } else if cfg!(target_os = "macos") { "wkwebview" } else { "webkitgtk" };
    let version = engine_version().unwrap_or_default();
    format!("window.__AKAN_NATIVE__.origin={};window.__AKAN_NATIVE__.engine=\"{engine}\";window.__AKAN_NATIVE__.engineVersion={};", json::quote(ORIGIN), json::quote(&version))
  })
}

/// The engine's version: WebView2's runtime, WebKitGTK's, or on macOS the system WebKit's (which
/// Safari updates bring: its bundle version names it, as the device plugin reports).
fn engine_version() -> Option<String> {
  #[cfg(target_os = "windows")]
  return win::device::webview_version();
  #[cfg(target_os = "linux")]
  return wry::webview_version().ok();
  #[cfg(target_os = "macos")]
  {
    let plist = std::fs::read_to_string("/Applications/Safari.app/Contents/Info.plist").ok()?;
    let after = plist.split("<key>CFBundleShortVersionString</key>").nth(1)?;
    let value = after.split("<string>").nth(1)?.split("</string>").next()?;
    Some(value.trim().to_string())
  }
}

/// What a window shows when its page's process ended twice within a minute (N2).
fn gone_page() -> String {
  format!(
    r#"<!doctype html><meta charset="utf-8"><meta name="color-scheme" content="light dark"><title>This window stopped working</title>
<body style="font:15px system-ui;display:grid;place-items:center;height:90vh;margin:0"><div style="text-align:center">
<p>This window stopped working.</p><p><a href="{ORIGIN}/">Reload</a></p></div></body>"#
  )
}

/// Tells when a window's web content process ends (Windows: ProcessFailed; Linux:
/// web-process-terminated; macOS: the builder's handler).
fn watch_web_process(webview: &WebView, id: u32) {
  #[cfg(target_os = "windows")]
  {
    use webview2_com::{Microsoft::Web::WebView2::Win32::*, ProcessFailedEventHandler};
    use wry::WebViewExtWindows;
    let handler = ProcessFailedEventHandler::create(Box::new(move |_, args| {
      let Some(args) = args else { return Ok(()) };
      let mut kind = COREWEBVIEW2_PROCESS_FAILED_KIND_RENDER_PROCESS_EXITED;
      unsafe { args.ProcessFailedKind(&mut kind)? };
      let reason = match kind {
        COREWEBVIEW2_PROCESS_FAILED_KIND_BROWSER_PROCESS_EXITED => "browserExited",
        COREWEBVIEW2_PROCESS_FAILED_KIND_RENDER_PROCESS_EXITED => "crashed",
        COREWEBVIEW2_PROCESS_FAILED_KIND_RENDER_PROCESS_UNRESPONSIVE => "unresponsive",
        _ => return Ok(()), // a frame's, the GPU's or a utility process: WebView2 recovers by itself
      };
      send(UserEvent::WebviewGone { window: id, reason });
      Ok(())
    }));
    let mut token = 0;
    if let Err(e) = unsafe { webview.webview().add_ProcessFailed(&handler, &mut token) } {
      log!("window {id}: web process failures are not watched: {e}");
    }
  }
  #[cfg(target_os = "linux")]
  {
    use webkit2gtk::{WebProcessTerminationReason, WebViewExt};
    use wry::WebViewExtUnix;
    webview.webview().connect_web_process_terminated(move |_, reason| {
      let reason = match reason {
        WebProcessTerminationReason::ExceededMemoryLimit => "oom",
        WebProcessTerminationReason::TerminatedByApi => "killed",
        _ => "crashed",
      };
      send(UserEvent::WebviewGone { window: id, reason });
    });
  }
  let _ = (webview, id);
}

fn drop_pending(webview: u32) {
  PENDING.lock().unwrap().retain(|_, (w, _)| *w != webview);
}

fn open_window(target: &EventLoopWindowTarget<UserEvent>, shell: &Shell, context: &mut wry::WebContext, id: u32, opts: WindowOptions) -> Result<Win, String> {
  // SH-3: paint the window and the webview before the first frame (no white flash).
  #[allow(unused_mut)]
  let mut background = if is_dark() { shell.colors.dark } else { shell.colors.light };
  let (width, height) = opts.size.unwrap_or(shell.size);
  let mut builder = WindowBuilder::new()
    .with_title(opts.title.as_deref().unwrap_or(&shell.title))
    .with_inner_size(LogicalSize::new(width, height))
    .with_min_inner_size(LogicalSize::new(MIN_INNER.0, MIN_INNER.1))
    .with_background_color(background)
    // D2: stay hidden until the first page load finished, so no blank frame is ever shown.
    .with_visible(false)
    .with_window_icon(shell.icon.clone());
  // Reopen where asked, unless that display is gone (placement.rs; window-state for window 1).
  // Not WindowBuilder::with_position: on macOS tao takes that as the content's top-left corner
  // (tao/src/platform_impl/macos/window.rs:202-208), so the title bar would end up above it;
  // window.getState reports the outer position, and set_outer_position takes one.
  let mut outer_position = None;
  let mut placed = None;
  if let Some((x, y)) = opts.position {
    let wanted = placement::Rect { x, y, width, height };
    match placement::place(wanted, &monitors(target), MIN_INNER) {
      Some(r) => {
        builder = builder.with_inner_size(LogicalSize::new(r.width, r.height));
        outer_position = Some(tao::dpi::LogicalPosition::new(r.x, r.y));
        placed = Some(r);
      }
      None => log!("window {id}: position ({x}, {y}) is on no display; using the default"),
    }
  }
  if opts.fullscreen {
    // Set before the first frame, on the display the window was placed on (else the primary one).
    let monitor = placed.and_then(|r| monitor_at(target, r.x + r.width / 2.0, r.y + r.height / 2.0));
    builder = builder.with_fullscreen(Some(tao::window::Fullscreen::Borderless(monitor)));
  }
  #[cfg(target_os = "windows")]
  if opts.skip_taskbar {
    use tao::platform::windows::WindowBuilderExtWindows;
    builder = builder.with_skip_taskbar(true);
  }
  #[cfg(target_os = "linux")]
  if opts.skip_taskbar {
    use tao::platform::unix::WindowBuilderExtUnix;
    builder = builder.with_skip_taskbar(true);
  }
  let window = builder.build(target).map_err(|e| format!("window: {e}"))?;
  // Windows and Linux: the system theme is known once a window exists (tao reads it then).
  #[cfg(not(target_os = "macos"))]
  if window_theme(&window) == tao::window::Theme::Dark && background != shell.colors.dark {
    background = shell.colors.dark;
    window.set_background_color(Some(background));
  }
  // Still hidden (D2), so nothing visibly moves. Both calls are queued on the main queue in
  // this order: the window zooms on the saved display, and un-zooming returns to these bounds.
  if let Some(position) = outer_position {
    window.set_outer_position(position);
  }
  if opts.maximized {
    window.set_maximized(true);
  }

  let app_dir = shell.app_dir.clone();
  let init_js = shell.init_js.clone();
  let dev_server = shell.dev_server.clone();
  let webview_id = id.to_string();
  // Linux: the scheme belongs to the shared context, so the first window registers it for all;
  // the handler tells windows apart by the webview id it is given (Windows::web_context).
  let register_scheme = !context.is_custom_protocol_registered("app");
  let mut builder = WebViewBuilder::new_with_web_context(context);
  // `akan-native test` (dev builds only): WebKit suspends a page whose window is covered by other apps
  // (visibilityState "hidden"), which stalled the self-test at the first sheet whenever the test
  // window opened behind the user's work. WRY sets WKPreferences.inactiveSchedulingPolicy (macOS 14+).
  if shell.devtools && std::env::var_os("AKAN_NATIVE_TEST_NO_THROTTLING").is_some() {
    builder = builder.with_background_throttling(wry::BackgroundThrottlingPolicy::Disabled);
  }
  if register_scheme {
    builder = builder.with_asynchronous_custom_protocol("app".into(), move |webview, req, responder| {
      handle_request(&app_dir, &init_js, dev_server.as_deref(), webview.parse().unwrap_or(id), req, responder)
    });
  }
  #[cfg(target_os = "windows")]
  let builder = {
    use wry::WebViewBuilderExtWindows;
    // Ctrl+R/F5, Ctrl+P, Ctrl+F, zoom and F12 are the browser's, not the app's: off in every build
    // (user decision 2026-09-26; page_menu.rs). Editing keys stay.
    let builder = builder.with_https_scheme(true).with_browser_accelerator_keys(false);
    // Dev builds: AKAN_NATIVE_WEBVIEW2_DEBUG_PORT opens the Chrome DevTools Protocol on that port, for
    // test automation. WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS does not apply: wry passes arguments of
    // its own, repeated here because these replace them (wry webview2/mod.rs, with autoplay on).
    let port = std::env::var("AKAN_NATIVE_WEBVIEW2_DEBUG_PORT").ok().filter(|_| shell.devtools).and_then(|p| p.parse::<u16>().ok());
    // desktop.screenCapture "auto": getDisplayMedia answers with the first screen, no picker, no user gesture. Not
    // --auto-select-desktop-capture-source: it matches the picker's title, which follows the UI language (verified).
    let capture = shell.screen_capture_auto.then(|| "--use-fake-ui-for-media-stream".to_string());
    let extra: Vec<String> = port.map(|p| format!("--remote-debugging-port={p}")).into_iter().chain(capture).collect();
    if extra.is_empty() {
      builder
    } else {
      builder.with_additional_browser_args(format!(
        "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --autoplay-policy=no-user-gesture-required {}",
        extra.join(" ")
      ))
    }
  };
  // SH-4: pages never leave the app origin (navigation.rs). Linux decides in its own signal handlers.
  #[cfg(not(target_os = "linux"))]
  let builder = builder.with_navigation_handler(|url| navigation::allow(&url));
  let builder = builder
    .with_id(&webview_id)
    .with_url(format!("{START_URL}{}", opts.path))
    .with_background_color(background)
    .with_devtools(shell.devtools)
    .with_new_window_req_handler(|url, _features| {
      // window.open and target=_blank: links go to the OS; the app's own pages open no second
      // window this way (the window plugin opens app windows).
      if in_app(&url) {
        log!("window.open({}) opens nothing: app windows come from the window plugin", navigation::shown(&url));
      } else {
        open_external(&url);
      }
      NewWindowResponse::Deny
    })
    .with_drag_drop_handler({
      let files = std::cell::Cell::new(false);
      #[cfg(target_os = "windows")]
      let hwnd = {
        use tao::platform::windows::WindowExtWindows;
        window.hwnd()
      };
      move |event| {
        // WebView2's positions are physical pixels: the window's DPI now (it can move between screens).
        #[cfg(target_os = "windows")]
        let scale = match unsafe { windows::Win32::UI::HiDpi::GetDpiForWindow(windows::Win32::Foundation::HWND(hwnd as *mut _)) } {
          0 => 1.0,
          dpi => dpi as f64 / 96.0,
        };
        #[cfg(not(target_os = "windows"))]
        let scale = 1.0;
        if let Some(json) = drag_drop_event(id, &files, event, scale) {
          push_event(&json);
        }
        false // keep WebKit's own handling: HTML5 drop events with dataTransfer.files still work
      }
    })
    .with_permission_handler(move |kind| permission_for(id, kind))
    .with_on_page_load_handler(move |ev, url| {
      if url == "about:blank" {
        // Only a destroyed window loads it (Windows::destroy); not an app page.
        if matches!(ev, PageLoadEvent::Finished) {
          send(UserEvent::Unloaded(id));
        }
        return;
      }
      #[cfg(target_os = "linux")]
      TOP_URLS.lock().unwrap_or_else(|e| e.into_inner()).get_or_insert_with(HashMap::new).insert(id, url.clone());
      let e = match ev {
        PageLoadEvent::Started => {
          // New document: pending bridge calls of the previous page can never be answered.
          drop_pending(id);
          "started"
        }
        PageLoadEvent::Finished => {
          send(UserEvent::Show(id));
          "finished"
        }
      };
      push_event(&format!(r#"{{"type":"pageLoad","event":"{e}","window":{id},"url":{}}}"#, json::quote(&url)));
    });
  // macOS: WKWebView tells when its web content process ended; the other engines through watch_web_process.
  #[cfg(target_os = "macos")]
  let builder = {
    use wry::WebViewBuilderExtDarwin;
    builder.with_on_web_content_process_terminate_handler(move || send(UserEvent::WebviewGone { window: id, reason: "terminated" }))
  };
  // Linux: inside tao's GTK box, which works on Wayland as well as X11 (wry's build() is X11 only).
  #[cfg(target_os = "linux")]
  let webview = {
    use tao::platform::unix::WindowExtUnix;
    use wry::WebViewBuilderExtUnix;
    builder.build_gtk(window.default_vbox().ok_or("webview: the window has no GTK box")?)
  };
  #[cfg(not(target_os = "linux"))]
  let webview = builder.build(&window);
  let webview = webview.map_err(|e| format!("webview: {e}"))?;
  navigation::install(&webview);
  watch_web_process(&webview, id);
  // Release builds: the page's right-click menu without the browser's items.
  page_menu::install(shell.devtools, &webview);
  #[cfg(target_os = "macos")]
  js_panels::install(shell.devtools, &webview); // D7, once WRY's delegate class exists
  // D7 on Windows and Linux: the webview's own dialogs, answered by a timer under AKAN_NATIVE_TEST_PANELS.
  #[cfg(target_os = "linux")]
  linux::dialogs::install_js_dialogs(shell.devtools, &webview);
  #[cfg(target_os = "windows")]
  win::dialogs::install_js_dialogs(shell.devtools, &webview);
  // The app menu bar, menu accelerators and taskbar state of the menu and dock plugins.
  #[cfg(target_os = "linux")]
  linux::window_opened(id, &window);
  #[cfg(target_os = "windows")]
  win::window_opened(id, &window, &webview);
  // Show the window even if the page never finishes loading.
  std::thread::spawn(move || {
    std::thread::sleep(Duration::from_millis(3000));
    send(UserEvent::Show(id));
  });
  Ok(Win { webview, window, reloaded_at: None, gone_streak: 0, reload_pending: false })
}

/// A `window` argument: a positive whole number.
fn window_arg(cmd: &json::V) -> Result<Option<u32>, String> {
  match cmd.get("window") {
    None => Ok(None),
    Some(v) => match v.as_f64() {
      Some(n) if n >= 1.0 && n.fract() == 0.0 && n <= u32::MAX as f64 => Ok(Some(n as u32)),
      _ => Err("window must be a window id".into()),
    },
  }
}

/// window.create's `path`: an absolute path on the app origin.
fn app_path(cmd: &json::V) -> Result<String, String> {
  let Some(v) = cmd.get("path") else { return Ok("/".into()) };
  let path = v.as_str().ok_or("path must be a string")?;
  if !is_app_path(path) {
    return Err(format!("path must be an app path like /settings, not {path:?}"));
  }
  Ok(path.to_string())
}

fn is_app_path(path: &str) -> bool {
  path.starts_with('/') && !path.starts_with("//") && !path.contains('\\') && !path.chars().any(char::is_control)
}

impl Windows {
  fn insert(&mut self, id: u32, win: Win) {
    self.ids.insert(win.window.id(), id);
    self.map.insert(id, win);
  }

  /// Where ops without a `window` go (Dock reopen, single-instance, plugin setup): the most
  /// recently focused window, which is also the one macOS brings forward when the app is
  /// activated; before any focus change window 1, else the oldest.
  fn primary(&self) -> Option<u32> {
    self.focus.iter().rev().find(|id| self.map.contains_key(id)).copied().or_else(|| {
      if self.map.contains_key(&1) {
        Some(1)
      } else {
        self.map.keys().min().copied()
      }
    })
  }

  fn focused(&mut self, id: u32) {
    self.focus.retain(|&f| f != id);
    self.focus.push(id);
  }

  fn state(&self, id: u32, win: &Win) -> String {
    // {"id":N, ...state}
    format!(r#"{{"id":{id},{}"#, &window_state(&win.window, Some(&win.webview))[1..])
  }

  fn create(&mut self, target: &EventLoopWindowTarget<UserEvent>, cmd: &json::V) -> Result<String, String> {
    let pair = |a: &str, b: &str| -> Result<Option<(f64, f64)>, String> {
      match (cmd.get(a), cmd.get(b)) {
        (None, None) => Ok(None),
        (Some(x), Some(y)) => match (x.as_f64(), y.as_f64()) {
          (Some(x), Some(y)) if x.is_finite() && y.is_finite() => Ok(Some((x, y))),
          _ => Err(format!("{a} and {b} must be numbers")),
        },
        _ => Err(format!("give both {a} and {b}")),
      }
    };
    let size = pair("width", "height")?;
    if size.is_some_and(|(w, h)| !(w >= 1.0 && h >= 1.0)) {
      return Err("width and height must be positive".into());
    }
    let title = match cmd.get("title") {
      None => None,
      Some(v) => Some(v.as_str().ok_or("title must be a string")?.to_string()),
    };
    // Without a position, cascade from the focused window like AppKit does for new documents.
    let position = match pair("x", "y")? {
      Some(p) => Some(p),
      None => self.focus.iter().rev().find_map(|id| self.map.get(id)).and_then(|w| {
        let scale = w.window.scale_factor();
        w.window.outer_position().ok().map(|p| {
          let l = p.to_logical::<f64>(scale);
          (l.x + 28.0, l.y + 28.0)
        })
      }),
    };
    let id = self.next;
    self.next += 1;
    let win = open_window(target, &self.shell, &mut self.web_context, id, WindowOptions { path: app_path(cmd)?, title, size, position, maximized: false, fullscreen: false, skip_taskbar: false })?;
    let state = self.state(id, &win);
    self.insert(id, win);
    push_event(&format!(r#"{{"type":"window","event":"created","window":{id}}}"#));
    Ok(state)
  }

  fn destroy(&mut self, id: u32) -> Result<String, String> {
    if !self.map.contains_key(&id) {
      return Err(format!("no window {id}"));
    }
    if self.map.len() == 1 {
      return Err("the last window cannot be destroyed; hide it or quit".into());
    }
    let win = self.map.remove(&id).unwrap();
    self.ids.remove(&win.window.id());
    self.focus.retain(|&f| f != id);
    drop_pending(id);
    // wry keeps the WKWebView alive after its drop (it retains it and only removes it from the
    // window, wry/src/wkwebview/mod.rs:1433-1436), and a detached page keeps running (verified:
    // its timers went on). So hide the window now, let the page unload into about:blank, and drop
    // the window once that load finished (Unloaded).
    win.window.set_visible(false);
    let _ = win.webview.load_url("about:blank");
    self.closing.insert(id, win);
    std::thread::spawn(move || {
      std::thread::sleep(Duration::from_millis(1000));
      send(UserEvent::Unloaded(id));
    });
    push_event(&format!(r#"{{"type":"window","event":"destroyed","window":{id}}}"#));
    Ok(format!(r#"{{"id":{id}}}"#))
  }

  fn shell_op(&mut self, target: &EventLoopWindowTarget<UserEvent>, json: &str) -> Result<String, String> {
    let cmd = json::parse(json)?;
    let op = cmd.get("op").and_then(|v| v.as_str()).ok_or("op is required")?;
    match op {
      "window.create" => return self.create(target, &cmd),
      "window.list" => {
        let mut ids: Vec<u32> = self.map.keys().copied().collect();
        ids.sort_unstable();
        let list: Vec<String> = ids.iter().map(|id| self.state(*id, &self.map[id])).collect();
        return Ok(format!("[{}]", list.join(",")));
      }
      "window.destroy" => return self.destroy(window_arg(&cmd)?.ok_or("window is required")?),
      // Dev builds: the idle wake budget counters (the self-test's K-idle check).
      "debug.stats" if self.shell.devtools => return Ok(stats_json()),
      _ => {}
    }
    // App-wide ops, not a window's: menu, tray, global shortcut, dock, screen and volume plugins
    // (menu.rs, tray.rs, hotkey.rs, dock.rs, screen.rs, volume.rs).
    #[cfg(target_os = "macos")]
    if let Some(result) = menu::shell_op(op, &cmd)
      .or_else(|| tray::shell_op(op, &cmd, &self.shell.app_dir))
      .or_else(|| hotkey::shell_op(op, &cmd))
      .or_else(|| dock::shell_op(op, &cmd, target))
      .or_else(|| screen::shell_op(op, target))
      .or_else(|| volume::shell_op(op, &cmd))
    {
      return result;
    }
    // The same plugins on Windows and Linux (win/, linux/).
    #[cfg(target_os = "windows")]
    if let Some(result) = win::shell_op(op, &cmd, target, &self.shell) {
      return result;
    }
    #[cfg(target_os = "linux")]
    if let Some(result) = linux::shell_op(op, &cmd, target, &self.shell) {
      return result;
    }
    let id = match window_arg(&cmd)? {
      Some(id) => id,
      None => self.primary().ok_or("there is no window")?,
    };
    let win = self.map.get(&id).ok_or_else(|| format!("no window {id}"))?;
    // Dev builds (the self-test): end the window's web content process, as a crash would (N2).
    if op == "webview.crashForTest" && self.shell.devtools {
      #[cfg(target_os = "macos")]
      unsafe {
        use objc2::{msg_send, runtime::AnyObject, sel};
        use wry::WebViewExtMacOS;
        let wk = win.webview.webview();
        let wk: &AnyObject = &wk;
        let can: bool = msg_send![wk, respondsToSelector: sel!(_killWebContentProcess)];
        if !can {
          return Err("UNSUPPORTED: this WebKit cannot end its web content process".into());
        }
        let _: () = msg_send![wk, _killWebContentProcess];
        return Ok("null".into());
      }
      #[cfg(target_os = "linux")]
      {
        use webkit2gtk::WebViewExt;
        use wry::WebViewExtUnix;
        win.webview.webview().terminate_web_process();
        return Ok("null".into());
      }
      #[cfg(target_os = "windows")]
      return Err("UNSUPPORTED: not on Windows".into());
    }
    #[cfg(target_os = "windows")]
    if let Some(result) = win::window_op(op, &cmd, id, win) {
      return result;
    }
    #[cfg(target_os = "linux")]
    if let Some(result) = linux::window_op(op, &cmd, id, win) {
      return result;
    }
    // What the macOS shell has and this OS does not (yet): the plugin reports UNSUPPORTED. After
    // window_op, which takes the families' window ops (menu.popup).
    #[cfg(not(target_os = "macos"))]
    if PLATFORM_OPS.iter().any(|family| op.starts_with(family)) {
      return Err(format!("UNSUPPORTED: {op} is not available on {OS_NAME} yet"));
    }
    #[cfg(target_os = "macos")]
    if op == "menu.popup" {
      return menu::popup_op(&cmd, id, &win.webview);
    }
    if op == "window.setTheme" {
      // appearance plugin: null = follow the system. The appearance is app-wide (NSApp), and tao
      // sends no ThemeChanged for a theme the app sets itself, so repaint every window here.
      let theme = match cmd.get("theme").and_then(|v| v.as_str()) {
        Some("dark") => Some(tao::window::Theme::Dark),
        Some("light") => Some(tao::window::Theme::Light),
        None => None,
        Some(other) => return Err(format!("unknown theme {other}")),
      };
      // Windows: TAO's app-wide theme (new windows too) and WebView2's color scheme, which
      // prefers-color-scheme follows (win/appearance.rs). Linux: GTK's settings, as TAO's would
      // switch a dark desktop to light for null (linux/appearance.rs).
      #[cfg(target_os = "macos")]
      win.window.set_theme(theme);
      #[cfg(target_os = "windows")]
      win::appearance::set_theme(target, theme, self.map.values().map(|w| &w.webview));
      #[cfg(target_os = "linux")]
      linux::appearance::set_theme(theme);
      let dark = theme.map_or_else(|| window_theme(&win.window) == tao::window::Theme::Dark, |t| t == tao::window::Theme::Dark);
      for w in self.map.values() {
        paint(&w.window, Some(&w.webview), &self.shell.colors, dark);
      }
      return Ok(window_state(&win.window, Some(&win.webview)));
    }
    if op == "webview.print" {
      // D8: WKWebView ignores window.print(); the page runtime calls this instead (Tauri does the
      // same, tauri/crates/tauri/src/webview/plugin.rs:198). A sheet on the window, not modal.
      win.webview.print().map_err(|e| e.to_string())?;
      return Ok("null".into());
    }
    window_op(&win.window, Some(&win.webview), &cmd, op)
  }
}

/// D9: a file drag over a window, as a `dragDrop` native event. Only drags that carry files are
/// reported: WRY sends Over/Drop/Leave for any drag, and only Enter says what is dragged.
/// `scale`: physical pixels per CSS pixel of the positions (WebView2 gives physical pixels after
/// ScreenToClient; WKWebView and WebKitGTK already give CSS pixels, so 1 there; N6).
fn drag_drop_event(window: u32, files: &std::cell::Cell<bool>, event: DragDropEvent, scale: f64) -> Option<String> {
  let css = |v: i32| (v as f64 / scale * 100.0).round() / 100.0;
  let paths = |paths: &[PathBuf]| {
    let list: Vec<String> = paths.iter().map(|p| json::quote(&p.to_string_lossy())).collect();
    format!("[{}]", list.join(","))
  };
  let (name, detail) = match event {
    DragDropEvent::Enter { paths: p, position: (x, y) } => {
      files.set(!p.is_empty());
      ("enter", format!(r#","paths":{},"x":{},"y":{}"#, paths(&p), css(x), css(y)))
    }
    DragDropEvent::Over { position: (x, y) } => ("over", format!(r#","x":{},"y":{}"#, css(x), css(y))),
    DragDropEvent::Drop { paths: p, position: (x, y) } => ("drop", format!(r#","paths":{},"x":{},"y":{}"#, paths(&p), css(x), css(y))),
    DragDropEvent::Leave => ("leave", String::new()),
    _ => return None,
  };
  if !files.get() {
    return None;
  }
  if name == "drop" || name == "leave" {
    files.set(false);
  }
  Some(format!(r#"{{"type":"dragDrop","window":{window},"event":"{name}"{detail}}}"#))
}

// ───────────────────────── akan_native_run ─────────────────────────

#[no_mangle]
pub unsafe extern "C" fn akan_native_run(config_json: *const c_char) -> i32 {
  #[cfg(target_os = "macos")]
  if !macos::is_main_thread() {
    log!("akan_native_run must be called on the process main thread");
    return -1;
  }
  if config_json.is_null() {
    return -2;
  }
  let cfg = match parse_config(&CStr::from_ptr(config_json).to_string_lossy()) {
    Ok(c) => c,
    Err(e) => {
      log!("bad config: {e}");
      set_last_error(&format!("bad config: {e}"));
      return -2;
    }
  };

  if let Some(base) = &cfg.dev_server {
    log!("pages from {base} (akan-native dev --hmr)");
  }
  navigation::set_extra_schemes(cfg.external_schemes.clone());
  #[cfg(not(target_os = "windows"))]
  #[cfg_attr(not(target_os = "macos"), allow(unused_mut))]
  let mut event_loop = EventLoopBuilder::<UserEvent>::with_user_event().build();
  // Windows: every Win32 message passes win::msg_hook before tao dispatches it (hotkeys, tray icons).
  #[cfg(target_os = "windows")]
  let event_loop = {
    use tao::platform::windows::EventLoopBuilderExtWindows;
    EventLoopBuilder::<UserEvent>::with_user_event().with_msg_hook(win::msg_hook).build()
  };
  #[cfg(target_os = "macos")]
  if cfg.activation == "prohibited" {
    use tao::platform::macos::{ActivationPolicy, EventLoopExtMacOS};
    event_loop.set_activation_policy(ActivationPolicy::Prohibited);
    event_loop.set_activate_ignoring_other_apps(false);
  }
  let _ = PROXY.set(Mutex::new(event_loop.create_proxy()));
  #[cfg(target_os = "macos")]
  macos::install_terminate_handler();
  #[cfg(target_os = "macos")]
  notify::install_if_declared();
  #[cfg(unix)]
  sigterm::install();
  #[cfg(target_os = "windows")]
  stdin_quit::install();
  // The helper window receives sign-out and shutdown (WM_QUERYENDSESSION), so it exists from the start.
  #[cfg(target_os = "windows")]
  if let Err(e) = win::msgwin::hwnd() {
    log!("sign-out and shutdown are not watched: {e}");
  }
  #[cfg(target_os = "windows")]
  if !cfg.app_id.is_empty() {
    win::notify::claim_app_id(&cfg.app_id);
  }

  let mut windows = Windows {
    shell: Shell {
      app_dir: cfg.app_dir.clone(),
      init_js: Arc::from(cfg.init_js.as_str()),
      dev_server: cfg.dev_server.as_deref().map(Arc::from),
      devtools: cfg.devtools,
      colors: Colors { light: cfg.background_light, dark: cfg.background_dark },
      title: cfg.title.clone(),
      size: (cfg.width, cfg.height),
      activate: cfg.activation != "prohibited",
      icon: cfg.icon.as_deref().and_then(read_icon),
      app_id: cfg.app_id.clone(),
      recovery_reload: cfg.recovery_reload,
      screen_capture_auto: cfg.screen_capture_auto,
    },
    web_context: wry::WebContext::new(cfg.data_dir.clone()),
    map: HashMap::new(),
    closing: HashMap::new(),
    ids: HashMap::new(),
    focus: Vec::new(),
    next: 2,
  };
  let main = WindowOptions {
    path: cfg.start_path.clone(),
    title: None,
    size: None,
    position: cfg.position,
    maximized: cfg.maximized,
    fullscreen: cfg.fullscreen,
    skip_taskbar: cfg.skip_taskbar,
  };
  match open_window(&event_loop, &windows.shell, &mut windows.web_context, 1, main) {
    Ok(win) => windows.insert(1, win),
    Err(e) => {
      log!("{e}");
      set_last_error(&e);
      // -5: the system has no webview engine (Windows without the WebView2 Runtime).
      #[cfg(target_os = "windows")]
      if e.starts_with("webview") && webview2_com::Microsoft::Web::WebView2::Win32::GetAvailableCoreWebView2BrowserVersionString(windows::core::PCWSTR::null(), &mut windows::core::PWSTR::null()).is_err() {
        set_last_error("the Microsoft Edge WebView2 Runtime is not installed (https://go.microsoft.com/fwlink/p/?LinkId=2124703)");
        return -5;
      }
      return if e.starts_with("window") { -3 } else { -4 };
    }
  }
  let menu = cfg.menu;
  let app_name = cfg.title.clone();

  event_loop.run(move |event, target, control_flow| {
    *control_flow = ControlFlow::Wait;
    match event {
      Event::NewEvents(StartCause::Init) => {
        #[cfg(target_os = "macos")]
        if menu {
          // Without an app menu, Cmd+C/V/A/Z/Q do nothing in WKWebView.
          menu::install_default(&app_name);
        }
        let _ = (menu, &app_name);
        push_event(r#"{"type":"init"}"#);
      }
      Event::WindowEvent { window_id, event, .. } => {
        let Some(&id) = windows.ids.get(&window_id) else { return }; // destroyed meanwhile
        let win = &windows.map[&id];
        match event {
          WindowEvent::CloseRequested => {
            if WAKE.load(Ordering::Acquire) == 0 {
              *control_flow = ControlFlow::ExitWithCode(0);
              return;
            }
            // The host decides: ask that window's page, then destroy it, or quit or hide it when
            // it is the last one (desktop.quitOnLastWindowClosed).
            if !QUITTING.load(Ordering::Acquire) {
              push_watched(&format!(r#"{{"type":"window","event":"closeRequested","window":{id}}}"#), Some(id));
            }
          }
          WindowEvent::Focused(focused) => {
            push_event(&format!(r#"{{"type":"window","event":"focused","window":{id},"value":{focused}}}"#));
            if focused {
              windows.focused(id);
            }
          }
          WindowEvent::Resized(_) => {
            let logical = inner_size(&win.window, Some(&win.webview)); // not the event's size (see inner_size)
            push_event(&format!(r#"{{"type":"window","event":"resized","window":{id},"width":{},"height":{}}}"#, logical.width, logical.height));
          }
          WindowEvent::Moved(position) => {
            let logical = position.to_logical::<f64>(win.window.scale_factor());
            push_event(&format!(r#"{{"type":"window","event":"moved","window":{id},"x":{},"y":{}}}"#, logical.x, logical.y));
          }
          WindowEvent::ThemeChanged(theme) => {
            paint(&win.window, Some(&win.webview), &windows.shell.colors, theme == tao::window::Theme::Dark);
            push_event(&format!(r#"{{"type":"window","event":"themeChanged","window":{id},"theme":"{}"}}"#, theme_name(theme)));
          }
          _ => {}
        }
      }
      // Deep links and "open with" (plugins.md D6). The plugin host buffers them until the page listens (C2).
      Event::Opened { urls } => {
        let list: Vec<String> = urls.iter().map(|u| json::quote(u.as_str())).collect();
        push_event(&format!(r#"{{"type":"opened","urls":[{}]}}"#, list.join(",")));
      }
      // Dock icon clicked (D5): bring the primary window back.
      Event::Reopen { .. } => {
        if let Some(win) = windows.primary().and_then(|id| windows.map.get(&id)) {
          win.window.set_visible(true);
          win.window.set_minimized(false);
          win.window.set_focus();
        }
      }
      Event::UserEvent(UserEvent::Shell { id, json }) => {
        // notify.*, camera.*, panel.*, alert.* and autostart.* answer later, from completion
        // handlers or a thread (notify.rs, camera.rs, panels.rs, autostart.rs).
        #[cfg(target_os = "macos")]
        if notify::shell_op(id, &json) || camera::shell_op(id, &json) || panels::shell_op(id, &json, &windows) || autostart::shell_op(id, &json) || keychain::shell_op(id, &json) {
          return;
        }
        #[cfg(target_os = "windows")]
        if win::async_op(id, &json, &windows) {
          return;
        }
        #[cfg(target_os = "linux")]
        if linux::async_op(id, &json, &windows) {
          return;
        }
        reply(id, windows.shell_op(target, &json))
      }
      Event::UserEvent(UserEvent::Respond(r, resp)) => r.respond(resp),
      Event::UserEvent(UserEvent::WebviewGone { window, reason }) => {
        // The page and every call it had made are gone: the host ends its document (dispatcher.reset).
        drop_pending(window);
        push_event(&format!(r#"{{"type":"webview","event":"processTerminated","window":{window},"reason":"{reason}"}}"#));
        if reason == "browserExited" && windows.shell.recovery_reload {
          // The host relaunches the app on the event above (host.ts); should it not, this quits.
          log!("the webview's browser process ended; the app relaunches");
          std::thread::spawn(|| {
            std::thread::sleep(std::time::Duration::from_secs(10));
            send(UserEvent::Quit(1));
          });
        } else if reason == "browserExited" {
          log!("the webview's browser process ended; quitting");
          send(UserEvent::Quit(1));
        } else if let Some(win) = windows.map.get_mut(&window) {
          if win.reload_pending {
            log!("window {window}: the page stopped ({reason}) while its reload waits");
            return;
          }
          let now = std::time::Instant::now();
          let again = win.reloaded_at.is_some_and(|t| now.duration_since(t) < std::time::Duration::from_secs(60));
          win.gone_streak = if again { win.gone_streak + 1 } else { 0 };
          let wait = recovery_wait(win.gone_streak).filter(|_| windows.shell.recovery_reload);
          if again && !windows.shell.recovery_reload {
            log!("window {window}: the page stopped again ({reason}) within a minute; showing an error page");
            let _ = win.webview.load_html(&gone_page());
          } else if let Some(wait) = wait {
            log!("window {window}: the page stopped again ({reason}); loading it again in {} s", wait.as_secs());
            win.reload_pending = true;
            std::thread::spawn(move || {
              std::thread::sleep(wait);
              send(UserEvent::ReloadGone(window));
            });
          } else {
            log!("window {window}: the page stopped ({reason}); loading it again");
            win.reloaded_at = Some(now);
            let _ = win.webview.reload();
          }
        }
      }
      Event::UserEvent(UserEvent::ReloadGone(window)) => {
        if let Some(win) = windows.map.get_mut(&window) {
          win.reload_pending = false;
          win.reloaded_at = Some(std::time::Instant::now());
          let _ = win.webview.reload();
        }
      }
      Event::UserEvent(UserEvent::Emit { webview_id, js }) => {
        if let Some(win) = windows.map.get(&webview_id) {
          let _ = win.webview.evaluate_script(&js);
        }
      }
      Event::UserEvent(UserEvent::Show(id)) => {
        if let Some(win) = windows.map.get(&id) {
          if !win.window.is_visible() {
            win.window.set_visible(true);
            if windows.shell.activate {
              win.window.set_focus();
            }
          }
        }
      }
      Event::UserEvent(UserEvent::Quit(code)) => {
        // Drop pending responders on the main thread before the webviews go away.
        PENDING.lock().unwrap().clear();
        #[cfg(target_os = "macos")]
        if TERMINATE_LATER.swap(false, Ordering::AcqRel) {
          // AppKit's pending terminate: finishes (applicationWillTerminate, exit) and the logout goes on.
          macos::reply_to_terminate(true);
          return;
        }
        *control_flow = ControlFlow::ExitWithCode(code);
      }
      Event::UserEvent(UserEvent::Unloaded(id)) => drop(windows.closing.remove(&id)), // webview first, then the window
      Event::UserEvent(UserEvent::CloseUntaken { watch, window }) => {
        if WATCH_TAKEN.load(Ordering::Acquire) >= watch || QUITTING.load(Ordering::Acquire) || !windows.map.contains_key(&window) {
          return; // taken meanwhile, or gone
        }
        if windows.map.len() > 1 {
          log!("the plugin host did not take the close request of window {window} within {WATCH_TIMEOUT:?}; closing it");
          let _ = windows.destroy(window);
        } else {
          log!("the plugin host did not take the close request of the last window within {WATCH_TIMEOUT:?}; quitting");
          akan_native_quit(0);
        }
      }
      Event::UserEvent(UserEvent::ThemeChanged) => {
        for (id, win) in &windows.map {
          let theme = window_theme(&win.window);
          paint(&win.window, Some(&win.webview), &windows.shell.colors, theme == tao::window::Theme::Dark);
          push_event(&format!(r#"{{"type":"window","event":"themeChanged","window":{id},"theme":"{}"}}"#, theme_name(theme)));
        }
      }
      Event::UserEvent(UserEvent::CancelTerminate) =>
      {
        #[cfg(target_os = "macos")]
        if TERMINATE_LATER.swap(false, Ordering::AcqRel) {
          macos::reply_to_terminate(false);
        }
      }
      _ => {}
    }
  });
}

// ───────────────────────── macOS ─────────────────────────

#[cfg(target_os = "macos")]
mod macos {
  use objc2::{
    msg_send,
    rc::Retained,
    runtime::{AnyClass, AnyObject, Imp, Sel},
    sel, MainThreadMarker,
  };
  use objc2_app_kit::{NSApplication, NSApplicationTerminateReply, NSWorkspace};
  use objc2_foundation::{NSAppleEventDescriptor, NSAppleEventManager, NSString, NSURL};

  pub enum TerminateReply {
    Now,
    Cancel,
    Later,
  }

  /// keyAEQuitReason ('why?') of the quit Apple event, and the values loginwindow sends for a
  /// logout, restart or shutdown (AERegistry.h). Cmd+Q comes from the menu (no Apple event); Dock
  /// Quit and AppleScript `quit` send a quit event without a reason.
  const QUIT_REASON: u32 = u32::from_be_bytes(*b"why?");
  const SESSION_END: [&[u8; 4]; 6] = [b"logo", b"rlgo", b"rrst", b"rsdn", b"rest", b"shut"];

  pub fn is_session_end(reason: u32) -> bool {
    SESSION_END.iter().any(|code| u32::from_be_bytes(**code) == reason)
  }

  fn quit_reason() -> Option<u32> {
    let event = NSAppleEventManager::sharedAppleEventManager().currentAppleEvent()?;
    // AppleEvents.h calls it a parameter; AppKit code in the wild reads it as an attribute. Try both.
    // msg_send: objc2-foundation gates these two behind objc2-core-services, a crate not in our tree.
    let attribute: Option<Retained<NSAppleEventDescriptor>> = unsafe { msg_send![&*event, attributeDescriptorForKeyword: QUIT_REASON] };
    let param = || -> Option<Retained<NSAppleEventDescriptor>> { unsafe { msg_send![&*event, paramDescriptorForKeyword: QUIT_REASON] } };
    let reason = attribute.or_else(param)?;
    Some(if reason.enumCodeValue() != 0 { reason.enumCodeValue() } else { reason.typeCodeValue() })
  }

  extern "C-unwind" fn application_should_terminate(_this: &AnyObject, _sel: Sel, _sender: *mut AnyObject) -> NSApplicationTerminateReply {
    let session_end = quit_reason().is_some_and(is_session_end);
    match super::should_terminate(session_end) {
      TerminateReply::Now => NSApplicationTerminateReply::TerminateNow,
      TerminateReply::Cancel => NSApplicationTerminateReply::TerminateCancel,
      TerminateReply::Later => NSApplicationTerminateReply::TerminateLater,
    }
  }

  /// TAO's app delegate does not implement applicationShouldTerminate:
  /// (tao/src/platform_impl/macos/app_delegate.rs), so AppKit would quit without asking the plugin
  /// host. Add it to TAO's delegate class at runtime, as Electrobun's own delegate implements it
  /// (electrobun/package/src/native/macos/nativeWrapper.mm:7097-7110).
  pub fn install_terminate_handler() {
    let Some(class) = AnyClass::get(c"TaoAppDelegateParent") else {
      log!("TaoAppDelegateParent not found: quitting skips the plugin host");
      return;
    };
    let imp = application_should_terminate as extern "C-unwind" fn(&AnyObject, Sel, *mut AnyObject) -> NSApplicationTerminateReply;
    // Safety: the signature matches the type encoding "Q@:@" (NSUInteger return, self, _cmd, sender).
    let added = unsafe {
      objc2::ffi::class_addMethod(
        class as *const AnyClass as *mut AnyClass,
        sel!(applicationShouldTerminate:),
        std::mem::transmute::<_, Imp>(imp),
        c"Q@:@".as_ptr(),
      )
    };
    if !added.as_bool() {
      log!("TaoAppDelegateParent already implements applicationShouldTerminate:; quitting skips the plugin host");
    }
  }

  pub fn reply_to_terminate(yes: bool) {
    if let Some(mtm) = MainThreadMarker::new() {
      NSApplication::sharedApplication(mtm).replyToApplicationShouldTerminate(yes);
    }
  }

  pub fn is_main_thread() -> bool {
    MainThreadMarker::new().is_some()
  }

  pub fn is_dark_mode() -> bool {
    let Some(mtm) = MainThreadMarker::new() else { return false };
    let app = NSApplication::sharedApplication(mtm);
    app.effectiveAppearance().name().to_string().contains("Dark")
  }

  pub fn open_url(url: &str) {
    if let Some(u) = NSURL::URLWithString(&NSString::from_str(url)) {
      NSWorkspace::sharedWorkspace().openURL(&u);
    }
  }

}

#[cfg(all(test, target_os = "macos"))]
mod quit_tests {
  use super::macos::is_session_end;

  #[test]
  fn session_end_reasons() {
    for code in [b"logo", b"rlgo", b"rrst", b"rsdn", b"rest", b"shut"] {
      assert!(is_session_end(u32::from_be_bytes(*code)));
    }
    assert!(!is_session_end(u32::from_be_bytes(*b"quia"))); // kAEQuitAll
    assert!(!is_session_end(0));
  }
}

#[cfg(test)]
mod asset_path_tests {
  use super::asset_path;
  use std::path::Path;

  #[test]
  fn asset_paths_stay_in_the_app_folder() {
    let dir = Path::new("app");
    assert_eq!(asset_path(dir, "img/a b.png"), Some(dir.join("img/a b.png")));
    for rel in ["/etc/passwd", "../x", "a/../b"] {
      assert_eq!(asset_path(dir, rel), None, "{rel}");
    }
    #[cfg(windows)]
    for rel in ["C:/Users/u/.ssh/id_rsa", "C:x", r"\\server\share\x"] {
      assert_eq!(asset_path(dir, rel), None, "{rel}");
    }
  }
}

#[cfg(test)]
mod range_tests {
  // The header rules are in the shared vectors (vectors.rs); this checks what reaches the page.
  #[test]
  fn ranged_reads_take_only_their_part() {
    let dir = std::env::temp_dir().join(format!("akan-native-range-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let file = dir.join("big.bin");
    let data: Vec<u8> = (0..(crate::contract::MAX_RANGE_BYTES * 3)).map(|i| (i % 251) as u8).collect();
    std::fs::write(&file, &data).unwrap();
    let r = super::read_file(&file, "video/mp4", super::Served::Asset, Some("bytes=10-")).unwrap();
    assert_eq!(r.status(), 206);
    assert_eq!(r.body().as_slice(), &data[10..10 + crate::contract::MAX_RANGE_BYTES]);
    assert_eq!(r.headers()["content-range"], format!("bytes 10-{}/{}", 9 + crate::contract::MAX_RANGE_BYTES, data.len()));
    let r = super::read_file(&file, "video/mp4", super::Served::Asset, Some("bytes=5-9")).unwrap();
    assert_eq!(r.body().as_slice(), &data[5..10]);
    let r = super::read_file(&file, "video/mp4", super::Served::Asset, None).unwrap();
    assert_eq!((r.status().as_u16(), r.body().len()), (200, data.len()));
    assert_eq!(super::read_file(&file, "video/mp4", super::Served::Asset, Some("bytes=999999999-")).unwrap().status(), 416);
    assert_eq!(super::read_file(&file, "bad\nvalue", super::Served::Asset, None).unwrap().status(), 500);
    // FileRefs: no sniffing, same-origin only, and sandboxed unless plain media (N1).
    let r = super::read_file(&file, "text/html", super::Served::FileRef, None).unwrap();
    assert_eq!(r.headers()["x-content-type-options"], "nosniff");
    assert_eq!(r.headers()["cross-origin-resource-policy"], "same-origin");
    assert_eq!(r.headers()["content-security-policy"], "sandbox");
    let r = super::read_file(&file, "image/png", super::Served::FileRef, None).unwrap();
    assert!(r.headers().get("content-security-policy").is_none());
    assert!(super::read_file(&file, "text/html", super::Served::Asset, None).unwrap().headers().get("content-security-policy").is_none());
    std::fs::remove_dir_all(&dir).unwrap();
  }
}

#[cfg(test)]
mod window_arg_tests {
  use super::{app_path, json, parse_config, window_arg};

  #[test]
  fn window_ids() {
    let arg = |s: &str| window_arg(&json::parse(s).unwrap());
    assert_eq!(arg(r#"{}"#), Ok(None));
    assert_eq!(arg(r#"{"window":2}"#), Ok(Some(2)));
    for bad in [r#"{"window":0}"#, r#"{"window":-1}"#, r#"{"window":1.5}"#, r#"{"window":"2"}"#, r#"{"window":1e12}"#] {
      assert!(arg(bad).is_err(), "{bad}");
    }
  }

  #[test]
  fn app_paths() {
    let path = |s: &str| app_path(&json::parse(s).unwrap());
    assert_eq!(path(r#"{}"#), Ok("/".into()));
    assert_eq!(path(r#"{"path":"/settings?tab=2#a"}"#), Ok("/settings?tab=2#a".into()));
    for bad in [r#"{"path":"settings"}"#, r#"{"path":"//evil.com/x"}"#, r#"{"path":"https://example.com"}"#, r#"{"path":"/a\\b"}"#, r#"{"path":"/a\nb"}"#, r#"{"path":3}"#] {
      assert!(path(bad).is_err(), "{bad}");
    }
  }

  #[test]
  fn start_paths() {
    let start = |extra: &str| parse_config(&format!(r#"{{"appDir":"/a","initJs":""{extra}}}"#)).map(|c| c.start_path);
    assert_eq!(start(""), Ok("/".into()));
    assert_eq!(start(r#","startPath":"/en/home?csr=true""#), Ok("/en/home?csr=true".into()));
    assert!(start(r#","startPath":"//evil.com/x""#).is_err());
  }
}

#[cfg(test)]
mod drag_drop_tests {
  use super::*;

  #[test]
  fn reports_file_drags_only() {
    let files = std::cell::Cell::new(false);
    let ev = |e| drag_drop_event(2, &files, e, 1.0);
    // A text drag: nothing, including its Over and Leave.
    assert_eq!(ev(DragDropEvent::Enter { paths: vec![], position: (1, 2) }), None);
    assert_eq!(ev(DragDropEvent::Over { position: (3, 4) }), None);
    assert_eq!(ev(DragDropEvent::Leave), None);
    // A file drag.
    let enter = ev(DragDropEvent::Enter { paths: vec![PathBuf::from("/tmp/a \"b\".txt")], position: (10, 20) }).unwrap();
    assert_eq!(enter, r#"{"type":"dragDrop","window":2,"event":"enter","paths":["/tmp/a \"b\".txt"],"x":10,"y":20}"#);
    assert!(json::parse(&enter).is_ok());
    assert_eq!(ev(DragDropEvent::Over { position: (11, 21) }).unwrap(), r#"{"type":"dragDrop","window":2,"event":"over","x":11,"y":21}"#);
    let drop = ev(DragDropEvent::Drop { paths: vec![PathBuf::from("/tmp/x")], position: (5, 6) }).unwrap();
    assert!(drop.contains(r#""event":"drop","paths":["/tmp/x"]"#));
    // After the drop, a following text drag is quiet again.
    assert_eq!(ev(DragDropEvent::Over { position: (0, 0) }), None);
  }

  /// WebView2's physical pixels become CSS pixels (N6): 150 % scaling.
  #[test]
  fn positions_are_css_pixels() {
    let files = std::cell::Cell::new(false);
    let enter = drag_drop_event(1, &files, DragDropEvent::Enter { paths: vec![PathBuf::from("/a")], position: (150, 301) }, 1.5).unwrap();
    assert!(enter.ends_with(r#""x":100,"y":200.67}"#), "{enter}");
  }
}

#[cfg(test)]
mod recovery_tests {
  use super::recovery_wait;
  use std::time::Duration;

  #[test]
  fn waits_longer_after_each_end_in_a_row_up_to_a_minute() {
    let secs: Vec<u64> = (0..10).map(|streak| recovery_wait(streak).map_or(0, |d| d.as_secs())).collect();
    assert_eq!(secs, [0, 1, 2, 4, 8, 16, 32, 60, 60, 60]);
    assert_eq!(recovery_wait(u32::MAX), Some(Duration::from_secs(60)));
  }

  #[test]
  fn reads_the_recovery_policy_and_refuses_an_unknown_one() {
    let base = r#""appDir":"/a","initJs":"x""#;
    assert!(!super::parse_config(&format!("{{{base}}}")).unwrap().recovery_reload);
    assert!(super::parse_config(&format!(r#"{{{base},"recovery":"reload","fullscreen":true}}"#)).unwrap().recovery_reload);
    assert!(super::parse_config(&format!(r#"{{{base},"recovery":"always"}}"#)).is_err());
    assert!(super::parse_config(&format!(r#"{{{base},"screenCapture":"auto"}}"#)).unwrap().screen_capture_auto);
    assert!(super::parse_config(&format!(r#"{{{base},"screenCapture":"any"}}"#)).is_err());
  }
}
