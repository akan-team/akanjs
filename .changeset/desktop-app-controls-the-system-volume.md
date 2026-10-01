---
"akanjs": minor
---

A desktop app reads and sets the system volume and mute, and hears when they change

The `volume` native plugin (`native.plugins: ["volume"]` in `akan.config.ts`, `volume` from `akanjs/client/native`)
has `getVolume()`, `setVolume({ level })` and `setMuted({ muted })`, each answering `{ level, muted, settable }`, and
a `change` event whoever moved the volume. macOS drives the default output device through CoreAudio (an HDMI or
DisplayPort output takes no volume from the computer and answers `level: null`), Windows the default render endpoint
the taskbar slider moves, and Linux the default sink of PulseAudio or PipeWire through `pactl`, in any desktop
language, hearing changes again after the audio server restarts. A phone or the web answers `UNSUPPORTED`, and a Linux
box without an audio server `NOT_FOUND`.
