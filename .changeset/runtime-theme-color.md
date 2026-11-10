---
"akanjs": minor
"@akanjs/devkit": patch
---

`--akan-theme-color` on the root now drives the browser's `theme-color` and a native app's status bar icons.

- **The variable outranks the root layout's `.viewport({ themeColor })`.** Set it per theme beside the tokens (`--akan-theme-color: var(--background)`), or at run time on `document.documentElement.style`. The page reads it again when the root's `style`, `class` or `data-theme` changes, or the OS scheme flips. With neither the variable nor a `themeColor`, no tag is written, as before.
- **iOS and Android shells pick status bar icons that read on the color in effect**, from the variable or from `themeColor`: dark icons on a light color (relative luminance over 0.5), light ones on a dark color. The page still draws under the bar, so the bar gets no background of its own. `appearance.setThemeColor({ color })` carries the color, and `appearance` is now one of the plugins every native app ships.
- **A native app with a `themeColor` sees its status bar icons change.** Until now they followed the appearance on iOS and the background color on Android.
- **Ship new phone binaries with this upgrade.** `appearance` joins every app's plugins with a new method, so the native API a phone's web updates are keyed by changes: a binary built before it gets no web update built after it.
