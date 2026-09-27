//! Displays and the mouse cursor on Windows (screen plugin, plugins.md §5), with the ops and JSON of
//! screen.rs: tao monitors and the monitor info of Win32.
//!
//! - bounds: the tao monitor's position and size in logical pixels of its own scale, the rects
//!   lib.rs `monitors` hands to placement.rs and the space window.setPosition uses (tao converts a
//!   window's logical position with that window's scale). The primary display is at 0,0.
//! - workArea: tao has none (its MonitorHandle keeps rcMonitor only, tao-0.37.0/src/platform_impl/
//!   windows/monitor.rs:159-223). GetMonitorInfoW's rcWork, without the taskbar and docked app
//!   bars, is placed inside bounds by its insets from rcMonitor, as the macOS side does.
//! - name: the monitor's description (EnumDisplayDevicesW on the adapter's device name, e.g.
//!   "Generic PnP Monitor"); tao's name is the device name ("\\.\DISPLAY1").
//! - id: the HMONITOR, stable while the display configuration stays.
//! - screen.watch: the helper window (msgwin.rs) gets WM_DISPLAYCHANGE (displays, resolution) and
//!   WM_SETTINGCHANGE with SPI_SETWORKAREA (the taskbar moved or resized); the host reads the
//!   displays again and compares.
//! - The cursor: GetCursorPos is in physical pixels (tao makes the process per-monitor DPI aware),
//!   divided by the scale of the display it is on, like the bounds (Electrobun converts it the
//!   same way, electrobun/package/src/native/win/nativeWrapper.cpp:14065-14086).

use std::cell::Cell;

use tao::{event_loop::EventLoopWindowTarget, platform::windows::MonitorHandleExtWindows};
use windows::core::PCWSTR;
use windows::Win32::Graphics::Gdi::{EnumDisplayDevicesW, GetMonitorInfoW, DISPLAY_DEVICEW, HMONITOR, MONITORINFO, MONITORINFOEXW};

use crate::{json, placement::Rect, push_event};

fn rect_json(r: Rect) -> String {
  format!(r#"{{"x":{},"y":{},"width":{},"height":{}}}"#, r.x, r.y, r.width, r.height)
}

/// (rcMonitor, rcWork, device name) of a monitor, physical pixels.
fn info(hmonitor: isize) -> Option<([i32; 4], [i32; 4], Vec<u16>)> {
  let mut mi = MONITORINFOEXW::default();
  mi.monitorInfo.cbSize = std::mem::size_of::<MONITORINFOEXW>() as u32;
  let ok = unsafe { GetMonitorInfoW(HMONITOR(hmonitor as *mut _), &mut mi as *mut MONITORINFOEXW as *mut MONITORINFO) }.as_bool();
  if !ok {
    return None;
  }
  let r = |r: windows::Win32::Foundation::RECT| [r.left, r.top, r.right, r.bottom];
  let device = mi.szDevice.iter().take_while(|c| **c != 0).copied().chain([0]).collect();
  Some((r(mi.monitorInfo.rcMonitor), r(mi.monitorInfo.rcWork), device))
}

fn description(device: &[u16]) -> Option<String> {
  let mut dd = DISPLAY_DEVICEW { cb: std::mem::size_of::<DISPLAY_DEVICEW>() as u32, ..Default::default() };
  let ok = unsafe { EnumDisplayDevicesW(PCWSTR(device.as_ptr()), 0, &mut dd, 0) }.as_bool();
  let name = String::from_utf16_lossy(&dd.DeviceString[..dd.DeviceString.iter().position(|c| *c == 0).unwrap_or(dd.DeviceString.len())]);
  (ok && !name.is_empty()).then_some(name)
}

/// The work area inside logical `bounds`, from the monitor and work rects in physical pixels.
pub fn work_area(bounds: Rect, monitor: [i32; 4], work: [i32; 4], scale: f64) -> Rect {
  Rect {
    x: bounds.x + (work[0] - monitor[0]) as f64 / scale,
    y: bounds.y + (work[1] - monitor[1]) as f64 / scale,
    width: (work[2] - work[0]) as f64 / scale,
    height: (work[3] - work[1]) as f64 / scale,
  }
}

fn displays<T>(target: &EventLoopWindowTarget<T>) -> String {
  let primary = target.primary_monitor().map(|m| m.hmonitor());
  let mut list: Vec<(bool, String)> = target
    .available_monitors()
    .map(|m| {
      let scale = m.scale_factor();
      let (p, s) = (m.position().to_logical::<f64>(scale), m.size().to_logical::<f64>(scale));
      let bounds = Rect { x: p.x, y: p.y, width: s.width, height: s.height };
      let (work, name) = match info(m.hmonitor()) {
        Some((monitor, work, device)) => (work_area(bounds, monitor, work, scale), description(&device).unwrap_or_else(|| m.name().unwrap_or_default())),
        None => (bounds, m.name().unwrap_or_default()),
      };
      let is_primary = primary == Some(m.hmonitor());
      let json = format!(
        r#"{{"id":{},"name":{},"bounds":{},"workArea":{},"scale":{scale},"primary":{is_primary}}}"#,
        m.hmonitor() as u32,
        json::quote(&name),
        rect_json(bounds),
        rect_json(work)
      );
      (is_primary, json)
    })
    .collect();
  list.sort_by_key(|(primary, _)| !primary);
  format!("[{}]", list.into_iter().map(|(_, j)| j).collect::<Vec<_>>().join(","))
}

fn cursor<T>(target: &EventLoopWindowTarget<T>) -> Result<String, String> {
  let p = target.cursor_position().map_err(|e| format!("cannot read the cursor position: {e}"))?;
  let scale = target
    .available_monitors()
    .find(|m| {
      let (mp, ms) = (m.position(), m.size());
      p.x >= mp.x as f64 && p.y >= mp.y as f64 && p.x < mp.x as f64 + ms.width as f64 && p.y < mp.y as f64 + ms.height as f64
    })
    .or_else(|| target.primary_monitor())
    .map_or(1.0, |m| m.scale_factor());
  let round = |v: f64| (v * 1000.0).round() / 1000.0;
  Ok(format!(r#"{{"x":{},"y":{}}}"#, round(p.x / scale), round(p.y / scale)))
}

thread_local! {
  static WATCHING: Cell<bool> = const { Cell::new(false) };
}

/// msgwin.rs: the displays or the work area changed.
pub fn changed() {
  if WATCHING.with(Cell::get) {
    push_event(r#"{"type":"screen","event":"changed"}"#);
  }
}

/// screen.* shell ops; None for other ops.
pub fn shell_op<T>(op: &str, target: &EventLoopWindowTarget<T>) -> Option<Result<String, String>> {
  let result = match op {
    "screen.displays" => Ok(displays(target)),
    "screen.cursor" => cursor(target),
    "screen.watch" => super::msgwin::hwnd().map(|_| {
      WATCHING.with(|w| w.set(true));
      "null".to_string()
    }),
    _ if op.starts_with("screen.") => Err(format!("unknown op {op}")),
    _ => return None,
  };
  Some(result)
}
