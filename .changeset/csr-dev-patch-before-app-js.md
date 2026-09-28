---
"akanjs": patch
"@akanjs/devkit": patch
---

fix(dev): a CSR dev save reaches the open tabs before `app.js` is rewritten, and a tab opened in between boots once

A dev CSR save used to rewrite the whole `app.js` before telling the open tabs about the patch, although only a tab
that boots later needs it. The patch is now announced first and `app.js` follows. The manifest records which
generation `app.js` holds (`appGeneration`), and the server holds a booting tab's `app.js?g=N` for up to two seconds
until the file holds `N`, instead of booting it one generation behind and reloading it again. A build that died in
that gap leaves `app.js` behind; the next update rewrites it even when nothing else changed.
