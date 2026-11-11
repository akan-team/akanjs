---
"@akanjs/native": patch
---

`app.relaunch()` and the desktop recovery's relaunch now start an AppImage again from its own file (`$APPIMAGE`) instead of the mount it ran from, which is gone once the app exits, so the app no longer quits without coming back. The relaunched app no longer inherits the old mount's `APPDIR`, `APPIMAGE`, `ARGV0` and `OWD`; its AppImage runtime sets them anew. An app that another AppImage started (an AppImage editor or launcher, say) inherits that AppImage's `APPIMAGE`; relaunch, the deep-link handler and the autostart entry now use `$APPIMAGE` only when the app runs from that AppImage's own mount, so such an app no longer registers the other AppImage in its place.
