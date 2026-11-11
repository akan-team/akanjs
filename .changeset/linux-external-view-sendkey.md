---
"@akanjs/native": minor
"@akanjs/cli": patch
---

The `external-view` plugin's `sendKey` now works on Linux, and `isSupported("sendKey")` is true there. The view gets a keydown and a keyup whose `code` is the one asked for, whatever the keyboard layout, whether the view, the app's page or another window has the focus, while an app dialog is open, and also while the view is hidden; neither the app's page nor its dialog sees the key, and an IBus or Fcitx input method types it as is rather than composing it. Its window must be shown: `sendKey` answers `UNSUPPORTED` while the window is hidden.
