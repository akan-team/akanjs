---
"@akanjs/devkit": patch
---

fix: a `bin` download is named by its URL's extension alone, and a `native/` plugin listed by path ships once

- The download was saved under the URL's decoded file name, so a `%2F` or `..` in it wrote outside the build's
  `bin` cache and a malformed `%` sequence stopped the build. It is now `download` plus the extension (`.zip`,
  `.tar.xz`, `.exe`, …), which is all that `unzip` and a Windows PATH lookup read.
- A plugin in the app's `native/<id>` that the target also lists in `native.plugins` by path reached the native build
  twice, which refused it as one id provided by two folders.
