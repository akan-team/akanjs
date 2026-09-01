---
"akanjs": patch
"@akanjs/cli": patch
"@akanjs/devkit": patch
---

fix(lint): stop `//!` markers from shipping to the browser

Bun's bundler classifies `//!` and `/*!` as legal comments — the `@license` / `@preserve` class it must preserve
for licence compliance — and keeps them through `minify: true`. Everything else goes: `//`, `/* */`, `//*`, `//?`,
and `// TODO:` are all stripped. But the workspace `AGENTS.md` prescribes `//!` as in-code marker 4, "disabled or
must-fix code", so the convention itself guaranteed that internal notes about broken and unfinished code shipped
verbatim to every visitor. A deployed app served eight of them in one chunk, including `//!env로 옮겨야함`,
`//!need to change`, and `//! Need to fix after bunjs migration`.

There is no bundler-side fix: `legalComments` is not a `Bun.build` option, and `Bun.Transpiler.transformSync`
preserves `//!` too. The source is the only place to stop it.

`no-bang-comment-in-client.grit` now bans the marker in browser-reachable code — `ui/`, `webkit/`, `common/`,
`page/**/*.tsx`, `*.constant.ts`, `*.store.ts`, and the five module component suffixes — while leaving it legal in
server, `srvkit/`, and CLI files, which never reach a bundle. The five existing occurrences in `akanjs` and the
libs became `// FIXME:`.

The rule anchors the marker to line start or to whitespace after code, so a literal like `"https://host//!path"`
does not trip it. Comments are trivia rather than nodes, so the diagnostic spans the module and a marker on a
file's very first line is invisible to the pattern — the one case the rule cannot see.

Rebuilding `apps/akan` takes the bundle from two `//!` comments to zero, with the third-party `/*!` licence
blocks left intact.
