---
"akanjs": patch
"@akanjs/devkit": patch
"@akanjs/cli": patch
"use-agentic": patch
---

Fixes from a CodeQL code-scanning and code-quality pass:

- The `"use client"` check that the build runs on every module no longer backtracks exponentially on leading block comments (about 30 one-line comments hung the build), and it no longer reads `/* a */ x /* b */ "use client"` as a directive.
- A package `exports` wildcard target with more than one `*` has every `*` replaced, as Node does, in the build's resolver and the barrel-imports plugin.
- A tunnel agent ignores a gateway heartbeat outside 1 s to 5 min and keeps the 30 s default; Bun runs a NaN, negative or over-2^31 interval every millisecond.
- The in-page agent's screen text prints no `data:` or `vbscript:` link, in any letter case, as it already printed no `javascript:` one.
- A markdown link label or a mention label no longer spans a `[` or `@[` where another one starts: `[a [b](u)` links `b`.
- `web_fetch` decodes `&amp;` last, so `&amp;lt;` reads as `&lt;`, and strips `</script >`-style end tags.
- Native: `google_services.xml` escapes backslashes, a share refuses a `vbscript:` link, and the dev shim escapes `<`, `>`, U+2028 and U+2029 in the values it inlines.
- `trimSlashes` and `trimTrailingSlashes` in `akanjs/common` trim in linear time; the framework's slash, email, translation and route-parsing regexes are now linear with the same results.
