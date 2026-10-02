---
"akanjs": minor
"@akanjs/devkit": minor
"@akanjs/cli": minor
---

`akan build-desktop --installer true` on Linux adds an AppImage

The app folder gains an `AppRun`, a `.desktop` entry naming the app's icon and its `deepLinks.schemes`, and a 256px icon,
and is packed with `mksquashfs` behind the AppImage type 2 runtime, pinned to a dated release and checked by its
digest. The AppImage needs only the WebKitGTK 4.1 and GTK 3 the folder already needs, and runs without FUSE through
`--appimage-extract-and-run`. It runs from a read-only image, so the updates plugin cannot replace it: an app with
`updates` is warned to publish a new AppImage for each release.
