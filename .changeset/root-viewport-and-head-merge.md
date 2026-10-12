---
"akanjs": minor
"@akanjs/devkit": patch
---

`rootLayout().viewport({ fitCover, interactiveWidget, themeColor })` writes the document's `viewport` and `theme-color` meta, on the server and in the CSR shell; a native app draws under the notch by default, and a per-theme `themeColor` follows a theme switch. Route heads now merge root first: a deeper `.head()` replaces the `<title>`, a `<meta>` with the same `name` or `property`, and a canonical, manifest or icon link, and keeps the rest. Upgrade note: a page that restated its root's manifest, icon or theme tags can drop them, and an ancestor's head now renders under every page that writes its own.
