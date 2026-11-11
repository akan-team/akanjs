---
"@akanjs/native": minor
"@akanjs/cli": patch
---

The `external-view` plugin's `sendKey` now works on Linux, and `isSupported("sendKey")` is true there. The view gets a keydown and a keyup whose `code` is the one asked for, whatever the keyboard layout, whether the view, the app's page or another window has the focus, and also while the view is hidden; the app's page never sees the key.
