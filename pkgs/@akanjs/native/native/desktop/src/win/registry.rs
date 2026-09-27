//! Registry values for the Windows parts of the shell (autostart's Run key, the camera consent
//! store, the BIOS names), through RegGetValueW / RegSetValueExW (Win32_System_Registry).
//! Errors are Win32 codes; a missing key or value is `Ok(None)`.

use windows::core::{HSTRING, PCWSTR};
use windows::Win32::Foundation::{ERROR_FILE_NOT_FOUND, ERROR_MORE_DATA, ERROR_SUCCESS, WIN32_ERROR};
use windows::Win32::System::Registry::{
  RegCloseKey, RegCreateKeyExW, RegDeleteKeyValueW, RegGetValueW, RegSetValueExW, HKEY, KEY_SET_VALUE, REG_OPTION_NON_VOLATILE, REG_ROUTINE_FLAGS, REG_SZ,
  RRF_RT_REG_BINARY, RRF_RT_REG_DWORD, RRF_RT_REG_SZ,
};

pub use windows::Win32::System::Registry::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};

/// A Win32 error as the code and the system's message, e.g. `5 (Access is denied.)`.
pub fn describe(code: WIN32_ERROR) -> String {
  format!("{} ({})", code.0, windows::core::Error::from(code.to_hresult()).message())
}

/// The raw bytes of a value of one of the `flags` types. RegGetValueW adds the terminating NUL
/// of strings that were stored without one.
fn read(root: HKEY, key: &str, value: &str, flags: REG_ROUTINE_FLAGS) -> Result<Option<Vec<u8>>, WIN32_ERROR> {
  let (key, value) = (HSTRING::from(key), HSTRING::from(value));
  let mut size = 0u32;
  let mut status = unsafe { RegGetValueW(root, &key, &value, flags, None, None, Some(&mut size)) };
  // The value may grow between the two calls: ask again with the new size.
  for _ in 0..4 {
    if status == ERROR_FILE_NOT_FOUND {
      return Ok(None);
    }
    if status != ERROR_SUCCESS && status != ERROR_MORE_DATA {
      return Err(status);
    }
    let mut data = vec![0u8; size as usize];
    status = unsafe { RegGetValueW(root, &key, &value, flags, None, Some(data.as_mut_ptr().cast()), Some(&mut size)) };
    if status == ERROR_SUCCESS {
      data.truncate(size as usize);
      return Ok(Some(data));
    }
  }
  Err(status)
}

/// A REG_SZ value (REG_EXPAND_SZ is expanded by RegGetValueW's default).
pub fn read_string(root: HKEY, key: &str, value: &str) -> Result<Option<String>, WIN32_ERROR> {
  Ok(read(root, key, value, RRF_RT_REG_SZ)?.map(|bytes| {
    let wide: Vec<u16> = bytes.chunks_exact(2).map(|c| u16::from_le_bytes([c[0], c[1]])).collect();
    let end = wide.iter().position(|&c| c == 0).unwrap_or(wide.len());
    String::from_utf16_lossy(&wide[..end])
  }))
}

pub fn read_binary(root: HKEY, key: &str, value: &str) -> Result<Option<Vec<u8>>, WIN32_ERROR> {
  read(root, key, value, RRF_RT_REG_BINARY)
}

#[allow(dead_code)] // kept next to its siblings; the Run key and the consent store are strings
pub fn read_dword(root: HKEY, key: &str, value: &str) -> Result<Option<u32>, WIN32_ERROR> {
  Ok(read(root, key, value, RRF_RT_REG_DWORD)?.and_then(|b| b.get(..4).map(|b| u32::from_le_bytes([b[0], b[1], b[2], b[3]]))))
}

/// Writes a REG_SZ value, creating the key if needed.
pub fn write_string(root: HKEY, key: &str, value: &str, data: &str) -> Result<(), WIN32_ERROR> {
  let mut hkey = HKEY::default();
  let status = unsafe { RegCreateKeyExW(root, &HSTRING::from(key), None, PCWSTR::null(), REG_OPTION_NON_VOLATILE, KEY_SET_VALUE, None, &mut hkey, None) };
  if status != ERROR_SUCCESS {
    return Err(status);
  }
  // UTF-16 with the terminating NUL, as bytes (the size RegSetValueExW wants includes it).
  let bytes: Vec<u8> = data.encode_utf16().chain(std::iter::once(0)).flat_map(u16::to_le_bytes).collect();
  let status = unsafe { RegSetValueExW(hkey, &HSTRING::from(value), None, REG_SZ, Some(&bytes)) };
  unsafe {
    let _ = RegCloseKey(hkey);
  }
  if status == ERROR_SUCCESS {
    Ok(())
  } else {
    Err(status)
  }
}

/// Deletes a value; a missing key or value is fine.
pub fn delete_value(root: HKEY, key: &str, value: &str) -> Result<(), WIN32_ERROR> {
  match unsafe { RegDeleteKeyValueW(root, &HSTRING::from(key), &HSTRING::from(value)) } {
    ERROR_SUCCESS | ERROR_FILE_NOT_FOUND => Ok(()),
    status => Err(status),
  }
}
