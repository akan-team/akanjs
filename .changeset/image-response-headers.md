---
"akanjs": patch
---

Every response from `/_akan/image` carries `X-Content-Type-Options: nosniff`, `Referrer-Policy` and a sandboxing `Content-Security-Policy` (`script-src 'none'; frame-src 'none'; sandbox;`), and an image response carries `Content-Disposition: attachment` named after its source file. An SVG an app allows with `dangerouslyAllowSVG` still shows in an `<img>`, and runs no script when its URL is opened on its own.

**Upgrading.** Opening an optimized image's URL directly in a browser tab now downloads it instead of showing it; images in pages, CSS and `srcset` are unchanged.
