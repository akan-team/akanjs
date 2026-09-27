//! Secrets on Windows: generic credentials in the Credential Manager (CredWriteW, CredReadW,
//! CredDeleteW; Win32_Security_Credentials), with the same ops as keychain.rs on macOS
//! (secure-storage keeps its data key there):
//!   keychain.get    {service, account}                → {"value": string | null}
//!   keychain.set    {service, account, value, label?} → null
//!   keychain.delete {service, account}                → null
//! The credential's target name is "<service>/<account>" (what Credential Manager and
//! `cmdkey /list` show), its user name the account and its comment the label. It is kept for this
//! user on this machine (CRED_PERSIST_LOCAL_MACHINE: not copied with a roaming profile). The value
//! is stored as UTF-16, as cmdkey and the system's credential dialogs store passwords, so at most
//! 1280 UTF-16 units (CRED_MAX_CREDENTIAL_BLOB_SIZE is 2560 bytes). The calls do not prompt:
//! answered at once.

use windows::core::{HSTRING, PWSTR};
use windows::Win32::Foundation::ERROR_NOT_FOUND;
use windows::Win32::Security::Credentials::{CredDeleteW, CredFree, CredReadW, CredWriteW, CREDENTIALW, CRED_MAX_CREDENTIAL_BLOB_SIZE, CRED_PERSIST_LOCAL_MACHINE, CRED_TYPE_GENERIC};

use crate::json;

/// CRED_MAX_STRING_LENGTH: the longest comment.
const MAX_COMMENT: usize = 256;

fn target(service: &str, account: &str) -> String {
  format!("{service}/{account}")
}

/// NUL-terminated UTF-16 for the PWSTR fields of CREDENTIALW.
fn wide(s: &str) -> Vec<u16> {
  s.encode_utf16().chain(std::iter::once(0)).collect()
}

fn not_found(e: &windows::core::Error) -> bool {
  e.code() == ERROR_NOT_FOUND.to_hresult()
}

pub fn get(service: &str, account: &str) -> Result<Option<String>, String> {
  let mut cred: *mut CREDENTIALW = std::ptr::null_mut();
  match unsafe { CredReadW(&HSTRING::from(target(service, account)), CRED_TYPE_GENERIC, None, &mut cred) } {
    Ok(()) => {}
    Err(e) if not_found(&e) => return Ok(None),
    Err(e) => return Err(format!("INTERNAL: reading the credential {} failed: {}", target(service, account), e.message())),
  }
  // Safety: CredReadW succeeded, so `cred` is a CREDENTIALW block that only CredFree releases.
  let units: Vec<u16> = unsafe {
    let c = &*cred;
    let bytes = if c.CredentialBlobSize == 0 || c.CredentialBlob.is_null() { &[][..] } else { std::slice::from_raw_parts(c.CredentialBlob, c.CredentialBlobSize as usize) };
    let units = bytes.chunks_exact(2).map(|b| u16::from_le_bytes([b[0], b[1]])).collect();
    CredFree(cred as *const _);
    units
  };
  String::from_utf16(&units).map(Some).map_err(|_| format!("INTERNAL: the credential {} is not text", target(service, account)))
}

pub fn set(service: &str, account: &str, value: &str, label: Option<&str>) -> Result<(), String> {
  let mut blob: Vec<u8> = value.encode_utf16().flat_map(u16::to_le_bytes).collect();
  if blob.len() > CRED_MAX_CREDENTIAL_BLOB_SIZE as usize {
    return Err(format!("keychain.set: value is too long for the Credential Manager ({} bytes as UTF-16, at most {CRED_MAX_CREDENTIAL_BLOB_SIZE})", blob.len()));
  }
  let mut name = wide(&target(service, account));
  let mut user = wide(account);
  let mut comment = label.map(|l| wide(&l.chars().take(MAX_COMMENT - 1).collect::<String>()));
  let cred = CREDENTIALW {
    Type: CRED_TYPE_GENERIC,
    TargetName: PWSTR(name.as_mut_ptr()),
    Comment: comment.as_mut().map_or(PWSTR::null(), |c| PWSTR(c.as_mut_ptr())),
    CredentialBlobSize: blob.len() as u32,
    CredentialBlob: blob.as_mut_ptr(),
    Persist: CRED_PERSIST_LOCAL_MACHINE,
    UserName: PWSTR(user.as_mut_ptr()),
    ..Default::default()
  };
  // Replaces a credential with the same target name and type.
  unsafe { CredWriteW(&cred, 0) }.map_err(|e| format!("INTERNAL: storing the credential {} failed: {}", target(service, account), e.message()))
}

pub fn delete(service: &str, account: &str) -> Result<(), String> {
  match unsafe { CredDeleteW(&HSTRING::from(target(service, account)), CRED_TYPE_GENERIC, None) } {
    Ok(()) => Ok(()),
    Err(e) if not_found(&e) => Ok(()),
    Err(e) => Err(format!("INTERNAL: deleting the credential {} failed: {}", target(service, account), e.message())),
  }
}

/// keychain.* ops. None: another op.
pub fn shell_op(op: &str, cmd: &json::V) -> Option<Result<String, String>> {
  if !op.starts_with("keychain.") {
    return None;
  }
  let text = |name: &str| cmd.get(name).and_then(|v| v.as_str()).filter(|s| !s.is_empty()).ok_or(format!("{op}: {name} must be a non-empty string"));
  let run = || -> Result<String, String> {
    let (service, account) = (text("service")?, text("account")?);
    match op {
      "keychain.get" => get(service, account).map(|v| format!(r#"{{"value":{}}}"#, v.map_or("null".into(), |s| json::quote(&s)))),
      "keychain.set" => {
        let value = cmd.get("value").and_then(|v| v.as_str()).ok_or("keychain.set: value must be a string")?;
        set(service, account, value, cmd.get("label").and_then(|v| v.as_str())).map(|_| "null".into())
      }
      "keychain.delete" => delete(service, account).map(|_| "null".into()),
      _ => Err(format!("unknown op {op}")),
    }
  };
  Some(run())
}
