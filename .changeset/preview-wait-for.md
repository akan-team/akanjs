---
"@akanjs/cli": patch
"@akanjs/devkit": patch
---

`akan preview --wait-for "<css selector>"` holds each page after load until the selector matches, bounded by `--timeout`, and fails a page where it never appears, naming the selector.
