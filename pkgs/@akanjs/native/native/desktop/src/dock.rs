//! The app's Dock tile on macOS (dock plugin, plugins.md §5): badge label, progress bar and
//! whether the app has a Dock icon at all. Everything goes through TAO's event loop target, as
//! Tauri does (tauri/crates/tauri-runtime-wry/src/lib.rs:3527-3555, 3200-3204):
//!   dock.getState                              → state
//!   dock.setBadge {label: string|null}          → state   TAO set_badge_label (tao/src/platform_impl/macos/badge.rs:5-13)
//!   dock.setProgress {progress: 0..1|null, state?: "normal"|"paused"|"error"} → state
//!                                                         TAO set_progress_bar (tao/src/platform_impl/macos/progress_bar.rs:14-43)
//!   dock.setVisible {visible: bool}             → state   TAO set_activation_policy_at_runtime (Regular | Accessory)
//! state = {"visible","policy","badge","progress","progressState"}
//!
//! Know-how from the references:
//! - TAO draws the progress bar itself: an NSProgressIndicator subclass on an NSImageView of the app
//!   icon that becomes the tile's content view (progress_bar.rs:45-71). It takes whole percents
//!   (0–100), draws "indeterminate" like "normal", paused in yellow and error in red
//!   (progress_bar.rs:145-150). Hiding it keeps that image view, so the tile shows a snapshot of the
//!   icon taken when the bar first appeared.
//! - Dock visibility: TAO also has set_dock_visibility, which uses the Carbon TransformProcessType
//!   and ignores a hide within 1 s of a show, because a fast hide/show left duplicate Dock icons
//!   (tao/src/platform_impl/macos/dock.rs:42-58). akan-native uses NSApplication.setActivationPolicy (the
//!   supported API that TAO's set_activation_policy_at_runtime calls), which applies at once and
//!   reads back. An accessory app has no Dock icon, is not in Cmd+Tab and shows no menu bar; its
//!   windows stay and key equivalents still work.
//! - The activation policy is app-wide state that the page cannot see, so every op answers with
//!   the whole state, and a reloaded page reads it back with getState.

use std::cell::Cell;

use objc2::MainThreadMarker;
use objc2_app_kit::{NSApplication, NSApplicationActivationPolicy};
use tao::{
  event_loop::EventLoopWindowTarget,
  platform::macos::{ActivationPolicy, EventLoopWindowTargetExtMacOS},
  window::{ProgressBarState, ProgressState},
};

use crate::json::{self, V};

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Kind {
  Normal,
  Paused,
  Error,
}

impl Kind {
  fn name(self) -> &'static str {
    match self {
      Kind::Normal => "normal",
      Kind::Paused => "paused",
      Kind::Error => "error",
    }
  }
}

/// A shown progress bar: the fraction the page asked for (0..1) and how it is drawn.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Progress {
  pub value: f64,
  pub kind: Kind,
}

thread_local! {
  /// The bar last set (main thread). TAO's indicator has no getter.
  static PROGRESS: Cell<Option<Progress>> = const { Cell::new(None) };
}

/// `dock.setProgress` arguments: `progress` 0..1 or null (hide), `state` normal | paused | error.
pub fn parse_progress(cmd: &V) -> Result<Option<Progress>, String> {
  let value = match cmd.get("progress") {
    None | Some(V::Null) => return Ok(None),
    Some(V::Num(n)) if (0.0..=1.0).contains(n) => *n,
    Some(_) => return Err("progress must be a number from 0 to 1, or null".into()),
  };
  let bad_state = || Err("state must be one of normal, paused, error".to_string());
  let kind = match cmd.get("state") {
    None | Some(V::Null) => Kind::Normal,
    Some(V::Str(s)) => match s.as_str() {
      "normal" => Kind::Normal,
      "paused" => Kind::Paused,
      "error" => Kind::Error,
      _ => return bad_state(),
    },
    Some(_) => return bad_state(),
  };
  Ok(Some(Progress { value, kind }))
}

/// TAO's progress takes whole percents.
pub fn percent(value: f64) -> u64 {
  (value * 100.0).round().clamp(0.0, 100.0) as u64
}

fn progress_bar(progress: Option<Progress>) -> ProgressBarState {
  match progress {
    None => ProgressBarState { state: Some(ProgressState::None), progress: None, desktop_filename: None },
    Some(p) => ProgressBarState {
      state: Some(match p.kind {
        Kind::Normal => ProgressState::Normal,
        Kind::Paused => ProgressState::Paused,
        Kind::Error => ProgressState::Error,
      }),
      progress: Some(percent(p.value)),
      desktop_filename: None,
    },
  }
}

/// `dock.setBadge`'s label: null or "" removes the badge.
pub fn parse_label(cmd: &V) -> Result<Option<String>, String> {
  match cmd.get("label") {
    None | Some(V::Null) => Ok(None),
    Some(V::Str(s)) if s.is_empty() => Ok(None),
    Some(V::Str(s)) => Ok(Some(s.clone())),
    Some(_) => Err("label must be a string or null".into()),
  }
}

fn policy_name(policy: NSApplicationActivationPolicy) -> &'static str {
  match policy {
    NSApplicationActivationPolicy::Regular => "regular",
    NSApplicationActivationPolicy::Accessory => "accessory",
    _ => "prohibited", // `akan-native test` starts the app this way (lib.rs Config::activation)
  }
}

pub fn state_json(badge: Option<&str>, policy: &str, progress: Option<Progress>) -> String {
  let badge = badge.map_or_else(|| "null".into(), json::quote);
  let (value, kind) = progress.map_or(("null".into(), "null".into()), |p| (format!("{}", p.value), format!(r#""{}""#, p.kind.name())));
  format!(r#"{{"visible":{},"policy":"{policy}","badge":{badge},"progress":{value},"progressState":{kind}}}"#, policy == "regular")
}

fn state(mtm: MainThreadMarker) -> String {
  let app = NSApplication::sharedApplication(mtm);
  let badge = app.dockTile().badgeLabel().map(|b| b.to_string());
  state_json(badge.as_deref(), policy_name(app.activationPolicy()), PROGRESS.with(Cell::get))
}

/// dock.* shell ops; None for other ops.
pub fn shell_op<T>(op: &str, cmd: &V, target: &EventLoopWindowTarget<T>) -> Option<Result<String, String>> {
  if !op.starts_with("dock.") {
    return None;
  }
  Some(run(op, cmd, target))
}

fn run<T>(op: &str, cmd: &V, target: &EventLoopWindowTarget<T>) -> Result<String, String> {
  let mtm = MainThreadMarker::new().ok_or("the Dock tile is changed on the main thread")?;
  match op {
    "dock.getState" => {}
    "dock.setBadge" => target.set_badge_label(parse_label(cmd)?),
    "dock.setProgress" => {
      let progress = parse_progress(cmd)?;
      target.set_progress_bar(progress_bar(progress));
      PROGRESS.with(|p| p.set(progress));
    }
    "dock.setVisible" => {
      let visible = cmd.get("visible").and_then(|v| v.as_bool()).ok_or("visible must be a boolean")?;
      target.set_activation_policy_at_runtime(if visible { ActivationPolicy::Regular } else { ActivationPolicy::Accessory });
    }
    _ => return Err(format!("unknown op {op}")),
  }
  Ok(state(mtm))
}

#[cfg(test)]
mod tests {
  use super::*;

  fn cmd(s: &str) -> V {
    json::parse(s).unwrap()
  }

  #[test]
  fn progress_arguments() {
    assert_eq!(parse_progress(&cmd(r#"{}"#)), Ok(None));
    assert_eq!(parse_progress(&cmd(r#"{"progress":null}"#)), Ok(None));
    assert_eq!(parse_progress(&cmd(r#"{"progress":0.25}"#)), Ok(Some(Progress { value: 0.25, kind: Kind::Normal })));
    assert_eq!(parse_progress(&cmd(r#"{"progress":1,"state":"normal"}"#)), Ok(Some(Progress { value: 1.0, kind: Kind::Normal })));
    assert_eq!(parse_progress(&cmd(r#"{"progress":0,"state":"paused"}"#)), Ok(Some(Progress { value: 0.0, kind: Kind::Paused })));
    assert_eq!(parse_progress(&cmd(r#"{"progress":0.5,"state":"error"}"#)), Ok(Some(Progress { value: 0.5, kind: Kind::Error })));
    for bad in [r#"{"progress":1.01}"#, r#"{"progress":-0.1}"#, r#"{"progress":"0.5"}"#, r#"{"progress":0.5,"state":"indeterminate"}"#, r#"{"progress":0.5,"state":1}"#] {
      assert!(parse_progress(&cmd(bad)).is_err(), "{bad}");
    }
  }

  #[test]
  fn whole_percents() {
    assert_eq!(percent(0.0), 0);
    assert_eq!(percent(0.004), 0);
    assert_eq!(percent(0.335), 34);
    assert_eq!(percent(1.0), 100);
  }

  #[test]
  fn labels() {
    assert_eq!(parse_label(&cmd(r#"{"label":"3"}"#)), Ok(Some("3".into())));
    assert_eq!(parse_label(&cmd(r#"{"label":""}"#)), Ok(None));
    assert_eq!(parse_label(&cmd(r#"{"label":null}"#)), Ok(None));
    assert!(parse_label(&cmd(r#"{"label":3}"#)).is_err());
  }

  #[test]
  fn state_is_json() {
    let s = state_json(Some("new \"1\""), "regular", Some(Progress { value: 0.5, kind: Kind::Paused }));
    assert_eq!(s, r#"{"visible":true,"policy":"regular","badge":"new \"1\"","progress":0.5,"progressState":"paused"}"#);
    assert!(json::parse(&s).is_ok());
    assert_eq!(state_json(None, "prohibited", None), r#"{"visible":false,"policy":"prohibited","badge":null,"progress":null,"progressState":null}"#);
  }
}
