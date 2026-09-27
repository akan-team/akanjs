//! Plain text on the Linux clipboard (clipboard plugin): GTK's CLIPBOARD selection (Ctrl+C/V),
//! not PRIMARY (the middle-click selection), on the main thread.
//!   clipboard.writeText {text} → null
//!   clipboard.readText         → {"text"}   "" when the clipboard holds no text
//! readText asks the owner asynchronously (gtk_clipboard_request_text) and answers through
//! crate::reply: gtk_clipboard_wait_for_text, which electrobun uses
//! (electrobun/package/src/native/linux/nativeWrapper.cpp:10249-10275), spins a nested main loop
//! that runs the other windows' sources meanwhile and blocks for as long as the owner takes.
//! writeText also hands the text to the clipboard manager (gtk_clipboard_store, as electrobun
//! does), so it survives the app: GTK does that by itself only at gtk_main's end, which TAO never
//! runs. Without a manager (or on Wayland) that returns at once.

use gtk::gdk;

use crate::json;

fn clipboard() -> gtk::Clipboard {
  gtk::Clipboard::get(&gdk::SELECTION_CLIPBOARD)
}

/// `clipboard.writeText`; None for other ops.
pub fn shell_op(op: &str, cmd: &json::V) -> Option<Result<String, String>> {
  if op != "clipboard.writeText" {
    return None;
  }
  Some(match cmd.get("text").and_then(|v| v.as_str()) {
    Some(text) => {
      let clipboard = clipboard();
      clipboard.set_text(text);
      clipboard.store();
      Ok("null".into())
    }
    None => Err("text must be a string".into()),
  })
}

/// `clipboard.readText`, answered from GTK's callback; false for other ops.
pub fn async_op(id: u64, json_text: &str) -> bool {
  if !json_text.contains("\"clipboard.readText\"") {
    return false;
  }
  let Ok(cmd) = json::parse(json_text) else { return false };
  if cmd.get("op").and_then(|v| v.as_str()) != Some("clipboard.readText") {
    return false;
  }
  clipboard().request_text(move |_, text| crate::reply(id, Ok(format!(r#"{{"text":{}}}"#, json::quote(text.unwrap_or(""))))));
  true
}
