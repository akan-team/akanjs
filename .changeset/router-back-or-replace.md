---
"akanjs": minor
"@akanjs/devkit": patch
"@akanjs/cli": patch
---

`router.backTo(href)` is named `router.backOrReplace(href)`.

The method steps back when the entry under the current one is `href` and replaces the current entry with `href` otherwise. It looks one entry down, never further, so `backTo` read as "go back until `href`", which it does not do. The new name says both outcomes and sits beside `router.backOrFallback(href)`.

Upgrade: `backTo` shipped only in 3.3.0-rc.54 and 3.3.0-rc.55, never in a stable release. An app on one of those rcs renames each `router.backTo(` call to `router.backOrReplace(`; the arguments and the behaviour are the same. The page skill and the API reference name the new method.
