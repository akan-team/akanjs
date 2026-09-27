//! Light and dark on Linux (appearance plugin; window.setTheme and window.getState's `theme` in
//! lib.rs), app-wide as on macOS. WebKitGTK draws prefers-color-scheme dark when GTK's
//! gtk-application-prefer-dark-theme is on, when gtk-theme-name ends in -dark, -Dark or :dark, or
//! when $GTK_THEME ends in :dark, and follows changes of those settings live (WebKit's
//! PageClientImpl::effectiveAppearanceIsDark, GTK 3 port). So the shell sets GTK's settings and
//! reads the same rule back for `theme`:
//! - "dark": prefer-dark on.
//! - "light": prefer-dark off, and a dark theme name swapped for its light variant ("Yaru-dark" →
//!   "Yaru"), which Ubuntu's dark style sets. $GTK_THEME cannot be overridden.
//! - system (null): GTK's own settings (XSETTINGS, what the desktop set), plus prefer-dark while
//!   the desktop portal's color-scheme is 1, "prefer dark" (org.freedesktop.portal.Settings,
//!   namespace org.freedesktop.appearance): GNOME's and KDE's dark style, which GTK 3 itself
//!   ignores and libadwaita follows.
//! TAO reads the portal only with its dbus feature (the dbus crate, 5 s blocking calls:
//! tao/src/platform_impl/linux/portal.rs), which the shell does not enable: then Window::theme() is
//! always Light, and set_theme(None) switches prefer-dark off on a dark desktop
//! (tao/src/platform_impl/linux/event_loop.rs:967-980). So lib.rs asks this module instead of TAO.
//! The portal is read asynchronously (ReadOne, else the older Read, whose value is boxed twice) and
//! watched through SettingChanged, so a missing or slow portal never holds up a window. When what
//! WebKit draws changes (the portal, GTK's settings, set_theme), UserEvent::ThemeChanged repaints
//! the windows and reports themeChanged, as TAO's ThemeChanged does on macOS and Windows.

use std::cell::{Cell, RefCell};

use gtk::{gio, glib, prelude::*};
use tao::window::Theme;

const PORTAL: &str = "org.freedesktop.portal.Desktop";
const PORTAL_PATH: &str = "/org/freedesktop/portal/desktop";
const SETTINGS: &str = "org.freedesktop.portal.Settings";
const NAMESPACE: &str = "org.freedesktop.appearance";

thread_local! {
  static STARTED: Cell<bool> = const { Cell::new(false) };
  /// set_theme's value: Some(true) dark, Some(false) light, None the system's.
  static FORCED: Cell<Option<bool>> = const { Cell::new(None) };
  /// The portal's color-scheme: 0 no preference, 1 prefer dark, 2 prefer light; None unknown.
  static SCHEME: Cell<Option<u32>> = const { Cell::new(None) };
  /// The theme name before "light" swapped it.
  static SWAPPED: RefCell<Option<String>> = const { RefCell::new(None) };
  /// What was last reported, so that only real changes repaint.
  static LAST: Cell<Option<bool>> = const { Cell::new(None) };
}

fn dark_name(name: &str) -> bool {
  name.ends_with("-dark") || name.ends_with("-Dark") || name.ends_with(":dark")
}

/// "Yaru-dark" → "Yaru".
fn light_name(name: &str) -> &str {
  name.strip_suffix("-dark").or_else(|| name.strip_suffix("-Dark")).unwrap_or(name)
}

/// WebKitGTK's rule (see above).
fn draws_dark(settings: &gtk::Settings) -> bool {
  settings.is_gtk_application_prefer_dark_theme()
    || settings.gtk_theme_name().is_some_and(|n| dark_name(&n))
    || std::env::var("GTK_THEME").is_ok_and(|t| t.ends_with(":dark"))
}

/// Whether windows draw dark now.
pub fn is_dark() -> bool {
  start();
  gtk::Settings::default().is_some_and(|s| draws_dark(&s))
}

pub fn theme() -> Theme {
  if is_dark() {
    Theme::Dark
  } else {
    Theme::Light
  }
}

/// Sets GTK's settings for the forced theme, or the system's.
fn apply() {
  let Some(settings) = gtk::Settings::default() else { return };
  let want = FORCED.get().or_else(|| (SCHEME.get() == Some(1)).then_some(true));
  if want != Some(false) && SWAPPED.take().is_some() {
    settings.reset_property("gtk-theme-name"); // back to the desktop's (XSETTINGS) value
  }
  match want {
    Some(true) => settings.set_gtk_application_prefer_dark_theme(true),
    Some(false) => {
      settings.set_gtk_application_prefer_dark_theme(false);
      if let Some(name) = settings.gtk_theme_name().filter(|n| dark_name(n)) {
        SWAPPED.with(|s| s.borrow_mut().get_or_insert_with(|| name.to_string()).clone());
        settings.set_gtk_theme_name(Some(light_name(&name)));
      }
    }
    None => settings.reset_property("gtk-application-prefer-dark-theme"),
  }
}

/// Reports a change of what the windows draw.
fn changed() {
  let dark = gtk::Settings::default().is_some_and(|s| draws_dark(&s));
  if LAST.replace(Some(dark)) != Some(dark) {
    crate::send(crate::UserEvent::ThemeChanged);
  }
}

pub fn set_theme(theme: Option<Theme>) {
  start();
  FORCED.set(theme.map(|t| t == Theme::Dark));
  apply();
  changed();
}

/// The portal's value: ReadOne answers (v), Read (v) holding another v.
fn scheme_of(mut value: glib::Variant) -> Option<u32> {
  while let Some(inner) = value.as_variant() {
    value = inner;
  }
  value.get::<u32>()
}

fn portal_scheme(scheme: Option<u32>) {
  if SCHEME.replace(scheme) != scheme {
    apply();
    changed();
  }
}

fn read_portal(conn: &gio::DBusConnection, method: &'static str) {
  let args = (NAMESPACE, "color-scheme").to_variant();
  let retry = conn.clone();
  conn.call(Some(PORTAL), PORTAL_PATH, SETTINGS, method, Some(&args), glib::VariantTy::new("(v)").ok(), gio::DBusCallFlags::NONE, 5000, gio::Cancellable::NONE, move |result| match result {
    Ok(reply) => portal_scheme(scheme_of(reply.child_value(0))),
    // Portals before version 2 have no ReadOne.
    Err(e) if method == "ReadOne" && e.message().contains("UnknownMethod") => read_portal(&retry, "Read"),
    Err(e) => log!("appearance: no color-scheme from the desktop portal: {e}"),
  });
}

/// Once, on the main thread, after GTK started: watch GTK's settings and the portal.
fn start() {
  if STARTED.replace(true) {
    return;
  }
  if let Some(settings) = gtk::Settings::default() {
    LAST.set(Some(draws_dark(&settings)));
    settings.connect_gtk_application_prefer_dark_theme_notify(|_| changed());
    settings.connect_gtk_theme_name_notify(|_| changed());
  }
  let conn = match gio::bus_get_sync(gio::BusType::Session, gio::Cancellable::NONE) {
    Ok(conn) => conn,
    Err(e) => return log!("appearance: no session bus for the desktop portal: {e}"),
  };
  conn.signal_subscribe(Some(PORTAL), Some(SETTINGS), Some("SettingChanged"), Some(PORTAL_PATH), Some(NAMESPACE), gio::DBusSignalFlags::NONE, |_, _, _, _, _, params| {
    // (namespace, key, value)
    if params.n_children() == 3 && params.child_value(1).str() == Some("color-scheme") {
      portal_scheme(scheme_of(params.child_value(2)));
    }
  });
  read_portal(&conn, "ReadOne");
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn theme_names() {
    assert!(dark_name("Adwaita-dark") && dark_name("Yaru-Dark") && dark_name("Adwaita:dark"));
    assert!(!dark_name("Adwaita") && !dark_name("Darkly"));
    assert_eq!(light_name("Yaru-dark"), "Yaru");
    assert_eq!(light_name("Adwaita"), "Adwaita");
  }

  #[test]
  fn portal_values() {
    assert_eq!(scheme_of(1u32.to_variant()), Some(1));
    assert_eq!(scheme_of(glib::Variant::from_variant(&glib::Variant::from_variant(&2u32.to_variant()))), Some(2));
    assert_eq!(scheme_of("x".to_variant()), None);
  }
}
