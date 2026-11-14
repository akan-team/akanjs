---
"@akanjs/native": patch
---

An Akan Android app no longer crashes on launch on Android 12 and 12L (API 31-32). Every launch there closed at once with a `NullPointerException` from `PhoneWindow.getInsetsController`, and the old-WebView screen crashed the same way.

- On API 30-32 the window's insets controller reads a decor view the window has not created yet. The activity set the bar icon colors through it before `setContentView`, so it threw.
- The runtime now creates the decor view first, and the bar settings apply once the view is attached. Showing or hiding the bars goes through the same path.
- Android 11 and earlier set the bar icon colors through the older flags, and the same call does not throw on Android 13 and later, so neither crashed.

Rebuild the Android app on this version to pick up the fix.
