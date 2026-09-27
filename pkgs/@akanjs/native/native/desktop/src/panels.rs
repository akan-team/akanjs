//! Native sheets on an app window (plugins.md Q-P6 (b)): NSOpenPanel and NSSavePanel for the
//! file-picker plugin, NSAlert for the dialog plugin. A sheet answers later, from its completion
//! handler, so these ops take the shell request id and call `super::reply` themselves.
//!
//! - Sheets, not app-modal panels: the other windows keep working, and a second sheet on the same
//!   window is queued by AppKit (Tauri's dialog plugin also passes the parent window to rfd,
//!   tauri-plugins-workspace/plugins/dialog/src/desktop.rs:100-101). The window is shown first when
//!   it is hidden: a sheet on a hidden window never appears and its handler never runs.
//! - Types: MIME types and extensions become UTTypes (UniformTypeIdentifiers, reached through the
//!   objc2 runtime; no `objc2-uniform-type-identifiers` crate, plugins.md Q-P6). A type without a
//!   registered UTType turns the filter off, so a file is never unpickable (the rule of the earlier
//!   osascript version).
//! - The app is not sandboxed, so the picked URLs need no security-scoped access; the panel still
//!   grants this process files in TCC-protected folders (~/Documents), and the plugin host copies
//!   them in-process. A sandboxed build would need startAccessingSecurityScopedResource.
//! - Tests (dev builds only): with AKAN_NATIVE_TEST_PANELS set, every sheet is ended by a timer instead of
//!   a click, through the same completion handlers (`TestAnswers`, dialog_args.rs, shared with Windows and Linux).

use block2::RcBlock;
use objc2::{
  msg_send,
  rc::Retained,
  runtime::{AnyClass, AnyObject},
  MainThreadMarker, Message,
};
use objc2_app_kit::{NSAlert, NSAlertFirstButtonReturn, NSModalResponse, NSModalResponseAbort, NSModalResponseOK, NSOpenPanel, NSSavePanel, NSTextField, NSWindow};
use objc2_foundation::{NSArray, NSPoint, NSRect, NSSize, NSString, NSURL};
use tao::platform::macos::WindowExtMacOS;

use crate::dialog_args::{alert_answer, json_list, mime_answer, open_answer, save_answer, strings, Alert, CANCELLED};
use crate::json::{self, V};

#[link(name = "UniformTypeIdentifiers", kind = "framework")]
extern "C" {}

/// Handles `panel.*` and `alert.*` shell ops. Returns false for any other op.
pub fn shell_op(id: u64, json: &str, windows: &super::Windows) -> bool {
  if !json.contains("\"panel.") && !json.contains("\"alert.") {
    return false;
  }
  let Ok(cmd) = json::parse(json) else { return false };
  let Some(op) = cmd.get("op").and_then(|v| v.as_str()) else { return false };
  if !op.starts_with("panel.") && !op.starts_with("alert.") {
    return false;
  }
  if let Err(e) = run(id, op, &cmd, windows) {
    super::reply(id, Err(e));
  }
  true
}

thread_local! {
  /// Alert sheets on screen by tag (main thread): the parent window and the sheet.
  static OPEN_ALERTS: std::cell::RefCell<std::collections::HashMap<String, (Retained<NSWindow>, Retained<NSWindow>)>> = Default::default();
}

fn run(id: u64, op: &str, cmd: &V, windows: &super::Windows) -> Result<(), String> {
  match op {
    // The call that showed it was cancelled or its page ended: the sheet goes, answering -1.
    "alert.dismiss" => {
      let tag = cmd.get("tag").and_then(|v| v.as_str()).unwrap_or("");
      let open = OPEN_ALERTS.with(|m| m.borrow_mut().remove(tag));
      if let Some((window, sheet)) = &open {
        window.endSheet_returnCode(sheet, NSModalResponseAbort);
      }
      super::reply(id, Ok(format!(r#"{{"dismissed":{}}}"#, open.is_some())));
      Ok(())
    }
    "panel.types" => {
      let utis = utis(&strings(cmd.get("types")));
      super::reply(id, Ok(format!(r#"{{"utis":{}}}"#, utis.map_or("null".into(), |u| json_list(&u.iter().map(|(_, id)| id.clone()).collect::<Vec<_>>())))));
      Ok(())
    }
    "panel.mime" => {
      super::reply(id, Ok(mime_answer(&strings(cmd.get("exts")), mime_for_ext)));
      Ok(())
    }
    "panel.open" | "panel.save" | "alert.show" => {
      let mtm = MainThreadMarker::new().ok_or("not on the main thread")?;
      let wid = match super::window_arg(cmd)? {
        Some(w) => w,
        None => windows.primary().ok_or("there is no window")?,
      };
      let win = windows.map.get(&wid).ok_or_else(|| format!("no window {wid}"))?;
      if !win.window.is_visible() {
        win.window.set_visible(true);
      }
      // Safety: tao's ns_window is the NSWindow of this live window.
      let ns_window: Retained<NSWindow> = unsafe { Retained::retain(win.window.ns_window() as *mut NSWindow) }.ok_or("the window has no NSWindow")?;
      let test = TestAnswers::get(windows.shell.devtools);
      match op {
        "panel.open" => open(mtm, id, cmd, &ns_window, test),
        "panel.save" => save(mtm, id, cmd, &ns_window, test),
        _ => alert(mtm, id, cmd, &ns_window, test),
      }
      Ok(())
    }
    _ => Err(format!("unknown op {op}")),
  }
}

// ───────────────────────── file panels ─────────────────────────

fn open(mtm: MainThreadMarker, id: u64, cmd: &V, window: &NSWindow, test: Option<&'static TestAnswers>) {
  let directory = cmd.get("directory").and_then(|v| v.as_bool()).unwrap_or(false);
  let panel = NSOpenPanel::openPanel(mtm);
  panel.setCanChooseDirectories(directory);
  panel.setCanChooseFiles(!directory);
  panel.setAllowsMultipleSelection(!directory && cmd.get("multiple").and_then(|v| v.as_bool()).unwrap_or(false));
  if !directory {
    if let Some(types) = utis(&strings(cmd.get("types"))) {
      let list: Vec<Retained<AnyObject>> = types.into_iter().map(|(t, _)| t).collect();
      let array = NSArray::from_retained_slice(&list);
      let _: () = unsafe { msg_send![&*panel, setAllowedContentTypes: &*array] };
    }
  }
  prepare_panel(test, &panel);
  let p = panel.clone();
  let handler = RcBlock::new(move |response: NSModalResponse| {
    if response != NSModalResponseOK {
      return super::reply(id, Ok(CANCELLED.into()));
    }
    let paths: Vec<String> = p.URLs().iter().filter_map(|u| u.path().map(|s| s.to_string())).collect();
    super::reply(id, Ok(open_answer(&paths)));
  });
  panel.beginSheetModalForWindow_completionHandler(window, &handler);
  if let Some(t) = test {
    end_panel_later(t, window, &panel, directory);
  }
}

/// Tests: ends a file panel sheet after the delay. The panels run out of process: `ok:` sent from
/// here is ignored, and a directory or name set after the panel is shown does not reach it (verified:
/// it saved under the default name in ~/Documents). So `prepare_panel` sets them before the sheet
/// begins, and ending the sheet with NSModalResponseOK from the parent window reaches the same
/// completion handler. An open panel for files is always cancelled: nothing can be selected.
/// Tests: the directory and name to answer with, set before the sheet is shown.
fn prepare_panel(test: Option<&'static TestAnswers>, panel: &NSSavePanel) {
  let Some(t) = test else { return };
  if let Some(dir) = &t.directory {
    panel.setDirectoryURL(Some(&NSURL::fileURLWithPath(&NSString::from_str(dir))));
  }
  if let Some(name) = &t.name {
    panel.setNameFieldStringValue(&NSString::from_str(name));
  }
}

fn end_panel_later(t: &'static TestAnswers, window: &NSWindow, panel: &NSSavePanel, can_ok: bool) {
  let window = window.retain();
  let panel = panel.retain();
  t.later(move || unsafe {
    if t.panel_ok && can_ok {
      window.endSheet_returnCode(&panel, NSModalResponseOK);
    } else {
      panel.cancel(None);
    }
  });
}

fn save(mtm: MainThreadMarker, id: u64, cmd: &V, window: &NSWindow, test: Option<&'static TestAnswers>) {
  let panel = NSSavePanel::savePanel(mtm);
  panel.setCanCreateDirectories(true);
  if let Some(name) = cmd.get("name").and_then(|v| v.as_str()) {
    panel.setNameFieldStringValue(&NSString::from_str(name));
  }
  prepare_panel(test, &panel);
  let p = panel.clone();
  let handler = RcBlock::new(move |response: NSModalResponse| {
    let path = if response == NSModalResponseOK { p.URL().and_then(|u| u.path()).map(|s| s.to_string()) } else { None };
    super::reply(id, Ok(save_answer(path.as_deref())));
  });
  panel.beginSheetModalForWindow_completionHandler(window, &handler);
  if let Some(t) = test {
    end_panel_later(t, window, &panel, true);
  }
}

// ───────────────────────── alerts ─────────────────────────

/// `alert.show` (dialog_args.rs Alert) as a sheet: the first button is the rightmost one.
fn alert(mtm: MainThreadMarker, id: u64, cmd: &V, window: &NSWindow, test: Option<&'static TestAnswers>) {
  let a = Alert::parse(cmd);
  let (alert, field) = make_alert(mtm, &a.title, &a.message, &a.buttons, a.input.as_ref().map(|(t, p)| (t.as_str(), p.as_str())));
  let f = field.clone();
  let tag = a.tag.clone();
  let handler = RcBlock::new(move |response: NSModalResponse| {
    if let Some(tag) = &tag {
      OPEN_ALERTS.with(|m| m.borrow_mut().remove(tag));
    }
    let button = (response - NSAlertFirstButtonReturn).max(-1);
    super::reply(id, Ok(alert_answer(button, f.as_ref().map(|f| f.stringValue().to_string()).as_deref())));
  });
  alert.beginSheetModalForWindow_completionHandler(window, Some(&handler));
  if let Some(tag) = &a.tag {
    OPEN_ALERTS.with(|m| m.borrow_mut().insert(tag.clone(), (window.retain(), alert.window())));
  }
  if let Some(t) = test {
    end_alert_later(t, window, &alert, field);
  }
}

/// An NSAlert with its buttons and, for a prompt, a text field. Shared with the JavaScript panels (D7).
pub fn make_alert(mtm: MainThreadMarker, title: &str, message: &str, buttons: &[(String, String)], input: Option<(&str, &str)>) -> (Retained<NSAlert>, Option<Retained<NSTextField>>) {
  let alert = NSAlert::new(mtm);
  // messageText is the bold line: the title, or the message when there is no title.
  if title.is_empty() {
    alert.setMessageText(&NSString::from_str(message));
  } else {
    alert.setMessageText(&NSString::from_str(title));
    alert.setInformativeText(&NSString::from_str(message));
  }
  for (label, style) in buttons {
    let button = alert.addButtonWithTitle(&NSString::from_str(label));
    match style.as_str() {
      "cancel" => button.setKeyEquivalent(&NSString::from_str("\u{1b}")),
      "destructive" => button.setHasDestructiveAction(true),
      _ => {}
    }
  }
  let field = input.map(|(text, placeholder)| {
    let field = NSTextField::textFieldWithString(&NSString::from_str(text), mtm);
    field.setFrame(NSRect::new(NSPoint::new(0.0, 0.0), NSSize::new(260.0, 24.0)));
    if !placeholder.is_empty() {
      field.setPlaceholderString(Some(&NSString::from_str(placeholder)));
    }
    alert.setAccessoryView(Some(&field));
    alert.layout();
    alert.window().setInitialFirstResponder(Some(&field));
    field
  });
  (alert, field)
}

/// Tests: ends an alert sheet with the configured button (and text) after the delay.
pub fn end_alert_later(t: &'static TestAnswers, window: &NSWindow, alert: &NSAlert, field: Option<Retained<NSTextField>>) {
  let window = window.retain();
  let sheet = alert.window();
  t.later(move || {
    if let (Some(field), Some(text)) = (&field, &t.text) {
      field.setStringValue(&NSString::from_str(text));
    }
    window.endSheet_returnCode(&sheet, NSAlertFirstButtonReturn + t.button);
  });
}

// ───────────────────────── types ─────────────────────────

/// Broad MIME wildcards as UTType identifiers (the earlier JXA mapping).
fn wildcard(kind: &str) -> Option<&'static str> {
  Some(match kind {
    "image" => "public.image",
    "video" => "public.movie",
    "audio" => "public.audio",
    "text" => "public.text",
    "application" => "public.data",
    "font" => "public.font",
    "model" => "public.3d-content",
    _ => return None,
  })
}

fn ut_type(ty: &str) -> Option<Retained<AnyObject>> {
  let class = AnyClass::get(c"UTType")?;
  let t: Option<Retained<AnyObject>> = unsafe {
    if let Some(kind) = ty.strip_suffix("/*") {
      msg_send![class, typeWithIdentifier: &*NSString::from_str(wildcard(kind)?)]
    } else if ty.contains('/') {
      msg_send![class, typeWithMIMEType: &*NSString::from_str(ty)]
    } else {
      msg_send![class, typeWithFilenameExtension: &*NSString::from_str(ty.trim_start_matches('.'))]
    }
  };
  let t = t?;
  let dynamic: bool = unsafe { msg_send![&*t, isDynamic] };
  (!dynamic).then_some(t)
}

/// The UTTypes and identifiers for `types`, or None (no filter) when any type is unknown or none is given.
fn utis(types: &[String]) -> Option<Vec<(Retained<AnyObject>, String)>> {
  let mut out = Vec::new();
  for ty in types {
    if ty == "*/*" {
      return None;
    }
    let t = ut_type(ty)?;
    let id: Retained<NSString> = unsafe { msg_send![&*t, identifier] };
    out.push((t, id.to_string()));
  }
  (!out.is_empty()).then_some(out)
}

/// The preferred MIME type of a file extension, from UTType.
fn mime_for_ext(ext: &str) -> Option<String> {
  let class = AnyClass::get(c"UTType")?;
  let t: Option<Retained<AnyObject>> = unsafe { msg_send![class, typeWithFilenameExtension: &*NSString::from_str(ext)] };
  let mime: Option<Retained<NSString>> = unsafe { msg_send![&*t?, preferredMIMEType] };
  mime.map(|m| m.to_string())
}

// ───────────────────────── tests (dev builds) ─────────────────────────

/// AKAN_NATIVE_TEST_PANELS answers (dialog_args.rs). On macOS a sheet is ended by an NSTimer.
pub use crate::dialog_args::TestAnswers;

impl TestAnswers {
  /// Runs `f` on the main run loop after the delay (a block-based NSTimer, reached through the runtime).
  pub fn later(&'static self, f: impl Fn() + 'static) {
    let Some(class) = AnyClass::get(c"NSTimer") else { return };
    let block = RcBlock::new(move |_timer: *mut AnyObject| f());
    let _: Option<Retained<AnyObject>> = unsafe { msg_send![class, scheduledTimerWithTimeInterval: self.delay, repeats: false, block: &*block] };
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn uti_mapping_like_the_osascript_version() {
    let ids = |types: &[&str]| utis(&types.iter().map(|s| s.to_string()).collect::<Vec<_>>()).map(|v| v.into_iter().map(|(_, id)| id).collect::<Vec<_>>());
    assert_eq!(
      ids(&["image/*", "application/pdf", "csv", ".md"]),
      Some(vec!["public.image".into(), "com.adobe.pdf".into(), "public.comma-separated-values-text".into(), "net.daringfireball.markdown".into()])
    );
    assert_eq!(ids(&["pdf", "zzzunknown"]), None); // an unknown type turns the filter off
    assert_eq!(ids(&["application/x-nope"]), None);
    assert_eq!(ids(&["*/*"]), None);
    assert_eq!(ids(&[]), None);
    assert_eq!(mime_for_ext("png").as_deref(), Some("image/png"));
    assert_eq!(mime_for_ext("pdf").as_deref(), Some("application/pdf"));
    assert_eq!(mime_for_ext("zzzunknown"), None);
  }
}
