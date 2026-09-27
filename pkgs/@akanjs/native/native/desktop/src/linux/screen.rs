//! Displays and the mouse cursor on Linux (screen plugin, plugins.md §5), with the ops and JSON of
//! screen.rs: GDK monitors.
//!
//! - bounds are the monitor's GDK geometry: logical pixels in the space of the X screen (or the
//!   Wayland compositor), the same numbers tao's monitors give as physical pixels divided by the
//!   integer scale (tao-0.37.0/src/platform_impl/linux/monitor.rs:28-51, the rects lib.rs
//!   `monitors` hands to placement.rs) and the space window.setPosition uses. Its origin is the
//!   top-left corner of the whole desktop, which need not be the primary display's.
//! - workArea: gdk_monitor_get_workarea (Electrobun reads the same, electrobun/package/src/native/
//!   linux/nativeWrapper.cpp:12009-12060). On X11 GDK takes it from _GTK_WORKAREAS or
//!   _NET_WORKAREA, which window managers keep only for the primary monitor; on Wayland it is the
//!   geometry. Clamped into bounds.
//! - name: "<manufacturer> <model>"; on X11 the model is the RandR output ("HDMI-1"), so `id`
//!   hashes it: stable while the display stays connected.
//! - primary: the monitor GDK calls primary, else the first one (X servers without a RandR
//!   primary output, such as Xvfb).
//! - screen.watch: GdkScreen monitors-changed and each monitor's geometry and scale notifications.
//!   Work area changes (a panel appearing) send nothing.
//! - The cursor: the seat pointer's position in the same space (Electrobun does the same,
//!   nativeWrapper.cpp:12116-12153). Wayland tells an app where the pointer is only over its own
//!   windows (tao answers 0,0 there, tao-0.37.0/src/platform_impl/linux/util.rs:17-38): UNSUPPORTED.

use std::cell::Cell;

use gtk::{gdk, prelude::*};

use crate::{json, placement::Rect, push_event};

fn rect(r: gdk::Rectangle) -> Rect {
  Rect { x: r.x() as f64, y: r.y() as f64, width: r.width() as f64, height: r.height() as f64 }
}

/// `inner` cut to `outer`.
fn clamp(inner: Rect, outer: Rect) -> Rect {
  let x = inner.x.max(outer.x);
  let y = inner.y.max(outer.y);
  let right = (inner.x + inner.width).min(outer.x + outer.width);
  let bottom = (inner.y + inner.height).min(outer.y + outer.height);
  if right <= x || bottom <= y {
    return outer;
  }
  Rect { x, y, width: right - x, height: bottom - y }
}

/// FNV-1a: a stable number from the output's name.
fn hash(s: &str) -> u32 {
  s.bytes().fold(0x811c9dc5u32, |h, b| (h ^ b as u32).wrapping_mul(0x01000193))
}

fn rect_json(r: Rect) -> String {
  format!(r#"{{"x":{},"y":{},"width":{},"height":{}}}"#, r.x, r.y, r.width, r.height)
}

fn displays() -> Result<String, String> {
  let display = gdk::Display::default().ok_or("there is no display")?;
  let monitors: Vec<gdk::Monitor> = (0..display.n_monitors()).filter_map(|i| display.monitor(i)).collect();
  let primary = monitors.iter().position(|m| m.is_primary()).unwrap_or(0);
  let mut list: Vec<(bool, String)> = Vec::new();
  let mut seen: Vec<u32> = Vec::new();
  for (i, m) in monitors.iter().enumerate() {
    let bounds = rect(m.geometry());
    let work_area = clamp(rect(m.workarea()), bounds);
    let model = m.model().map(|s| s.to_string()).unwrap_or_default();
    let manufacturer = m.manufacturer().map(|s| s.to_string()).unwrap_or_default();
    let name = [manufacturer.as_str(), model.as_str()].iter().filter(|s| !s.is_empty()).copied().collect::<Vec<_>>().join(" ");
    let mut id = hash(&format!("{manufacturer}/{model}"));
    while seen.contains(&id) {
      id = id.wrapping_add(1); // two monitors of the same model on Wayland
    }
    seen.push(id);
    let json = format!(
      r#"{{"id":{id},"name":{},"bounds":{},"workArea":{},"scale":{},"primary":{}}}"#,
      json::quote(&name),
      rect_json(bounds),
      rect_json(work_area),
      m.scale_factor(),
      i == primary
    );
    list.push((i == primary, json));
  }
  list.sort_by_key(|(primary, _)| !primary);
  Ok(format!("[{}]", list.into_iter().map(|(_, j)| j).collect::<Vec<_>>().join(",")))
}

fn cursor() -> Result<String, String> {
  let display = gdk::Display::default().ok_or("there is no display")?;
  if display.type_().name() != "GdkX11Display" {
    return Err("UNSUPPORTED: Wayland tells apps where the pointer is only over their own windows".into());
  }
  let pointer = display.default_seat().and_then(|s| s.pointer()).ok_or("there is no pointer")?;
  let (_, x, y) = pointer.position_double();
  Ok(format!(r#"{{"x":{x},"y":{y}}}"#))
}

thread_local! {
  static WATCHING: Cell<bool> = const { Cell::new(false) };
}

fn changed() {
  push_event(r#"{"type":"screen","event":"changed"}"#);
}

fn watch_monitor(m: &gdk::Monitor) {
  m.connect_geometry_notify(|_| changed());
  m.connect_scale_factor_notify(|_| changed());
}

fn watch() -> Result<String, String> {
  if WATCHING.with(|w| w.replace(true)) {
    return Ok("null".into());
  }
  let display = gdk::Display::default().ok_or("there is no display")?;
  for i in 0..display.n_monitors() {
    if let Some(m) = display.monitor(i) {
      watch_monitor(&m);
    }
  }
  display.connect_monitor_added(|_, m| {
    watch_monitor(m);
    changed();
  });
  display.connect_monitor_removed(|_, _| changed());
  display.default_screen().connect_monitors_changed(|_| changed());
  Ok("null".into())
}

/// screen.* shell ops; None for other ops.
pub fn shell_op(op: &str) -> Option<Result<String, String>> {
  let result = match op {
    "screen.displays" => displays(),
    "screen.cursor" => cursor(),
    "screen.watch" => watch(),
    _ if op.starts_with("screen.") => Err(format!("unknown op {op}")),
    _ => return None,
  };
  Some(result)
}

#[cfg(test)]
mod tests {
  use super::*;

  fn r(x: f64, y: f64, width: f64, height: f64) -> Rect {
    Rect { x, y, width, height }
  }

  #[test]
  fn work_area_inside_bounds() {
    let b = r(0.0, 0.0, 1920.0, 1080.0);
    assert_eq!(clamp(r(0.0, 27.0, 1920.0, 1053.0), b), r(0.0, 27.0, 1920.0, 1053.0));
    // _NET_WORKAREA spans the whole desktop: cut to the monitor.
    assert_eq!(clamp(r(0.0, 27.0, 3840.0, 1053.0), r(1920.0, 0.0, 1920.0, 1080.0)), r(1920.0, 27.0, 1920.0, 1053.0));
    // No overlap: the bounds.
    assert_eq!(clamp(r(5000.0, 0.0, 10.0, 10.0), b), b);
    assert_eq!(hash("HDMI-1"), hash("HDMI-1"));
    assert_ne!(hash("HDMI-1"), hash("HDMI-2"));
  }
}
