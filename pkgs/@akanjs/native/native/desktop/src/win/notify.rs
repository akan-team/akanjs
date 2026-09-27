//! Local notifications on Windows: toast notifications (Windows.UI.Notifications through
//! windows-rs) of an unpackaged app, registered as Microsoft documents it for apps without a
//! package ("Send a local app notification from other types of unpackaged apps"): an
//! AppUserModelID with DisplayName and IconUri under HKCU\Software\Classes\AppUserModelId\<AUMID>,
//! and SetCurrentProcessExplicitAppUserModelID. tauri's notification plugin shows toasts the same
//! way (notify-rust → CreateToastNotifierWithId and an XML template) but only with the app's
//! identifier when it is installed, else as PowerShell (tauri-plugins-workspace/plugins/
//! notification/src/desktop.rs); akan-native registers the app's own id instead.
//!   notify.status / notify.request → {"status": 2} while toasts are on for the app, 1 when the user
//!     or a policy turned them off (Settings > Notifications); there is nothing to ask for
//!   notify.add / notify.pending / notify.removePending → notify_schedule.rs, shown with Show
//!   notify.delivered → the app's toasts in Action Center (ToastNotificationHistory), from any run
//!   notify.removeDelivered {ids} → removed from Action Center
//! Argument `app` {id, name}: the AUMID and its display name.
//! A toast is tagged with the id (the same id replaces it), grouped as GROUP, and carries its
//! request JSON as the launch argument, so the history lists it like the macOS center does.
//! Events: "received" when one is shown; "action" when it is clicked while the app runs (the
//! toast's Activated event). A click after the app quit does nothing: that needs a COM activator
//! (INotificationActivationCallback, CustomActivator in the registration, a class factory the app
//! registers at launch), not done yet; ScheduledToastNotification, which delivers while the app
//! is closed, is only useful with it.

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use windows::core::{IInspectable, HRESULT, HSTRING, PCWSTR};
use windows::Data::Xml::Dom::XmlDocument;
use windows::Foundation::TypedEventHandler;
use windows::Win32::Foundation::{ERROR_NOT_FOUND, ERROR_SUCCESS, FILETIME, SYSTEMTIME};
use windows::Win32::System::Registry::{RegCloseKey, RegCreateKeyExW, RegSetValueExW, HKEY, HKEY_CURRENT_USER, KEY_SET_VALUE, REG_OPTION_NON_VOLATILE, REG_SZ};
use windows::Win32::System::Time::{FileTimeToSystemTime, SystemTimeToFileTime, SystemTimeToTzSpecificLocalTime, TzSpecificLocalTimeToSystemTime};
use windows::Win32::UI::Shell::SetCurrentProcessExplicitAppUserModelID;
use windows::UI::Notifications::{NotificationSetting, ToastNotification, ToastNotificationManager};

use crate::json;
use crate::notify_schedule::{self as schedule, Item};

/// The toasts' group: other toasts of the app (none yet) are left alone.
const GROUP: &str = "akan-native.ln";

#[derive(Clone)]
struct App {
  /// The AppUserModelID: the app id.
  id: HSTRING,
}

static APP: Mutex<Option<App>> = Mutex::new(None);
/// The shown toasts: their Activated handlers live as long as the objects.
static TOASTS: Mutex<Vec<(String, ToastNotification)>> = Mutex::new(Vec::new());

fn failed(what: &str) -> impl Fn(windows::core::Error) -> String + '_ {
  move |e| format!("INTERNAL: {what} failed: {} ({})", e.message(), e.code())
}

/// A REG_SZ value under HKCU, creating the key.
fn write_string(key: &str, value: &str, data: &str) -> Result<(), String> {
  let mut hkey = HKEY::default();
  let status = unsafe { RegCreateKeyExW(HKEY_CURRENT_USER, &HSTRING::from(key), None, PCWSTR::null(), REG_OPTION_NON_VOLATILE, KEY_SET_VALUE, None, &mut hkey, None) };
  if status != ERROR_SUCCESS {
    return Err(format!("INTERNAL: cannot create HKCU\\{key} ({})", status.0));
  }
  let bytes: Vec<u8> = data.encode_utf16().chain(std::iter::once(0)).flat_map(u16::to_le_bytes).collect();
  let status = unsafe { RegSetValueExW(hkey, &HSTRING::from(value), None, REG_SZ, Some(&bytes)) };
  unsafe {
    let _ = RegCloseKey(hkey);
  }
  if status == ERROR_SUCCESS {
    Ok(())
  } else {
    Err(format!("INTERNAL: cannot write HKCU\\{key}\\{value} ({})", status.0))
  }
}

/// The app, registered on first use: the AUMID's registry entry (Action Center shows its name and
/// icon) and the process's explicit AUMID.
fn app(cmd: &json::V, resources: Option<&Path>) -> Result<App, String> {
  let mut current = APP.lock().unwrap();
  if let Some(app) = current.as_ref() {
    return Ok(app.clone());
  }
  let field = |name: &str| cmd.get("app").and_then(|a| a.get(name)).and_then(|v| v.as_str()).filter(|s| !s.is_empty());
  let (id, name) = (field("id").ok_or("app.id is required")?, field("name").ok_or("app.name is required")?);
  // AppUserModelID: at most 128 characters, no spaces (Application User Model IDs, Microsoft Learn).
  if id.chars().count() > 128 || id.contains(char::is_whitespace) {
    return Err(format!("INTERNAL: the app id {id} cannot be an AppUserModelID (at most 128 characters, no spaces)"));
  }
  let key = format!(r"Software\Classes\AppUserModelId\{id}");
  write_string(&key, "DisplayName", name)?;
  if let Some(icon) = resources.and_then(|r| icon_file(id, r)) {
    write_string(&key, "IconUri", &icon.to_string_lossy())?;
  }
  let aumid = HSTRING::from(id);
  unsafe { SetCurrentProcessExplicitAppUserModelID(&aumid) }.map_err(failed("SetCurrentProcessExplicitAppUserModelID"))?;
  let app = App { id: aumid };
  *current = Some(app.clone());
  Ok(app)
}

/// At launch, before any window exists (lib.rs akan_native_run): the taskbar groups and pins the app by
/// its AppUserModelID from the start, not only after the first notification registered it.
pub fn claim_app_id(id: &str) {
  if id.chars().count() > 128 || id.contains(char::is_whitespace) {
    return log!("the app id {id} cannot be an AppUserModelID (at most 128 characters, no spaces)");
  }
  if let Err(e) = unsafe { SetCurrentProcessExplicitAppUserModelID(&HSTRING::from(id)) } {
    log!("SetCurrentProcessExplicitAppUserModelID: {}", e.message());
  }
}

fn registered() -> Result<App, String> {
  APP.lock().unwrap().clone().ok_or_else(|| "INTERNAL: the app is not registered for notifications".into())
}

// ───────────────────────── icon ─────────────────────────

/// IconUri wants an image file: the CLI's icon.rgba ([u32 width LE][u32 height LE][RGBA]) as a PNG
/// in %LOCALAPPDATA%\<id>, rewritten only when it changed.
fn icon_file(id: &str, resources: &Path) -> Option<PathBuf> {
  let bytes = std::fs::read(resources.join("icon.rgba")).ok()?;
  let (w, h) = (u32::from_le_bytes(bytes.get(0..4)?.try_into().ok()?), u32::from_le_bytes(bytes.get(4..8)?.try_into().ok()?));
  let rgba = bytes.get(8..)?;
  if w == 0 || h == 0 || rgba.len() != (w as usize) * (h as usize) * 4 {
    return None;
  }
  let dir = PathBuf::from(std::env::var_os("LOCALAPPDATA")?).join(id);
  let file = dir.join("notification-icon.png");
  let data = png(w, h, rgba);
  if std::fs::read(&file).ok().as_deref() != Some(&data[..]) {
    std::fs::create_dir_all(&dir).ok()?;
    std::fs::write(&file, &data).map_err(|e| log!("cannot write {}: {e}", file.display())).ok()?;
  }
  Some(file)
}

fn crc32(bytes: &[u8]) -> u32 {
  let mut crc = !0u32;
  for &b in bytes {
    crc ^= b as u32;
    for _ in 0..8 {
      crc = if crc & 1 != 0 { (crc >> 1) ^ 0xEDB8_8320 } else { crc >> 1 };
    }
  }
  !crc
}

fn adler32(bytes: &[u8]) -> u32 {
  let (mut a, mut b) = (1u32, 0u32);
  for &x in bytes {
    a = (a + x as u32) % 65521;
    b = (b + a) % 65521;
  }
  (b << 16) | a
}

/// An RGBA PNG with uncompressed ("stored") deflate blocks: valid without a zlib crate, and a
/// 256×256 icon is 256 KB.
fn png(width: u32, height: u32, rgba: &[u8]) -> Vec<u8> {
  let mut raw = Vec::with_capacity((width as usize * 4 + 1) * height as usize);
  for row in rgba.chunks_exact(width as usize * 4) {
    raw.push(0); // filter: none
    raw.extend_from_slice(row);
  }
  let mut z = vec![0x78, 0x01];
  let blocks: Vec<&[u8]> = raw.chunks(65_535).collect();
  for (i, block) in blocks.iter().enumerate() {
    z.push((i + 1 == blocks.len()) as u8);
    z.extend_from_slice(&(block.len() as u16).to_le_bytes());
    z.extend_from_slice(&(!(block.len() as u16)).to_le_bytes());
    z.extend_from_slice(block);
  }
  z.extend_from_slice(&adler32(&raw).to_be_bytes());
  let mut out = b"\x89PNG\r\n\x1a\n".to_vec();
  let mut chunk = |kind: &[u8; 4], data: &[u8]| {
    out.extend_from_slice(&(data.len() as u32).to_be_bytes());
    let start = out.len();
    out.extend_from_slice(kind);
    out.extend_from_slice(data);
    let crc = crc32(&out[start..]);
    out.extend_from_slice(&crc.to_be_bytes());
  };
  let mut header = Vec::with_capacity(13);
  header.extend_from_slice(&width.to_be_bytes());
  header.extend_from_slice(&height.to_be_bytes());
  header.extend_from_slice(&[8, 6, 0, 0, 0]); // 8 bits, RGBA, deflate, no filter, no interlace
  chunk(b"IHDR", &header);
  chunk(b"IDAT", &z);
  chunk(b"IEND", &[]);
  out
}

// ───────────────────────── toasts ─────────────────────────

/// Text for XML: escaped, without the control characters XML 1.0 does not allow.
fn xml(text: &str) -> String {
  let mut out = String::with_capacity(text.len());
  for c in text.chars() {
    match c {
      '&' => out.push_str("&amp;"),
      '<' => out.push_str("&lt;"),
      '>' => out.push_str("&gt;"),
      '"' => out.push_str("&quot;"),
      '\'' => out.push_str("&apos;"),
      '\t' | '\n' | '\r' => out.push(c),
      c if (c as u32) < 0x20 => {}
      c => out.push(c),
    }
  }
  out
}

fn event(kind: &str, item: &Item) -> String {
  format!(r#"{{"type":"notification","event":"{kind}","notification":{}}}"#, item.json(None))
}

fn show(item: &Item) -> Result<(), String> {
  let app = registered()?;
  let launch = item.json(Some(schedule::now_ms()));
  let body = if item.body.is_empty() { String::new() } else { format!("<text>{}</text>", xml(&item.body)) };
  let content = format!(r#"<toast launch="{}"><visual><binding template="ToastGeneric"><text>{}</text>{body}</binding></visual></toast>"#, xml(&launch), xml(&item.title));
  let action = event("action", item);
  let toast = (|| -> windows::core::Result<ToastNotification> {
    let doc = XmlDocument::new()?;
    doc.LoadXml(&HSTRING::from(content))?;
    let toast = ToastNotification::CreateToastNotification(&doc)?;
    toast.SetTag(&HSTRING::from(item.id.as_str()))?;
    toast.SetGroup(&HSTRING::from(GROUP))?;
    // A click on the toast (or on it in Action Center) while the app runs; on a thread-pool thread.
    toast.Activated(&TypedEventHandler::<ToastNotification, IInspectable>::new(move |_, _| {
      crate::push_event(&action);
      Ok(())
    }))?;
    ToastNotificationManager::CreateToastNotifierWithId(&app.id)?.Show(&toast)?;
    Ok(toast)
  })()
  .map_err(failed("showing the toast"))?;
  {
    let mut toasts = TOASTS.lock().unwrap();
    toasts.retain(|(id, _)| id != &item.id);
    toasts.push((item.id.clone(), toast));
  }
  crate::push_event(&event("received", item));
  Ok(())
}

fn status(app: &App) -> Result<String, String> {
  let enabled = match ToastNotificationManager::CreateToastNotifierWithId(&app.id).and_then(|n| n.Setting()) {
    Ok(setting) => setting == NotificationSetting::Enabled,
    // An unpackaged app has no entry in Settings > Notifications until its first toast, and Setting
    // fails with ERROR_NOT_FOUND until then (seen on Windows 11 26200). Nobody can have turned the
    // app off yet, so only the switch for all apps counts (0 when the user turned it off).
    Err(e) if e.code() == HRESULT::from_win32(ERROR_NOT_FOUND.0) => {
      crate::win::registry::read_dword(HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\PushNotifications", "ToastEnabled").ok().flatten() != Some(0)
    }
    Err(e) => return Err(failed("reading the notification setting")(e)),
  };
  Ok(format!(r#"{{"status":{}}}"#, if enabled { 2 } else { 1 }))
}

fn delivered(app: &App) -> Result<String, String> {
  let list = ToastNotificationManager::History().and_then(|h| h.GetHistoryWithId(&app.id)).map_err(failed("reading Action Center"))?;
  let mut out = Vec::new();
  for i in 0..list.Size().map_err(failed("reading Action Center"))? {
    let Ok(toast) = list.GetAt(i) else { continue };
    if !toast.Group().is_ok_and(|g| g == GROUP) {
      continue;
    }
    let Ok(launch) = toast.Content().and_then(|c| c.DocumentElement()).and_then(|e| e.GetAttribute(&HSTRING::from("launch"))) else { continue };
    let launch = launch.to_string();
    if json::parse(&launch).is_ok_and(|v| v.get("ours").and_then(|o| o.as_bool()) == Some(true)) {
      out.push(launch);
    }
  }
  Ok(format!("[{}]", out.join(",")))
}

fn remove_delivered(app: &App, ids: &[String]) -> Result<String, String> {
  let history = ToastNotificationManager::History().map_err(failed("reading Action Center"))?;
  for id in ids {
    // Not there (dismissed meanwhile) is no error.
    let _ = history.RemoveGroupedTagWithId(&HSTRING::from(id.as_str()), &HSTRING::from(GROUP), &app.id);
  }
  TOASTS.lock().unwrap().retain(|(id, _)| !ids.contains(id));
  Ok("null".into())
}

/// Local calendar days: UTC → local wall-clock time, plus the days, back to UTC (the time zone's
/// offset for the new date), so 09:00 stays 09:00 across DST.
fn add_days(ms: f64, days: i64) -> f64 {
  // FILETIME: 100 ns units since 1601; the Unix epoch is this far in.
  const EPOCH: i64 = 116_444_736_000_000_000;
  let to_ft = |t: i64| FILETIME { dwLowDateTime: t as u32, dwHighDateTime: (t >> 32) as u32 };
  let from_ft = |f: FILETIME| ((f.dwHighDateTime as i64) << 32) | f.dwLowDateTime as i64;
  let local = || -> Option<f64> {
    let (mut utc, mut local, mut ft) = (SYSTEMTIME::default(), SYSTEMTIME::default(), FILETIME::default());
    unsafe {
      FileTimeToSystemTime(&to_ft((ms * 10_000.0) as i64 + EPOCH), &mut utc).ok()?;
      SystemTimeToTzSpecificLocalTime(None, &utc, &mut local).ok()?;
      SystemTimeToFileTime(&local, &mut ft).ok()?;
      FileTimeToSystemTime(&to_ft(from_ft(ft) + days * 864_000_000_000), &mut local).ok()?;
      TzSpecificLocalTimeToSystemTime(None, &local, &mut utc).ok()?;
      SystemTimeToFileTime(&utc, &mut ft).ok()?;
    }
    Some((from_ft(ft) - EPOCH) as f64 / 10_000.0)
  };
  local().unwrap_or(ms + days as f64 * 86_400_000.0)
}

fn run(op: &str, cmd: &json::V, resources: Option<&Path>) -> Result<String, String> {
  let app = app(cmd, resources)?;
  if let Some(result) = schedule::op(op, cmd) {
    return result;
  }
  match op {
    "notify.status" | "notify.request" => status(&app),
    "notify.delivered" => delivered(&app),
    "notify.removeDelivered" => remove_delivered(&app, &schedule::ids(cmd)?),
    _ => Err(format!("unknown op {op}")),
  }
}

/// notify.* ops, answered from a thread (WinRT from the implicit multithreaded apartment, which
/// windows-rs enters when a thread first activates a class). `app_dir`: the shell's app folder,
/// next to the CLI's icon.rgba.
pub fn async_op(id: u64, json_text: &str, app_dir: &Path) -> bool {
  if !json_text.contains("\"notify.") {
    return false;
  }
  let Ok(cmd) = json::parse(json_text) else { return false };
  let Some(op) = cmd.get("op").and_then(|v| v.as_str()).filter(|op| op.starts_with("notify.")).map(str::to_string) else { return false };
  schedule::start(schedule::Host { show, add_days });
  let resources = app_dir.parent().map(Path::to_path_buf);
  std::thread::spawn(move || crate::reply(id, run(&op, &cmd, resources.as_deref())));
  true
}
