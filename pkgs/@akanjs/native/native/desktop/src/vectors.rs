//! The shared vectors (packages/core/vectors) against the desktop kernel: routes.rs and
//! navigation.rs. The TypeScript reference runs the same files in bun test.

use crate::contract;
use crate::json::{self, V};
use crate::navigation::{decide_for, Decision};
use crate::routes::{asset_mime, file_mime, file_ref_sandboxed, id_valid, is_host_path, parse_range, route, RangeAnswer, Route};

fn load(text: &str) -> V {
  json::parse(text).expect("vector file")
}

fn arr(v: &V) -> &[V] {
  match v {
    V::Arr(a) => a,
    _ => panic!("not an array"),
  }
}

fn text(v: &V) -> String {
  v.as_str().expect("string").to_string()
}

#[test]
fn routes() {
  let v = load(include_str!("../../../packages/core/vectors/routes.json"));
  let files: Vec<String> = arr(v.get("files").unwrap()).iter().map(text).collect();
  let mut failed = Vec::new();
  for case in arr(v.get("cases").unwrap()) {
    let c = arr(case);
    let (path, all) = (text(&c[0]), text(&c[1]) == "all");
    let got = match route(&path, |rel| all || files.iter().any(|f| f == rel)) {
      Route::Init => ("init", None),
      Route::Ipc => ("ipc", None),
      Route::Hello => ("hello", None),
      Route::File(id) => ("file", Some(id)),
      Route::Asset(p) => ("asset", Some(p)),
      Route::NotFound => ("not-found", None),
    };
    let expected = (text(&c[2]), c[3].as_str().map(str::to_string));
    if (got.0.to_string(), got.1.clone()) != expected {
      failed.push(format!("{path:?}: {got:?}, expected {expected:?}"));
    }
  }
  for case in arr(v.get("hostPaths").unwrap()) {
    let c = arr(case);
    if is_host_path(&text(&c[0])) != c[1].as_bool().unwrap() {
      failed.push(format!("host path {:?}", text(&c[0])));
    }
  }
  assert!(failed.is_empty(), "{failed:#?}");
}

#[test]
fn ranges() {
  let v = load(include_str!("../../../packages/core/vectors/ranges.json"));
  let mut failed = Vec::new();
  for case in arr(v.get("cases").unwrap()) {
    let c = arr(case);
    let header = c[0].as_str();
    let size = c[1].as_f64().unwrap() as u64;
    let expected: Vec<u64> = arr(&c[2]).iter().map(|n| n.as_f64().unwrap() as u64).collect();
    let got = match parse_range(header, size) {
      RangeAnswer::Whole => vec![200],
      RangeAnswer::Part(a, b) => vec![206, a, b],
      RangeAnswer::Unsatisfiable => vec![416],
    };
    if got != expected {
      failed.push(format!("{header:?} of {size}: {got:?}, expected {expected:?}"));
    }
  }
  assert!(failed.is_empty(), "{failed:#?}");
}

#[test]
fn ids_and_mime() {
  let v = load(include_str!("../../../packages/core/vectors/ids.json"));
  let mut failed = Vec::new();
  for case in arr(v.get("cases").unwrap()) {
    let c = arr(case);
    let spec = match text(&c[0]).as_str() {
      "fileRef" => &contract::ID_FILE_REF,
      "bundle" => &contract::ID_BUNDLE,
      "document" => &contract::ID_DOCUMENT,
      _ => &contract::ID_NAME,
    };
    if id_valid(spec, &text(&c[1])) != c[2].as_bool().unwrap() {
      failed.push(format!("{} {:?}", text(&c[0]), text(&c[1])));
    }
  }
  for case in arr(v.get("mime").unwrap().get("cases").unwrap()) {
    let c = arr(case);
    let path = text(&c[0]);
    if asset_mime(&path) != text(&c[1]) || file_mime(&path) != text(&c[2]) {
      failed.push(format!("mime {path:?}: {} / {}", asset_mime(&path), file_mime(&path)));
    }
  }
  assert!(failed.is_empty(), "{failed:#?}");
}

#[test]
fn navigation() {
  let v = load(include_str!("../../../packages/core/vectors/navigation.json"));
  let mut failed = Vec::new();
  for case in arr(v.get("cases").unwrap()) {
    let c = arr(case);
    let url = text(&c[0]);
    let extra: Vec<String> = arr(&c[2]).iter().map(text).collect();
    let expected = match text(&c[3]).as_str() {
      "load" => Decision::Load,
      "open" => Decision::Open,
      _ => Decision::Drop,
    };
    let got = decide_for(&url, c[1].as_bool().unwrap(), "app://localhost", &extra);
    if got != expected {
      failed.push(format!("{url:?} top={:?} extra={extra:?}: {got:?}, expected {expected:?}", c[1].as_bool()));
    }
  }
  for case in arr(v.get("fileRefSandbox").unwrap()) {
    let c = arr(case);
    if file_ref_sandboxed(&text(&c[0])) != c[1].as_bool().unwrap() {
      failed.push(format!("sandbox {:?}", text(&c[0])));
    }
  }
  assert!(failed.is_empty(), "{failed:#?}");
}
