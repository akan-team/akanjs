//! Displays and the mouse cursor on macOS (screen plugin, plugins.md §5).
//!   screen.displays → [{"id","name","bounds":{x,y,width,height},"workArea":{…},"scale","primary"}], primary first
//!   screen.cursor   → {"x","y"}
//!   screen.watch    → null. From then on the shell sends {"type":"screen","event":"changed"} whenever
//!                     AppKit posts NSApplicationDidChangeScreenParametersNotification (a display was
//!                     added, removed or rearranged, or its resolution or scale changed); the plugin
//!                     host reads screen.displays again. Neither TAO nor Electrobun watches this.
//!
//! Coordinates are logical points (CSS px) with the origin at the top-left corner of the primary
//! display (the one with the menu bar) and y growing down: the space of window.setPosition,
//! window.getState and window-state (placement.rs). TAO flips Cocoa's bottom-left screen
//! coordinates against the main display (tao/src/platform_impl/macos/util/mod.rs:87-106).
//! - bounds: the TAO monitor's position and size (CGDisplayBounds, tao/src/platform_impl/macos/monitor.rs:216-231),
//!   the same rects lib.rs `monitors` hands to placement.rs.
//! - workArea: TAO has none. As in Tauri (tauri/crates/tauri-runtime-wry/src/monitor/macos.rs:7-35),
//!   the NSScreen's visibleFrame (without the menu bar and the Dock) is placed inside bounds by its
//!   insets from frame; Cocoa's y grows up, so the top inset is frame.maxY − visibleFrame.maxY.
//!   Electrobun flips both rects against the first NSScreen's height and truncates them to integers
//!   (electrobun/package/src/native/macos/nativeWrapper.mm:9260-9303); taking bounds from TAO keeps
//!   one source for display rects, and points stay fractional where macOS has them.
//! - TAO's ns_screen() hands out a +1 retained pointer (tao/src/platform/macos.rs:376-381). Tauri's
//!   work_area borrows it and never releases it; here it is taken back with Retained::from_raw.
//! - TAO names every monitor "Monitor #<model number>"; NSScreen.localizedName is the name System
//!   Settings shows.
//! - The cursor: TAO's cursor_position (NSEvent.mouseLocation, flipped the same way) is physical at
//!   the primary display's scale (util/mod.rs:101-106), so it is divided by that scale again.

use std::{cell::OnceCell, ptr::NonNull};

use block2::RcBlock;
use objc2::{msg_send, rc::Retained, runtime::AnyObject, MainThreadMarker};
use objc2_app_kit::{NSApplicationDidChangeScreenParametersNotification, NSScreen};
use objc2_foundation::{NSNotificationCenter, NSRect};
use tao::{event_loop::EventLoopWindowTarget, platform::macos::MonitorHandleExtMacOS};

use crate::{json, placement::Rect, push_event};

/// The part of `bounds` (top-left origin, y down) that visibleFrame covers, from an NSScreen's
/// frame and visibleFrame (Cocoa coordinates, y up).
pub fn work_area(bounds: Rect, frame: NSRect, visible: NSRect) -> Rect {
  let left = visible.origin.x - frame.origin.x;
  let top = (frame.origin.y + frame.size.height) - (visible.origin.y + visible.size.height);
  Rect { x: bounds.x + left, y: bounds.y + top, width: visible.size.width, height: visible.size.height }
}

pub struct Display {
  /// CGDirectDisplayID: stable while the display stays connected.
  pub id: u32,
  pub name: String,
  pub bounds: Rect,
  pub work_area: Rect,
  pub scale: f64,
  pub primary: bool,
}

fn rect_json(r: Rect) -> String {
  format!(r#"{{"x":{},"y":{},"width":{},"height":{}}}"#, r.x, r.y, r.width, r.height)
}

pub fn display_json(d: &Display) -> String {
  format!(
    r#"{{"id":{},"name":{},"bounds":{},"workArea":{},"scale":{},"primary":{}}}"#,
    d.id,
    json::quote(&d.name),
    rect_json(d.bounds),
    rect_json(d.work_area),
    d.scale,
    d.primary
  )
}

/// The primary display first (it holds the origin), then CGGetActiveDisplayList's order.
pub fn list_json(mut displays: Vec<Display>) -> String {
  displays.sort_by_key(|d| !d.primary);
  format!("[{}]", displays.iter().map(display_json).collect::<Vec<_>>().join(","))
}

fn displays<T>(target: &EventLoopWindowTarget<T>) -> String {
  let primary = target.primary_monitor().map(|m| m.native_id());
  let list = target
    .available_monitors()
    .map(|m| {
      let scale = m.scale_factor();
      let (p, s) = (m.position().to_logical::<f64>(scale), m.size().to_logical::<f64>(scale));
      let bounds = Rect { x: p.x, y: p.y, width: s.width, height: s.height };
      // Safety: a +1 retained NSScreen (see above), released when `screen` drops.
      let screen = m.ns_screen().and_then(|ptr| unsafe { Retained::from_raw(ptr as *mut NSScreen) });
      let (work_area, name) = match &screen {
        Some(screen) => (work_area(bounds, screen.frame(), screen.visibleFrame()), screen.localizedName().to_string()),
        None => (bounds, m.name().unwrap_or_default()),
      };
      Display { id: m.native_id(), name, bounds, work_area, scale, primary: primary == Some(m.native_id()) }
    })
    .collect();
  list_json(list)
}

/// Mouse positions have fractions of a point; the scale round trip adds float noise past them.
fn round(v: f64) -> f64 {
  (v * 1000.0).round() / 1000.0
}

fn cursor<T>(target: &EventLoopWindowTarget<T>) -> Result<String, String> {
  let physical = target.cursor_position().map_err(|e| format!("cannot read the cursor position: {e}"))?;
  let scale = target.primary_monitor().map_or(1.0, |m| m.scale_factor());
  let p = physical.to_logical::<f64>(scale);
  Ok(format!(r#"{{"x":{},"y":{}}}"#, round(p.x), round(p.y)))
}

thread_local! {
  /// The notification observer (main thread), kept for the rest of the process.
  static OBSERVER: OnceCell<Retained<AnyObject>> = const { OnceCell::new() };
}

fn watch() -> Result<String, String> {
  MainThreadMarker::new().ok_or("screen.watch runs on the main thread")?;
  OBSERVER.with(|observer| {
    observer.get_or_init(|| {
      let block = RcBlock::new(|_note: NonNull<AnyObject>| push_event(r#"{"type":"screen","event":"changed"}"#));
      let center = NSNotificationCenter::defaultCenter();
      let none = std::ptr::null::<AnyObject>();
      // Safety: addObserverForName:object:queue:usingBlock: copies the block; a nil queue runs it
      // on the posting thread (AppKit posts this on the main thread; push_event is thread-safe).
      unsafe { msg_send![&center, addObserverForName: NSApplicationDidChangeScreenParametersNotification, object: none, queue: none, usingBlock: &*block] }
    });
  });
  Ok("null".into())
}

/// screen.* shell ops; None for other ops.
pub fn shell_op<T>(op: &str, target: &EventLoopWindowTarget<T>) -> Option<Result<String, String>> {
  let result = match op {
    "screen.displays" => Ok(displays(target)),
    "screen.cursor" => cursor(target),
    "screen.watch" => watch(),
    _ if op.starts_with("screen.") => Err(format!("unknown op {op}")),
    _ => return None,
  };
  Some(result)
}

#[cfg(test)]
mod tests {
  use super::*;
  use objc2_foundation::{NSPoint, NSSize};

  fn ns(x: f64, y: f64, width: f64, height: f64) -> NSRect {
    NSRect::new(NSPoint::new(x, y), NSSize::new(width, height))
  }

  fn r(x: f64, y: f64, width: f64, height: f64) -> Rect {
    Rect { x, y, width, height }
  }

  #[test]
  fn work_area_below_the_menu_bar_and_above_the_dock() {
    // A 1512×982 laptop, 33-point menu bar, 70-point Dock at the bottom.
    let laptop = r(0.0, 0.0, 1512.0, 982.0);
    assert_eq!(work_area(laptop, ns(0.0, 0.0, 1512.0, 982.0), ns(0.0, 70.0, 1512.0, 879.0)), r(0.0, 33.0, 1512.0, 879.0));
    // Dock on the left.
    assert_eq!(work_area(laptop, ns(0.0, 0.0, 1512.0, 982.0), ns(80.0, 0.0, 1432.0, 949.0)), r(80.0, 33.0, 1432.0, 949.0));
  }

  #[test]
  fn work_area_on_a_display_above_and_left_of_the_primary() {
    // CG bounds (-1920, -1080); in Cocoa its frame starts at y = 982 − (−1080 + 1080) = 982.
    let external = r(-1920.0, -1080.0, 1920.0, 1080.0);
    let wa = work_area(external, ns(-1920.0, 982.0, 1920.0, 1080.0), ns(-1920.0, 982.0, 1920.0, 1055.0));
    assert_eq!(wa, r(-1920.0, -1055.0, 1920.0, 1055.0));
  }

  #[test]
  fn json_shape() {
    let d = |id, primary| Display { id, name: "Built-in \"Retina\"".into(), bounds: r(0.0, 0.0, 1512.0, 982.0), work_area: r(0.0, 33.5, 1512.0, 948.5), scale: 2.0, primary };
    let one = display_json(&d(1, true));
    assert_eq!(one, r#"{"id":1,"name":"Built-in \"Retina\"","bounds":{"x":0,"y":0,"width":1512,"height":982},"workArea":{"x":0,"y":33.5,"width":1512,"height":948.5},"scale":2,"primary":true}"#);
    let list = list_json(vec![d(7, false), d(1, true), d(9, false)]);
    assert!(json::parse(&list).is_ok());
    let ids: Vec<&str> = list.match_indices(r#""id":"#).map(|(i, _)| &list[i + 5..i + 6]).collect();
    assert_eq!(ids, ["1", "7", "9"]);
    assert_eq!(list_json(vec![]), "[]");
  }

  #[test]
  fn rounds_float_noise_only() {
    assert_eq!(round(1512.0000000002), 1512.0);
    assert_eq!(round(100.5), 100.5);
    assert_eq!(round(-3.25), -3.25);
  }
}
