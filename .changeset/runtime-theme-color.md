---
"akanjs": minor
---

`--akan-theme-color` on the root now drives the browser's `theme-color`, and a native app's status bar icons when the app names the `appearance` plugin.

- **The variable outranks the root layout's `.viewport({ themeColor })`.** Set it per theme beside the tokens (`--akan-theme-color: var(--background)`), or at run time on `document.documentElement.style`. The page reads it again when the root's `style`, `class` or `data-theme` changes, or the OS scheme flips. With neither the variable nor a `themeColor`, no tag is written, as before.
- **iOS and Android shells pick status bar icons that read on the color in effect**, from the variable or from `themeColor`: dark icons on a light color (relative luminance over 0.5), light ones on a dark color. The page still draws under the bar, so the bar gets no background of its own. `appearance.setThemeColor({ color })` carries the color, so add `"appearance"` to `native.plugins` for it. An app without the plugin keeps its status bar as before.
- **An app that names `appearance` needs new phone binaries.** The plugin gains a method, so the native API a phone's web updates are keyed by changes for that app: a binary built before it gets no web update built after it. An app that does not name `appearance` keeps its key.
