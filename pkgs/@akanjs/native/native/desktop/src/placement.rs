//! Where a restored window may open (window-state plugin), the display window.placeOnDisplay means and where it
//! puts the window, and the sizes window ops take. Logical points throughout, except placeOnDisplay's bounds: a
//! display's device pixels.
//!
//! Tauri window-state restores the position when any corner lies on a monitor
//! (`tauri-plugins-workspace/plugins/window-state/src/lib.rs:550-575`). A window whose only
//! visible corner is its bottom-right one cannot be dragged back, so this checks the title bar:
//! a strip at the top of the window must overlap a monitor enough to grab it.

use tao::{dpi::LogicalSize, event_loop::EventLoopWindowTarget, monitor::MonitorHandle, window::Window};
use wry::WebView;

use crate::{json, UserEvent};

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Rect {
  pub x: f64,
  pub y: f64,
  pub width: f64,
  pub height: f64,
}

/// Height of the strip that must be reachable (the macOS title bar is 28 points).
const GRAB_HEIGHT: f64 = 28.0;
/// How much of that strip must be on one monitor to grab it.
const GRAB_WIDTH: f64 = 80.0;

fn overlap(a0: f64, a1: f64, b0: f64, b1: f64) -> f64 {
  (a1.min(b1) - a0.max(b0)).max(0.0)
}

/// The rect to open at: the saved one, shrunk to fit its monitor, or None when its title bar
/// would be on no monitor (a display was unplugged): then the default position is used.
pub fn place(saved: Rect, monitors: &[Rect], min: (f64, f64)) -> Option<Rect> {
  let monitor = monitors.iter().find(|m| {
    let top = saved.y.max(m.y);
    let reachable = saved.y >= m.y - GRAB_HEIGHT / 2.0 && top < m.y + m.height - GRAB_HEIGHT;
    reachable && overlap(saved.x, saved.x + saved.width, m.x, m.x + m.width) >= GRAB_WIDTH.min(saved.width)
  })?;
  let width = saved.width.min(monitor.width).max(min.0);
  let height = saved.height.min(monitor.height).max(min.1);
  // Above the monitor's top edge (under the menu bar) the title bar cannot be grabbed.
  let y = saved.y.max(monitor.y);
  Some(Rect { x: saved.x, y, width, height })
}

/// The display window.placeOnDisplay names by its centre: on Windows the logical rects of displays at different scales
/// overlap, so a display whose centre it is goes before the first one merely holding the point.
pub fn display_at(displays: &[Rect], x: f64, y: f64) -> Option<usize> {
  let centred = |r: &Rect| (r.x + r.width / 2.0 - x).abs() < 0.5 && (r.y + r.height / 2.0 - y).abs() < 0.5;
  let holds = |r: &Rect| x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height;
  displays.iter().position(centred).or_else(|| displays.iter().position(holds))
}

/// Pixels a window op takes, device or logical: scaled by any display's factor and added to its origin, a value this
/// size stays far inside the i32 tao and Win32 place windows in.
const LIMIT: f64 = 1_000_000.0;

/// window.placeOnDisplay's bounds, device pixels from the display's corner.
pub fn device_bounds(x: f64, y: f64, width: f64, height: f64) -> Result<(f64, f64, f64, f64), String> {
  let [x, y, width, height] = [x, y, width, height].map(f64::round);
  if !(width >= 1.0 && height >= 1.0) {
    return Err("width and height must be positive".into());
  }
  if ![x, y, width, height].iter().all(|v| v.abs() <= LIMIT) {
    return Err(format!("bounds must stay within {LIMIT} device pixels of the display's corner"));
  }
  Ok((x, y, width, height))
}

/// One logical size or position of a window or an external view, `name` as its op calls it.
pub fn logical(name: &str, value: f64) -> Result<f64, String> {
  if value.is_finite() && value.abs() <= LIMIT {
    Ok(value)
  } else {
    Err(format!("{name} must be a number between -{LIMIT} and {LIMIT}"))
  }
}

/// Two logical numbers a window op takes together (`width` and `height`, `x` and `y`): both, or neither.
pub fn logical_pair(cmd: &json::V, a: &str, b: &str) -> Result<Option<(f64, f64)>, String> {
  match (cmd.get(a), cmd.get(b)) {
    (None, None) => Ok(None),
    (Some(x), Some(y)) => match (x.as_f64(), y.as_f64()) {
      (Some(x), Some(y)) => Ok(Some((logical(a, x)?, logical(b, y)?))),
      _ => Err(format!("{a} and {b} must be numbers")),
    },
    _ => Err(format!("give both {a} and {b}")),
  }
}

/// Every display, by its logical rect.
pub fn monitors(target: &EventLoopWindowTarget<UserEvent>) -> Vec<Rect> {
  target.available_monitors().map(|m| logical_rect(&m)).collect()
}

fn logical_rect(m: &MonitorHandle) -> Rect {
  let scale = m.scale_factor();
  let (p, s) = (m.position().to_logical::<f64>(scale), m.size().to_logical::<f64>(scale));
  Rect { x: p.x, y: p.y, width: s.width, height: s.height }
}

/// The display holding a logical point.
pub fn monitor_at(target: &EventLoopWindowTarget<UserEvent>, x: f64, y: f64) -> Option<MonitorHandle> {
  target.available_monitors().find(|m| {
    let r = logical_rect(m);
    x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height
  })
}

/// window.placeOnDisplay's `(x, y, width, height)` in the display's device pixels from its corner, filled by a decorated
/// window's frame (title bar included) or by a frameless window's content. Returns the minimum size, lowered to fit.
fn fill(window: &Window, webview: &WebView, monitor: &MonitorHandle, (x, y, w, h): (f64, f64, f64, f64), min_size: (f64, f64)) -> (f64, f64) {
  let scale = monitor.scale_factor();
  let lowered = |size: LogicalSize<f64>| (min_size.0.min(size.width), min_size.1.min(size.height));
  //? AppKit and GTK lay every display out in logical units; tao's physical ones are each display's own (and a window's).
  #[cfg(not(target_os = "windows"))]
  let min = {
    let origin = monitor.position().to_logical::<f64>(scale);
    #[cfg(target_os = "macos")]
    let deco = if window.is_decorated() {
      let (frame, content) = (window.outer_size().to_logical::<f64>(window.scale_factor()), crate::inner_size(window, Some(webview)));
      ((frame.width - content.width).max(0.0).round(), (frame.height - content.height).max(0.0).round())
    } else {
      (0.0, 0.0)
    };
    #[cfg(target_os = "linux")]
    let deco = {
      let _ = webview;
      (0.0, 0.0)
    };
    let size = LogicalSize::new((w / scale - deco.0).max(1.0), (h / scale - deco.1).max(1.0));
    let min = lowered(size);
    window.set_min_inner_size(Some(LogicalSize::new(min.0, min.1)));
    //? AppKit keeps a borderless window's bottom edge where its size changes (a titled one's top): the size goes first.
    window.set_inner_size(size);
    window.set_outer_position(tao::dpi::LogicalPosition::new(origin.x + x / scale, origin.y + y / scale));
    min
  };
  #[cfg(target_os = "windows")]
  let min = {
    use tao::dpi::{PhysicalPosition, PhysicalSize};
    let _ = webview;
    let origin = monitor.position();
    let corner = PhysicalPosition::new(origin.x + x as i32, origin.y + y as i32);
    let decorated = window.is_decorated();
    let mut size = PhysicalSize::new(w as u32, h as u32);
    //? Off while placing: a minimum in logical pixels would clamp the size at the scale of the display the window leaves.
    window.set_min_inner_size(None::<LogicalSize<f64>>);
    //? Windows rescales a window that comes onto a display of another scale to keep its logical size (WM_DPICHANGED),
    //? on the move or on the resize that leaves it there: a second pass sets the size again at that display's scale.
    for _ in 0..2 {
      window.set_outer_position(corner);
      let (frame, content) = (window.outer_size(), window.inner_size());
      let deco = if decorated { (frame.width.saturating_sub(content.width), frame.height.saturating_sub(content.height)) } else { (0, 0) };
      size = PhysicalSize::new((w as u32).saturating_sub(deco.0).max(1), (h as u32).saturating_sub(deco.1).max(1));
      window.set_inner_size(size);
      //? tao keeps an invisible shadow inset (about 8 px) around a frameless window's content: the content fills the bounds.
      let inset = match (window.inner_position(), window.outer_position()) {
        (Ok(content), Ok(frame)) if !decorated => (content.x - frame.x, content.y - frame.y),
        _ => (0, 0),
      };
      window.set_outer_position(PhysicalPosition::new(corner.x - inset.0, corner.y - inset.1));
      if window.inner_size() == size {
        break;
      }
    }
    let min = lowered(size.to_logical::<f64>(scale));
    window.set_min_inner_size(Some(LogicalSize::new(min.0, min.1)));
    min
  };
  min
}

/// window.placeOnDisplay: the display at `atX`, `atY` (display_at), filled by the window with `fullscreen`, else
/// `x`, `y`, `width`, `height` on it. Returns the window's minimum size, lowered to fit.
pub fn place_on_display(cmd: &json::V, target: &EventLoopWindowTarget<UserEvent>, window: &Window, webview: &WebView, min_size: (f64, f64)) -> Result<(f64, f64), String> {
  let num = |k: &str| cmd.get(k).and_then(|v| v.as_f64()).ok_or_else(|| format!("{k} must be a number"));
  let monitors: Vec<MonitorHandle> = target.available_monitors().collect();
  let rects: Vec<Rect> = monitors.iter().map(logical_rect).collect();
  let at = display_at(&rects, num("atX")?, num("atY")?);
  let monitor = at.and_then(|i| monitors.into_iter().nth(i)).ok_or("NOT_FOUND: no display is there now")?;
  if cmd.get("fullscreen").and_then(|v| v.as_bool()) == Some(true) {
    window.set_fullscreen(Some(tao::window::Fullscreen::Borderless(Some(monitor))));
    return Ok(min_size);
  }
  let bounds = device_bounds(num("x")?, num("y")?, num("width")?, num("height")?)?;
  window.set_fullscreen(None);
  Ok(fill(window, webview, &monitor, bounds, min_size))
}

/// window.setMinSize: `width` and `height`, or neither for no minimum. Returns the minimum set.
pub fn set_min_size(cmd: &json::V, window: &Window) -> Result<(f64, f64), String> {
  let min = match logical_pair(cmd, "width", "height")? {
    Some((w, h)) if w >= 1.0 && h >= 1.0 => (w, h),
    None => (1.0, 1.0),
    Some(_) => return Err("width and height must be positive, or both left out for no minimum".into()),
  };
  window.set_min_inner_size(Some(LogicalSize::new(min.0, min.1)));
  Ok(min)
}

#[cfg(test)]
mod tests {
  use super::*;

  const MIN: (f64, f64) = (320.0, 240.0);
  const LAPTOP: Rect = Rect { x: 0.0, y: 0.0, width: 1512.0, height: 982.0 };
  // An external display to the left and a bit higher.
  const LEFT: Rect = Rect { x: -1920.0, y: -200.0, width: 1920.0, height: 1080.0 };

  fn r(x: f64, y: f64, width: f64, height: f64) -> Rect {
    Rect { x, y, width, height }
  }

  #[test]
  fn keeps_a_window_that_is_on_screen() {
    let w = r(100.0, 80.0, 800.0, 600.0);
    assert_eq!(place(w, &[LAPTOP], MIN), Some(w));
    let on_left = r(-1500.0, -100.0, 1200.0, 800.0);
    assert_eq!(place(on_left, &[LAPTOP, LEFT], MIN), Some(on_left));
  }

  #[test]
  fn drops_a_window_on_an_unplugged_display() {
    assert_eq!(place(r(-1500.0, -100.0, 1200.0, 800.0), &[LAPTOP], MIN), None);
    assert_eq!(place(r(3000.0, 100.0, 800.0, 600.0), &[LAPTOP], MIN), None);
    assert_eq!(place(r(100.0, 2000.0, 800.0, 600.0), &[LAPTOP], MIN), None);
    assert_eq!(place(r(100.0, 80.0, 800.0, 600.0), &[], MIN), None);
  }

  #[test]
  fn title_bar_must_be_reachable_not_just_a_corner() {
    // Only the bottom-right corner is on the laptop: Tauri would restore it, this does not.
    assert_eq!(place(r(-700.0, -500.0, 800.0, 600.0), &[LAPTOP], MIN), None);
    // Title bar hanging 60 points off the left edge but mostly visible: fine.
    let w = r(-60.0, 100.0, 800.0, 600.0);
    assert_eq!(place(w, &[LAPTOP], MIN), Some(w));
    // Only 40 points of the title bar are on screen: too little to grab.
    assert_eq!(place(r(1472.0, 100.0, 800.0, 600.0), &[LAPTOP], MIN), None);
  }

  #[test]
  fn shrinks_to_the_monitor_and_keeps_the_minimum() {
    let big = place(r(0.0, 0.0, 1920.0, 1080.0), &[LAPTOP], MIN).unwrap();
    assert_eq!((big.width, big.height), (1512.0, 982.0));
    let tiny = place(r(10.0, 10.0, 100.0, 50.0), &[LAPTOP], MIN).unwrap();
    assert_eq!((tiny.width, tiny.height), MIN);
  }

  #[test]
  fn moves_a_title_bar_out_from_above_the_top_edge() {
    assert_eq!(place(r(100.0, -10.0, 800.0, 600.0), &[LAPTOP], MIN), Some(r(100.0, 0.0, 800.0, 600.0)));
  }

  #[test]
  fn a_display_is_named_by_its_centre_where_logical_rects_overlap() {
    // Windows: 2560×1440 at 100 %, and right of it a 4K display at 200 %, which starts at 1280 in logical pixels.
    let qhd = r(0.0, 0.0, 2560.0, 1440.0);
    let uhd = r(1280.0, 0.0, 1920.0, 1080.0);
    assert_eq!(display_at(&[qhd, uhd], 2240.0, 540.0), Some(1));
    assert_eq!(display_at(&[qhd, uhd], 1280.0, 720.0), Some(0));
    assert_eq!(display_at(&[uhd, qhd], 1280.0, 720.0), Some(1));
    assert_eq!(display_at(&[qhd, uhd], 2000.0, 100.0), Some(0));
    assert_eq!(display_at(&[qhd, uhd], 5000.0, 100.0), None);
    assert_eq!(display_at(&[], 0.0, 0.0), None);
  }

  #[test]
  fn device_bounds_are_whole_pixels_and_never_leave_i32() {
    assert_eq!(device_bounds(10.4, -3.6, 640.0, 128.2), Ok((10.0, -4.0, 640.0, 128.0)));
    assert_eq!(device_bounds(-1e6, 1e6, 1e6, 1e6), Ok((-1e6, 1e6, 1e6, 1e6)));
    assert!(device_bounds(0.0, 0.0, 0.4, 128.0).is_err());
    assert!(device_bounds(0.0, 0.0, 640.0, -1.0).is_err());
    for (x, y, w, h) in [(3e9, 0.0, 640.0, 128.0), (0.0, -2_147_483_648.0, 640.0, 128.0), (0.0, 0.0, 5e9, 128.0), (0.0, 0.0, 640.0, f64::INFINITY), (f64::NAN, 0.0, 640.0, 128.0)] {
      assert!(device_bounds(x, y, w, h).is_err(), "{x} {y} {w} {h}");
    }
  }

  #[test]
  fn sizes_and_positions_come_in_pairs_and_in_range() {
    let pair = |s: &str| logical_pair(&json::parse(s).unwrap(), "width", "height");
    assert_eq!(pair(r#"{}"#), Ok(None));
    assert_eq!(pair(r#"{"width":640,"height":128.5}"#), Ok(Some((640.0, 128.5))));
    assert_eq!(pair(r#"{"width":640}"#), Err("give both width and height".into()));
    for bad in [r#"{"width":"640","height":128}"#, r#"{"width":1e7,"height":128}"#, r#"{"width":640,"height":-3e9}"#, r#"{"width":1e999,"height":1}"#] {
      assert!(pair(bad).is_err(), "{bad}");
    }
  }

  #[test]
  fn logical_sizes_and_positions_never_leave_i32_at_any_scale() {
    assert_eq!(logical("x", -1e6), Ok(-1e6));
    assert_eq!(logical("width", 640.5), Ok(640.5));
    for value in [1e6 + 1.0, -3e9, 2_147_483_648.0, f64::INFINITY, f64::NEG_INFINITY, f64::NAN] {
      assert_eq!(logical("height", value), Err("height must be a number between -1000000 and 1000000".into()), "{value}");
    }
  }
}
