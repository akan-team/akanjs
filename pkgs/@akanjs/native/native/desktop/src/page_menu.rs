//! The webview's own right-click menu on the page (the menu plugin's context menus are menu.rs,
//! win/menu.rs and linux/menu.rs). User decision (2026-09-26): release builds keep text editing
//! (cut, copy, paste, select all, spelling, emoji, input methods), the copy items and the system's
//! text services, and drop what belongs to a browser: back, forward, stop, reload, save, print,
//! share, inspect, and opening or downloading a link, image, frame or media. A menu left with
//! nothing is not shown. Dev builds keep the engine's whole menu, Inspect included. WebView2's
//! browser accelerator keys (Ctrl+R, F5, Ctrl+P, Ctrl+F, zoom, F12) are off in every build
//! (lib.rs open_window); in dev builds DevTools opens from this menu's Inspect.
//!
//! Each engine names its items its own way, and that name decides:
//!   WebView2   CoreWebView2ContextMenuItem.Name, the English label in lower camel case
//!              (ContextMenuRequested, ICoreWebView2_11)
//!   WebKitGTK  the item's stock action (WebKitWebView "context-menu")
//!   WKWebView  the NSMenuItem identifier (willOpenMenu:withEvent:, added to wry's WryWebView,
//!              which WebKit calls before it shows the menu so that a subclass can change it)

/// WebView2 item names that are the browser's.
const WEBVIEW2: &[&str] = &[
  "back",
  "forward",
  "reload",
  "saveAs",
  "print",
  "share",
  "webCapture",
  "createQrCode",
  "inspectElement",
  "openLinkInNewWindow",
  "saveLinkAs",
  "saveImageAs",
  "saveMediaAs",
  "copyLinkToHighlight",
  // A submenu of browser tools (seen on WebView2 154; Name "other" with no label is a separator).
  "moreTools",
];

/// WebKitGTK stock actions (webkit2gtk ContextMenuAction, as Debug prints them) that are the browser's.
const WEBKITGTK: &[&str] = &[
  "OpenLink",
  "OpenLinkInNewWindow",
  "DownloadLinkToDisk",
  "OpenImageInNewWindow",
  "DownloadImageToDisk",
  "OpenFrameInNewWindow",
  "GoBack",
  "GoForward",
  "Stop",
  "Reload",
  "InspectElement",
  "OpenVideoInNewWindow",
  "OpenAudioInNewWindow",
  "DownloadVideoToDisk",
  "DownloadAudioToDisk",
  // WebKit's own items without a public stock action (seen: "Copy Link with Highlight", WebKitGTK
  // 2.52); akan-native adds no items of its own to this menu.
  "Custom",
];

/// WKWebView menu item identifiers (WebKit WKMenuItemIdentifiers) that are the browser's.
const WKWEBVIEW: &[&str] = &[
  "WKMenuItemIdentifierGoBack",
  "WKMenuItemIdentifierGoForward",
  "WKMenuItemIdentifierReload",
  "WKMenuItemIdentifierInspectElement",
  "WKMenuItemIdentifierOpenLink",
  "WKMenuItemIdentifierOpenLinkInNewWindow",
  "WKMenuItemIdentifierDownloadLinkedFile",
  "WKMenuItemIdentifierOpenImageInNewWindow",
  "WKMenuItemIdentifierDownloadImage",
  "WKMenuItemIdentifierOpenMediaInNewWindow",
  "WKMenuItemIdentifierDownloadMedia",
  "WKMenuItemIdentifierOpenFrameInNewWindow",
  "WKMenuItemIdentifierShareMenu",
];

#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
fn browser_item_webview2(name: &str) -> bool {
  WEBVIEW2.contains(&name)
}

#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
fn browser_item_webkitgtk(action: &str) -> bool {
  WEBKITGTK.contains(&action)
}

#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
fn browser_item_wkwebview(identifier: &str) -> bool {
  WKWEBVIEW.contains(&identifier)
}

/// With the browser items gone: the separators to remove (a leading or trailing one, or one after
/// another), highest index first so that removing them in order keeps the others in place.
#[cfg_attr(target_os = "macos", allow(dead_code))]
fn stray_separators(separators: &[bool]) -> Vec<usize> {
  let mut remove = Vec::new();
  let mut previous_kept_is_separator = true; // nothing before the first item
  for (i, &separator) in separators.iter().enumerate() {
    if separator && previous_kept_is_separator {
      remove.push(i);
    } else {
      previous_kept_is_separator = separator;
    }
  }
  if let Some(last) = (0..separators.len()).rev().find(|i| !remove.contains(i)) {
    if separators[last] {
      remove.push(last);
    }
  }
  remove.sort_unstable_by(|a, b| b.cmp(a));
  remove
}

#[cfg(target_os = "windows")]
pub fn install(dev: bool, webview: &wry::WebView) {
  use webview2_com::ContextMenuRequestedEventHandler;
  use webview2_com::Microsoft::Web::WebView2::Win32::{ICoreWebView2_11, COREWEBVIEW2_CONTEXT_MENU_ITEM_KIND, COREWEBVIEW2_CONTEXT_MENU_ITEM_KIND_SEPARATOR};
  use windows::core::{Interface, PWSTR};
  use wry::WebViewExtWindows;
  if dev {
    return;
  }
  let handler = ContextMenuRequestedEventHandler::create(Box::new(|_, args| {
    let Some(args) = args else { return Ok(()) };
    unsafe {
      let items = args.MenuItems()?;
      let mut count = 0;
      items.Count(&mut count)?;
      for i in (0..count).rev() {
        let mut name = PWSTR::null();
        items.GetValueAtIndex(i)?.Name(&mut name)?;
        if browser_item_webview2(&webview2_com::take_pwstr(name)) {
          items.RemoveValueAtIndex(i)?;
        }
      }
      items.Count(&mut count)?;
      let mut separators = Vec::with_capacity(count as usize);
      for i in 0..count {
        let mut kind = COREWEBVIEW2_CONTEXT_MENU_ITEM_KIND::default();
        items.GetValueAtIndex(i)?.Kind(&mut kind)?;
        separators.push(kind == COREWEBVIEW2_CONTEXT_MENU_ITEM_KIND_SEPARATOR);
      }
      let stray = stray_separators(&separators);
      for &i in &stray {
        items.RemoveValueAtIndex(i as u32)?;
      }
      // Handled without a command: WebView2 shows no menu.
      if stray.len() == separators.len() {
        args.SetHandled(true)?;
      }
    }
    Ok(())
  }));
  let result = webview.webview().cast::<ICoreWebView2_11>().and_then(|core| unsafe {
    let mut token = 0;
    core.add_ContextMenuRequested(&handler, &mut token)
  });
  if let Err(e) = result {
    log!("the page's context menu keeps the browser's items: {e}");
  }
}

#[cfg(target_os = "linux")]
pub fn install(dev: bool, webview: &wry::WebView) {
  use webkit2gtk::{ContextMenuExt, ContextMenuItemExt, WebViewExt};
  use wry::WebViewExtUnix;
  if dev {
    return;
  }
  // true: no menu.
  webview.webview().connect_context_menu(|_, menu, _, _| {
    for item in menu.items() {
      if !item.is_separator() && browser_item_webkitgtk(&format!("{:?}", item.stock_action())) {
        menu.remove(&item);
      }
    }
    let items = menu.items();
    let separators: Vec<bool> = items.iter().map(|item| item.is_separator()).collect();
    let stray = stray_separators(&separators);
    for &i in &stray {
      menu.remove(&items[i]);
    }
    stray.len() == items.len()
  });
}

#[cfg(target_os = "macos")]
mod mac {
  use std::sync::OnceLock;

  use objc2::{
    msg_send,
    rc::Retained,
    runtime::{AnyClass, AnyObject, Imp, Sel},
    sel,
  };
  use objc2_app_kit::{NSEvent, NSMenu, NSMenuItem, NSUserInterfaceItemIdentification};
  use objc2_foundation::NSArray;

  /// The class the method was added to, whose superclass (WKWebView) gets the call first.
  static CLASS: OnceLock<usize> = OnceLock::new();

  pub fn install(dev: bool, webview: &wry::WebView) {
    use wry::WebViewExtMacOS;
    if dev {
      return;
    }
    let wk = webview.webview();
    let class: &'static AnyClass = (*wk).class();
    CLASS.get_or_init(|| {
      let imp = will_open_menu as extern "C-unwind" fn(&AnyObject, Sel, *mut NSMenu, *mut NSEvent);
      // Safety: the signature matches the type encoding (void; self, _cmd, two objects).
      // class_addMethod adds an override of the superclass's method and never replaces one the
      // class has itself (a newer wry may define it): then the menu keeps its items.
      let added = unsafe {
        objc2::ffi::class_addMethod(class as *const AnyClass as *mut AnyClass, sel!(willOpenMenu:withEvent:), std::mem::transmute::<_, Imp>(imp), c"v@:@@".as_ptr())
      };
      if !added.as_bool() {
        log!("{} already implements willOpenMenu:withEvent:; the page's context menu keeps the browser's items", class.name().to_string_lossy());
      }
      class as *const AnyClass as usize
    });
  }

  extern "C-unwind" fn will_open_menu(this: &AnyObject, _: Sel, menu: *mut NSMenu, event: *mut NSEvent) {
    let Some(class) = CLASS.get().map(|&c| unsafe { &*(c as *const AnyClass) }) else { return };
    let Some(superclass) = class.superclass() else { return };
    unsafe {
      let _: () = msg_send![super(this, superclass), willOpenMenu: menu, withEvent: event];
    }
    let Some(menu) = (unsafe { menu.as_ref() }) else { return };
    let items: Retained<NSArray<NSMenuItem>> = menu.itemArray();
    for item in items.iter() {
      let identifier = item.identifier().map(|id| id.to_string()).unwrap_or_default();
      if super::browser_item_wkwebview(&identifier) {
        menu.removeItem(&item);
      }
    }
    // Separators left at an end or doubled; an empty menu is not shown.
    let items = menu.itemArray();
    let separators: Vec<bool> = items.iter().map(|item| item.isSeparatorItem()).collect();
    for i in super::stray_separators(&separators) {
      menu.removeItem(&items.objectAtIndex(i));
    }
  }
}

#[cfg(target_os = "macos")]
pub use mac::install;

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn browser_items_go_and_editing_stays() {
    for name in ["back", "reload", "print", "saveAs", "share", "inspectElement", "openLinkInNewWindow", "saveImageAs", "moreTools"] {
      assert!(browser_item_webview2(name), "{name}");
    }
    for name in ["cut", "copy", "paste", "pasteAndMatchStyle", "selectAll", "undo", "redo", "emoji", "copyLinkLocation", "copyImage", "other"] {
      assert!(!browser_item_webview2(name), "{name}");
    }
    for action in ["GoBack", "Reload", "Stop", "InspectElement", "OpenLink", "DownloadImageToDisk", "Custom"] {
      assert!(browser_item_webkitgtk(action), "{action}");
    }
    for action in ["Copy", "Cut", "Paste", "SelectAll", "SpellingGuess", "InsertEmoji", "CopyLinkToClipboard", "InputMethods"] {
      assert!(!browser_item_webkitgtk(action), "{action}");
    }
    for id in ["WKMenuItemIdentifierReload", "WKMenuItemIdentifierInspectElement", "WKMenuItemIdentifierShareMenu", "WKMenuItemIdentifierOpenLinkInNewWindow"] {
      assert!(browser_item_wkwebview(id), "{id}");
    }
    for id in ["WKMenuItemIdentifierCopy", "WKMenuItemIdentifierPaste", "WKMenuItemIdentifierLookUp", "WKMenuItemIdentifierTranslate", "WKMenuItemIdentifierSpeechMenu", ""] {
      assert!(!browser_item_wkwebview(id), "{id}");
    }
  }

  #[test]
  fn separators_do_not_lead_trail_or_double() {
    let (s, i) = (true, false);
    assert_eq!(stray_separators(&[]), Vec::<usize>::new());
    assert_eq!(stray_separators(&[i, s, i]), Vec::<usize>::new());
    assert_eq!(stray_separators(&[s, i, s, s, i, s]), vec![5, 3, 0]);
    assert_eq!(stray_separators(&[s, s]), vec![1, 0]);
    assert_eq!(stray_separators(&[i, s, s, s]), vec![3, 2, 1]);
    // Nothing but separators: all go, and the menu is not shown.
    assert_eq!(stray_separators(&[s]).len(), 1);
  }
}
