//! `akan-native dev --hmr` (dev builds): app:// page requests are fetched from the dev gateway on the
//! loopback interface (packages/cli/src/lib/hmr.ts) instead of Resources/app, keeping the page on
//! app://localhost. A minimal HTTP/1.1 client over std::net, since there is no HTTP client crate
//! in the tree and none is added: one request per connection (`Connection: close`), response
//! bodies delimited by Content-Length, chunked transfer coding, or the end of the connection.

use std::io::{Read, Write};
use std::net::{TcpStream, ToSocketAddrs};
use std::time::Duration;

#[derive(Debug, PartialEq, Eq)]
pub struct Reply {
  pub status: u16,
  pub headers: Vec<(String, String)>,
  pub body: Vec<u8>,
}

/// "http://127.0.0.1:4173" → "127.0.0.1:4173". Only plain http to a loopback host with a port:
/// the gateway always runs on the developer's machine.
pub fn authority(base: &str) -> Option<&str> {
  let rest = base.strip_prefix("http://")?.trim_end_matches('/');
  let (host, port) = rest.rsplit_once(':')?;
  let loopback = matches!(host, "127.0.0.1" | "localhost" | "[::1]");
  (loopback && port.parse::<u16>().is_ok_and(|p| p > 0)).then_some(rest)
}

const MAX_HEAD: usize = 64 * 1024;

pub fn fetch(authority: &str, method: &str, target: &str, headers: &[(String, String)], body: &[u8]) -> Result<Reply, String> {
  let addr = authority.to_socket_addrs().map_err(|e| format!("{authority}: {e}"))?.next().ok_or_else(|| format!("{authority}: no address"))?;
  let mut stream = TcpStream::connect_timeout(&addr, Duration::from_secs(2)).map_err(|e| format!("{authority}: {e}"))?;
  // Bun bundles on the first request for a page, which can take a few seconds.
  let _ = stream.set_read_timeout(Some(Duration::from_secs(60)));
  let _ = stream.set_nodelay(true);
  stream.write_all(&request_head(authority, method, target, headers, body.len())).map_err(|e| e.to_string())?;
  stream.write_all(body).map_err(|e| e.to_string())?;
  read_response(&mut stream, method == "HEAD")
}

fn request_head(authority: &str, method: &str, target: &str, headers: &[(String, String)], body_len: usize) -> Vec<u8> {
  let mut head = format!("{method} {target} HTTP/1.1\r\nHost: {authority}\r\nConnection: close\r\nAccept-Encoding: identity\r\n");
  for (name, value) in headers {
    // Never let a value end the header line.
    if !name.is_empty() && !name.contains([':', '\r', '\n']) && !value.contains(['\r', '\n']) {
      head.push_str(&format!("{name}: {value}\r\n"));
    }
  }
  if body_len > 0 || matches!(method, "POST" | "PUT" | "PATCH") {
    head.push_str(&format!("Content-Length: {body_len}\r\n"));
  }
  head.push_str("\r\n");
  head.into_bytes()
}

fn find(haystack: &[u8], needle: &[u8]) -> Option<usize> {
  haystack.windows(needle.len()).position(|w| w == needle)
}

/// Reads more bytes into `buf`; the connection ending here is an error (a truncated response).
fn fill(r: &mut impl Read, buf: &mut Vec<u8>) -> Result<(), String> {
  let mut chunk = [0u8; 16 * 1024];
  let n = r.read(&mut chunk).map_err(|e| e.to_string())?;
  if n == 0 {
    return Err("connection closed before the response was complete".into());
  }
  buf.extend_from_slice(&chunk[..n]);
  Ok(())
}

pub fn read_response(r: &mut impl Read, head_only: bool) -> Result<Reply, String> {
  let mut buf = Vec::new();
  let end = loop {
    if let Some(i) = find(&buf, b"\r\n\r\n") {
      break i;
    }
    if buf.len() > MAX_HEAD {
      return Err("response headers too large".into());
    }
    fill(r, &mut buf)?;
  };
  let head = std::str::from_utf8(&buf[..end]).map_err(|_| "response headers are not UTF-8".to_string())?;
  let mut lines = head.split("\r\n");
  let status_line = lines.next().unwrap_or_default();
  let status = status_line
    .strip_prefix("HTTP/1.")
    .and_then(|s| s.split(' ').nth(1))
    .and_then(|s| s.parse::<u16>().ok())
    .filter(|s| (100..600).contains(s))
    .ok_or_else(|| format!("bad status line {status_line:?}"))?;
  let headers: Vec<(String, String)> = lines.filter_map(|l| l.split_once(':')).map(|(k, v)| (k.trim().to_string(), v.trim().to_string())).collect();
  let header = |name: &str| headers.iter().find(|(k, _)| k.eq_ignore_ascii_case(name)).map(|(_, v)| v.as_str());
  let rest = buf[end + 4..].to_vec();

  let body = if head_only || status == 204 || status == 304 || status < 200 {
    Vec::new()
  } else if header("transfer-encoding").is_some_and(|v| v.to_ascii_lowercase().contains("chunked")) {
    dechunk(r, rest)?
  } else if let Some(len) = header("content-length") {
    let len: usize = len.parse().map_err(|_| format!("bad content-length {len:?}"))?;
    let mut body = rest;
    while body.len() < len {
      fill(r, &mut body)?;
    }
    body.truncate(len);
    body
  } else {
    let mut body = rest;
    r.read_to_end(&mut body).map_err(|e| e.to_string())?;
    body
  };
  Ok(Reply { status, headers, body })
}

/// Chunked transfer coding (RFC 9112 §7.1); chunk extensions and trailers are ignored.
fn dechunk(r: &mut impl Read, mut buf: Vec<u8>) -> Result<Vec<u8>, String> {
  let mut out = Vec::new();
  let mut pos = 0;
  loop {
    let line_end = loop {
      if let Some(i) = find(&buf[pos..], b"\r\n") {
        break pos + i;
      }
      fill(r, &mut buf)?;
    };
    let line = std::str::from_utf8(&buf[pos..line_end]).map_err(|_| "bad chunk size".to_string())?;
    let size_text = line.split(';').next().unwrap_or_default().trim();
    let size = usize::from_str_radix(size_text, 16).map_err(|_| format!("bad chunk size {size_text:?}"))?;
    pos = line_end + 2;
    if size == 0 {
      return Ok(out);
    }
    while buf.len() < pos + size + 2 {
      fill(r, &mut buf)?;
    }
    out.extend_from_slice(&buf[pos..pos + size]);
    pos += size + 2;
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::net::TcpListener;

  /// Serves `response` once (in pieces, to exercise the incremental reads) and returns the request.
  fn serve_once(response: &'static [u8]) -> (String, std::thread::JoinHandle<String>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let authority = listener.local_addr().unwrap().to_string();
    let handle = std::thread::spawn(move || {
      let (mut socket, _) = listener.accept().unwrap();
      let mut request = Vec::new();
      // The whole request, body included: closing with unread bytes would reset the connection.
      let complete = |r: &[u8]| {
        find(r, b"\r\n\r\n").is_some_and(|end| {
          let head = String::from_utf8_lossy(&r[..end]).to_ascii_lowercase();
          let len = head.split("\r\n").find_map(|l| l.strip_prefix("content-length: ")).map_or(0, |v| v.parse().unwrap());
          r.len() >= end + 4 + len
        })
      };
      while !complete(&request) {
        let mut chunk = [0u8; 1024];
        let n = socket.read(&mut chunk).unwrap();
        request.extend_from_slice(&chunk[..n]);
      }
      // The client may close once it has what it needs (a chunked body ends before its trailers);
      // Windows then fails the next write (WSAECONNABORTED), where macOS and Linux still buffer it.
      for piece in response.chunks(7) {
        if socket.write_all(piece).and_then(|()| socket.flush()).is_err() {
          break;
        }
      }
      String::from_utf8(request).unwrap()
    });
    (authority, handle)
  }

  #[test]
  fn authorities() {
    assert_eq!(authority("http://127.0.0.1:4173"), Some("127.0.0.1:4173"));
    assert_eq!(authority("http://localhost:80/"), Some("localhost:80"));
    assert_eq!(authority("https://127.0.0.1:4173"), None);
    assert_eq!(authority("http://example.com:80"), None);
    assert_eq!(authority("http://127.0.0.1"), None);
    assert_eq!(authority("http://127.0.0.1:0"), None);
    assert_eq!(authority("http://127.0.0.1:1/x"), None);
  }

  #[test]
  fn content_length() {
    let (authority, server) = serve_once(b"HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: 5\r\n\r\nhello");
    let headers = vec![("Range".to_string(), "bytes=0-4".to_string()), ("Bad".to_string(), "a\r\nInjected: 1".to_string())];
    let reply = fetch(&authority, "GET", "/a/b?c=1", &headers, b"").unwrap();
    assert_eq!(reply.status, 200);
    assert_eq!(reply.body, b"hello");
    assert!(reply.headers.contains(&("Content-Type".into(), "text/html".into())));
    let request = server.join().unwrap();
    assert!(request.starts_with("GET /a/b?c=1 HTTP/1.1\r\n"), "{request}");
    assert!(request.contains("\r\nConnection: close\r\n") && request.contains("\r\nRange: bytes=0-4\r\n"));
    assert!(!request.contains("Injected"));
  }

  #[test]
  fn chunked() {
    let (authority, server) = serve_once(b"HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n5;ext=1\r\nhello\r\n7\r\n, world\r\n0\r\nTrailer: x\r\n\r\n");
    let reply = fetch(&authority, "POST", "/_bun/report_error", &[], b"body").unwrap();
    assert_eq!(reply.body, b"hello, world");
    let request = server.join().unwrap();
    assert!(request.contains("\r\nContent-Length: 4\r\n"));
  }

  #[test]
  fn until_close_and_empty_bodies() {
    let (authority, server) = serve_once(b"HTTP/1.1 404 Not Found\r\n\r\nnot found");
    let reply = fetch(&authority, "GET", "/x.png", &[], b"").unwrap();
    assert_eq!((reply.status, reply.body.as_slice()), (404, &b"not found"[..]));
    server.join().unwrap();
    let (authority, server) = serve_once(b"HTTP/1.1 200 OK\r\nContent-Length: 5\r\n\r\n");
    assert_eq!(fetch(&authority, "HEAD", "/", &[], b"").unwrap().body, b"");
    server.join().unwrap();
  }

  #[test]
  fn broken_responses() {
    let (authority, server) = serve_once(b"HTTP/1.1 200 OK\r\nContent-Length: 10\r\n\r\nshort");
    assert!(fetch(&authority, "GET", "/", &[], b"").is_err());
    server.join().unwrap();
    let (authority, server) = serve_once(b"garbage\r\n\r\n");
    assert!(fetch(&authority, "GET", "/", &[], b"").is_err());
    server.join().unwrap();
    // Nothing listens there any more: an error, which makes the host serve its bundled files.
    let closed = TcpListener::bind("127.0.0.1:0").unwrap().local_addr().unwrap().to_string();
    assert!(fetch(&closed, "GET", "/", &[], b"").is_err());
  }
}
