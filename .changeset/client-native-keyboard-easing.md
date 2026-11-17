---
"akanjs": patch
---

`akanjs/client` exports `nativeKeyboardEasing()`, the curve the keyboard of the shell a page runs in moves on: Android's (`ANDROID_KEYBOARD_ANIMATION_EASING`) in an Android app, iOS's (`IOS_KEYBOARD_ANIMATION_EASING`) anywhere else. `KeyboardRide` already used it; with the name on the barrel, a page's browser code holds the device and keyboard files once, where a build would otherwise have shipped them in two bundles.
