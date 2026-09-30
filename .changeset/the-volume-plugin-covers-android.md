---
"akanjs": minor
---

The volume plugin reads and sets Android's media volume

On Android, `volume` from `akanjs/client/native` drives the media volume (STREAM_MUSIC), the one the volume keys move
while the app plays: `getVolume()`, `setVolume({ level })`, `setMuted({ muted })` and the `change` event behave as on
the desktop. Setting the level keeps the mute as it was (Android unmutes a stream whose volume changes), and a device
with a fixed volume answers `settable: false`. iOS still answers `UNSUPPORTED`.
