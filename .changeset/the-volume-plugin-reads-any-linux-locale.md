---
"akanjs": patch
---

fix: the volume plugin reads the mute state and hears changes on a Linux desktop in any language

`pactl` translates its output, so on a Korean desktop `muted` was always `false` and no `change` event came. It now
runs in the C locale. Its `subscribe` also starts again after the audio server restarts, where changes used to stop
for the rest of the session.
