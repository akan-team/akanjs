//! A hidden window of the main thread for the tray, global-shortcut and screen parts: tray icon
//! callbacks (tray.rs), WM_HOTKEY (hotkey.rs) and the broadcasts TaskbarCreated, WM_DISPLAYCHANGE
//! and WM_SETTINGCHANGE (screen.rs) arrive at its window procedure. So do WM_QUERYENDSESSION and
//! WM_ENDSESSION (sign-out, shutdown), which message-only windows never get: it is created at
//! startup for them (N5).
//!
//! - A top-level window, never shown, not HWND_MESSAGE: message-only windows get no broadcasts
//!   (TaskbarCreated, sent when Explorer restarts, is how tray icons come back), and a tray menu's
//!   owner has to become the foreground window. tao's own hidden window is a top-level
//!   WS_EX_TOOLWINDOW for the same reasons (tao-0.37.0/src/platform_impl/windows/event_loop.rs:
//!   623-661).
//! - Not thread messages (a NULL window): the modal loops of menus, dialogs and window moves drop
//!   those, so a hotkey pressed while a menu is open would be lost.

use std::cell::OnceCell;

use windows::core::w;
use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::UI::WindowsAndMessaging::{
  CreateWindowExW, DefWindowProcW, RegisterClassExW, RegisterWindowMessageW, SPI_SETWORKAREA, WINDOW_STYLE, WM_APP, WM_DISPLAYCHANGE, WM_ENDSESSION,
  WM_HOTKEY, WM_QUERYENDSESSION, WM_SETTINGCHANGE, WNDCLASSEXW, WS_EX_TOOLWINDOW,
};

/// Tray icon callbacks (NOTIFYICONDATAW.uCallbackMessage).
pub const WM_TRAY: u32 = WM_APP + 0x0A1;

thread_local! {
  /// The window (main thread), created on first use.
  static WINDOW: OnceCell<isize> = const { OnceCell::new() };
  static TASKBAR_CREATED: OnceCell<u32> = const { OnceCell::new() };
}

fn taskbar_created() -> u32 {
  TASKBAR_CREATED.with(|m| *m.get_or_init(|| unsafe { RegisterWindowMessageW(w!("TaskbarCreated")) }))
}

unsafe extern "system" fn proc(hwnd: HWND, msg: u32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
  match msg {
    WM_TRAY => super::tray::callback(wparam.0 as u32, lparam.0 as u32),
    WM_HOTKEY => super::hotkey::pressed(wparam.0 as i32),
    WM_DISPLAYCHANGE => super::screen::changed(),
    WM_SETTINGCHANGE if wparam.0 as u32 == SPI_SETWORKAREA.0 => super::screen::changed(),
    _ if msg == taskbar_created() => super::tray::recreate(),
    // Sign-out or shutdown asks: the host's beforeQuit vetoes decide nothing here (Windows does not
    // wait for them), so allow it and tell the host, which runs its quit hooks.
    WM_QUERYENDSESSION => {
      crate::push_event(r#"{"type":"quitRequested","reason":"session"}"#);
      return LRESULT(1);
    }
    // The session ends: after this returns Windows ends the process. Give the host's onQuit hooks
    // (window-state, single-instance) a few seconds on its own thread.
    WM_ENDSESSION if wparam.0 != 0 => {
      crate::push_event(r#"{"type":"signal","signal":"session"}"#);
      std::thread::sleep(std::time::Duration::from_secs(3));
    }
    _ => return DefWindowProcW(hwnd, msg, wparam, lparam),
  }
  LRESULT(0)
}

/// The window, created on first use (main thread).
pub fn hwnd() -> Result<HWND, String> {
  let raw = WINDOW.with(|w| {
    if let Some(raw) = w.get() {
      return Ok(*raw);
    }
    let _ = taskbar_created();
    let hwnd = unsafe {
      let instance = GetModuleHandleW(None).map_err(|e| e.to_string())?;
      let class = WNDCLASSEXW {
        cbSize: std::mem::size_of::<WNDCLASSEXW>() as u32,
        lpfnWndProc: Some(proc),
        hInstance: instance.into(),
        lpszClassName: w!("AkanNativeShellHelper"),
        ..Default::default()
      };
      RegisterClassExW(&class);
      CreateWindowExW(WS_EX_TOOLWINDOW, w!("AkanNativeShellHelper"), w!("akan-native"), WINDOW_STYLE(0), 0, 0, 0, 0, None, None, Some(instance.into()), None)
        .map_err(|e| format!("INTERNAL: cannot create the helper window: {e}"))?
    };
    let _ = w.set(hwnd.0 as isize);
    Ok::<isize, String>(hwnd.0 as isize)
  })?;
  Ok(HWND(raw as *mut _))
}
