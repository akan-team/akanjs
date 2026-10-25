---
"akanjs": patch
---

Desktop window and external view fixes:

- An external view's `evaluate`, `sendKey` and `capture` fail with `TIMEOUT` after 30 s when the view's page never answers, as a page busy in a loop does.
- `window.setSize`, `setPosition`, `setMinSize` and `createWindow`, and an external view's `bounds`, refuse a value beyond one million logical pixels with `INVALID_ARGS`, as `placeOnDisplay` refuses device pixels; such a value used to wrap into a window off every display. `setMinSize` given a size that is not a number is refused.
- Windows: showing the pointer again over an external view shows it over the view's frames too, and hiding it hides it over a frame that loaded while it showed, without waiting for the frame to navigate.
- macOS: hiding or showing the pointer over a window reaches the frames of another origin its page shows.
- Windows: a frame in an external view opens no other program by scheme (`mailto:`, `ms-settings:`, a custom one), as on macOS, and WebView2 does not offer to.
