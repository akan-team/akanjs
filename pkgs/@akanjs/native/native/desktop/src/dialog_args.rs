//! What the native dialogs of every desktop OS share (panels.rs on macOS, win/dialogs.rs,
//! linux/dialogs.rs): the arguments of `alert.show`, the answers of `alert.show`, `panel.open`,
//! `panel.save` and `panel.mime`, and the test answers (AKAN_NATIVE_TEST_PANELS). One contract, so the
//! dialog and file-picker plugins keep one desktop.ts.

use std::sync::OnceLock;

use crate::json::{self, V};

// ───────────────────────── alert.show ─────────────────────────

/// `alert.show { title, message, buttons: [{ title, style }], input?: { text, placeholder } }`
/// → `{ button, text? }`, the index of the button that ended the dialog. The first button is the
/// default (Return); a "cancel" button also answers Escape; "destructive" is styled where the OS can.
pub struct Alert {
  pub title: String,
  pub message: String,
  /// (label, style): style is "default", "cancel" or "destructive".
  pub buttons: Vec<(String, String)>,
  /// A prompt's text field: (text, placeholder).
  pub input: Option<(String, String)>,
  /// The page's name for this alert, for `alert.dismiss` (the call was cancelled or its page ended).
  pub tag: Option<String>,
}

impl Alert {
  pub fn parse(cmd: &V) -> Alert {
    let text = |v: Option<&V>, key: &str| v.and_then(|v| v.get(key)).and_then(|v| v.as_str()).unwrap_or("").to_string();
    let mut buttons: Vec<(String, String)> = Vec::new();
    if let Some(V::Arr(list)) = cmd.get("buttons") {
      for b in list {
        let t = b.get("title").and_then(|v| v.as_str()).unwrap_or("OK").to_string();
        let s = b.get("style").and_then(|v| v.as_str()).unwrap_or("default").to_string();
        buttons.push((t, s));
      }
    }
    if buttons.is_empty() {
      buttons.push(("OK".into(), "default".into()));
    }
    let input = cmd.get("input").map(|i| (text(Some(i), "text"), text(Some(i), "placeholder")));
    let tag = cmd.get("tag").and_then(|v| v.as_str()).map(str::to_string);
    Alert { title: text(Some(cmd), "title"), message: text(Some(cmd), "message"), buttons, input, tag }
  }

  /// The bold line and the text under it: the title and the message, or the message alone.
  #[cfg_attr(target_os = "macos", allow(dead_code))]
  pub fn lines(&self) -> (&str, &str) {
    if self.title.is_empty() {
      (&self.message, "")
    } else {
      (&self.title, &self.message)
    }
  }

  /// The button Escape (and a window's close button) answers with; None: one must be clicked.
  #[cfg_attr(target_os = "macos", allow(dead_code))]
  pub fn cancel(&self) -> Option<usize> {
    self.buttons.iter().position(|(_, style)| style == "cancel")
  }
}

/// `alert.show`'s answer.
pub fn alert_answer(button: isize, text: Option<&str>) -> String {
  let text = text.map(|t| format!(r#","text":{}"#, json::quote(t))).unwrap_or_default();
  format!(r#"{{"button":{button}{text}}}"#)
}

// ───────────────────────── panel.* ─────────────────────────

/// A file panel that was closed without a choice.
pub const CANCELLED: &str = r#"{"cancelled":true}"#;

/// `panel.open`'s answer: `{ paths }`, or cancelled when nothing was chosen.
pub fn open_answer(paths: &[String]) -> String {
  if paths.is_empty() {
    return CANCELLED.into();
  }
  format!(r#"{{"paths":{}}}"#, json_list(paths))
}

/// `panel.save`'s answer: `{ path }`, or cancelled.
pub fn save_answer(path: Option<&str>) -> String {
  path.map_or(CANCELLED.into(), |path| format!(r#"{{"path":{}}}"#, json::quote(path)))
}

/// `panel.mime`'s answer: `{ ext: mime }` for the extensions the OS knows.
pub fn mime_answer(exts: &[String], mime_for_ext: impl Fn(&str) -> Option<String>) -> String {
  let pairs: Vec<String> = exts.iter().filter_map(|e| mime_for_ext(e).map(|m| format!("{}:{}", json::quote(e), json::quote(&m)))).collect();
  format!("{{{}}}", pairs.join(","))
}

pub fn strings(v: Option<&V>) -> Vec<String> {
  match v {
    Some(V::Arr(list)) => list.iter().filter_map(|x| x.as_str().map(str::to_string)).collect(),
    _ => Vec::new(),
  }
}

pub fn json_list(items: &[String]) -> String {
  format!("[{}]", items.iter().map(|s| json::quote(s)).collect::<Vec<_>>().join(","))
}

// ───────────────────────── tests (dev builds) ─────────────────────────

/// AKAN_NATIVE_TEST_PANELS (dev builds only; `akan-native test` sets "auto" on every desktop OS): every dialog,
/// file panel and JavaScript alert is shown, then ended by a timer instead of a click, through the
/// same completion path as a click. "auto" = the first alert button and Cancel for file panels.
/// A JSON object sets the answer: `{"delay":300,"button":1,"text":"typed","panel":"ok",
/// "directory":"/tmp/x","name":"out.txt"}`. An open panel for files cannot be answered "ok" this
/// way (nothing can be selected programmatically); it is cancelled. The timers are per OS: an
/// NSTimer (panels.rs), a GLib timeout (linux/dialogs.rs), Win32 and TaskDialog timers (win/dialogs.rs).
pub struct TestAnswers {
  /// Seconds.
  pub delay: f64,
  pub button: isize,
  pub text: Option<String>,
  pub panel_ok: bool,
  pub directory: Option<String>,
  pub name: Option<String>,
}

impl TestAnswers {
  pub fn get(dev: bool) -> Option<&'static TestAnswers> {
    static ANSWERS: OnceLock<Option<TestAnswers>> = OnceLock::new();
    if !dev {
      return None;
    }
    ANSWERS.get_or_init(|| Self::parse(&std::env::var("AKAN_NATIVE_TEST_PANELS").ok()?)).as_ref()
  }

  fn parse(value: &str) -> Option<TestAnswers> {
    let mut t = TestAnswers { delay: 0.3, button: 0, text: None, panel_ok: false, directory: None, name: None };
    if value == "auto" {
      return Some(t);
    }
    let v = json::parse(value).ok()?;
    if let Some(ms) = v.get("delay").and_then(|v| v.as_f64()) {
      t.delay = ms / 1000.0;
    }
    if let Some(b) = v.get("button").and_then(|v| v.as_f64()) {
      t.button = b as isize;
    }
    t.text = v.get("text").and_then(|v| v.as_str()).map(str::to_string);
    t.panel_ok = v.get("panel").and_then(|v| v.as_str()) == Some("ok");
    t.directory = v.get("directory").and_then(|v| v.as_str()).map(str::to_string);
    t.name = v.get("name").and_then(|v| v.as_str()).map(str::to_string);
    Some(t)
  }

  /// The delay in whole milliseconds (Win32 and GLib timers).
  #[cfg_attr(target_os = "macos", allow(dead_code))]
  pub fn delay_ms(&self) -> u32 {
    (self.delay * 1000.0).round().clamp(1.0, u32::MAX as f64) as u32
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn alert_args() {
    let a = Alert::parse(&json::parse(r#"{"title":"T","message":"M","buttons":[{"title":"Yes"},{"title":"No","style":"cancel"}],"input":{"text":"abc"}}"#).unwrap());
    assert_eq!((a.lines(), a.cancel(), a.input.clone()), (("T", "M"), Some(1), Some(("abc".into(), "".into()))));
    let b = Alert::parse(&json::parse(r#"{"message":"only"}"#).unwrap());
    assert_eq!((b.lines(), b.cancel(), b.buttons.clone()), (("only", ""), None, vec![("OK".into(), "default".into())]));
    assert_eq!(alert_answer(1, Some("a\"b")), r#"{"button":1,"text":"a\"b"}"#);
    assert_eq!(alert_answer(-1, None), r#"{"button":-1}"#);
  }

  #[test]
  fn panel_answers() {
    assert_eq!(open_answer(&[]), CANCELLED);
    assert_eq!(open_answer(&["/a b".into()]), r#"{"paths":["/a b"]}"#);
    assert_eq!(save_answer(None), CANCELLED);
    assert_eq!(save_answer(Some("C:\\x.txt")), r#"{"path":"C:\\x.txt"}"#);
    assert_eq!(mime_answer(&["png".into(), "zzz".into()], |e| (e == "png").then(|| "image/png".into())), r#"{"png":"image/png"}"#);
  }

  #[test]
  fn test_answers() {
    let t = TestAnswers::parse(r#"{"delay":50,"button":1,"text":"hi","panel":"ok","directory":"/tmp","name":"a.txt"}"#).unwrap();
    assert_eq!((t.delay, t.button, t.text.as_deref(), t.panel_ok, t.directory.as_deref(), t.name.as_deref()), (0.05, 1, Some("hi"), true, Some("/tmp"), Some("a.txt")));
    assert_eq!(t.delay_ms(), 50);
    let auto = TestAnswers::parse("auto").unwrap();
    assert_eq!((auto.button, auto.panel_ok, auto.delay_ms()), (0, false, 300));
    assert!(TestAnswers::parse("{not json").is_none());
  }
}
