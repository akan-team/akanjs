//! Where a restored window may open (window-state plugin), and the display window.placeOnDisplay
//! means. Logical points throughout, except device_bounds: a display's device pixels.
//!
//! Tauri window-state restores the position when any corner lies on a monitor
//! (`tauri-plugins-workspace/plugins/window-state/src/lib.rs:550-575`). A window whose only
//! visible corner is its bottom-right one cannot be dragged back, so this checks the title bar:
//! a strip at the top of the window must overlap a monitor enough to grab it.

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

/// Device pixels window.placeOnDisplay accepts from a display's corner: a display's origin plus them stays far inside
/// the i32 tao and Win32 place windows in.
const DEVICE_LIMIT: f64 = 1_000_000.0;

pub fn device_bounds(x: f64, y: f64, width: f64, height: f64) -> Result<(f64, f64, f64, f64), String> {
  let [x, y, width, height] = [x, y, width, height].map(f64::round);
  if !(width >= 1.0 && height >= 1.0) {
    return Err("width and height must be positive".into());
  }
  if ![x, y, width, height].iter().all(|v| v.abs() <= DEVICE_LIMIT) {
    return Err(format!("bounds must stay within {DEVICE_LIMIT} device pixels of the display's corner"));
  }
  Ok((x, y, width, height))
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
}
