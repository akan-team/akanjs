//! Keyboard accelerators ("CmdOrCtrl+Shift+K") for menu key equivalents and global shortcuts.
//! Pure parsing and mapping, so it is unit tested on any host.
//!
//! Grammar follows Electron/Tauri: modifiers and one key joined by "+", case-insensitive.
//! - Modifiers: Cmd/Command/Super/Meta, Ctrl/Control, CmdOrCtrl/CommandOrControl, Alt/Option,
//!   Shift. On macOS CmdOrCtrl is Command; elsewhere it is Control.
//! - Keys: A–Z, 0–9, F1–F20, punctuation (= - , . / ; ' [ ] \ `), Plus, Space, Tab,
//!   Enter/Return, Escape/Esc, Backspace, Delete, Insert, Up/Down/Left/Right, Home, End,
//!   PageUp, PageDown, Num0–Num9.
//! Key codes are positions on the ANSI (US) layout, as in Carbon's kVK_* constants (global-hotkey
//! does the same); menu key equivalents are characters and follow the active layout.

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Accelerator {
  /// CmdOrCtrl (Command on macOS).
  pub primary: bool,
  pub command: bool,
  pub control: bool,
  pub alt: bool,
  pub shift: bool,
  /// Canonical key name: "a"–"z", "0"–"9", "F1"…, "Up", "Space", "=", "Num5", ….
  pub key: String,
}

const NAMED: &[(&str, &[&str])] = &[
  ("Space", &["space"]),
  ("Tab", &["tab"]),
  ("Enter", &["enter", "return"]),
  ("Escape", &["escape", "esc"]),
  ("Backspace", &["backspace"]),
  ("Delete", &["delete", "del"]),
  ("Insert", &["insert"]),
  ("Up", &["up", "arrowup"]),
  ("Down", &["down", "arrowdown"]),
  ("Left", &["left", "arrowleft"]),
  ("Right", &["right", "arrowright"]),
  ("Home", &["home"]),
  ("End", &["end"]),
  ("PageUp", &["pageup"]),
  ("PageDown", &["pagedown"]),
  ("Plus", &["plus"]),
];

const PUNCTUATION: &str = "=-,./;'[]\\`";

fn canonical_key(token: &str) -> Option<String> {
  let lower = token.to_ascii_lowercase();
  if token.chars().count() == 1 {
    let c = token.chars().next().unwrap();
    if c.is_ascii_alphanumeric() {
      return Some(c.to_ascii_lowercase().to_string());
    }
    if PUNCTUATION.contains(c) {
      return Some(c.to_string());
    }
    return None;
  }
  if let Some(n) = lower.strip_prefix('f').and_then(|n| n.parse::<u8>().ok()) {
    return (1..=20).contains(&n).then(|| format!("F{n}"));
  }
  if let Some(n) = lower.strip_prefix("num").and_then(|n| n.parse::<u8>().ok()) {
    return (n <= 9).then(|| format!("Num{n}"));
  }
  NAMED.iter().find(|(_, names)| names.contains(&lower.as_str())).map(|(name, _)| name.to_string())
}

pub fn parse(text: &str) -> Result<Accelerator, String> {
  let bad = |why: &str| Err(format!("bad accelerator {text:?}: {why}"));
  let tokens: Vec<&str> = text.split('+').map(str::trim).collect();
  if tokens.iter().any(|t| t.is_empty()) {
    return bad("empty part (write Plus for the + key)");
  }
  let (key, modifiers) = tokens.split_last().ok_or("empty accelerator")?;
  let mut a = Accelerator { primary: false, command: false, control: false, alt: false, shift: false, key: String::new() };
  for m in modifiers {
    let flag = match m.to_ascii_lowercase().as_str() {
      "cmdorctrl" | "commandorcontrol" | "cmdorcontrol" | "commandorctrl" => &mut a.primary,
      "cmd" | "command" | "super" | "meta" => &mut a.command,
      "ctrl" | "control" => &mut a.control,
      "alt" | "option" => &mut a.alt,
      "shift" => &mut a.shift,
      _ => return bad(&format!("unknown modifier {m:?}")),
    };
    if *flag {
      return bad(&format!("{m} given twice"));
    }
    *flag = true;
  }
  match canonical_key(key) {
    Some(k) => a.key = k,
    None => return bad(&format!("unknown key {key:?}")),
  }
  Ok(a)
}

#[cfg_attr(not(target_os = "macos"), allow(dead_code))] // canonical() is everyone's; the rest is AppKit's and Carbon's
impl Accelerator {
  /// macOS: Command pressed (CmdOrCtrl or Cmd).
  pub fn mac_command(&self) -> bool {
    self.primary || self.command
  }

  /// One spelling per shortcut, to compare registrations: "CmdOrCtrl+Alt+Shift+K".
  pub fn canonical(&self) -> String {
    let mut parts: Vec<String> = Vec::new();
    if self.primary {
      parts.push("CmdOrCtrl".into());
    }
    if self.command {
      parts.push("Cmd".into());
    }
    if self.control {
      parts.push("Ctrl".into());
    }
    if self.alt {
      parts.push("Alt".into());
    }
    if self.shift {
      parts.push("Shift".into());
    }
    parts.push(if self.key.len() == 1 { self.key.to_ascii_uppercase() } else { self.key.clone() });
    parts.join("+")
  }

  /// NSEventModifierFlags bits: Shift 1<<17, Control 1<<18, Option 1<<19, Command 1<<20.
  pub fn ns_modifiers(&self) -> usize {
    (if self.shift { 1 << 17 } else { 0 })
      | (if self.control { 1 << 18 } else { 0 })
      | (if self.alt { 1 << 19 } else { 0 })
      | (if self.mac_command() { 1 << 20 } else { 0 })
  }

  /// Carbon (Events.h) modifier bits: cmdKey 1<<8, shiftKey 1<<9, optionKey 1<<11, controlKey 1<<12.
  pub fn carbon_modifiers(&self) -> u32 {
    (if self.mac_command() { 1 << 8 } else { 0 })
      | (if self.shift { 1 << 9 } else { 0 })
      | (if self.alt { 1 << 11 } else { 0 })
      | (if self.control { 1 << 12 } else { 0 })
  }

  /// NSMenuItem keyEquivalent: a lowercase character, or the AppKit function-key character.
  /// Shift stays in the modifier mask rather than being spelled as an uppercase letter.
  pub fn key_equivalent(&self) -> String {
    let function = |code: u32| char::from_u32(code).unwrap().to_string();
    match self.key.as_str() {
      k if k.len() == 1 => k.to_string(),
      "Plus" => "+".into(),
      "Space" => " ".into(),
      "Tab" => "\t".into(),
      "Enter" => "\r".into(),
      "Escape" => "\u{1b}".into(),
      "Backspace" => "\u{8}".into(),
      "Delete" => function(0xF728), // NSDeleteFunctionKey (forward delete)
      "Insert" => function(0xF727),
      "Up" => function(0xF700),
      "Down" => function(0xF701),
      "Left" => function(0xF702),
      "Right" => function(0xF703),
      "Home" => function(0xF729),
      "End" => function(0xF72B),
      "PageUp" => function(0xF72C),
      "PageDown" => function(0xF72D),
      k if k.starts_with('F') => function(0xF704 + k[1..].parse::<u32>().unwrap() - 1), // NSF1FunctionKey…
      k if k.starts_with("Num") => k[3..].to_string(),
      _ => String::new(),
    }
  }

  /// Carbon virtual key code (kVK_*, ANSI layout).
  pub fn mac_key_code(&self) -> Option<u32> {
    const LETTERS: [u32; 26] = [
      0x00, 0x0B, 0x08, 0x02, 0x0E, 0x03, 0x05, 0x04, 0x22, 0x26, 0x28, 0x25, 0x2E, // a–m
      0x2D, 0x1F, 0x23, 0x0C, 0x0F, 0x01, 0x11, 0x20, 0x09, 0x0D, 0x07, 0x10, 0x06, // n–z
    ];
    const DIGITS: [u32; 10] = [0x1D, 0x12, 0x13, 0x14, 0x15, 0x17, 0x16, 0x1A, 0x1C, 0x19];
    const KEYPAD: [u32; 10] = [0x52, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5B, 0x5C];
    const FUNCTION: [u32; 20] = [
      0x7A, 0x78, 0x63, 0x76, 0x60, 0x61, 0x62, 0x64, 0x65, 0x6D, 0x67, 0x6F, 0x69, 0x6B, 0x71, 0x6A, 0x40, 0x4F, 0x50, 0x5A,
    ];
    let k = self.key.as_str();
    let c = k.chars().next()?;
    Some(match k {
      _ if k.len() == 1 && c.is_ascii_lowercase() => LETTERS[(c as u8 - b'a') as usize],
      _ if k.len() == 1 && c.is_ascii_digit() => DIGITS[(c as u8 - b'0') as usize],
      "=" => 0x18,
      "-" => 0x1B,
      "]" => 0x1E,
      "[" => 0x21,
      "'" => 0x27,
      ";" => 0x29,
      "\\" => 0x2A,
      "," => 0x2B,
      "/" => 0x2C,
      "." => 0x2F,
      "`" => 0x32,
      "Plus" => 0x18, // the = key; Shift makes it +
      "Enter" => 0x24,
      "Tab" => 0x30,
      "Space" => 0x31,
      "Backspace" => 0x33,
      "Escape" => 0x35,
      "Delete" => 0x75,
      "Insert" => 0x72, // Help on Apple keyboards
      "Home" => 0x73,
      "PageUp" => 0x74,
      "End" => 0x77,
      "PageDown" => 0x79,
      "Left" => 0x7B,
      "Right" => 0x7C,
      "Down" => 0x7D,
      "Up" => 0x7E,
      _ if k.starts_with("Num") => KEYPAD[k[3..].parse::<usize>().ok()?],
      _ if k.starts_with('F') => FUNCTION[k[1..].parse::<usize>().ok()? - 1],
      _ => return None,
    })
  }

  /// Back from a menu item's key equivalent and modifier bits (getAppMenu). None for an empty key.
  pub fn from_key_equivalent(key: &str, ns_modifiers: usize) -> Option<Accelerator> {
    let c = key.chars().next()?;
    let code = c as u32;
    let named = |n: &str| Some(n.to_string());
    let name = match code {
      0xF700 => named("Up"),
      0xF701 => named("Down"),
      0xF702 => named("Left"),
      0xF703 => named("Right"),
      0xF704..=0xF717 => Some(format!("F{}", code - 0xF704 + 1)),
      0xF727 => named("Insert"),
      0xF728 => named("Delete"),
      0xF729 => named("Home"),
      0xF72B => named("End"),
      0xF72C => named("PageUp"),
      0xF72D => named("PageDown"),
      0x20 => named("Space"),
      0x09 => named("Tab"),
      0x0D => named("Enter"),
      0x1B => named("Escape"),
      0x08 | 0x7F => named("Backspace"),
      0x2B => named("Plus"),
      _ if c.is_ascii_alphanumeric() => Some(c.to_ascii_lowercase().to_string()),
      _ if PUNCTUATION.contains(c) => Some(c.to_string()),
      _ => None,
    }?;
    // An uppercase letter as key equivalent means Shift (AppKit convention).
    let shift = ns_modifiers & (1 << 17) != 0 || c.is_ascii_uppercase();
    Some(Accelerator {
      primary: ns_modifiers & (1 << 20) != 0,
      command: false,
      control: ns_modifiers & (1 << 18) != 0,
      alt: ns_modifiers & (1 << 19) != 0,
      shift,
      key: name,
    })
  }
}

/// Windows and Linux (win/, linux/): CmdOrCtrl is Control there, and Cmd/Super/Meta the Windows
/// (Super) key. Key codes are US-layout positions again: virtual-key codes for RegisterHotKey and
/// accelerator tables (the same table as Electrobun's, electrobun/package/src/native/win/
/// nativeWrapper.cpp:6401-6451), keysyms for GTK accelerators and XGrabKey (GDK keyvals are keysyms).
#[cfg_attr(target_os = "macos", allow(dead_code))]
impl Accelerator {
  /// Control pressed: Ctrl or CmdOrCtrl.
  pub fn control_key(&self) -> bool {
    self.control || self.primary
  }
}

#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
impl Accelerator {
  /// RegisterHotKey modifiers: MOD_ALT 1, MOD_CONTROL 2, MOD_SHIFT 4, MOD_WIN 8.
  pub fn win_hotkey_modifiers(&self) -> u32 {
    (if self.alt { 1 } else { 0 }) | (if self.control_key() { 2 } else { 0 }) | (if self.shift { 4 } else { 0 }) | (if self.command { 8 } else { 0 })
  }

  /// ACCEL.fVirt: FVIRTKEY 1 | FSHIFT 4 | FCONTROL 8 | FALT 0x10. None with the Windows key, which
  /// accelerator tables cannot hold.
  pub fn win_accel_flags(&self) -> Option<u8> {
    if self.command {
      return None;
    }
    Some(1 | (if self.shift { 4 } else { 0 }) | (if self.control_key() { 8 } else { 0 }) | (if self.alt { 0x10 } else { 0 }))
  }

  /// Windows virtual-key code (VK_*).
  pub fn win_vk(&self) -> Option<u16> {
    let k = self.key.as_str();
    let c = k.chars().next()?;
    Some(match k {
      _ if k.len() == 1 && c.is_ascii_lowercase() => c.to_ascii_uppercase() as u16,
      _ if k.len() == 1 && c.is_ascii_digit() => c as u16,
      "=" | "Plus" => 0xBB, // VK_OEM_PLUS, the = key (Shift makes it +)
      "-" => 0xBD,
      "," => 0xBC,
      "." => 0xBE,
      "/" => 0xBF,
      ";" => 0xBA,
      "'" => 0xDE,
      "[" => 0xDB,
      "]" => 0xDD,
      "\\" => 0xDC,
      "`" => 0xC0,
      "Space" => 0x20,
      "Tab" => 0x09,
      "Enter" => 0x0D,
      "Escape" => 0x1B,
      "Backspace" => 0x08,
      "Delete" => 0x2E,
      "Insert" => 0x2D,
      "Up" => 0x26,
      "Down" => 0x28,
      "Left" => 0x25,
      "Right" => 0x27,
      "Home" => 0x24,
      "End" => 0x23,
      "PageUp" => 0x21,
      "PageDown" => 0x22,
      _ if k.starts_with("Num") => 0x60 + k[3..].parse::<u16>().ok()?, // VK_NUMPAD0…
      _ if k.starts_with('F') => 0x70 + k[1..].parse::<u16>().ok()? - 1, // VK_F1…
      _ => return None,
    })
  }

  /// How Windows menus show it after the tab: "Ctrl+Shift+K".
  pub fn win_label(&self) -> String {
    let mut parts: Vec<String> = Vec::new();
    for (on, name) in [(self.command, "Win"), (self.control_key(), "Ctrl"), (self.alt, "Alt"), (self.shift, "Shift")] {
      if on {
        parts.push(name.into());
      }
    }
    parts.push(match self.key.as_str() {
      "Plus" => "+".into(),
      "Delete" => "Del".into(),
      "Insert" => "Ins".into(),
      "Escape" => "Esc".into(),
      k if k.len() == 1 => k.to_ascii_uppercase(),
      k => k.into(),
    });
    parts.join("+")
  }
}

#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
impl Accelerator {
  /// X11 keysym, also the GDK keyval.
  pub fn keysym(&self) -> Option<u32> {
    let k = self.key.as_str();
    let c = k.chars().next()?;
    Some(match k {
      _ if k.len() == 1 => c as u32, // a–z, 0–9 and punctuation are their Latin-1 keysyms
      "Plus" => 0x2B,
      "Space" => 0x20,
      "Tab" => 0xFF09,
      "Enter" => 0xFF0D,
      "Escape" => 0xFF1B,
      "Backspace" => 0xFF08,
      "Delete" => 0xFFFF,
      "Insert" => 0xFF63,
      "Up" => 0xFF52,
      "Down" => 0xFF54,
      "Left" => 0xFF51,
      "Right" => 0xFF53,
      "Home" => 0xFF50,
      "End" => 0xFF57,
      "PageUp" => 0xFF55,
      "PageDown" => 0xFF56,
      _ if k.starts_with("Num") => 0xFFB0 + k[3..].parse::<u32>().ok()?, // XK_KP_0…
      _ if k.starts_with('F') => 0xFFBE + k[1..].parse::<u32>().ok()? - 1, // XK_F1…
      _ => return None,
    })
  }

  /// X11 modifier state: ShiftMask 1, ControlMask 4, Mod1Mask (Alt) 8, Mod4Mask (Super) 64.
  pub fn x11_modifiers(&self) -> u32 {
    (if self.shift { 1 } else { 0 }) | (if self.control_key() { 4 } else { 0 }) | (if self.alt { 8 } else { 0 }) | (if self.command { 64 } else { 0 })
  }

  /// GdkModifierType: SHIFT 1, CONTROL 4, MOD1 (Alt) 8, SUPER 1 << 26.
  pub fn gdk_modifiers(&self) -> u32 {
    (if self.shift { 1 } else { 0 }) | (if self.control_key() { 4 } else { 0 }) | (if self.alt { 8 } else { 0 }) | (if self.command { 1 << 26 } else { 0 })
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn maps_to_windows_and_x11() {
    let a = parse("CmdOrCtrl+Alt+Shift+G").unwrap();
    assert_eq!(a.win_vk(), Some(0x47));
    assert_eq!(a.win_hotkey_modifiers(), 1 | 2 | 4);
    assert_eq!(a.win_accel_flags(), Some(1 | 4 | 8 | 0x10));
    assert_eq!(a.keysym(), Some(0x67)); // XK_g
    assert_eq!(a.x11_modifiers(), 1 | 4 | 8);
    assert_eq!(a.gdk_modifiers(), 1 | 4 | 8);
    assert_eq!(a.win_label(), "Ctrl+Alt+Shift+G");
    // Cmd is the Windows (Super) key there: not in accelerator tables.
    let win = parse("Super+Shift+F12").unwrap();
    assert_eq!((win.win_vk(), win.win_hotkey_modifiers(), win.win_accel_flags()), (Some(0x7B), 8 | 4, None));
    assert_eq!((win.keysym(), win.x11_modifiers(), win.gdk_modifiers()), (Some(0xFFC9), 64 | 1, (1 << 26) | 1));
    assert_eq!(parse("Ctrl+F1").unwrap().keysym(), Some(0xFFBE));
    assert_eq!(parse("F20").unwrap().win_vk(), Some(0x83));
    for (text, vk, sym) in [("Ctrl+=", 0xBB, 0x3D), ("Ctrl+Plus", 0xBB, 0x2B), ("Alt+/", 0xBF, 0x2F), ("Ctrl+`", 0xC0, 0x60), ("Num7", 0x67, 0xFFB7), ("Ctrl+0", 0x30, 0x30)] {
      let a = parse(text).unwrap();
      assert_eq!((a.win_vk(), a.keysym()), (Some(vk), Some(sym)), "{text}");
    }
    for (text, vk, sym) in [("Delete", 0x2E, 0xFFFF), ("PageDown", 0x22, 0xFF56), ("Enter", 0x0D, 0xFF0D), ("Left", 0x25, 0xFF51), ("Space", 0x20, 0x20)] {
      let a = parse(text).unwrap();
      assert_eq!((a.win_vk(), a.keysym()), (Some(vk), Some(sym)), "{text}");
    }
    assert_eq!(parse("CmdOrCtrl+Plus").unwrap().win_label(), "Ctrl++");
    assert_eq!(parse("Ctrl+Delete").unwrap().win_label(), "Ctrl+Del");
  }

  #[test]
  fn parses_modifiers_and_keys() {
    let a = parse("CmdOrCtrl+Shift+K").unwrap();
    assert!(a.primary && a.shift && !a.alt && !a.control);
    assert_eq!(a.key, "k");
    assert_eq!(a.canonical(), "CmdOrCtrl+Shift+K");
    assert_eq!(parse("shift+commandorcontrol+k").unwrap().canonical(), "CmdOrCtrl+Shift+K");
    assert_eq!(parse("Option+Command+F12").unwrap().canonical(), "Cmd+Alt+F12");
    assert_eq!(parse("Ctrl+Plus").unwrap().canonical(), "Ctrl+Plus");
    assert_eq!(parse("Alt+ArrowUp").unwrap().key, "Up");
    assert_eq!(parse("Esc").unwrap().key, "Escape");
    assert_eq!(parse("Super+Num7").unwrap().canonical(), "Cmd+Num7");
    assert_eq!(parse("Ctrl+/").unwrap().key, "/");
  }

  #[test]
  fn rejects_bad_accelerators() {
    for bad in ["", "Cmd+", "Cmd++", "Hyper+K", "Cmd+Shift+Shift+K", "Cmd+KK", "F25", "Cmd+é", "Num10"] {
      assert!(parse(bad).is_err(), "{bad:?} should fail");
    }
  }

  #[test]
  fn maps_to_carbon_and_appkit() {
    let a = parse("CmdOrCtrl+Alt+Shift+K").unwrap();
    assert_eq!(a.carbon_modifiers(), 256 | 512 | 2048);
    assert_eq!(a.ns_modifiers(), (1 << 20) | (1 << 19) | (1 << 17));
    assert_eq!(a.mac_key_code(), Some(0x28)); // kVK_ANSI_K
    assert_eq!(a.key_equivalent(), "k");
    assert_eq!(parse("Ctrl+Space").unwrap().mac_key_code(), Some(0x31));
    assert_eq!(parse("F1").unwrap().mac_key_code(), Some(0x7A));
    assert_eq!(parse("F12").unwrap().mac_key_code(), Some(0x6F));
    assert_eq!(parse("Cmd+0").unwrap().mac_key_code(), Some(0x1D));
    assert_eq!(parse("Cmd+Up").unwrap().key_equivalent(), "\u{F700}");
    assert_eq!(parse("F5").unwrap().key_equivalent(), "\u{F708}");
    assert_eq!(parse("Cmd+Ctrl+F").unwrap().carbon_modifiers(), 256 | 4096);
  }

  #[test]
  fn round_trips_through_menu_key_equivalents() {
    for text in ["CmdOrCtrl+Shift+K", "CmdOrCtrl+Alt+Left", "Ctrl+F5", "CmdOrCtrl+,", "CmdOrCtrl+Plus", "Shift+Delete"] {
      let a = parse(text).unwrap();
      let back = Accelerator::from_key_equivalent(&a.key_equivalent(), a.ns_modifiers()).unwrap();
      assert_eq!(back.canonical(), a.canonical(), "{text}");
    }
    // AppKit's "Z" (uppercase) implies Shift.
    assert_eq!(Accelerator::from_key_equivalent("Z", 1 << 20).unwrap().canonical(), "CmdOrCtrl+Shift+Z");
  }
}
