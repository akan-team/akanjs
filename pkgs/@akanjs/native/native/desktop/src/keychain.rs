//! Generic passwords in the login keychain, created by the app itself (secure-storage's data key
//! on macOS). SecItem* from Security.framework are declared here and called with Foundation
//! dictionaries, which are toll-free bridged to CFDictionary (plugins.md Q-P6 (b1): no binding crate).
//!   keychain.get    {service, account}          → {"value": string | null}
//!   keychain.set    {service, account, value}   → null
//!   keychain.delete {service, account}          → null
//!
//! Why in-process: an item added by /usr/bin/security trusts that tool (partition "apple-tool:"),
//! so any process of the user can read it through the tool without a prompt. An item the app adds
//! trusts the app. Measured on macOS 26 with `akan-native signing setup`'s self-signed identity: the ACL
//! holds the stable requirement `identifier "<id>" and certificate leaf = H"…"`, but the partition
//! list holds `cdhash:<creating build>` (apps without a Team ID get cdhash partitions), so the next
//! build is asked "wants to use your confidential information". Only Team ID signatures (partition
//! `teamid:…`, CLI-9) make this silent across builds; secure-storage uses these ops only then.
//! The calls run on a thread: a keychain prompt blocks until the user answers.

use std::ffi::c_void;

use objc2::{rc::Retained, runtime::AnyObject, Message};
use objc2_foundation::{NSData, NSDictionary, NSNumber, NSString};

use crate::json;

#[allow(non_upper_case_globals)]
#[link(name = "Security", kind = "framework")]
extern "C" {
  static kSecClass: *const NSString;
  static kSecClassGenericPassword: *const NSString;
  static kSecAttrService: *const NSString;
  static kSecAttrAccount: *const NSString;
  static kSecValueData: *const NSString;
  static kSecReturnData: *const NSString;
  static kSecMatchLimit: *const NSString;
  static kSecMatchLimitOne: *const NSString;
  fn SecItemAdd(attributes: *const c_void, result: *mut *const c_void) -> i32;
  fn SecItemCopyMatching(query: *const c_void, result: *mut *const c_void) -> i32;
  fn SecItemUpdate(query: *const c_void, attributes: *const c_void) -> i32;
  fn SecItemDelete(query: *const c_void) -> i32;
}

const ERR_SEC_ITEM_NOT_FOUND: i32 = -25300;
const ERR_SEC_DUPLICATE_ITEM: i32 = -25299;

/// Security.framework's CFString constants as &NSString (toll-free bridged, alive for the process).
fn key(k: *const NSString) -> &'static NSString {
  unsafe { &*k }
}

fn dictionary(pairs: &[(&'static NSString, &AnyObject)]) -> Retained<NSDictionary<NSString, AnyObject>> {
  let keys: Vec<&NSString> = pairs.iter().map(|(k, _)| *k).collect();
  let values: Vec<&AnyObject> = pairs.iter().map(|(_, v)| *v).collect();
  NSDictionary::from_slices(&keys, &values)
}

fn describe(status: i32) -> String {
  match status {
    -25308 => "the keychain refused without asking (errSecInteractionNotAllowed)".into(),
    -128 => "the user denied keychain access".into(),
    -25293 => "keychain authorization failed".into(),
    other => format!("keychain error {other}"),
  }
}

fn base(service: &NSString, account: &NSString) -> Vec<(&'static NSString, Retained<AnyObject>)> {
  unsafe {
    vec![
      (key(kSecClass), Retained::cast_unchecked::<AnyObject>(key(kSecClassGenericPassword).retain())),
      (key(kSecAttrService), Retained::cast_unchecked::<AnyObject>(service.retain())),
      (key(kSecAttrAccount), Retained::cast_unchecked::<AnyObject>(account.retain())),
    ]
  }
}

fn as_pairs<'a>(owned: &'a [(&'static NSString, Retained<AnyObject>)]) -> Vec<(&'static NSString, &'a AnyObject)> {
  owned.iter().map(|(k, v)| (*k, &**v)).collect()
}

pub fn get(service: &str, account: &str) -> Result<Option<String>, String> {
  let (service, account) = (NSString::from_str(service), NSString::from_str(account));
  let mut q = base(&service, &account);
  unsafe {
    q.push((key(kSecReturnData), Retained::cast_unchecked(NSNumber::new_bool(true))));
    q.push((key(kSecMatchLimit), Retained::cast_unchecked(key(kSecMatchLimitOne).retain())));
  }
  let query = dictionary(&as_pairs(&q));
  let mut out: *const c_void = std::ptr::null();
  let status = unsafe { SecItemCopyMatching(Retained::as_ptr(&query).cast(), &mut out) };
  match status {
    0 => {
      // Owned (+1) CFData, i.e. NSData.
      let data = unsafe { Retained::from_raw(out as *mut NSData) }.ok_or("the keychain returned no data")?;
      String::from_utf8(data.to_vec()).map(Some).map_err(|_| "the keychain item is not UTF-8".to_string())
    }
    ERR_SEC_ITEM_NOT_FOUND => Ok(None),
    other => Err(describe(other)),
  }
}

pub fn set(service: &str, account: &str, value: &str) -> Result<(), String> {
  let (service, account) = (NSString::from_str(service), NSString::from_str(account));
  let data = NSData::with_bytes(value.as_bytes());
  let q = base(&service, &account);
  let mut add = base(&service, &account);
  add.push((key(unsafe { kSecValueData }), unsafe { Retained::cast_unchecked(data.clone()) }));
  let status = unsafe { SecItemAdd(Retained::as_ptr(&dictionary(&as_pairs(&add))).cast(), std::ptr::null_mut()) };
  match status {
    0 => Ok(()),
    ERR_SEC_DUPLICATE_ITEM => {
      let update = dictionary(&[(key(unsafe { kSecValueData }), &**unsafe { &Retained::cast_unchecked::<AnyObject>(data) })]);
      match unsafe { SecItemUpdate(Retained::as_ptr(&dictionary(&as_pairs(&q))).cast(), Retained::as_ptr(&update).cast()) } {
        0 => Ok(()),
        other => Err(describe(other)),
      }
    }
    other => Err(describe(other)),
  }
}

pub fn delete(service: &str, account: &str) -> Result<(), String> {
  let (service, account) = (NSString::from_str(service), NSString::from_str(account));
  let q = base(&service, &account);
  match unsafe { SecItemDelete(Retained::as_ptr(&dictionary(&as_pairs(&q))).cast()) } {
    0 | ERR_SEC_ITEM_NOT_FOUND => Ok(()),
    other => Err(describe(other)),
  }
}

fn run(cmd: &json::V) -> Result<String, String> {
  let op = cmd.get("op").and_then(|v| v.as_str()).unwrap_or("");
  let text = |name: &str| cmd.get(name).and_then(|v| v.as_str()).filter(|s| !s.is_empty()).ok_or(format!("{op}: {name} must be a non-empty string"));
  let (service, account) = (text("service")?, text("account")?);
  match op {
    "keychain.get" => get(service, account).map(|v| format!(r#"{{"value":{}}}"#, v.map_or("null".into(), |s| json::quote(&s)))),
    "keychain.set" => set(service, account, cmd.get("value").and_then(|v| v.as_str()).ok_or("keychain.set: value must be a string")?).map(|_| "null".into()),
    "keychain.delete" => delete(service, account).map(|_| "null".into()),
    _ => Err(format!("unknown op {op}")),
  }
}

/// keychain.* ops: answered from a thread through `crate::reply`.
pub fn shell_op(id: u64, json_text: &str) -> bool {
  if !json_text.contains("\"keychain.") {
    return false;
  }
  let Ok(cmd) = json::parse(json_text) else { return false };
  if !cmd.get("op").and_then(|v| v.as_str()).is_some_and(|op| op.starts_with("keychain.")) {
    return false;
  }
  std::thread::spawn(move || crate::reply(id, objc2::rc::autoreleasepool(|_| run(&cmd))));
  true
}
