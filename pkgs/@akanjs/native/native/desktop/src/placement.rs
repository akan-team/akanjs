//! Where a restored window may open (window-state plugin). All values are logical points.
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
}
