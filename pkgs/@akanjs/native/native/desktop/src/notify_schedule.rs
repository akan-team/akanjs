//! Local notifications on Windows and Linux: the schedule behind the notify.* ops of
//! win/notify.rs and linux/notify.rs, which only show, list and remove what is on screen.
//! A freedesktop notification server keeps no schedule at all, and Windows' ScheduledToastNotification
//! cannot repeat every minute, hour, day or week and reports no click to an unpackaged app
//! without a COM activator (win/notify.rs). So the shell keeps the schedule itself: a thread
//! shows each notification when it is due, for as long as the app runs, like the web plugin's
//! timers (plugins/local-notifications/src/timers.ts).
//!
//! The pending ones are kept in the plugin's file (`store`, in the app data folder) and come back
//! at the next launch (notify.restore), as the OS keeps them on macOS. Nothing is shown while the
//! app is not running: a one-shot that came due meanwhile is shown at the next launch, late, and a
//! series goes on with its next occurrence (missed ones are skipped, as while the machine sleeps).
//!
//! Same arguments and answers as notify.rs on macOS:
//!   items    [{id, title, body, at, every?, data?}]  (at: epoch ms, data: JSON text)
//!   requests {id, title, body, data, at, every, next, date, ours}
//! A repeating series keeps its phase: occurrence n is `at` plus n intervals, day and week in
//! local calendar days (09:00 stays 09:00 across DST), as the calendar triggers on macOS and iOS.

use std::path::{Path, PathBuf};
use std::sync::{Condvar, Mutex, OnceLock};
use std::time::Duration;

use crate::json::{self, V};

/// Longest wait between checks: the thread sleeps on a monotonic clock, while due times are
/// wall-clock (a suspended machine or a changed clock is noticed within this).
const MAX_WAIT: Duration = Duration::from_secs(10);

#[derive(Clone, Copy, PartialEq)]
pub enum Every {
  Minute,
  Hour,
  Day,
  Week,
}

impl Every {
  fn parse(s: &str) -> Option<Self> {
    match s {
      "minute" => Some(Every::Minute),
      "hour" => Some(Every::Hour),
      "day" => Some(Every::Day),
      "week" => Some(Every::Week),
      _ => None,
    }
  }

  fn name(self) -> &'static str {
    match self {
      Every::Minute => "minute",
      Every::Hour => "hour",
      Every::Day => "day",
      Every::Week => "week",
    }
  }

  /// Nominal length in ms (a local day or week is an hour longer or shorter across DST).
  fn step(self) -> f64 {
    match self {
      Every::Minute => 60_000.0,
      Every::Hour => 3_600_000.0,
      Every::Day => 86_400_000.0,
      Every::Week => 604_800_000.0,
    }
  }
}

#[derive(Clone)]
pub struct Item {
  /// The plugin's 32-bit id as text (the request identifier on macOS).
  pub id: String,
  pub title: String,
  pub body: String,
  /// JSON text, handed back unchanged.
  pub data: Option<String>,
  /// First delivery, epoch ms; the phase of a repeating series.
  pub at: f64,
  pub every: Option<Every>,
  /// This delivery: `at` plus `count` intervals.
  pub due: f64,
  count: u32,
}

impl Item {
  /// The request as the plugin reads it (`date`: when it was shown). `next` is the coming
  /// delivery of a series; the plugin reports `next ?? at`.
  pub fn json(&self, date: Option<f64>) -> String {
    format!(
      r#"{{"id":{},"title":{},"body":{},"data":{},"at":{},"every":{},"next":{},"date":{},"ours":true}}"#,
      json::quote(&self.id),
      json::quote(&self.title),
      json::quote(&self.body),
      self.data.as_deref().map_or_else(|| "null".into(), json::quote),
      num(self.at),
      self.every.map_or_else(|| "null".into(), |e| json::quote(e.name())),
      if self.every.is_some() { num(self.due) } else { "null".into() },
      date.map_or_else(|| "null".into(), num),
    )
  }
}

impl Item {
  /// The stored form: item()'s fields, plus where the series is.
  fn saved(&self) -> String {
    format!(
      r#"{{"id":{},"title":{},"body":{},"data":{},"at":{},"every":{},"due":{},"count":{}}}"#,
      self.id,
      json::quote(&self.title),
      json::quote(&self.body),
      self.data.as_deref().map_or_else(|| "null".into(), json::quote),
      num(self.at),
      self.every.map_or_else(|| "null".into(), |e| json::quote(e.name())),
      num(self.due),
      self.count,
    )
  }
}

fn num(v: f64) -> String {
  if v.is_finite() {
    format!("{}", v.round())
  } else {
    "null".into()
  }
}

pub fn now_ms() -> f64 {
  std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_or(0.0, |d| d.as_secs_f64() * 1000.0)
}

/// notify.add's items, checked like notify.rs `request`.
pub fn items(cmd: &V) -> Result<Vec<Item>, String> {
  let Some(V::Arr(items)) = cmd.get("items") else { return Err("items is required".into()) };
  items.iter().map(item).collect()
}

fn item(v: &V) -> Result<Item, String> {
  let id = v.get("id").and_then(|v| v.as_f64()).filter(|n| n.fract() == 0.0 && n.abs() <= 2_147_483_648.0).ok_or("id must be an integer")?;
  let title = v.get("title").and_then(|v| v.as_str()).ok_or("title must be a string")?;
  let body = v.get("body").and_then(|v| v.as_str()).unwrap_or("");
  let at = v.get("at").and_then(|v| v.as_f64()).filter(|n| n.is_finite()).ok_or("at must be epoch ms")?;
  let every = match v.get("every").and_then(|v| v.as_str()) {
    Some(e) => Some(Every::parse(e).ok_or("every must be minute, hour, day or week")?),
    None => None,
  };
  let data = v.get("data").and_then(|v| v.as_str()).map(str::to_string);
  Ok(Item { id: format!("{}", id as i64), title: title.into(), body: body.into(), data, at, every, due: at, count: 0 })
}

/// notify.removePending's and notify.removeDelivered's ids.
pub fn ids(cmd: &V) -> Result<Vec<String>, String> {
  match cmd.get("ids") {
    Some(V::Arr(items)) => items.iter().map(|v| v.as_str().map(str::to_string).ok_or_else(|| "ids must be strings".to_string())).collect(),
    _ => Err("ids is required".into()),
  }
}

/// What an OS module gives the schedule.
pub struct Host {
  /// Shows one notification, on the schedule's thread or on the thread of a notify.add.
  pub show: fn(&Item) -> Result<(), String>,
  /// `ms` plus `days` calendar days in local time (the same time of day across DST changes).
  pub add_days: fn(f64, i64) -> f64,
}

static HOST: OnceLock<Host> = OnceLock::new();
static PENDING: Mutex<Vec<Item>> = Mutex::new(Vec::new());
static WAKE: Condvar = Condvar::new();
/// The plugin's file of pending notifications, from the first op that names it.
static STORE: OnceLock<PathBuf> = OnceLock::new();

/// Writes the pending notifications (with the lock held, so writes never interleave).
fn save(pending: &[Item]) {
  let Some(path) = STORE.get() else { return };
  let text = format!("[{}]", pending.iter().map(Item::saved).collect::<Vec<_>>().join(","));
  let tmp = path.with_extension("tmp");
  let written = path.parent().map_or(Ok(()), std::fs::create_dir_all).and_then(|_| std::fs::write(&tmp, text)).and_then(|_| std::fs::rename(&tmp, path));
  if let Err(e) = written {
    log!("cannot save the pending notifications to {}: {e}", path.display());
  }
}

/// Takes the pending notifications of the last run back from `path`, once.
fn restore(path: &Path) {
  if STORE.set(path.to_path_buf()).is_err() {
    return;
  }
  let Ok(text) = std::fs::read_to_string(path) else { return };
  let saved = match json::parse(&text) {
    Ok(V::Arr(saved)) => saved,
    _ => return log!("{} is not a list of notifications; starting without it", path.display()),
  };
  let now = now_ms();
  let mut pending = PENDING.lock().unwrap();
  for v in &saved {
    let Ok(mut item) = item(v) else { continue };
    if pending.iter().any(|p| p.id == item.id) {
      continue; // scheduled again in this run already
    }
    item.count = v.get("count").and_then(|c| c.as_f64()).map_or(0, |c| c.clamp(0.0, u32::MAX as f64) as u32);
    item.due = v.get("due").and_then(|d| d.as_f64()).filter(|d| d.is_finite()).unwrap_or(item.at);
    if let (Some(every), Some(host)) = (item.every, HOST.get()) {
      if item.due <= now {
        advance(&mut item, every, now, host.add_days);
      }
    }
    pending.push(item);
  }
  save(&pending);
  WAKE.notify_one();
}

/// Sets the host and starts the thread, once.
pub fn start(host: Host) {
  if HOST.set(host).is_ok() {
    std::thread::Builder::new().name("akan-native notifications".into()).spawn(run).expect("cannot start the notification thread");
  }
}

/// The shared notify.* ops: add, pending, removePending, restore. None: another op. Every op may
/// carry `store`, the file of pending notifications; the first one that does restores from it.
pub fn op(op: &str, cmd: &V) -> Option<Result<String, String>> {
  if !op.starts_with("notify.") {
    return None;
  }
  if let Some(store) = cmd.get("store").and_then(|v| v.as_str()).filter(|s| !s.is_empty()) {
    restore(Path::new(store));
  }
  Some(match op {
    "notify.add" => items(cmd).and_then(add).map(|_| "null".into()),
    "notify.pending" => Ok(format!("[{}]", PENDING.lock().unwrap().iter().map(|i| i.json(None)).collect::<Vec<_>>().join(","))),
    "notify.removePending" => ids(cmd).map(|ids| {
      let mut pending = PENDING.lock().unwrap();
      pending.retain(|i| !ids.contains(&i.id));
      save(&pending);
      "null".into()
    }),
    "notify.restore" => Ok("null".into()),
    _ => return None,
  })
}

/// Adds notifications; an id again replaces the earlier one. The ones due now are shown before
/// this returns, so their errors reach the caller.
fn add(items: Vec<Item>) -> Result<(), String> {
  let host = HOST.get().ok_or("the notification schedule is not running")?;
  let now = now_ms();
  let mut due = Vec::new();
  {
    let mut pending = PENDING.lock().unwrap();
    for item in items {
      pending.retain(|p| p.id != item.id);
      if item.every.is_none() && item.at <= now {
        due.push(item);
      } else {
        pending.push(item);
      }
    }
    save(&pending);
  }
  WAKE.notify_one();
  due.iter().try_for_each(|item| (host.show)(item))
}

fn run() {
  let host = HOST.get().expect("started without a host");
  let mut pending = PENDING.lock().unwrap();
  loop {
    let now = now_ms();
    let mut due = Vec::new();
    pending.retain_mut(|item| {
      if item.due > now {
        return true;
      }
      due.push(item.clone());
      match item.every {
        Some(every) => {
          advance(item, every, now, host.add_days);
          true
        }
        None => false,
      }
    });
    if !due.is_empty() {
      save(&pending);
      drop(pending);
      for item in &due {
        if let Err(e) = (host.show)(item) {
          log!("showing notification {} failed: {e}", item.id);
        }
      }
      pending = PENDING.lock().unwrap();
      continue;
    }
    let next = pending.iter().map(|i| i.due).fold(f64::INFINITY, f64::min);
    pending = if next.is_finite() {
      let wait = Duration::from_millis((next - now).clamp(1.0, MAX_WAIT.as_millis() as f64) as u64);
      WAKE.wait_timeout(pending, wait).unwrap().0
    } else {
      WAKE.wait(pending).unwrap()
    };
  }
}

fn occurrence(item: &Item, every: Every, count: u32, add_days: fn(f64, i64) -> f64) -> f64 {
  match every {
    Every::Minute | Every::Hour => item.at + count as f64 * every.step(),
    Every::Day => add_days(item.at, count as i64),
    Every::Week => add_days(item.at, 7 * count as i64),
  }
}

/// On to the first occurrence after `now`: repeats missed while the machine slept are skipped,
/// not shown all at once (timers.ts does the same).
fn advance(item: &mut Item, every: Every, now: f64, add_days: fn(f64, i64) -> f64) {
  // A jump close by the nominal length (DST moves a day or week by at most an hour), then walk.
  let guess = ((now - item.at) / every.step()).floor() as i64 - 1;
  let mut count = (item.count as i64 + 1).max(guess).clamp(0, u32::MAX as i64) as u32;
  while occurrence(item, every, count, add_days) <= now {
    count += 1;
  }
  item.count = count;
  item.due = occurrence(item, every, count, add_days);
}

#[cfg(test)]
mod tests {
  use super::*;

  fn plain_days(ms: f64, days: i64) -> f64 {
    ms + days as f64 * 86_400_000.0
  }

  fn series(every: &str) -> Item {
    item(&json::parse(&format!(r#"{{"id":7,"title":"T","at":1000000,"every":"{every}","data":"{{}}"}}"#)).unwrap()).unwrap()
  }

  #[test]
  fn parses_like_notify_rs() {
    let i = item(&json::parse(r#"{"id":-5,"title":"T","body":"b","at":1700000000000}"#).unwrap()).unwrap();
    assert_eq!((i.id.as_str(), i.body.as_str(), i.due), ("-5", "b", 1.7e12));
    assert!(item(&json::parse(r#"{"id":1.5,"title":"T","at":1}"#).unwrap()).is_err());
    assert!(item(&json::parse(r#"{"id":1,"title":"T","at":1,"every":"year"}"#).unwrap()).is_err());
    assert_eq!(
      series("week").json(None),
      r#"{"id":"7","title":"T","body":"","data":"{}","at":1000000,"every":"week","next":1000000,"date":null,"ours":true}"#
    );
  }

  #[test]
  fn repeats_keep_their_phase_and_skip_missed_ones() {
    let mut i = series("minute");
    advance(&mut i, Every::Minute, 1_000_000.0, plain_days);
    assert_eq!(i.due, 1_060_000.0);
    // Slept for an hour and a half: the next one, not 90 at once.
    advance(&mut i, Every::Minute, 1_000_000.0 + 5_400_000.0 + 1.0, plain_days);
    assert_eq!(i.due, 1_000_000.0 + 5_460_000.0);
    let mut d = series("day");
    advance(&mut d, Every::Day, 1_000_000.0 + 3.5 * 86_400_000.0, plain_days);
    assert_eq!(d.due, 1_000_000.0 + 4.0 * 86_400_000.0);
    // A 23-hour day (DST): still the first occurrence after now.
    let short = |ms: f64, days: i64| ms + days as f64 * 86_400_000.0 - if days > 0 { 3_600_000.0 } else { 0.0 };
    let mut s = series("week");
    advance(&mut s, Every::Week, 1_000_000.0 + 604_800_000.0 - 1_800_000.0, short);
    assert_eq!(s.due, 1_000_000.0 + 2.0 * 604_800_000.0 - 3_600_000.0);
  }

  #[test]
  fn the_stored_form_reads_back() {
    let mut i = series("hour");
    i.body = "줄 \"하나\"\n둘".into();
    advance(&mut i, Every::Hour, 1_000_000.0 + 7_200_000.0, plain_days);
    let v = json::parse(&i.saved()).unwrap();
    let back = item(&v).unwrap();
    assert_eq!((back.id.as_str(), back.title.as_str(), back.body.as_str(), back.data.as_deref(), back.at), ("7", "T", i.body.as_str(), Some("{}"), 1_000_000.0));
    assert!(back.every == Some(Every::Hour));
    assert_eq!((v.get("due").and_then(|d| d.as_f64()), v.get("count").and_then(|c| c.as_f64())), (Some(i.due), Some(i.count as f64)));
    let once = item(&json::parse(r#"{"id":-3,"title":"x","at":5}"#).unwrap()).unwrap();
    assert_eq!(once.saved(), r#"{"id":-3,"title":"x","body":"","data":null,"at":5,"every":null,"due":5,"count":0}"#);
  }
}
