---
"akanjs": patch
"@akanjs/devkit": patch
"@akanjs/cli": patch
---

`native.backgroundColor` (one color or `{ light, dark }`) is what a native window shows before its page paints, and the splash's default, so a dark screen no longer flashes white. `native.desktop.publisher` names a Windows app's publisher in Apps & features, in its setup program and in its executable. On Windows, `window.setCursorVisible(false)` hides the pointer over the window's external views too, in every document they load, until it is shown again.
