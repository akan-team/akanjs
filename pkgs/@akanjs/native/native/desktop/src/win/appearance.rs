//! Light and dark on Windows (appearance plugin; window.setTheme in lib.rs), app-wide as on macOS:
//! - TAO's event loop theme: every window's title bar and TAO's `theme()`, windows opened later
//!   included (tao/src/platform_impl/windows/event_loop.rs:340-345, window.rs:1104-1110). TAO
//!   reads the system's AppsUseLightTheme itself and sends ThemeChanged when it changes, or when
//!   this theme changes what a window shows.
//! - WebView2's preferred color scheme, which prefers-color-scheme follows (Auto: the system's):
//!   wry's set_theme sets it on the webview's profile (wry/src/webview2/mod.rs:1915-1924). Set on
//!   every webview anyway, and on new ones in lib.rs open_window. tauri-runtime-wry keeps the
//!   webviews in step with TAO the same way (tauri/crates/tauri-runtime-wry/src/lib.rs:4255-4266).

use std::sync::Mutex;

use tao::event_loop::EventLoopWindowTarget;
use tao::window::Theme;
use wry::{WebView, WebViewExtWindows};

use crate::UserEvent;

/// What the app asked for; None: the system's.
static FORCED: Mutex<Option<Theme>> = Mutex::new(None);

fn webview_theme(theme: Option<Theme>) -> wry::Theme {
  match theme {
    Some(Theme::Dark) => wry::Theme::Dark,
    Some(_) => wry::Theme::Light,
    None => wry::Theme::Auto,
  }
}

fn apply_to(webview: &WebView, theme: Option<Theme>) {
  // Runtimes before 101.0.1210.39 lack ICoreWebView2_13; the page then keeps the system's scheme.
  if let Err(e) = webview.set_theme(webview_theme(theme)) {
    log!("webview theme: {e}");
  }
}

pub fn set_theme<'a>(target: &EventLoopWindowTarget<UserEvent>, theme: Option<Theme>, webviews: impl Iterator<Item = &'a WebView>) {
  *FORCED.lock().unwrap() = theme;
  target.set_theme(theme);
  for webview in webviews {
    apply_to(webview, theme);
  }
}

/// A new window's webview: the app's theme, if it set one (the default is the system's).
pub fn apply(webview: &WebView) {
  let theme = *FORCED.lock().unwrap();
  if theme.is_some() {
    apply_to(webview, theme);
  }
}
