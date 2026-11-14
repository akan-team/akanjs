---
"@akanjs/native": patch
---

On Linux, `external-view` `sendKey` now sends `{ key: "Unidentified" }`, which the page reads as `Unidentified`, and sends `{ key: "Enter", code: "NumpadEnter" }` as the keypad's Enter, so the page reads `location` 3 as on Windows. `{ key: "Dead" }` still answers `INVALID_ARGS` there, now saying why: GTK's input method would compose it with the next key into one character.
