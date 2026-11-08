//! core/src/acl.ts as far as the links the shell hands to the OS need it; vectors.rs runs the shared vectors on it.

use crate::json::V;

type Entry = Vec<(String, String)>;

struct Grant {
  plugin: String,
  windows: Option<Vec<u32>>,
  items: Option<Vec<String>>,
  allow: Option<Vec<Entry>>,
  deny: Vec<Entry>,
}

pub struct Acl {
  grants: Vec<Grant>,
  denied: Vec<(String, Vec<String>)>,
}

fn strings(v: &V) -> Option<Vec<String>> {
  v.as_array()?.iter().map(|s| s.as_str().map(str::to_string)).collect()
}

fn entries(v: &V) -> Option<Vec<Entry>> {
  v.as_array()?
    .iter()
    .map(|e| match e {
      V::Obj(fields) => fields.iter().map(|(k, x)| Some((k.clone(), x.as_str()?.to_string()))).collect(),
      _ => None,
    })
    .collect()
}

fn grant(g: &V) -> Option<Grant> {
  let every = |v: &V| matches!(v, V::Str(s) if s == "*");
  let windows = g.get("windows")?;
  let items = g.get("items")?;
  Some(Grant {
    plugin: g.get("plugin")?.as_str()?.to_string(),
    windows: if every(windows) { None } else { Some(windows.as_array()?.iter().map(|n| n.as_f64().map(|n| n as u32)).collect::<Option<_>>()?) },
    items: if every(items) { None } else { Some(strings(items)?) },
    allow: match g.get("allow") {
      None => None,
      Some(v) => Some(entries(v)?),
    },
    deny: match g.get("deny") {
      None => Vec::new(),
      Some(v) => entries(v)?,
    },
  })
}

impl Acl {
  /// boot.json's ACL as main.ts passes it on (acl.ts loadAcl); one this cannot read allows nothing.
  pub fn from(v: &V) -> Acl {
    let parsed = || -> Option<Acl> {
      let grants = v.get("grants")?.as_array()?.iter().map(grant).collect::<Option<_>>()?;
      let denied = match v.get("denied") {
        None => Vec::new(),
        Some(V::Obj(o)) => o.iter().map(|(k, items)| Some((k.clone(), strings(items)?))).collect::<Option<_>>()?,
        Some(_) => return None,
      };
      Some(Acl { grants, denied })
    };
    parsed().unwrap_or(Acl { grants: Vec::new(), denied: Vec::new() })
  }

  pub fn opener_permits(&self, url: &str, window: u32) -> bool {
    let (plugin, item) = ("opener", "openUrl");
    if self.denied.iter().any(|(p, items)| p == plugin && items.iter().any(|i| i == item)) {
      return false;
    }
    let matching: Vec<&Grant> = self
      .grants
      .iter()
      .filter(|g| g.plugin == plugin && g.items.as_ref().is_none_or(|i| i.iter().any(|x| x == item)) && g.windows.as_ref().is_none_or(|w| w.contains(&window)))
      .collect();
    if matching.is_empty() {
      return false;
    }
    let matches = |e: &Entry, deny: bool| e.iter().all(|(field, pattern)| field == "url" && url_match(pattern, url, deny));
    if matching.iter().any(|g| g.deny.iter().any(|e| matches(e, true))) {
      return false;
    }
    matching.iter().any(|g| g.allow.is_none()) || matching.iter().flat_map(|g| g.allow.iter().flatten()).any(|e| matches(e, false))
  }
}

fn wildcard(pattern: &str, text: &str, star: fn(char) -> bool) -> bool {
  let text: Vec<char> = text.chars().collect();
  let mut done = vec![false; text.len() + 1];
  done[0] = true;
  for c in pattern.chars() {
    let mut next = vec![false; text.len() + 1];
    for j in 0..=text.len() {
      next[j] = match c {
        '*' => done[j] || (j > 0 && next[j - 1] && star(text[j - 1])),
        '?' => j > 0 && done[j - 1],
        _ => j > 0 && done[j - 1] && text[j - 1] == c,
      };
    }
    done = next;
  }
  done[text.len()]
}

struct UrlParts {
  scheme: String,
  host: Option<String>,
  port: String,
  rest: String,
}

/// In a pattern `?` is a wildcard, so only "/" ends the authority.
fn url_parts(text: &str, pattern: bool) -> Option<UrlParts> {
  let colon = text.find(':').filter(|&c| c > 0)?;
  let scheme = text[..colon].to_lowercase();
  let mut rest = &text[colon + 1..];
  if !pattern {
    if let Some(end) = rest.find(['?', '#']) {
      rest = &rest[..end];
    }
  }
  let Some(after) = rest.strip_prefix("//") else {
    return Some(UrlParts { scheme, host: None, port: String::new(), rest: rest.to_string() });
  };
  let (authority, path) = after.find('/').map_or((after, ""), |end| (&after[..end], &after[end..]));
  let authority = authority.rfind('@').map_or(authority, |at| &authority[at + 1..]);
  let bracket = if authority.starts_with('[') { authority.find(']').map_or(0, |end| end + 1) } else { 0 };
  let (host, port) = authority[bracket..].find(':').map_or((authority, ""), |at| (&authority[..bracket + at], &authority[bracket + at + 1..]));
  Some(UrlParts { scheme, host: Some(host.to_lowercase()), port: port.to_string(), rest: path.to_string() })
}

fn default_port(scheme: &str) -> &'static str {
  match scheme {
    "http" | "ws" => "80",
    "https" | "wss" => "443",
    _ => "",
  }
}

/// A pattern without a port is the default port in an allow entry and every port in a deny entry.
pub fn url_match(pattern: &str, url: &str, deny: bool) -> bool {
  if !pattern.is_empty() && pattern.chars().all(|c| c == '*') {
    return true;
  }
  let (Some(p), Some(v)) = (url_parts(pattern, true), url_parts(url, false)) else { return false };
  if p.host.is_some() != v.host.is_some() || !wildcard(&p.scheme, &v.scheme, |c| c.is_ascii_lowercase() || c.is_ascii_digit() || "+.-".contains(c)) {
    return false;
  }
  if let (Some(pattern_host), Some(host)) = (&p.host, &v.host) {
    if !wildcard(pattern_host, host, |_| true) {
      return false;
    }
    let default = default_port(&v.scheme);
    let port = if v.port.is_empty() { default } else { v.port.as_str() };
    let port_ok = if p.port.is_empty() { deny || port == default } else { p.port == "*" || p.port == port };
    if !port_ok {
      return false;
    }
    if p.rest.is_empty() {
      return true;
    }
  }
  wildcard(&p.rest, &v.rest, |_| true)
}
