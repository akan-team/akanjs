//! Host decisions shared with every akan-native host (docs/architecture.md §5): asset routes, path
//! decoding, ids, MIME types and Range requests. The reference is packages/core/src/kernel.ts;
//! vectors.rs runs the shared vectors (packages/core/vectors) against these functions.

use crate::contract::{self, IdSpec};

#[derive(Debug, PartialEq, Eq)]
pub enum Route {
  Init,
  Ipc,
  /// Android's port doorbell; the desktop answers 404.
  Hello,
  File(String),
  /// Relative path inside the app folder.
  Asset(String),
  NotFound,
}

/// Strict percent-decoding: "%" and two hex digits, and the result must be UTF-8; otherwise None.
pub fn decode(s: &str) -> Option<String> {
  let b = s.as_bytes();
  let mut out = Vec::with_capacity(b.len());
  let mut i = 0;
  while i < b.len() {
    if b[i] == b'%' {
      let hex = s.get(i + 1..i + 3).filter(|h| h.bytes().all(|c| c.is_ascii_hexdigit()))?; // not "%+1"
      out.push(u8::from_str_radix(hex, 16).ok()?);
      i += 3;
    } else {
      out.push(b[i]);
      i += 1;
    }
  }
  String::from_utf8(out).ok()
}

/// Whether `s` follows an id grammar: its characters and length, and an optional ".ext" after the first dot.
pub fn id_valid(spec: &IdSpec, s: &str) -> bool {
  let run = |s: &str, chars: &str, min: usize, max: usize| (min..=max).contains(&s.len()) && s.chars().all(|c| chars.contains(c));
  if spec.ext_max > 0 {
    return match s.split_once('.') {
      None => run(s, spec.chars, spec.min, spec.max),
      Some((stem, ext)) => run(stem, spec.chars, spec.min, spec.max) && run(ext, spec.ext_chars, 1, spec.ext_max),
    };
  }
  let mut chars = s.chars();
  let Some(first) = chars.next() else { return false };
  let first_set = if spec.first.is_empty() { spec.chars } else { spec.first };
  (spec.min..=spec.max).contains(&s.len()) && first_set.contains(first) && !spec.not_first.contains(first) && chars.all(|c| spec.chars.contains(c))
}

pub fn route(pathname: &str, exists: impl Fn(&str) -> bool) -> Route {
  let Some(decoded) = decode(pathname) else { return Route::NotFound };
  let segments: Vec<&str> = decoded.split('/').filter(|s| !s.is_empty()).collect();
  if segments.iter().any(|s| *s == ".." || *s == "." || s.contains('\\') || s.contains('\0')) {
    return Route::NotFound;
  }
  if segments.first() == Some(&contract::ROUTE_ROOT) {
    return match segments.as_slice() {
      [_, s] if *s == contract::ROUTE_INIT => Route::Init,
      [_, s] if *s == contract::ROUTE_IPC => Route::Ipc,
      [_, s] if *s == contract::ROUTE_HELLO => Route::Hello,
      [_, s, id] if *s == contract::ROUTE_FILE && id_valid(&contract::ID_FILE_REF, id) => Route::File((*id).to_string()),
      _ => Route::NotFound,
    };
  }
  let relative = segments.join("/");
  if relative.is_empty() || relative == "index.html" {
    return Route::Asset("index.html".into());
  }
  // ":" never reaches the filesystem: "C:" would make the joined path absolute on Windows, "a:b"
  // names an alternate data stream (kernel.ts). The path can still be an SPA route.
  if !relative.contains(':') && exists(&relative) {
    return Route::Asset(relative);
  }
  if segments.last().is_some_and(|s| s.contains('.')) {
    Route::NotFound
  } else {
    Route::Asset("index.html".into())
  }
}

/// Paths the host answers itself even when its pages come from a dev server (akan-native dev --hmr,
/// devproxy.rs): /__akan_native/*, and paths that do not decode (route() refuses them).
pub fn is_host_path(pathname: &str) -> bool {
  let Some(decoded) = decode(pathname) else { return true };
  decoded.split('/').find(|s| !s.is_empty()) == Some(contract::ROUTE_ROOT)
}

/// The MIME type for a file name (FileRefs): application/octet-stream when unknown.
pub fn file_mime(path: &str) -> &'static str {
  let base = path.rsplit('/').next().unwrap_or(path);
  let ext = match base.rfind('.') {
    Some(dot) if dot > 0 => base[dot + 1..].to_ascii_lowercase(),
    _ => return "application/octet-stream", // no extension, or a dot file such as .env
  };
  contract::MIME.iter().find(|(e, _)| *e == ext).map_or("application/octet-stream", |(_, m)| m)
}

/// The Content-Type an asset is served with: text types carry charset=utf-8.
pub fn asset_mime(path: &str) -> String {
  let mime = file_mime(path);
  if mime.starts_with("text/") || contract::MIME_UTF8.contains(&mime) {
    format!("{mime}; charset=utf-8")
  } else {
    mime.to_string()
  }
}

/// kernel.ts fileRefSandboxed: every FileRef but images other than SVG, audio, video, fonts and PDF
/// is served with `Content-Security-Policy: sandbox` (an opaque origin: no bridge, no page). macOS
/// WebKit draws nothing for a sandboxed PDF.
pub fn file_ref_sandboxed(mime: &str) -> bool {
  let kind = mime.split(';').next().unwrap_or("").trim().to_ascii_lowercase();
  kind == "image/svg+xml" || !(["image/", "audio/", "video/", "font/"].iter().any(|p| kind.starts_with(p)) || kind == "application/pdf")
}

#[derive(Debug, PartialEq, Eq)]
pub enum RangeAnswer {
  Whole,
  /// First and last byte, inclusive.
  Part(u64, u64),
  Unsatisfiable,
}

/// A Range header (IN-5, RFC 9110 §14) for a file of `size` bytes. One "bytes=" range is supported:
/// a header that is not one (another unit, several ranges, bad syntax, last before first) is ignored
/// and the whole file is sent. A valid range the file cannot satisfy is 416. A response carries at
/// most MAX_RANGE_BYTES, from the range's start.
pub fn parse_range(header: Option<&str>, size: u64) -> RangeAnswer {
  let number = |s: &str| (s.len() <= 18 && s.bytes().all(|c| c.is_ascii_digit())).then(|| if s.is_empty() { None } else { s.parse::<u64>().ok() });
  let Some((a, b)) = header.and_then(|h| h.strip_prefix("bytes=")).and_then(|spec| spec.split_once('-')) else { return RangeAnswer::Whole };
  let (Some(a), Some(b)) = (number(a), number(b)) else { return RangeAnswer::Whole };
  let (start, end) = match (a, b) {
    (None, None) => return RangeAnswer::Whole,
    (None, Some(suffix)) => {
      if suffix == 0 || size == 0 {
        return RangeAnswer::Unsatisfiable;
      }
      (size.saturating_sub(suffix), size - 1)
    }
    (Some(start), last) => {
      if last.is_some_and(|last| last < start) {
        return RangeAnswer::Whole;
      }
      if start >= size {
        return RangeAnswer::Unsatisfiable;
      }
      (start, last.unwrap_or(u64::MAX).min(size - 1))
    }
  };
  RangeAnswer::Part(start, end.min(start + contract::MAX_RANGE_BYTES as u64 - 1))
}
