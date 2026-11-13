---
"akanjs": minor
"@akanjs/cli": patch
---

A page's `.head()` can now set its own `theme-color`, and a level that writes an image no longer inherits the image tags of the one above it.

- A `<meta name="theme-color">` a `.head()` writes replaces the root `.viewport({ themeColor })`'s tags, in the server render, after hydration and across client navigation. A page without its own gets the root's back.
- A level that writes `og:image` drops the `og:image:*` tags (`width`, `height`, `alt`, `type`) it inherits and keeps its own. `twitter:image` and its `twitter:image:*` tags merge the same way.
- Only `.head()` merges. A `<title>` or `<meta>` written inside a component renders beside the merged head, so a second `<title>` can reach the document. The `pageRule` guideline now says so.

Behaviour is unchanged for a page that sets neither a theme-color nor an image. The api report lists two new `ViewportMeta` statics; no upgrade step is needed.
