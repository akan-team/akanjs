//! Native dialogs on Windows for the dialog and file-picker plugins, with the ops and JSON of the
//! macOS sheets (panels.rs, dialog_args.rs): `alert.show` → a TaskDialog (a dialog of our own when
//! it needs a text field), `panel.open` and `panel.save` → IFileOpenDialog / IFileSaveDialog,
//! `panel.mime` → the registry's Content Type. And D7 (JavaScript alert/confirm/prompt) under tests.
//!
//! - Each dialog runs on a thread of its own, owned by the app window (Tauri does the same through
//!   rfd: tauri-plugins-workspace/plugins/dialog/src/desktop.rs:142-150). A Win32 dialog runs a
//!   nested modal loop, and inside tao's event handler that loop would hold back every other event
//!   of the app, IPC responses included (tao buffers what arrives while the handler runs,
//!   tao/src/platform_impl/windows/event_loop/runner.rs event_buffer). The owner is disabled while
//!   the dialog is open, like under a sheet; the other windows keep working.
//! - Common Controls 6 (TaskDialogIndirect, themed buttons and text fields): the Bun executable has
//!   no manifest, so build.rs embeds one into this DLL (resource 2, a dependency on
//!   Microsoft.Windows.Common-Controls 6) and a dialog thread activates it (electrobun/package/src/
//!   native/win/nativeWrapper.cpp showTaskDialogWithDllActivationContext). TaskDialogIndirect is
//!   looked up at run time, so the DLL loads without it; alerts then use our own dialog as well.
//! - Types: extensions and MIME types become one "*.ext" filter (the registry's MIME database and a
//!   table of common types); a type without a known extension turns the filter off, so a file is
//!   never unpickable (the macOS rule). One filter, no "All files" choice, as on macOS.

use std::{
  cell::RefCell,
  collections::HashMap,
  ffi::c_void,
  sync::{LazyLock, Mutex, OnceLock},
};

use tao::platform::windows::WindowExtWindows;
use windows::core::{w, Interface, BOOL, HRESULT, HSTRING, PCWSTR, PWSTR};
use windows::Win32::Foundation::{ERROR_CANCELLED, HANDLE, HINSTANCE, HMODULE, HWND, LPARAM, RECT, S_OK, WPARAM};
use windows::Win32::Graphics::Gdi::{
  CreateFontIndirectW, DeleteObject, DrawTextW, GetDC, GetObjectW, ReleaseDC, SelectObject, DRAW_TEXT_FORMAT, DT_CALCRECT, DT_EXPANDTABS, DT_NOPREFIX, DT_SINGLELINE, DT_WORDBREAK, FW_BOLD,
  HFONT, LOGFONTW,
};
use windows::Win32::System::ApplicationInstallationAndServicing::{ActivateActCtx, CreateActCtxW, DeactivateActCtx, ReleaseActCtx, ACTCTXW};
use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize, CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED, COINIT_DISABLE_OLE1DDE};
use windows::Win32::System::LibraryLoader::{GetModuleHandleExW, GetProcAddress, LoadLibraryW, GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS, GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT};
use windows::Win32::System::Ole::IOleWindow;
use windows::Win32::System::Registry::{RegCloseKey, RegEnumKeyExW, RegOpenKeyExW, HKEY, HKEY_CLASSES_ROOT, KEY_READ};
use windows::Win32::UI::Controls::{
  EM_SETCUEBANNER, EM_SETSEL, TASKDIALOGCONFIG, TASKDIALOG_BUTTON, TASKDIALOG_NOTIFICATIONS, TDF_ALLOW_DIALOG_CANCELLATION, TDF_CALLBACK_TIMER, TDF_POSITION_RELATIVE_TO_WINDOW, TDF_SIZE_TO_CONTENT, TDM_CLICK_BUTTON, TDN_CREATED, TDN_DESTROYED, TDN_TIMER,
};
use windows::Win32::UI::Shell::Common::COMDLG_FILTERSPEC;
use windows::Win32::UI::Shell::{
  FileOpenDialog, FileSaveDialog, IFileDialog, IFileOpenDialog, IFileSaveDialog, IShellItem, SHCreateItemFromParsingName, FOS_ALLOWMULTISELECT, FOS_FILEMUSTEXIST, FOS_FORCEFILESYSTEM,
  FOS_OVERWRITEPROMPT, FOS_PATHMUSTEXIST, FOS_PICKFOLDERS, SIGDN_FILESYSPATH,
};
use windows::Win32::UI::WindowsAndMessaging::{
  CreateWindowExW, DestroyWindow, DialogBoxIndirectParamW, EndDialog, GetClientRect, GetWindowLongPtrW, GetWindowRect, GetWindowTextLengthW, GetWindowTextW, IsWindowVisible, KillTimer, MapDialogRect,
  PostMessageW, SendMessageW, SetTimer, SetWindowLongPtrW, SetWindowPos, SetWindowTextW, BS_DEFPUSHBUTTON, BS_PUSHBUTTON, DLGTEMPLATE, DM_SETDEFID, DS_MODALFRAME, DS_SETFONT,
  ES_AUTOHSCROLL, GWLP_USERDATA, HMENU, HWND_MESSAGE, IDCANCEL, IDOK, SWP_NOACTIVATE, SWP_NOZORDER, WINDOW_EX_STYLE, WINDOW_STYLE, WM_COMMAND, WM_DESTROY,
  WM_APP, WM_GETFONT, WM_INITDIALOG, WM_NEXTDLGCTL, WM_SETFONT, WM_TIMER, WS_CAPTION, WS_CHILD, WS_EX_CLIENTEDGE, WS_POPUP, WS_SYSMENU, WS_TABSTOP, WS_VISIBLE,
};

use crate::dialog_args::{alert_answer, mime_answer, open_answer, save_answer, strings, Alert, TestAnswers, CANCELLED};
use crate::json::{self, V};

/// Handles `panel.open`, `panel.save`, `panel.mime` and `alert.show`. false: another op (also
/// `panel.types`, macOS UTIs, which lib.rs answers UNSUPPORTED).
pub fn async_op(id: u64, json: &str, windows: &crate::Windows) -> bool {
  if !json.contains("\"panel.") && !json.contains("\"alert.") {
    return false;
  }
  let Ok(cmd) = json::parse(json) else { return false };
  match cmd.get("op").and_then(|v| v.as_str()) {
    Some("panel.mime") => crate::reply(id, Ok(mime_answer(&strings(cmd.get("exts")), mime_for_ext))),
    // The call that showed it was cancelled or its page ended: the dialog goes. Posted to the
    // dialog's own thread; its answer reaches a call nobody waits for.
    Some("alert.dismiss") => {
      let tag = cmd.get("tag").and_then(|v| v.as_str()).unwrap_or("");
      let open = OPEN_DIALOGS.lock().unwrap().remove(tag);
      if let Some((hwnd, how)) = open {
        let hwnd = HWND(hwnd as *mut c_void);
        let _ = match how {
          Dismiss::Click(button) => unsafe { PostMessageW(Some(hwnd), TDM_CLICK_BUTTON.0 as u32, WPARAM(button as usize), LPARAM(0)) },
          Dismiss::Form => unsafe { PostMessageW(Some(hwnd), WM_DISMISS, WPARAM(0), LPARAM(0)) },
        };
      }
      crate::reply(id, Ok(format!(r#"{{"dismissed":{}}}"#, open.is_some())));
    }
    Some(op @ ("panel.open" | "panel.save" | "alert.show")) => {
      if let Err(e) = show(id, op, &cmd, windows) {
        crate::reply(id, Err(e));
      }
    }
    _ => return false,
  }
  true
}

/// How `alert.dismiss` ends a dialog: a TaskDialog by clicking one of its buttons (TaskDialog has no
/// "end without an answer"), our own form by WM_DISMISS.
#[derive(Clone, Copy)]
enum Dismiss {
  Click(i32),
  Form,
}

/// Alerts on screen by tag: the dialog window (an isize: HWND is not Send) and how to end it.
static OPEN_DIALOGS: LazyLock<Mutex<HashMap<String, (isize, Dismiss)>>> = LazyLock::new(Default::default);

/// Ends our own form without an answer (-1).
const WM_DISMISS: u32 = WM_APP + 1;

/// What a dialog thread shows.
enum Job {
  Alert { alert: Alert, caption: String },
  Open { directory: bool, multiple: bool, types: Vec<String> },
  Save { name: Option<String> },
}

fn show(id: u64, op: &str, cmd: &V, windows: &crate::Windows) -> Result<(), String> {
  let wid = match crate::window_arg(cmd)? {
    Some(w) => w,
    None => windows.primary().ok_or("there is no window")?,
  };
  let win = windows.map.get(&wid).ok_or_else(|| format!("no window {wid}"))?;
  if !win.window.is_visible() {
    win.window.set_visible(true);
  }
  let job = match op {
    "alert.show" => Job::Alert { alert: Alert::parse(cmd), caption: windows.shell.title.clone() },
    "panel.save" => Job::Save { name: cmd.get("name").and_then(|v| v.as_str()).map(str::to_string) },
    _ => Job::Open {
      directory: cmd.get("directory").and_then(|v| v.as_bool()).unwrap_or(false),
      multiple: cmd.get("multiple").and_then(|v| v.as_bool()).unwrap_or(false),
      types: strings(cmd.get("types")),
    },
  };
  let owner = win.window.hwnd(); // an isize: HWND is not Send
  let test = TestAnswers::get(windows.shell.devtools);
  std::thread::Builder::new()
    .name("akan-native dialog".into())
    .spawn(move || crate::reply(id, dialog_thread(HWND(owner as *mut c_void), test, job)))
    .map(drop)
    .map_err(|e| format!("INTERNAL: cannot start the dialog thread: {e}"))
}

fn dialog_thread(owner: HWND, test: Option<&'static TestAnswers>, job: Job) -> Result<String, String> {
  // The file dialogs are COM objects of a single-threaded apartment.
  let com = unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE) };
  let result = {
    let controls = CommonControls::activate();
    match job {
      Job::Alert { alert, caption } => {
        let task_dialog = controls.as_ref().and_then(|_| task_dialog_fn());
        let answer = match task_dialog {
          Some(f) if alert.input.is_none() => task_alert(f, owner, &caption, &alert, test),
          _ => form(owner, &caption, &alert, test),
        };
        answer.map(|(button, text)| alert_answer(button, text.as_deref()))
      }
      Job::Open { directory, multiple, types } => unsafe { open(owner, directory, multiple, &types, test) },
      Job::Save { name } => unsafe { save(owner, name.as_deref(), test) },
    }
  };
  if com.is_ok() {
    unsafe { CoUninitialize() };
  }
  result
}

fn internal(context: &str) -> impl Fn(windows::core::Error) -> String + '_ {
  move |e| format!("INTERNAL: {context}: {e}")
}

// ───────────────────────── Common Controls 6 ─────────────────────────

// winbase.h; the constants live in a large windows-rs module (Win32_System_WindowsProgramming).
const ACTCTX_FLAG_RESOURCE_NAME_VALID: u32 = 0x8;
const ACTCTX_FLAG_HMODULE_VALID: u32 = 0x80;
/// ISOLATIONAWARE_MANIFEST_RESOURCE_ID: where the linker puts a DLL's manifest (build.rs).
const DLL_MANIFEST: u16 = 2;

/// This DLL: the module that holds ANCHOR, not the executable.
fn this_module() -> Option<HMODULE> {
  static ANCHOR: u8 = 0;
  let mut module = HMODULE::default();
  let flags = GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS | GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT;
  unsafe { GetModuleHandleExW(flags, PCWSTR(&ANCHOR as *const u8 as *const u16), &mut module) }.ok()?;
  Some(module)
}

/// This DLL's manifest (Common Controls 6) as this thread's activation context while it lives.
struct CommonControls {
  context: HANDLE,
  cookie: usize,
}

impl CommonControls {
  fn activate() -> Option<CommonControls> {
    let module = this_module()?;
    unsafe {
      let request = ACTCTXW {
        cbSize: size_of::<ACTCTXW>() as u32,
        dwFlags: ACTCTX_FLAG_HMODULE_VALID | ACTCTX_FLAG_RESOURCE_NAME_VALID,
        lpResourceName: PCWSTR(DLL_MANIFEST as usize as *const u16),
        hModule: module,
        ..Default::default()
      };
      let context = CreateActCtxW(&request).map_err(|e| log!("dialogs: no Common Controls 6 manifest in the DLL ({e}); plain controls")).ok()?;
      let mut cookie = 0;
      if let Err(e) = ActivateActCtx(Some(context), &mut cookie) {
        log!("dialogs: cannot activate Common Controls 6 ({e})");
        ReleaseActCtx(context);
        return None;
      }
      Some(CommonControls { context, cookie })
    }
  }
}

impl Drop for CommonControls {
  fn drop(&mut self) {
    unsafe {
      let _ = DeactivateActCtx(0, self.cookie);
      ReleaseActCtx(self.context);
    }
  }
}

type TaskDialogIndirect = unsafe extern "system" fn(*const TASKDIALOGCONFIG, *mut i32, *mut i32, *mut BOOL) -> HRESULT;

/// TaskDialogIndirect of comctl32 6 (5.82, what a process without a manifest gets, has none). The
/// first call runs under CommonControls, so the loader picks version 6 from the side-by-side store.
fn task_dialog_fn() -> Option<TaskDialogIndirect> {
  static FN: OnceLock<Option<usize>> = OnceLock::new();
  let f = *FN.get_or_init(|| unsafe {
    let comctl = LoadLibraryW(w!("comctl32.dll")).ok()?;
    GetProcAddress(comctl, windows::core::s!("TaskDialogIndirect")).map(|f| f as usize)
  });
  // Safety: the export has this signature (commctrl.h).
  f.map(|f| unsafe { std::mem::transmute::<usize, TaskDialogIndirect>(f) })
}

// ───────────────────────── alerts ─────────────────────────

/// Button ids: after IDOK..IDCONTINUE, which TaskDialog and the dialog manager use themselves.
const BUTTON_ID: i32 = 100;

/// Tests: which button the TaskDialog's timer notification clicks, once.
struct TestClick {
  delay: u32,
  /// A button id to click, and the answer to give when the test's button is not one of the dialog's.
  click: i32,
  answer: Option<isize>,
  done: bool,
}

/// What the TaskDialog callback needs: the tag to file the dialog under, and the test's click.
struct TaskCallback {
  tag: Option<String>,
  /// The button `alert.dismiss` clicks: the cancel button, else the first.
  dismiss: i32,
  click: Option<TestClick>,
}

/// `alert.show` as a TaskDialog: the title is the main instruction and the message the content under
/// it (NSAlert's messageText / informativeText), the buttons in their order with the first one as
/// the default. Escape and the close button answer with the cancel button; without one the dialog
/// cannot be cancelled. No destructive style: TaskDialog has none.
fn task_alert(f: TaskDialogIndirect, owner: HWND, caption: &str, a: &Alert, test: Option<&'static TestAnswers>) -> Result<(isize, Option<String>), String> {
  let (main, content) = a.lines();
  let (caption, main_w, content_w) = (HSTRING::from(caption), HSTRING::from(main), HSTRING::from(content));
  let labels: Vec<HSTRING> = a.buttons.iter().map(|(label, _)| HSTRING::from(label.as_str())).collect();
  let buttons: Vec<TASKDIALOG_BUTTON> = labels.iter().enumerate().map(|(i, l)| TASKDIALOG_BUTTON { nButtonID: BUTTON_ID + i as i32, pszButtonText: PCWSTR(l.as_ptr()) }).collect();
  let n = buttons.len() as isize;
  let cancel = a.cancel();
  let text = |s: &HSTRING| if s.is_empty() { PCWSTR::null() } else { PCWSTR(s.as_ptr()) };

  let mut flags = TDF_POSITION_RELATIVE_TO_WINDOW | TDF_SIZE_TO_CONTENT;
  if cancel.is_some() {
    flags |= TDF_ALLOW_DIALOG_CANCELLATION;
  }
  // A packed struct (commctrl.h): fields are assigned whole, never borrowed.
  let mut config = TASKDIALOGCONFIG::default();
  config.cbSize = size_of::<TASKDIALOGCONFIG>() as u32;
  config.hwndParent = owner;
  config.pszWindowTitle = PCWSTR(caption.as_ptr());
  config.pszMainInstruction = text(&main_w);
  config.pszContent = text(&content_w);
  config.cButtons = buttons.len() as u32;
  config.pButtons = buttons.as_ptr();
  config.nDefaultButton = BUTTON_ID;
  let click = test.map(|t| {
    let known = (0..n).contains(&t.button);
    TestClick { delay: t.delay_ms(), click: BUTTON_ID + if known { t.button as i32 } else { 0 }, answer: (!known).then_some(t.button), done: false }
  });
  if click.is_some() {
    // TDN_TIMER comes about every 200 ms with the time since the dialog was created.
    flags |= TDF_CALLBACK_TIMER;
  }
  let mut callback = TaskCallback { tag: a.tag.clone(), dismiss: BUTTON_ID + cancel.unwrap_or(0) as i32, click };
  config.pfCallback = Some(task_callback);
  config.lpCallbackData = &mut callback as *mut TaskCallback as isize;
  config.dwFlags = flags;
  let mut pressed = 0;
  let shown = unsafe { f(&config, &mut pressed, std::ptr::null_mut(), std::ptr::null_mut()) }.ok().map_err(internal("TaskDialogIndirect"));
  if let Some(tag) = &callback.tag {
    OPEN_DIALOGS.lock().unwrap().remove(tag);
  }
  shown?;
  if let Some(answer) = callback.click.and_then(|c| c.answer) {
    return Ok((answer, None));
  }
  let button = match pressed as isize - BUTTON_ID as isize {
    i if (0..n).contains(&i) => i,
    _ => cancel.map_or(-1, |c| c as isize), // IDCANCEL: Escape or the close button
  };
  Ok((button, None))
}

unsafe extern "system" fn task_callback(hwnd: HWND, msg: TASKDIALOG_NOTIFICATIONS, wparam: WPARAM, _: LPARAM, data: isize) -> HRESULT {
  let callback = unsafe { &mut *(data as *mut TaskCallback) };
  if msg == TDN_CREATED {
    if let Some(tag) = &callback.tag {
      OPEN_DIALOGS.lock().unwrap().insert(tag.clone(), (hwnd.0 as isize, Dismiss::Click(callback.dismiss)));
    }
  } else if msg == TDN_DESTROYED {
    if let Some(tag) = &callback.tag {
      OPEN_DIALOGS.lock().unwrap().remove(tag);
    }
  } else if msg == TDN_TIMER {
    if let Some(click) = &mut callback.click {
      if !click.done && wparam.0 >= click.delay as usize {
        click.done = true;
        unsafe { SendMessageW(hwnd, TDM_CLICK_BUTTON.0 as u32, Some(WPARAM(click.click as usize)), Some(LPARAM(0))) };
      }
    }
  }
  S_OK
}

/// Our own dialog: a prompt (a text field under the text), or an alert when there is no TaskDialog.
/// An empty in-memory template (Segoe UI 9 pt) whose controls WM_INITDIALOG creates and lays out in
/// dialog units (MapDialogRect), so the layout follows the font and the monitor's DPI. The buttons
/// are in their order, right-aligned, the first one the default (Return).
struct Form<'a> {
  alert: &'a Alert,
  owner: HWND,
  test: Option<&'static TestAnswers>,
  edit: Option<HWND>,
  bold: Option<HFONT>,
  done: bool,
  button: isize,
  text: Option<String>,
}

const TEST_TIMER: usize = 1;

fn form(owner: HWND, caption: &str, a: &Alert, test: Option<&'static TestAnswers>) -> Result<(isize, Option<String>), String> {
  let mut form = Form { alert: a, owner, test, edit: None, bold: None, done: false, button: -1, text: None };
  let template = template(caption, a.cancel().is_some());
  let module = this_module().map(|m| HINSTANCE(m.0));
  let result = unsafe { DialogBoxIndirectParamW(module, template.as_ptr() as *const DLGTEMPLATE, Some(owner), Some(form_proc), LPARAM(&mut form as *mut Form as isize)) };
  if result <= 0 {
    return Err(format!("INTERNAL: DialogBoxIndirectParam: {}", windows::core::Error::from_thread()));
  }
  Ok((form.button, form.text))
}

/// DLGTEMPLATE, no menu, the default class, the caption and DS_SETFONT's font; no items. DWORD
/// aligned, as the dialog manager requires.
fn template(caption: &str, closable: bool) -> Vec<u32> {
  let style = WS_POPUP.0 | WS_CAPTION.0 | if closable { WS_SYSMENU.0 } else { 0 } | DS_MODALFRAME as u32 | DS_SETFONT as u32;
  // style, extended style, item count, x, y, cx, cy (resized in WM_INITDIALOG), menu, class
  let mut words: Vec<u16> = vec![style as u16, (style >> 16) as u16, 0, 0, 0, 0, 0, 200, 60, 0, 0];
  words.extend(caption.encode_utf16().chain([0]));
  words.push(9); // points
  words.extend("Segoe UI".encode_utf16().chain([0]));
  let mut out = vec![0u32; words.len().div_ceil(2)];
  // Safety: `out` has room for every word.
  unsafe { std::ptr::copy_nonoverlapping(words.as_ptr(), out.as_mut_ptr() as *mut u16, words.len()) };
  out
}

unsafe extern "system" fn form_proc(hwnd: HWND, msg: u32, wparam: WPARAM, lparam: LPARAM) -> isize {
  unsafe {
    if msg == WM_INITDIALOG {
      SetWindowLongPtrW(hwnd, GWLP_USERDATA, lparam.0);
      let form = &mut *(lparam.0 as *mut Form);
      form.layout(hwnd);
      if let Some(tag) = &form.alert.tag {
        OPEN_DIALOGS.lock().unwrap().insert(tag.clone(), (hwnd.0 as isize, Dismiss::Form));
      }
      if let Some(t) = form.test {
        SetTimer(Some(hwnd), TEST_TIMER, t.delay_ms(), None);
      }
      // FALSE: the focus is set (the text field); TRUE: the dialog manager focuses the first button.
      return form.edit.is_none() as isize;
    }
    let Some(form) = (GetWindowLongPtrW(hwnd, GWLP_USERDATA) as *mut Form).as_mut() else { return 0 };
    match msg {
      WM_COMMAND => {
        let n = form.alert.buttons.len() as i32;
        let button = match (wparam.0 & 0xffff) as i32 {
          id if (BUTTON_ID..BUTTON_ID + n).contains(&id) => (id - BUTTON_ID) as isize,
          id if id == IDOK.0 => 0, // Return
          id if id == IDCANCEL.0 => match form.alert.cancel() {
            Some(c) => c as isize, // Escape, the close button
            None => return 1,
          },
          _ => return 0,
        };
        form.finish(hwnd, button);
        1
      }
      WM_TIMER if wparam.0 == TEST_TIMER => {
        let _ = KillTimer(Some(hwnd), TEST_TIMER);
        if let Some(t) = form.test {
          if let (Some(edit), Some(text)) = (form.edit, &t.text) {
            let _ = SetWindowTextW(edit, &HSTRING::from(text.as_str()));
          }
          form.finish(hwnd, t.button);
        }
        1
      }
      WM_DISMISS => {
        form.finish(hwnd, -1);
        1
      }
      WM_DESTROY => {
        if let Some(bold) = form.bold.take() {
          let _ = DeleteObject(bold.into());
        }
        if let Some(tag) = &form.alert.tag {
          OPEN_DIALOGS.lock().unwrap().remove(tag);
        }
        0
      }
      _ => 0,
    }
  }
}

impl Form<'_> {
  unsafe fn finish(&mut self, hwnd: HWND, button: isize) {
    if std::mem::replace(&mut self.done, true) {
      return;
    }
    self.button = button;
    self.text = self.edit.map(|edit| unsafe { window_text(edit) });
    let _ = unsafe { EndDialog(hwnd, 1) };
  }

  unsafe fn layout(&mut self, hwnd: HWND) {
    unsafe {
      let font = HFONT(SendMessageW(hwnd, WM_GETFONT, None, None).0 as *mut c_void);
      // Dialog units (a quarter of the font's average width, an eighth of its height) in pixels.
      let du = |x: i32, y: i32| {
        let mut r = RECT { left: 0, top: 0, right: x, bottom: y };
        let _ = MapDialogRect(hwnd, &mut r);
        (r.right, r.bottom)
      };
      let (mx, my) = du(7, 7);
      let (gx, gy) = du(4, 4);
      let (bw, bh) = du(50, 14);
      let (pad, _) = du(10, 0);
      let mut width = du(220, 0).0;

      let labels: Vec<String> = self.alert.buttons.iter().map(|(l, _)| l.clone()).collect();
      let widths: Vec<i32> = labels.iter().map(|l| bw.max(measure(hwnd, font, l, 0).0 + pad)).collect();
      let row = widths.iter().sum::<i32>() + gx * (widths.len() as i32 - 1);
      width = width.max(row);

      let (primary, secondary) = self.alert.lines();
      let mut y = my;
      if !primary.is_empty() {
        // The title in bold over the message, as NSAlert and TaskDialog set it apart.
        let label_font = if secondary.is_empty() { font } else { self.bold_font(font) };
        let h = measure(hwnd, label_font, primary, width).1;
        control(hwnd, w!("STATIC"), primary, 0x80 /* SS_NOPREFIX */, WINDOW_EX_STYLE(0), -1, (mx, y, width, h), label_font);
        y += h + gy;
      }
      if !secondary.is_empty() {
        let h = measure(hwnd, font, secondary, width).1;
        control(hwnd, w!("STATIC"), secondary, 0x80, WINDOW_EX_STYLE(0), -1, (mx, y, width, h), font);
        y += h + gy;
      }
      if let Some((text, placeholder)) = &self.alert.input {
        let edit = control(hwnd, w!("EDIT"), text, WS_TABSTOP.0 | ES_AUTOHSCROLL as u32, WS_EX_CLIENTEDGE, BUTTON_ID - 1, (mx, y, width, bh), font);
        if !placeholder.is_empty() {
          let cue = HSTRING::from(placeholder.as_str());
          // TRUE: shown while the (focused) field is empty.
          SendMessageW(edit, EM_SETCUEBANNER, Some(WPARAM(1)), Some(LPARAM(cue.as_ptr() as isize)));
        }
        SendMessageW(edit, EM_SETSEL, Some(WPARAM(0)), Some(LPARAM(-1)));
        // The dialog manager's way to focus a control (WM_INITDIALOG then returns FALSE).
        SendMessageW(hwnd, WM_NEXTDLGCTL, Some(WPARAM(edit.0 as usize)), Some(LPARAM(1)));
        self.edit = Some(edit);
        y += bh + gy;
      }
      y += my - gy;
      let mut x = mx + width - row;
      for (i, (label, w)) in labels.iter().zip(&widths).enumerate() {
        let style = WS_TABSTOP.0 | if i == 0 { BS_DEFPUSHBUTTON } else { BS_PUSHBUTTON } as u32;
        control(hwnd, w!("BUTTON"), label, style, WINDOW_EX_STYLE(0), BUTTON_ID + i as i32, (x, y, *w, bh), font);
        x += w + gx;
      }
      SendMessageW(hwnd, DM_SETDEFID, Some(WPARAM(BUTTON_ID as usize)), None);

      // Client size → window size, centered on the owner.
      let (cw, ch) = (mx + width + mx, y + bh + my);
      let (mut outer, mut inner, mut owner) = (RECT::default(), RECT::default(), RECT::default());
      let _ = GetWindowRect(hwnd, &mut outer);
      let _ = GetClientRect(hwnd, &mut inner);
      let _ = GetWindowRect(self.owner, &mut owner);
      let (ww, wh) = (cw + (outer.right - outer.left) - inner.right, ch + (outer.bottom - outer.top) - inner.bottom);
      let (x, y) = ((owner.left + owner.right - ww) / 2, (owner.top + owner.bottom - wh) / 2);
      let _ = SetWindowPos(hwnd, None, x, y, ww, wh, SWP_NOZORDER | SWP_NOACTIVATE);
    }
  }

  /// The dialog font in bold, deleted with the dialog.
  unsafe fn bold_font(&mut self, font: HFONT) -> HFONT {
    unsafe {
      let mut lf = LOGFONTW::default();
      if GetObjectW(font.into(), size_of::<LOGFONTW>() as i32, Some(&mut lf as *mut LOGFONTW as *mut c_void)) == 0 {
        return font;
      }
      lf.lfWeight = FW_BOLD.0 as i32;
      let bold = CreateFontIndirectW(&lf);
      if bold.is_invalid() {
        return font;
      }
      self.bold = Some(bold);
      bold
    }
  }
}

/// A child control with the dialog's font.
unsafe fn control(parent: HWND, class: PCWSTR, text: &str, style: u32, ex: WINDOW_EX_STYLE, id: i32, (x, y, w, h): (i32, i32, i32, i32), font: HFONT) -> HWND {
  unsafe {
    let menu = HMENU(id as isize as *mut c_void); // a child's id
    let child = CreateWindowExW(ex, class, &HSTRING::from(text), WINDOW_STYLE(WS_CHILD.0 | WS_VISIBLE.0 | style), x, y, w, h, Some(parent), Some(menu), None, None).unwrap_or_default();
    SendMessageW(child, WM_SETFONT, Some(WPARAM(font.0 as usize)), Some(LPARAM(1)));
    child
  }
}

/// The size of `text` in `font`: one line when `width` is 0, else wrapped to `width`.
unsafe fn measure(hwnd: HWND, font: HFONT, text: &str, width: i32) -> (i32, i32) {
  unsafe {
    let dc = GetDC(Some(hwnd));
    let old = SelectObject(dc, font.into());
    let mut wide: Vec<u16> = text.encode_utf16().collect();
    let mut r = RECT { left: 0, top: 0, right: width, bottom: 0 };
    let format: DRAW_TEXT_FORMAT = DT_CALCRECT | DT_NOPREFIX | DT_EXPANDTABS | if width == 0 { DT_SINGLELINE } else { DT_WORDBREAK };
    DrawTextW(dc, &mut wide, &mut r, format);
    SelectObject(dc, old);
    ReleaseDC(Some(hwnd), dc);
    (r.right - r.left, r.bottom - r.top)
  }
}

unsafe fn window_text(hwnd: HWND) -> String {
  unsafe {
    let mut buf = vec![0u16; GetWindowTextLengthW(hwnd) as usize + 1];
    let n = GetWindowTextW(hwnd, &mut buf);
    String::from_utf16_lossy(&buf[..n.max(0) as usize])
  }
}

// ───────────────────────── file dialogs ─────────────────────────

const CANCELLED_HR: HRESULT = HRESULT::from_win32(ERROR_CANCELLED.0);

unsafe fn open(owner: HWND, directory: bool, multiple: bool, types: &[String], test: Option<&'static TestAnswers>) -> Result<String, String> {
  unsafe {
    let dialog: IFileOpenDialog = CoCreateInstance(&FileOpenDialog, None, CLSCTX_INPROC_SERVER).map_err(internal("FileOpenDialog"))?;
    let mut options = dialog.GetOptions().map_err(internal("GetOptions"))? | FOS_FORCEFILESYSTEM | FOS_PATHMUSTEXIST | FOS_FILEMUSTEXIST;
    if directory {
      options |= FOS_PICKFOLDERS;
    } else if multiple {
      options |= FOS_ALLOWMULTISELECT;
    }
    dialog.SetOptions(options).map_err(internal("SetOptions"))?;
    // Kept alive until Show returns: the dialog holds the pointers.
    let spec = (!directory).then(|| filter(types)).flatten().map(|s| HSTRING::from(s.as_str()));
    if let Some(spec) = &spec {
      dialog.SetFileTypes(&[COMDLG_FILTERSPEC { pszName: PCWSTR(spec.as_ptr()), pszSpec: PCWSTR(spec.as_ptr()) }]).map_err(internal("SetFileTypes"))?;
    }
    prepare(&dialog, test, None);
    match show_modal(&dialog, owner, test, directory) {
      Err(e) if e.code() == CANCELLED_HR => return Ok(CANCELLED.into()),
      Err(e) => return Err(internal("Show")(e)),
      Ok(()) => {}
    }
    let items = dialog.GetResults().map_err(internal("GetResults"))?;
    let mut paths = Vec::new();
    for i in 0..items.GetCount().map_err(internal("GetCount"))? {
      paths.push(path_of(&items.GetItemAt(i).map_err(internal("GetItemAt"))?)?);
    }
    Ok(open_answer(&paths))
  }
}

unsafe fn save(owner: HWND, name: Option<&str>, test: Option<&'static TestAnswers>) -> Result<String, String> {
  unsafe {
    let dialog: IFileSaveDialog = CoCreateInstance(&FileSaveDialog, None, CLSCTX_INPROC_SERVER).map_err(internal("FileSaveDialog"))?;
    // The plugin writes the file without asking again, as after NSSavePanel.
    let options = dialog.GetOptions().map_err(internal("GetOptions"))? | FOS_FORCEFILESYSTEM | FOS_PATHMUSTEXIST | FOS_OVERWRITEPROMPT;
    dialog.SetOptions(options).map_err(internal("SetOptions"))?;
    if let Some(name) = name {
      let _ = dialog.SetFileName(&HSTRING::from(name));
      // A name typed without an extension gets the suggested one.
      if let Some((_, ext)) = name.rsplit_once('.').filter(|(stem, ext)| !stem.is_empty() && !ext.is_empty()) {
        let _ = dialog.SetDefaultExtension(&HSTRING::from(ext));
      }
    }
    prepare(&dialog, test, name);
    match show_modal(&dialog, owner, test, true) {
      Err(e) if e.code() == CANCELLED_HR => return Ok(CANCELLED.into()),
      Err(e) => return Err(internal("Show")(e)),
      Ok(()) => {}
    }
    let item = dialog.GetResult().map_err(internal("GetResult"))?;
    Ok(save_answer(Some(&path_of(&item)?)))
  }
}

unsafe fn path_of(item: &IShellItem) -> Result<String, String> {
  unsafe {
    let path: PWSTR = item.GetDisplayName(SIGDN_FILESYSPATH).map_err(internal("GetDisplayName"))?;
    let s = path.to_string().map_err(|e| format!("INTERNAL: a path is not UTF-16: {e}"));
    CoTaskMemFree(Some(path.0 as *const c_void));
    s
  }
}

/// Tests: the answer's folder and name, set before the dialog is shown (as on macOS).
unsafe fn prepare(dialog: &IFileDialog, test: Option<&'static TestAnswers>, name: Option<&str>) {
  let Some(t) = test else { return };
  unsafe {
    if let Some(dir) = &t.directory {
      if let Ok(folder) = SHCreateItemFromParsingName::<_, _, IShellItem>(&HSTRING::from(dir.as_str()), None) {
        let _ = dialog.SetFolder(&folder);
      }
    }
    if let (Some(test_name), Some(_)) = (&t.name, name) {
      let _ = dialog.SetFileName(&HSTRING::from(test_name.as_str()));
    }
  }
}

thread_local! {
  /// Tests: the file dialog this thread shows, and whether to answer it with OK.
  static SHOWN: RefCell<Option<(IFileDialog, bool)>> = const { RefCell::new(None) };
}

/// Shows the dialog on its owner. Tests: a timer on a message-only window of this thread ends it
/// from inside the dialog's modal loop, which dispatches this thread's messages.
unsafe fn show_modal(dialog: &IFileDialog, owner: HWND, test: Option<&'static TestAnswers>, can_ok: bool) -> windows::core::Result<()> {
  unsafe {
    let timer = test.and_then(|t| {
      let window = CreateWindowExW(WINDOW_EX_STYLE(0), w!("STATIC"), None, WINDOW_STYLE(0), 0, 0, 0, 0, Some(HWND_MESSAGE), None, None, None).ok()?;
      SHOWN.with(|s| *s.borrow_mut() = Some((dialog.clone(), t.panel_ok && can_ok)));
      SetTimer(Some(window), TEST_TIMER, t.delay_ms(), Some(end_file_dialog));
      Some(window)
    });
    let result = dialog.Show(Some(owner));
    if let Some(window) = timer {
      SHOWN.with(|s| s.borrow_mut().take());
      let _ = DestroyWindow(window); // and its timer
    }
    result
  }
}

/// Clicks OK or Cancel, at every tick until Show returns: Show pumps this thread's messages while it
/// builds the dialog, so a tick can come before the dialog takes clicks. IFileDialog::Close returns
/// S_OK from here but leaves the dialog open (it works from the dialog's own event callbacks).
unsafe extern "system" fn end_file_dialog(_: HWND, _: u32, _: usize, _: u32) {
  unsafe {
    let Some((dialog, ok)) = SHOWN.with(|s| s.borrow().clone()) else { return };
    let Ok(hwnd) = dialog.cast::<IOleWindow>().and_then(|w| w.GetWindow()) else { return };
    if IsWindowVisible(hwnd).as_bool() {
      // OK: the folder and name prepare() set. Cancel: Show returns ERROR_CANCELLED.
      let button = if ok { IDOK } else { IDCANCEL };
      let _ = PostMessageW(Some(hwnd), WM_COMMAND, WPARAM(button.0 as usize), LPARAM(0));
    }
  }
}

// ───────────────────────── types ─────────────────────────

/// Common types the registry's MIME database often lacks (it lists what installed apps registered).
const COMMON: &[(&str, &[&str])] = &[
  ("image/png", &["png"]),
  ("image/jpeg", &["jpg", "jpeg", "jpe", "jfif"]),
  ("image/gif", &["gif"]),
  ("image/webp", &["webp"]),
  ("image/bmp", &["bmp"]),
  ("image/tiff", &["tif", "tiff"]),
  ("image/svg+xml", &["svg"]),
  ("image/heic", &["heic"]),
  ("image/avif", &["avif"]),
  ("image/x-icon", &["ico"]),
  ("video/mp4", &["mp4", "m4v"]),
  ("video/quicktime", &["mov"]),
  ("video/webm", &["webm"]),
  ("video/x-msvideo", &["avi"]),
  ("video/x-matroska", &["mkv"]),
  ("video/mpeg", &["mpeg", "mpg"]),
  ("audio/mpeg", &["mp3"]),
  ("audio/mp4", &["m4a"]),
  ("audio/wav", &["wav"]),
  ("audio/ogg", &["ogg", "oga"]),
  ("audio/flac", &["flac"]),
  ("audio/aac", &["aac"]),
  ("text/plain", &["txt"]),
  ("text/csv", &["csv"]),
  ("text/html", &["html", "htm"]),
  ("text/markdown", &["md", "markdown"]),
  ("text/css", &["css"]),
  ("text/javascript", &["js", "mjs"]),
  ("application/json", &["json"]),
  ("application/pdf", &["pdf"]),
  ("application/zip", &["zip"]),
  ("application/xml", &["xml"]),
  ("application/rtf", &["rtf"]),
  ("application/msword", &["doc"]),
  ("application/vnd.openxmlformats-officedocument.wordprocessingml.document", &["docx"]),
  ("application/vnd.ms-excel", &["xls"]),
  ("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", &["xlsx"]),
  ("application/vnd.ms-powerpoint", &["ppt"]),
  ("application/vnd.openxmlformats-officedocument.presentationml.presentation", &["pptx"]),
  ("font/ttf", &["ttf"]),
  ("font/otf", &["otf"]),
  ("font/woff", &["woff"]),
  ("font/woff2", &["woff2"]),
];

const MIME_DATABASE: &str = "MIME\\Database\\Content Type";

/// The filter's pattern list ("*.pdf;*.txt"), or None (every file) when a type is "*/*" or has no
/// extension this machine knows.
fn filter(types: &[String]) -> Option<String> {
  filter_with(types, registry_extensions)
}

fn filter_with(types: &[String], registry: impl Fn(&str) -> Vec<String>) -> Option<String> {
  if types.is_empty() {
    return None;
  }
  let mut patterns: Vec<String> = Vec::new();
  for ty in types {
    if ty == "*/*" {
      return None;
    }
    let exts = if ty.contains('/') { extensions_for_mime(ty, &registry) } else { vec![ty.trim_start_matches('.').to_ascii_lowercase()] };
    if exts.is_empty() {
      return None;
    }
    for ext in exts {
      let pattern = format!("*.{ext}");
      if !patterns.contains(&pattern) {
        patterns.push(pattern);
      }
    }
  }
  Some(patterns.join(";"))
}

/// Extensions of a MIME type ("image/png") or a family ("image/*"): the table, then the registry.
fn extensions_for_mime(mime: &str, registry: &impl Fn(&str) -> Vec<String>) -> Vec<String> {
  let mime = mime.to_ascii_lowercase();
  let family = mime.strip_suffix('*');
  let matches = |m: &str| family.map_or(m == mime, |prefix| m.starts_with(prefix));
  let mut out: Vec<String> = Vec::new();
  for ext in COMMON.iter().filter(|(m, _)| matches(m)).flat_map(|(_, exts)| exts.iter().map(|e| e.to_string())).chain(registry(&mime)) {
    if !out.contains(&ext) {
      out.push(ext);
    }
  }
  out
}

/// HKCR\MIME\Database\Content Type\<type>\Extension, for one type or every type of a family.
fn registry_extensions(mime: &str) -> Vec<String> {
  let ext = |ty: &str| reg_string(&format!("{MIME_DATABASE}\\{ty}"), "Extension").map(|e| e.trim_start_matches('.').to_ascii_lowercase());
  match mime.strip_suffix('*') {
    Some(prefix) => reg_subkeys(MIME_DATABASE).iter().filter(|t| t.to_ascii_lowercase().starts_with(prefix)).filter_map(|t| ext(t)).collect(),
    None => ext(mime).into_iter().collect(),
  }
}

/// The MIME type of a file extension: HKCR\.<ext>\Content Type, else the table.
fn mime_for_ext(ext: &str) -> Option<String> {
  let ext = ext.trim_start_matches('.').to_ascii_lowercase();
  reg_string(&format!(".{ext}"), "Content Type").or_else(|| COMMON.iter().find(|(_, exts)| exts.contains(&ext.as_str())).map(|(m, _)| m.to_string()))
}

fn reg_string(key: &str, value: &str) -> Option<String> {
  super::registry::read_string(HKEY_CLASSES_ROOT, key, value).ok().flatten().filter(|s| !s.is_empty())
}

fn reg_subkeys(key: &str) -> Vec<String> {
  let mut out = Vec::new();
  unsafe {
    let mut hkey = HKEY::default();
    if RegOpenKeyExW(HKEY_CLASSES_ROOT, &HSTRING::from(key), None, KEY_READ, &mut hkey).is_err() {
      return out;
    }
    let mut buf = [0u16; 256];
    for i in 0.. {
      let mut len = buf.len() as u32;
      if RegEnumKeyExW(hkey, i, Some(PWSTR(buf.as_mut_ptr())), &mut len, None, None, None, None).is_err() {
        break;
      }
      out.push(String::from_utf16_lossy(&buf[..len as usize]));
    }
    let _ = RegCloseKey(hkey);
  }
  out
}

// ───────────────────────── D7 ─────────────────────────

/// D7 under tests: WebView2 shows its own JavaScript alert/confirm/prompt dialogs, which wait for a
/// click. With AKAN_NATIVE_TEST_PANELS (dev builds) the default dialogs are turned off and the
/// ScriptDialogOpening event answers them instead: the handler takes a deferral, sets the answer and
/// completes it after the delay; the page's script waits meanwhile, as behind a real dialog. Set
/// right after the webview is built, before its first navigation starts (settings changed later
/// apply from the next navigation). Without the variable WebView2's own dialogs stay.
pub fn install_js_dialogs(dev: bool, webview: &wry::WebView) {
  use webview2_com::Microsoft::Web::WebView2::Win32::{COREWEBVIEW2_SCRIPT_DIALOG_KIND, COREWEBVIEW2_SCRIPT_DIALOG_KIND_ALERT, COREWEBVIEW2_SCRIPT_DIALOG_KIND_PROMPT};
  use webview2_com::ScriptDialogOpeningEventHandler;
  use wry::WebViewExtWindows;
  let Some(t) = TestAnswers::get(dev) else { return };
  let core = webview.webview();
  let handler = ScriptDialogOpeningEventHandler::create(Box::new(move |_, args| {
    let Some(args) = args else { return Ok(()) };
    unsafe {
      let mut kind = COREWEBVIEW2_SCRIPT_DIALOG_KIND::default();
      args.Kind(&mut kind)?;
      let accept = t.button == 0 && kind != COREWEBVIEW2_SCRIPT_DIALOG_KIND_ALERT;
      // As on macOS, a prompt keeps its default text.
      if accept && kind == COREWEBVIEW2_SCRIPT_DIALOG_KIND_PROMPT {
        let text = match &t.text {
          Some(text) => text.clone(),
          None => {
            let mut default = PWSTR::null();
            args.DefaultText(&mut default)?;
            webview2_com::take_pwstr(default)
          }
        };
        args.SetResultText(&HSTRING::from(text))?;
      }
      let deferral = args.GetDeferral()?;
      later(t.delay_ms(), move || {
        if accept {
          let _ = args.Accept();
        }
        let _ = deferral.Complete();
      });
    }
    Ok(())
  }));
  let result = unsafe {
    let mut token = 0;
    core.add_ScriptDialogOpening(&handler, &mut token).and_then(|()| core.Settings()).and_then(|s| s.SetAreDefaultScriptDialogsEnabled(false))
  };
  if let Err(e) = result {
    log!("D7: cannot answer JavaScript dialogs in tests: {e}");
  }
}

thread_local! {
  /// Main-thread timers: id → what runs when it fires.
  static LATER: RefCell<HashMap<usize, Box<dyn FnOnce()>>> = RefCell::new(HashMap::new());
}

/// Runs `f` on this (the main) thread after `ms`: a thread timer, dispatched by tao's message loop.
fn later(ms: u32, f: impl FnOnce() + 'static) {
  let id = unsafe { SetTimer(None, 0, ms, Some(run_later)) };
  if id == 0 {
    return f();
  }
  LATER.with(|l| l.borrow_mut().insert(id, Box::new(f)));
}

unsafe extern "system" fn run_later(_: HWND, _: u32, id: usize, _: u32) {
  let _ = unsafe { KillTimer(None, id) };
  if let Some(f) = LATER.with(|l| l.borrow_mut().remove(&id)) {
    f();
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn filters() {
    let none = |_: &str| Vec::new();
    let types = |t: &[&str]| t.iter().map(|s| s.to_string()).collect::<Vec<_>>();
    assert_eq!(filter_with(&types(&["pdf", ".TXT", "image/png"]), none).as_deref(), Some("*.pdf;*.txt;*.png"));
    assert_eq!(filter_with(&types(&["audio/*"]), none).unwrap().split(';').count(), 7);
    assert_eq!(filter_with(&types(&["application/x-nope"]), none), None); // unknown: no filter
    assert_eq!(filter_with(&types(&["application/x-nope"]), |_| vec!["nope".into()]).as_deref(), Some("*.nope"));
    assert_eq!(filter_with(&types(&["pdf", "*/*"]), none), None);
    assert_eq!(filter_with(&[], none), None);
  }

  #[test]
  fn dialog_template_is_dword_aligned_words() {
    let t = template("A", true);
    let words: Vec<u16> = t.iter().flat_map(|d| [*d as u16, (*d >> 16) as u16]).collect();
    // style, ex style, cdit, x, y, cx, cy, menu, class, "A\0", 9, "Segoe UI\0"
    assert_eq!(&words[9..13], &[0, 0, 'A' as u16, 0]);
    assert_eq!(words[13], 9);
    assert_eq!(String::from_utf16_lossy(&words[14..22]), "Segoe UI");
    assert_eq!(words[22], 0);
  }
}
