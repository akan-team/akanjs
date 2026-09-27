//! Minimal JSON reader for the shell config, and string quoting for events.
//! Kept in-tree because serde is not in the wry/tao dependency tree.

#[allow(dead_code)] // arrays and nulls are parsed but the config does not read them
pub enum V {
  Null,
  Bool(bool),
  Num(f64),
  Str(String),
  Arr(Vec<V>),
  Obj(Vec<(String, V)>),
}

impl V {
  pub fn get(&self, k: &str) -> Option<&V> {
    if let V::Obj(o) = self {
      o.iter().find(|(kk, _)| kk == k).map(|(_, v)| v)
    } else {
      None
    }
  }
  pub fn as_str(&self) -> Option<&str> {
    if let V::Str(s) = self {
      Some(s)
    } else {
      None
    }
  }
  pub fn as_f64(&self) -> Option<f64> {
    if let V::Num(n) = self {
      Some(*n)
    } else {
      None
    }
  }
  pub fn as_bool(&self) -> Option<bool> {
    if let V::Bool(b) = self {
      Some(*b)
    } else {
      None
    }
  }
}

/// Deeper nesting is refused: each level is a recursive call, and a page could send an array nested
/// a million deep (menu items reach shell_op on the main thread) to overflow the stack.
const MAX_DEPTH: usize = 128;

pub fn parse(s: &str) -> Result<V, String> {
  let mut p = P { b: s.as_bytes(), i: 0, depth: 0 };
  let v = p.val()?;
  p.ws();
  if p.i != p.b.len() {
    return Err(format!("trailing data at {}", p.i));
  }
  Ok(v)
}

struct P<'a> {
  b: &'a [u8],
  i: usize,
  depth: usize,
}

impl P<'_> {
  fn ws(&mut self) {
    while self.i < self.b.len() && matches!(self.b[self.i], b' ' | b'\n' | b'\r' | b'\t') {
      self.i += 1;
    }
  }

  fn eat(&mut self, c: u8) -> Result<(), String> {
    self.ws();
    if self.b.get(self.i) == Some(&c) {
      self.i += 1;
      Ok(())
    } else {
      Err(format!("expected '{}' at {}", c as char, self.i))
    }
  }

  fn val(&mut self) -> Result<V, String> {
    self.ws();
    let nested = matches!(self.b.get(self.i), Some(b'{' | b'['));
    if nested {
      if self.depth == MAX_DEPTH {
        return Err(format!("nested deeper than {MAX_DEPTH} at {}", self.i));
      }
      self.depth += 1;
    }
    let v = self.value();
    if nested {
      self.depth -= 1;
    }
    v
  }

  fn value(&mut self) -> Result<V, String> {
    match self.b.get(self.i).copied() {
      Some(b'{') => {
        self.i += 1;
        let mut o = Vec::new();
        self.ws();
        if self.b.get(self.i) == Some(&b'}') {
          self.i += 1;
          return Ok(V::Obj(o));
        }
        loop {
          self.ws();
          let k = self.string()?;
          self.eat(b':')?;
          o.push((k, self.val()?));
          self.ws();
          match self.b.get(self.i) {
            Some(b',') => self.i += 1,
            Some(b'}') => {
              self.i += 1;
              return Ok(V::Obj(o));
            }
            _ => return Err(format!("bad object at {}", self.i)),
          }
        }
      }
      Some(b'[') => {
        self.i += 1;
        let mut a = Vec::new();
        self.ws();
        if self.b.get(self.i) == Some(&b']') {
          self.i += 1;
          return Ok(V::Arr(a));
        }
        loop {
          a.push(self.val()?);
          self.ws();
          match self.b.get(self.i) {
            Some(b',') => self.i += 1,
            Some(b']') => {
              self.i += 1;
              return Ok(V::Arr(a));
            }
            _ => return Err(format!("bad array at {}", self.i)),
          }
        }
      }
      Some(b'"') => Ok(V::Str(self.string()?)),
      Some(b't') if self.b[self.i..].starts_with(b"true") => {
        self.i += 4;
        Ok(V::Bool(true))
      }
      Some(b'f') if self.b[self.i..].starts_with(b"false") => {
        self.i += 5;
        Ok(V::Bool(false))
      }
      Some(b'n') if self.b[self.i..].starts_with(b"null") => {
        self.i += 4;
        Ok(V::Null)
      }
      Some(_) => {
        let st = self.i;
        while self.i < self.b.len() && matches!(self.b[self.i], b'-' | b'+' | b'.' | b'e' | b'E' | b'0'..=b'9') {
          self.i += 1;
        }
        std::str::from_utf8(&self.b[st..self.i])
          .unwrap()
          .parse()
          .map(V::Num)
          .map_err(|_| format!("bad number at {st}"))
      }
      None => Err("unexpected end".into()),
    }
  }

  fn string(&mut self) -> Result<String, String> {
    if self.b.get(self.i) != Some(&b'"') {
      return Err(format!("expected string at {}", self.i));
    }
    self.i += 1;
    let mut out = String::new();
    loop {
      let c = *self.b.get(self.i).ok_or("unterminated string")?;
      self.i += 1;
      match c {
        b'"' => return Ok(out),
        b'\\' => {
          let e = *self.b.get(self.i).ok_or("bad escape")?;
          self.i += 1;
          match e {
            b'"' => out.push('"'),
            b'\\' => out.push('\\'),
            b'/' => out.push('/'),
            b'b' => out.push('\u{8}'),
            b'f' => out.push('\u{c}'),
            b'n' => out.push('\n'),
            b'r' => out.push('\r'),
            b't' => out.push('\t'),
            b'u' => {
              let hex = |p: &mut Self| -> Result<u32, String> {
                let h = std::str::from_utf8(p.b.get(p.i..p.i + 4).ok_or("bad \\u")?).map_err(|_| "bad \\u")?;
                if !h.bytes().all(|b| b.is_ascii_hexdigit()) {
                  return Err("bad \\u".into()); // from_str_radix would take "+abc"
                }
                p.i += 4;
                u32::from_str_radix(h, 16).map_err(|_| "bad \\u".to_string())
              };
              let mut cp = hex(self)?;
              if (0xD800..0xDC00).contains(&cp) && self.b.get(self.i..self.i + 2) == Some(b"\\u") {
                self.i += 2;
                let lo = hex(self)?;
                cp = 0x10000 + ((cp - 0xD800) << 10) + (lo.wrapping_sub(0xDC00) & 0x3ff);
              }
              out.push(char::from_u32(cp).unwrap_or('\u{fffd}'));
            }
            _ => return Err("bad escape".into()),
          }
        }
        _ => {
          // Copy a whole UTF-8 sequence.
          let st = self.i - 1;
          let len = match c {
            0x00..=0x7f => 1,
            0xc0..=0xdf => 2,
            0xe0..=0xef => 3,
            _ => 4,
          };
          self.i = (st + len).min(self.b.len());
          out.push_str(std::str::from_utf8(&self.b[st..self.i]).map_err(|_| "bad utf8")?);
        }
      }
    }
  }
}

pub fn quote(s: &str) -> String {
  let mut o = String::with_capacity(s.len() + 2);
  o.push('"');
  for c in s.chars() {
    match c {
      '"' => o.push_str("\\\""),
      '\\' => o.push_str("\\\\"),
      '\n' => o.push_str("\\n"),
      '\r' => o.push_str("\\r"),
      '\t' => o.push_str("\\t"),
      c if (c as u32) < 0x20 => o.push_str(&format!("\\u{:04x}", c as u32)),
      c => o.push(c),
    }
  }
  o.push('"');
  o
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn nesting_is_limited() {
    let ok = format!("{}{}", "[".repeat(MAX_DEPTH), "]".repeat(MAX_DEPTH));
    assert!(parse(&ok).is_ok());
    let deep = format!("{}{}", "[".repeat(MAX_DEPTH + 1), "]".repeat(MAX_DEPTH + 1));
    assert!(parse(&deep).err().is_some_and(|e| e.contains("nested deeper")));
    // A million levels: an error, not a stack overflow.
    assert!(parse(&"[".repeat(1_000_000)).is_err());
    assert!(parse(r#"{"a":[{"b":[1,2,{"c":{}}]}]}"#).is_ok());
  }

  #[test]
  fn unicode_escapes_are_four_hex_digits() {
    assert!(matches!(parse(r#""é""#), Ok(V::Str(s)) if s == "é"));
    assert!(parse(r#""\u+0e9""#).is_err());
    assert!(parse(r#""\u00g9""#).is_err());
  }
}
