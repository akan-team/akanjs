//! Opening URLs with their default app on Linux (opener, browser and auth-session plugins).
//!   shell.open    {url} → null      g_app_info_launch_default_for_uri_async, answered through crate::reply
//!   shell.handler {url} → {"app"}   the desktop entry registered for the URL's scheme, or null
//! Errors: `NOT_FOUND: …` when no app is registered for the scheme, `INTERNAL: …` otherwise.
//!
//! GIO reads the same associations as xdg-open (mimeapps.list, x-scheme-handler/<scheme>) and goes
//! through the OpenURI portal by itself inside Flatpak or Snap. Asynchronously, because launching
//! may wait for D-Bus activation. electrobun calls it synchronously and falls back to
//! `system("xdg-open …")` (electrobun/package/src/native/linux/nativeWrapper.cpp:9931-9965), which
//! splices the URL into a shell command; GIO needs no fallback. The lookup is what Tauri's
//! deep-link plugin asks `xdg-mime query default x-scheme-handler/<scheme>` for
//! (tauri-plugins-workspace/plugins/deep-link/src/lib.rs:494-513), without a process.

use gtk::gio;
use gtk::prelude::*;

use crate::json;

fn url_arg(cmd: &json::V) -> Result<String, String> {
  let url = cmd.get("url").and_then(|v| v.as_str()).ok_or("url must be a string")?;
  if url.is_empty() || url.chars().any(char::is_control) {
    return Err("url must be a URL".into());
  }
  Ok(url.to_string())
}

fn scheme(url: &str) -> Option<String> {
  let (scheme, _) = url.split_once(':')?;
  let ok = scheme.starts_with(|c: char| c.is_ascii_alphabetic()) && scheme.chars().all(|c| c.is_ascii_alphanumeric() || "+-.".contains(c));
  ok.then(|| scheme.to_ascii_lowercase())
}

/// The app for `url`'s scheme: its desktop file id ("firefox.desktop"), else its name.
pub fn handler(url: &str) -> Option<String> {
  let app = gio::AppInfo::default_for_uri_scheme(&scheme(url)?)?;
  Some(app.id().map_or_else(|| app.name().to_string(), |id| id.to_string()))
}

/// `shell.handler`; None for other ops.
pub fn shell_op(op: &str, cmd: &json::V) -> Option<Result<String, String>> {
  if op != "shell.handler" {
    return None;
  }
  Some(url_arg(cmd).map(|url| format!(r#"{{"app":{}}}"#, handler(&url).map_or("null".into(), |app| json::quote(&app)))))
}

/// `shell.open`, answered once GIO launched the app; false for other ops.
pub fn async_op(id: u64, json_text: &str) -> bool {
  if !json_text.contains("\"shell.open\"") {
    return false;
  }
  let Ok(cmd) = json::parse(json_text) else { return false };
  if cmd.get("op").and_then(|v| v.as_str()) != Some("shell.open") {
    return false;
  }
  let url = match url_arg(&cmd) {
    Ok(url) => url,
    Err(e) => {
      crate::reply(id, Err(e));
      return true;
    }
  };
  let what = scheme(&url).map_or_else(|| url.clone(), |s| format!("{s}:"));
  let target = url.clone();
  gio::AppInfo::launch_default_for_uri_async(&target, None::<&gio::AppLaunchContext>, gio::Cancellable::NONE, move |result| {
    crate::reply(
      id,
      result.map(|()| "null".to_string()).map_err(|e| {
        // "No application is registered as handling this file" (g_app_info_launch_default_for_uri).
        if e.matches(gio::IOErrorEnum::NotSupported) || (e.matches(gio::IOErrorEnum::NotFound) && handler(&url).is_none()) {
          format!("NOT_FOUND: no app is registered for {what}")
        } else {
          format!("INTERNAL: cannot open {what}: {e}")
        }
      }),
    )
  });
  true
}
