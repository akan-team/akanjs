//! The system output volume on Windows (volume plugin), with the ops and JSON of volume.rs: the default
//! render endpoint's IAudioEndpointVolume, which is what the taskbar's volume slider moves.
//!
//! - volume.watch is not an op here: the plugin host polls volume.get. Hearing changes would take an
//!   IAudioEndpointVolumeCallback per endpoint and an IMMNotificationClient for a new default endpoint,
//!   two COM objects kept alive for one event.
//! - Every endpoint has a software volume, so it is always settable.

use windows::Win32::Media::Audio::Endpoints::IAudioEndpointVolume;
use windows::Win32::Media::Audio::{eConsole, eRender, IMMDeviceEnumerator, MMDeviceEnumerator};
use windows::Win32::System::Com::{CoCreateInstance, CLSCTX_ALL, CLSCTX_INPROC_SERVER};

use crate::json;

fn endpoint() -> Result<IAudioEndpointVolume, String> {
  // COM is initialized on this thread (tao's OleInitialize, wry's CoInitializeEx).
  unsafe {
    let devices: IMMDeviceEnumerator =
      CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_INPROC_SERVER).map_err(|e| format!("INTERNAL: cannot list the audio devices: {e}"))?;
    let device = devices.GetDefaultAudioEndpoint(eRender, eConsole).map_err(|_| "NOT_FOUND: there is no audio output".to_string())?;
    device.Activate::<IAudioEndpointVolume>(CLSCTX_ALL, None).map_err(|e| format!("UNSUPPORTED: the audio output has no volume control: {e}"))
  }
}

pub fn state_json(level: f32, muted: bool) -> String {
  format!(r#"{{"level":{},"muted":{},"settable":true}}"#, (f64::from(level) * 1000.0).round() / 1000.0, muted)
}

fn state(volume: &IAudioEndpointVolume) -> Result<String, String> {
  unsafe {
    let level = volume.GetMasterVolumeLevelScalar().map_err(|e| format!("INTERNAL: cannot read the volume: {e}"))?;
    let muted = volume.GetMute().map_err(|e| format!("INTERNAL: cannot read the mute: {e}"))?.as_bool();
    Ok(state_json(level, muted))
  }
}

fn set(cmd: &json::V) -> Result<String, String> {
  let level = cmd.get("level").and_then(|v| v.as_f64()).filter(|v| (0.0..=1.0).contains(v)).ok_or("level must be a number from 0 to 1")?;
  let volume = endpoint()?;
  unsafe { volume.SetMasterVolumeLevelScalar(level as f32, std::ptr::null()) }.map_err(|e| format!("INTERNAL: cannot set the volume: {e}"))?;
  state(&volume)
}

fn mute(cmd: &json::V) -> Result<String, String> {
  let muted = cmd.get("muted").and_then(|v| v.as_bool()).ok_or("muted must be a boolean")?;
  let volume = endpoint()?;
  unsafe { volume.SetMute(muted, std::ptr::null()) }.map_err(|e| format!("INTERNAL: cannot set the mute: {e}"))?;
  state(&volume)
}

/// volume.* shell ops; None for other ops.
pub fn shell_op(op: &str, cmd: &json::V) -> Option<Result<String, String>> {
  let result = match op {
    "volume.get" => endpoint().and_then(|volume| state(&volume)),
    "volume.set" => set(cmd),
    "volume.mute" => mute(cmd),
    _ if op.starts_with("volume.") => Err(format!("unknown op {op}")),
    _ => return None,
  };
  Some(result)
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn state_shape() {
    assert_eq!(state_json(0.49999997, true), r#"{"level":0.5,"muted":true,"settable":true}"#);
  }
}
