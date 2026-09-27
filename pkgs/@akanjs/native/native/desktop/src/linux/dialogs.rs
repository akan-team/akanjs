//! Native dialogs on Linux (GTK 3) for the dialog and file-picker plugins, with the ops and JSON of
//! the macOS sheets (panels.rs, dialog_args.rs): `alert.show` → GtkMessageDialog, `panel.open` and
//! `panel.save` → GtkFileChooserNative, `panel.mime` → GIO's shared-mime-info database. And D7
//! (JavaScript alert/confirm/prompt) under tests.
//!
//! - No nested main loop (not gtk_dialog_run / gtk_native_dialog_run as in electrobun/package/src/
//!   native/linux/nativeWrapper.cpp): a dialog is shown and answers from its response signal, so the
//!   TAO loop, IPC responses and the other windows keep running meanwhile.
//! - Modal to its window only, like a sheet: the window gets a window group of its own, which the
//!   transient dialog joins, and GTK's modal grab covers one group. The window is shown first when it
//!   is hidden.
//! - GtkFileChooserNative goes through the XDG desktop portal where GTK does (Flatpak, Snap,
//!   GTK_USE_PORTAL=1) and is GTK's own chooser otherwise (electrobun/package/src/native/linux/
//!   native_file_dialog.h). GTK does not keep a native dialog alive: its response handler does.
//! - Types: extensions become case-insensitive patterns, MIME types (also "image/*") GTK MIME filters.
//!   A MIME type shared-mime-info does not know turns the filter off, so a file is never unpickable
//!   (the macOS rule). One filter, no "All files" choice, as on macOS.

use std::{
  cell::{Cell, RefCell},
  rc::Rc,
  time::Duration,
};

use gtk::{gio, glib, prelude::*};
use tao::platform::unix::WindowExtUnix;

use crate::dialog_args::{alert_answer, mime_answer, open_answer, save_answer, strings, Alert, TestAnswers, CANCELLED};
use crate::json::{self, V};

/// Handles `panel.open`, `panel.save`, `panel.mime` and `alert.show`. false: another op (also
/// `panel.types`, macOS UTIs, which lib.rs answers UNSUPPORTED).
pub fn async_op(id: u64, json: &str, windows: &crate::Windows) -> bool {
  if !json.contains("\"panel.") && !json.contains("\"alert.") {
    return false;
  }
  let Ok(cmd) = json::parse(json) else { return false };
  match cmd.get("op").and_then(|v| v.as_str()) {
    Some("panel.mime") => crate::reply(id, Ok(mime_answer(&strings(cmd.get("exts")), mime_for_ext))),
    // The call that showed it was cancelled or its page ended: the dialog goes, answering -1.
    Some("alert.dismiss") => {
      let tag = cmd.get("tag").and_then(|v| v.as_str()).unwrap_or("");
      let end = OPEN_ALERTS.with(|m| m.borrow_mut().remove(tag));
      let dismissed = end.is_some();
      if let Some(end) = end {
        end();
      }
      crate::reply(id, Ok(format!(r#"{{"dismissed":{dismissed}}}"#)));
    }
    Some(op @ ("panel.open" | "panel.save" | "alert.show")) => {
      if let Err(e) = show(id, op, &cmd, windows) {
        crate::reply(id, Err(e));
      }
    }
    _ => return false,
  }
  true
}

fn show(id: u64, op: &str, cmd: &V, windows: &crate::Windows) -> Result<(), String> {
  let wid = match crate::window_arg(cmd)? {
    Some(w) => w,
    None => windows.primary().ok_or("there is no window")?,
  };
  let win = windows.map.get(&wid).ok_or_else(|| format!("no window {wid}"))?;
  if !win.window.is_visible() {
    win.window.set_visible(true);
  }
  let parent = win.window.gtk_window();
  if !parent.has_group() {
    gtk::WindowGroup::new().add_window(parent);
  }
  let test = TestAnswers::get(windows.shell.devtools);
  match op {
    "alert.show" => alert(id, &Alert::parse(cmd), parent, test),
    "panel.save" => chooser(id, Chooser::Save, cmd, parent, test),
    _ if cmd.get("directory").and_then(|v| v.as_bool()).unwrap_or(false) => chooser(id, Chooser::Folder, cmd, parent, test),
    _ => chooser(id, Chooser::Files, cmd, parent, test),
  }
  Ok(())
}

/// Tests: runs `f` on the main loop after the delay.
fn later(t: &'static TestAnswers, f: impl FnOnce() + 'static) {
  glib::timeout_add_local_once(Duration::from_millis(t.delay_ms().into()), f);
}

// ───────────────────────── alerts ─────────────────────────

thread_local! {
  /// Alerts on screen by tag (main thread): what ends one without an answer.
  static OPEN_ALERTS: std::cell::RefCell<std::collections::HashMap<String, Box<dyn Fn()>>> = Default::default();
}

/// `alert.show` as a GtkMessageDialog: the title is the bold line, the message the text under it
/// (NSAlert's messageText / informativeText). GNOME order: the default (first) button is the
/// rightmost one, so the buttons are added last to first. Escape and the close button answer with
/// the cancel button; without one the dialog has no close button and Escape does nothing.
fn alert(id: u64, a: &Alert, parent: &gtk::ApplicationWindow, test: Option<&'static TestAnswers>) {
  let (primary, secondary) = a.lines();
  let dialog = gtk::MessageDialog::new(Some(parent), gtk::DialogFlags::MODAL | gtk::DialogFlags::DESTROY_WITH_PARENT, gtk::MessageType::Other, gtk::ButtonsType::None, primary);
  if !secondary.is_empty() {
    dialog.set_secondary_text(Some(secondary));
  }
  for (i, (label, style)) in a.buttons.iter().enumerate().rev() {
    let button = dialog.add_button(label, gtk::ResponseType::Other(i as u16));
    match style.as_str() {
      "destructive" => button.style_context().add_class("destructive-action"),
      "default" if i == 0 => button.style_context().add_class("suggested-action"),
      _ => {}
    }
  }
  dialog.set_default_response(gtk::ResponseType::Other(0));
  let cancel = a.cancel();
  dialog.set_deletable(cancel.is_some());
  let entry = a.input.as_ref().map(|(text, placeholder)| {
    let entry = gtk::Entry::new();
    entry.set_text(text);
    if !placeholder.is_empty() {
      entry.set_placeholder_text(Some(placeholder));
    }
    entry.set_activates_default(true); // Return: the first button
    if let Ok(area) = dialog.message_area().downcast::<gtk::Box>() {
      area.pack_end(&entry, false, false, 0);
    }
    entry
  });

  let done = Cell::new(false);
  let tag = a.tag.clone();
  let finish = Rc::new({
    let entry = entry.clone();
    let tag = tag.clone();
    move |dialog: &gtk::MessageDialog, button: isize| {
      if done.replace(true) {
        return;
      }
      if let Some(tag) = &tag {
        OPEN_ALERTS.with(|m| m.borrow_mut().remove(tag));
      }
      let text = entry.as_ref().map(|e| e.text().to_string());
      crate::reply(id, Ok(alert_answer(button, text.as_deref())));
      // Safety: nothing uses the dialog after this; destroying it also drops this handler.
      unsafe { dialog.destroy() };
    }
  });
  dialog.connect_response({
    let finish = finish.clone();
    move |dialog, response| match response {
      gtk::ResponseType::Other(i) => finish(dialog, i as isize),
      gtk::ResponseType::DeleteEvent => {
        if let Some(c) = cancel {
          finish(dialog, c as isize);
        }
      }
      _ => {}
    }
  });
  if let Some(tag) = tag {
    let (finish, dialog) = (finish.clone(), dialog.clone());
    OPEN_ALERTS.with(|m| m.borrow_mut().insert(tag, Box::new(move || finish(&dialog, -1))));
  }
  // Not show_all: it would also show the dialog's hidden placeholder image ("image-missing").
  dialog.show();
  if let Some(entry) = &entry {
    entry.show();
    entry.grab_focus();
  }
  if let Some(t) = test {
    let n = a.buttons.len() as isize;
    later(t, move || {
      if let (Some(entry), Some(text)) = (&entry, &t.text) {
        entry.set_text(text);
      }
      // A click's path (the response signal); a button the dialog does not have is answered as is.
      if (0..n).contains(&t.button) {
        dialog.response(gtk::ResponseType::Other(t.button as u16));
      } else {
        finish(&dialog, t.button);
      }
    });
  }
}

// ───────────────────────── file choosers ─────────────────────────

#[derive(Clone, Copy, PartialEq)]
enum Chooser {
  Files,
  Folder,
  Save,
}

/// `panel.open` (files or a folder) and `panel.save` as a GtkFileChooserNative on the window.
fn chooser(id: u64, kind: Chooser, cmd: &V, parent: &gtk::ApplicationWindow, test: Option<&'static TestAnswers>) {
  let (action, title) = match kind {
    Chooser::Files => (gtk::FileChooserAction::Open, "Open File"),
    Chooser::Folder => (gtk::FileChooserAction::SelectFolder, "Select Folder"),
    Chooser::Save => (gtk::FileChooserAction::Save, "Save File"),
  };
  // None: GTK's own (translated) Open / Save / Select and Cancel labels.
  let native = gtk::FileChooserNative::new(Some(title), Some(parent), action, None, None);
  native.set_modal(true);
  match kind {
    Chooser::Files => {
      native.set_select_multiple(cmd.get("multiple").and_then(|v| v.as_bool()).unwrap_or(false));
      if let Some(filter) = filter(&strings(cmd.get("types"))) {
        native.add_filter(filter.clone());
        native.set_filter(&filter);
      }
    }
    Chooser::Save => {
      // The plugin writes the file without asking again, as after NSSavePanel.
      native.set_do_overwrite_confirmation(true);
      native.set_create_folders(true);
      if let Some(name) = cmd.get("name").and_then(|v| v.as_str()) {
        native.set_current_name(name);
      }
    }
    Chooser::Folder => {}
  }
  // Tests: the answer's folder and name, set before the chooser is shown (as on macOS).
  if let Some(t) = test {
    if let Some(dir) = &t.directory {
      native.set_current_folder(dir);
    }
    if let (Some(name), Chooser::Save) = (&t.name, kind) {
      native.set_current_name(name);
    }
  }

  let keep = RefCell::new(Some(native.clone()));
  let respond = Rc::new(move |native: &gtk::FileChooserNative, accepted: bool| {
    let Some(_alive) = keep.borrow_mut().take() else { return }; // answered already
    let answer = match (accepted, kind) {
      (false, _) => CANCELLED.into(),
      (true, Chooser::Save) => save_answer(native.filename().as_deref().and_then(|p| p.to_str())),
      (true, _) => open_answer(&native.filenames().iter().filter_map(|p| p.to_str().map(str::to_string)).collect::<Vec<_>>()),
    };
    crate::reply(id, Ok(answer));
  });
  native.connect_response({
    let respond = respond.clone();
    move |native, response| respond(native, response == gtk::ResponseType::Accept)
  });
  native.show();
  if let Some(t) = test {
    // hide() ends the chooser without a response signal (GtkNativeDialog docs), so the answer goes
    // to the same handler from here. A choice of files cannot be made this way: it is cancelled.
    later(t, move || {
      native.hide();
      respond(&native, t.panel_ok && kind != Chooser::Files);
    });
  }
}

/// One filter for all of `types`, or None (every file) when one is "*/*" or unknown.
fn filter(types: &[String]) -> Option<gtk::FileFilter> {
  if types.is_empty() {
    return None;
  }
  let mut registered: Option<Vec<glib::GString>> = None;
  let mut known = |mime: &str| {
    let list = registered.get_or_insert_with(gio::content_types_get_registered);
    match mime.strip_suffix('*') {
      Some(prefix) => list.iter().any(|t| t.starts_with(prefix)),
      None => list.iter().any(|t| t == mime),
    }
  };
  let filter = gtk::FileFilter::new();
  for ty in types {
    if ty == "*/*" {
      return None;
    }
    if ty.contains('/') {
      if !known(ty) {
        return None;
      }
      filter.add_mime_type(ty);
    } else {
      filter.add_pattern(&pattern(ty));
    }
  }
  filter.set_name(Some(&types.join(", ")));
  Some(filter)
}

/// "pdf" or ".pdf" → "*.[pP][dD][fF]": GTK 3 patterns are case-sensitive (GTK 4 has add_suffix).
fn pattern(ext: &str) -> String {
  let mut p = String::from("*.");
  for c in ext.trim_start_matches('.').chars() {
    match c {
      c if c.is_alphabetic() => p.extend(['[', c.to_ascii_lowercase(), c.to_ascii_uppercase(), ']']),
      '*' | '?' | '[' | ']' | '\\' => p.extend(['[', c, ']']),
      c => p.push(c),
    }
  }
  p
}

/// The MIME type of a file extension from shared-mime-info (GIO's content types are MIME types here).
fn mime_for_ext(ext: &str) -> Option<String> {
  let (ty, uncertain) = gio::content_type_guess(Some(format!("file.{ext}")), &[]);
  if uncertain || gio::content_type_is_unknown(&ty) {
    return None;
  }
  gio::content_type_get_mime_type(&ty).map(|m| m.to_string())
}

// ───────────────────────── D7 ─────────────────────────

/// D7 under tests: WebKitGTK shows its own JavaScript alert/confirm/prompt dialogs, which wait for a
/// click. With AKAN_NATIVE_TEST_PANELS (dev builds) the WebKitWebView's script-dialog signal answers them
/// instead: the handler keeps the dialog (webkit_script_dialog_ref, the asynchronous form), sets the
/// answer and closes it after the delay; the page's script waits meanwhile, as behind a real dialog.
/// Without the variable WebKit's own dialogs stay.
pub fn install_js_dialogs(dev: bool, webview: &wry::WebView) {
  use webkit2gtk::{ScriptDialogType, WebViewExt};
  use wry::WebViewExtUnix;
  let Some(t) = TestAnswers::get(dev) else { return };
  webview.webview().connect_script_dialog(move |_, dialog| {
    let accept = t.button == 0;
    match dialog.dialog_type() {
      ScriptDialogType::Confirm | ScriptDialogType::BeforeUnloadConfirm => dialog.confirm_set_confirmed(accept),
      // As on macOS, a prompt keeps its default text.
      ScriptDialogType::Prompt if accept => {
        let text = t.text.clone().or_else(|| dialog.prompt_get_default_text().map(|s| s.to_string())).unwrap_or_default();
        dialog.prompt_set_text(&text);
      }
      _ => {}
    }
    let dialog = dialog.clone();
    later(t, move || dialog.close());
    true
  });
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn patterns_ignore_case() {
    assert_eq!(pattern("pdf"), "*.[pP][dD][fF]");
    assert_eq!(pattern(".tar.gz"), "*.[tT][aA][rR].[gG][zZ]");
    assert_eq!(pattern("mp3"), "*.[mM][pP]3");
  }
}
