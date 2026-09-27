//! Opening URLs with their default app on Windows (opener, browser and auth-session plugins).
//!   shell.open    {url} → null      ShellExecuteExW, on a thread of its own (answered through crate::reply)
//!   shell.handler {url} → {"app"}   the app registered for the URL's scheme, or null
//! Errors: `NOT_FOUND: …` when no app is registered for the scheme, `INTERNAL: …` otherwise.
//!
//! ShellExecuteEx can block for an unbounded time (Electron runs it on a COM STA worker thread:
//! electron/shell/common/platform_util_win.cc OpenExternalOnWorkerThread), and shell extensions
//! need a single-threaded apartment (chromium/ui/base/win/shell.cc InvokeShellExecute), so each
//! call gets a thread with COM initialized. SEE_MASK_FLAG_NO_UI: an unregistered scheme fails with
//! ERROR_NO_ASSOCIATION instead of Windows' "you'll need a new app" dialog.
//! The handler lookup is AssocQueryStringW with ASSOCF_IS_PROTOCOL, as Electron's
//! app.getApplicationNameForProtocol (electron/shell/browser/browser_win.cc:103-153).

use windows::core::{HSTRING, PCWSTR, PWSTR};
use windows::Win32::Foundation::{ERROR_NO_ASSOCIATION, WIN32_ERROR};
use windows::Win32::System::Com::{CoInitializeEx, CoUninitialize, COINIT_APARTMENTTHREADED, COINIT_DISABLE_OLE1DDE};
use windows::Win32::UI::Shell::{
  AssocQueryStringW, ShellExecuteExW, ASSOCF_INIT_IGNOREUNKNOWN, ASSOCF_IS_PROTOCOL, ASSOCF_NOTRUNCATE, ASSOCSTR, ASSOCSTR_EXECUTABLE, ASSOCSTR_FRIENDLYAPPNAME,
  SEE_MASK_FLAG_NO_UI, SEE_MASK_NOASYNC, SHELLEXECUTEINFOW,
};
use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

use crate::json;

fn url_arg(cmd: &json::V) -> Result<String, String> {
  let url = cmd.get("url").and_then(|v| v.as_str()).ok_or("url must be a string")?;
  if url.is_empty() || url.chars().any(char::is_control) {
    return Err("url must be a URL".into());
  }
  Ok(url.to_string())
}

/// The URL's scheme, lowercase ("https" for "HTTPS://…").
fn scheme(url: &str) -> Option<String> {
  let (scheme, _) = url.split_once(':')?;
  let ok = scheme.len() > 1 && scheme.starts_with(|c: char| c.is_ascii_alphabetic()) && scheme.chars().all(|c| c.is_ascii_alphanumeric() || "+-.".contains(c));
  ok.then(|| scheme.to_ascii_lowercase())
}

/// Opens a URL (or file) with its default app. Blocks: call it off the main thread.
pub fn open(url: &str) -> Result<(), String> {
  let file = HSTRING::from(url);
  let verb = HSTRING::from("open");
  let mut info = SHELLEXECUTEINFOW {
    cbSize: std::mem::size_of::<SHELLEXECUTEINFOW>() as u32,
    fMask: SEE_MASK_NOASYNC | SEE_MASK_FLAG_NO_UI,
    lpVerb: PCWSTR(verb.as_ptr()),
    lpFile: PCWSTR(file.as_ptr()),
    nShow: SW_SHOWNORMAL.0,
    ..Default::default()
  };
  let com = unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE) };
  let result = unsafe { ShellExecuteExW(&mut info) };
  if com.is_ok() {
    unsafe { CoUninitialize() };
  }
  result.map_err(|e| {
    let what = scheme(url).map_or_else(|| url.to_string(), |s| format!("{s}:"));
    // An unregistered scheme fails with ERROR_NO_ASSOCIATION, or ERROR_FILE_NOT_FOUND when Windows
    // takes the URL for a file name: the lookup tells.
    if WIN32_ERROR::from_error(&e) == Some(ERROR_NO_ASSOCIATION) || (scheme(url).is_some() && handler(url).is_none()) {
      format!("NOT_FOUND: no app is registered for {what}")
    } else {
      format!("INTERNAL: cannot open {what}: {}", e.message())
    }
  })
}

fn assoc(scheme: &str, what: ASSOCSTR) -> Option<String> {
  let scheme = HSTRING::from(scheme);
  let flags = ASSOCF_IS_PROTOCOL | ASSOCF_NOTRUNCATE | ASSOCF_INIT_IGNOREUNKNOWN;
  let mut buffer = vec![0u16; 1024];
  let mut size = buffer.len() as u32;
  let hr = unsafe { AssocQueryStringW(flags, what, &scheme, PCWSTR::null(), Some(PWSTR(buffer.as_mut_ptr())), &mut size) };
  if hr.is_err() {
    return None;
  }
  let text = String::from_utf16_lossy(&buffer[..(size as usize).saturating_sub(1).min(buffer.len())]);
  let text = text.trim_end_matches('\0').trim().to_string();
  (!text.is_empty()).then_some(text)
}

/// The app that opens `url`'s scheme: its display name (Store apps too), else its executable.
pub fn handler(url: &str) -> Option<String> {
  let scheme = scheme(url)?;
  assoc(&scheme, ASSOCSTR_FRIENDLYAPPNAME).or_else(|| assoc(&scheme, ASSOCSTR_EXECUTABLE))
}

/// `shell.handler`; None for other ops.
pub fn shell_op(op: &str, cmd: &json::V) -> Option<Result<String, String>> {
  if op != "shell.handler" {
    return None;
  }
  Some(url_arg(cmd).map(|url| format!(r#"{{"app":{}}}"#, handler(&url).map_or("null".into(), |app| json::quote(&app)))))
}

/// `shell.open`, answered from its thread; false for other ops.
pub fn async_op(id: u64, json_text: &str) -> bool {
  if !json_text.contains("\"shell.open\"") {
    return false;
  }
  let Ok(cmd) = json::parse(json_text) else { return false };
  if cmd.get("op").and_then(|v| v.as_str()) != Some("shell.open") {
    return false;
  }
  match url_arg(&cmd) {
    Ok(url) => {
      std::thread::spawn(move || crate::reply(id, open(&url).map(|()| "null".to_string())));
    }
    Err(e) => crate::reply(id, Err(e)),
  }
  true
}

#[cfg(test)]
mod tests {
  use super::scheme;

  #[test]
  fn schemes() {
    assert_eq!(scheme("HTTPS://example.com").as_deref(), Some("https"));
    assert_eq!(scheme("mailto:a@b.c").as_deref(), Some("mailto"));
    assert_eq!(scheme("ms-settings:privacy").as_deref(), Some("ms-settings"));
    assert_eq!(scheme("C:\\Users\\a.txt"), None); // a drive letter, not a scheme
    assert_eq!(scheme("no scheme"), None);
  }
}
