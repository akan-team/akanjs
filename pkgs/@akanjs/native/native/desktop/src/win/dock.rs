//! The dock plugin (and the badge plugin's count) on Windows: the windows' taskbar buttons, with the
//! ops and state of dock.rs.
//!   dock.setBadge    → an overlay icon (ITaskbarList3::SetOverlayIcon): a red disc with the label,
//!                      numbers over 99 as "99+", longer text as a plain disc
//!   dock.setProgress → the button's progress bar (SetProgressState/SetProgressValue): normal
//!                      green, paused yellow, error red, as on macOS
//!   dock.setVisible  → the windows' taskbar buttons (ITaskbarList::DeleteTab/AddTab)
//!   dock.getState
//!
//! Every window has a button of its own, so the state is applied to each, and again when a button
//! appears ("TaskbarButtonCreated": a window shows for the first time, is shown again after it was
//! hidden, or Explorer restarted), since the calls fail before the button exists. tao has the same
//! calls per window (tao-0.37.0/src/platform_impl/windows/window.rs:987-1030, 1535-1545) but
//! creates the taskbar object on every call and never waits for the button; Tauri draws no count
//! and leaves the overlay to the app (tauri/crates/tauri-runtime/src/lib.rs:990).
//!
//! The overlay is drawn with GDI: the label in white on black, antialiased, gives the text's
//! coverage, which is laid over a red disc with an antialiased edge in a 32-bit icon.

use std::cell::{OnceCell, RefCell};

use windows::core::{w, HSTRING};
use windows::Win32::Foundation::{COLORREF, HWND, RECT};
use windows::Win32::Graphics::Gdi::{
  CreateBitmap, CreateCompatibleDC, CreateDIBSection, CreateFontW, DeleteDC, DeleteObject, DrawTextW, GdiFlush, SelectObject, SetBkMode, SetTextColor,
  ANTIALIASED_QUALITY, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, CLIP_DEFAULT_PRECIS, DEFAULT_CHARSET, DIB_RGB_COLORS, DT_CENTER, DT_NOPREFIX, DT_SINGLELINE,
  DT_VCENTER, FF_SWISS, FW_BOLD, HGDIOBJ, OUT_DEFAULT_PRECIS, TRANSPARENT, VARIABLE_PITCH,
};
use windows::Win32::System::Com::{CoCreateInstance, CLSCTX_INPROC_SERVER};
use windows::Win32::UI::Shell::{ITaskbarList3, TaskbarList, TBPF_ERROR, TBPF_NOPROGRESS, TBPF_NORMAL, TBPF_PAUSED};
use windows::Win32::UI::WindowsAndMessaging::{CreateIconIndirect, DestroyIcon, GetSystemMetrics, HICON, ICONINFO, SM_CXSMICON};

use crate::{
  chrome::{self, Progress, ProgressKind},
  json::V,
};

#[derive(Clone, Default)]
struct State {
  badge: Option<String>,
  overlay: Option<HICON>,
  progress: Option<Progress>,
  hidden: bool,
}

thread_local! {
  static STATE: RefCell<State> = RefCell::new(State::default());
  static TASKBAR: OnceCell<Option<ITaskbarList3>> = const { OnceCell::new() };
}

fn taskbar() -> Option<ITaskbarList3> {
  TASKBAR.with(|t| {
    t.get_or_init(|| unsafe {
      // COM is initialized on this thread (tao's OleInitialize, wry's CoInitializeEx).
      let list: ITaskbarList3 = CoCreateInstance(&TaskbarList, None, CLSCTX_INPROC_SERVER).map_err(|e| log!("taskbar: {e}")).ok()?;
      list.HrInit().map_err(|e| log!("taskbar: {e}")).ok()?;
      Some(list)
    })
    .clone()
  })
}

/// The text on the disc: counts over 99 as "99+", other labels up to 2 characters; None: a plain disc.
pub fn badge_text(label: &str) -> Option<String> {
  if label.parse::<u64>().is_ok_and(|n| n > 99) {
    return Some("99+".into());
  }
  (label.chars().count() <= 2).then(|| label.to_string())
}

/// A red disc with `text`, size×size, as a 32-bit icon.
fn overlay_icon(text: Option<&str>) -> Result<HICON, String> {
  let size = unsafe { GetSystemMetrics(SM_CXSMICON) }.max(16);
  unsafe {
    let dc = CreateCompatibleDC(None);
    let info = BITMAPINFO {
      bmiHeader: BITMAPINFOHEADER {
        biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
        biWidth: size,
        biHeight: -size, // top-down
        biPlanes: 1,
        biBitCount: 32,
        biCompression: BI_RGB.0,
        ..Default::default()
      },
      ..Default::default()
    };
    let mut bits = std::ptr::null_mut();
    let color = match CreateDIBSection(Some(dc), &info, DIB_RGB_COLORS, &mut bits, None, 0) {
      Ok(b) => b,
      Err(e) => {
        let _ = DeleteDC(dc);
        return Err(format!("INTERNAL: badge: {e}"));
      }
    };
    let pixels = std::slice::from_raw_parts_mut(bits as *mut u32, (size * size) as usize);
    pixels.fill(0);
    let old = SelectObject(dc, HGDIOBJ(color.0));
    if let Some(text) = text.filter(|t| !t.is_empty()) {
      // The text's coverage: white on black, antialiased (not ClearType: one gray per pixel).
      let height = if text.chars().count() > 2 { size * 9 / 16 } else { size * 3 / 4 };
      let font = CreateFontW(-height, 0, 0, 0, FW_BOLD.0 as i32, 0, 0, 0, DEFAULT_CHARSET, OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS, ANTIALIASED_QUALITY, (VARIABLE_PITCH.0 | FF_SWISS.0) as u32, w!("Segoe UI"));
      let old_font = SelectObject(dc, HGDIOBJ(font.0));
      SetTextColor(dc, COLORREF(0x00FF_FFFF));
      SetBkMode(dc, TRANSPARENT);
      let mut rect = RECT { left: 0, top: 0, right: size, bottom: size };
      let mut wide: Vec<u16> = text.encode_utf16().collect();
      DrawTextW(dc, &mut wide, &mut rect, DT_CENTER | DT_VCENTER | DT_SINGLELINE | DT_NOPREFIX);
      let _ = GdiFlush();
      SelectObject(dc, old_font);
      let _ = DeleteObject(HGDIOBJ(font.0));
    }
    // The disc under the text (BGRA, straight alpha): red, white where the text covers it.
    let (r, g, b) = (0xD1u32, 0x34u32, 0x38u32);
    let radius = size as f64 / 2.0;
    for y in 0..size {
      for x in 0..size {
        let i = (y * size + x) as usize;
        let text = (pixels[i] & 0xFF) as u32; // the blue channel of the white text
        let (dx, dy) = (x as f64 + 0.5 - radius, y as f64 + 0.5 - radius);
        let edge = (radius - (dx * dx + dy * dy).sqrt()).clamp(0.0, 1.0);
        let alpha = (edge * 255.0).round() as u32;
        let mix = |c: u32| (c * (255 - text) + 255 * text) / 255;
        pixels[i] = (alpha << 24) | (mix(r) << 16) | (mix(g) << 8) | mix(b);
      }
    }
    SelectObject(dc, old);
    // An all-zero AND mask (rows of 16-bit words): the alpha channel decides; without bits its
    // contents would be undefined.
    let mask_bits = vec![0u8; (size as usize).div_ceil(16) * 2 * size as usize];
    let mask = CreateBitmap(size, size, 1, 1, Some(mask_bits.as_ptr() as *const std::ffi::c_void));
    let icon = CreateIconIndirect(&ICONINFO { fIcon: true.into(), xHotspot: 0, yHotspot: 0, hbmMask: mask, hbmColor: color });
    let _ = DeleteObject(HGDIOBJ(mask.0));
    let _ = DeleteObject(HGDIOBJ(color.0));
    let _ = DeleteDC(dc);
    icon.map_err(|e| format!("INTERNAL: badge: {e}"))
  }
}

/// Puts the state on one window's taskbar button.
fn apply(hwnd: HWND, state: &State) {
  let Some(list) = taskbar() else { return };
  unsafe {
    if state.hidden {
      let _ = list.DeleteTab(hwnd);
      return;
    }
    let _ = list.SetOverlayIcon(hwnd, state.overlay.unwrap_or_default(), &HSTRING::from(state.badge.as_deref().unwrap_or("")));
    match state.progress {
      None => {
        let _ = list.SetProgressState(hwnd, TBPF_NOPROGRESS);
      }
      Some(p) => {
        let flag = match p.kind {
          ProgressKind::Normal => TBPF_NORMAL,
          ProgressKind::Paused => TBPF_PAUSED,
          ProgressKind::Error => TBPF_ERROR,
        };
        let _ = list.SetProgressState(hwnd, flag);
        let _ = list.SetProgressValue(hwnd, (p.value * 1000.0).round() as u64, 1000);
      }
    }
  }
}

/// menu.rs subclass: a window's taskbar button appeared.
pub fn button_created(hwnd: HWND) {
  // A copy: the taskbar calls can take messages (this one among them) while they run.
  let state = STATE.with(|s| s.borrow().clone());
  apply(hwnd, &state);
}

fn state_json(state: &State) -> String {
  chrome::dock_state_json(state.badge.as_deref(), !state.hidden, state.progress)
}

/// dock.* shell ops; None for other ops.
pub fn shell_op(op: &str, cmd: &V) -> Option<Result<String, String>> {
  if !op.starts_with("dock.") {
    return None;
  }
  // The icon a new badge replaces, destroyed once the buttons show the new one.
  let mut replaced = None;
  let result = STATE.with(|s| {
    let mut state = s.borrow_mut();
    match op {
      "dock.getState" => return Ok(None),
      "dock.setBadge" => {
        let label = chrome::parse_label(cmd)?;
        let overlay = label.as_deref().map(|l| overlay_icon(badge_text(l).as_deref())).transpose()?;
        replaced = std::mem::replace(&mut state.overlay, overlay);
        state.badge = label;
      }
      "dock.setProgress" => state.progress = chrome::parse_progress(cmd)?,
      "dock.setVisible" => {
        let hidden = !chrome::parse_visible(cmd)?;
        let shown = state.hidden && !hidden;
        state.hidden = hidden;
        return Ok(Some(shown));
      }
      _ => return Err(format!("unknown op {op}")),
    }
    Ok(Some(false))
  });
  // Applied from a copy, with STATE free: the taskbar calls can take messages meanwhile.
  let changed = match result {
    Ok(changed) => changed,
    Err(e) => return Some(Err(e)),
  };
  let state = STATE.with(|s| s.borrow().clone());
  if let Some(shown) = changed {
    let list = taskbar();
    for hwnd in super::menu::hwnds() {
      if let (true, Some(list)) = (shown, &list) {
        unsafe {
          let _ = list.AddTab(hwnd);
        }
      }
      apply(hwnd, &state);
    }
  }
  if let Some(old) = replaced {
    unsafe {
      let _ = DestroyIcon(old);
    }
  }
  Some(Ok(state_json(&state)))
}
