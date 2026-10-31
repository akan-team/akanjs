//! Work the app does while nobody looks at it, held against App Nap on macOS (updates plugin):
//!   activity.begin {reason} → {"id":n}   NSProcessInfo beginActivityWithOptions:reason:, user initiated,
//!                                         idle system sleep allowed
//!   activity.end {id}       → null       endActivity:; an id already ended is no error
//!
//! - App Nap takes a hidden or covered app 30–50 s after it was last seen: the threads of the process drop to
//!   priority 4 (darwinbg) and its I/O is throttled (the processes it starts keep priority 31). On an idle Mac the
//!   work only slows down; on a busy one it waits for idle cores. An 80 MB update download, unpacked and checked,
//!   took 106 s napped and 3.4 s held, every core busy (measured, 2026-11-01). Held, a hidden app stays at 28.
//! - The activity also ends with the process, so a quit or a crash never leaves one behind.

use std::{cell::RefCell, collections::HashMap};

use objc2::{
  rc::Retained,
  runtime::{NSObjectProtocol, ProtocolObject},
};
use objc2_foundation::{NSActivityOptions, NSProcessInfo, NSString};

use crate::json::V;

type Token = Retained<ProtocolObject<dyn NSObjectProtocol>>;

thread_local! {
  static HELD: RefCell<(u64, HashMap<u64, Token>)> = RefCell::new((0, HashMap::new()));
}

pub fn shell_op(op: &str, cmd: &V) -> Option<Result<String, String>> {
  match op {
    "activity.begin" => Some(begin(cmd)),
    "activity.end" => Some(end(cmd)),
    _ => None,
  }
}

fn begin(cmd: &V) -> Result<String, String> {
  let reason = cmd.get("reason").and_then(|v| v.as_str()).filter(|r| !r.is_empty()).ok_or("reason must be a non-empty string")?;
  let token = NSProcessInfo::processInfo().beginActivityWithOptions_reason(NSActivityOptions::UserInitiatedAllowingIdleSystemSleep, &NSString::from_str(reason));
  let id = HELD.with(|held| {
    let (next, tokens) = &mut *held.borrow_mut();
    *next += 1;
    tokens.insert(*next, token);
    *next
  });
  Ok(format!(r#"{{"id":{id}}}"#))
}

fn end(cmd: &V) -> Result<String, String> {
  let id = match cmd.get("id").and_then(|v| v.as_f64()) {
    Some(n) if n >= 1.0 && n.fract() == 0.0 && n <= u64::MAX as f64 => n as u64,
    _ => return Err("id must be an activity id".into()),
  };
  if let Some(token) = HELD.with(|held| held.borrow_mut().1.remove(&id)) {
    unsafe { NSProcessInfo::processInfo().endActivity(&token) };
  }
  Ok("null".into())
}
