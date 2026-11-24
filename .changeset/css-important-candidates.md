---
"@akanjs/devkit": patch
---

A Tailwind class marked important (`h-0!`, `!h-0`, `md:!h-0`, `w-[10px]!`) now compiles with `!important`. The CSS candidate scanner used to cut the `!` off, so the class compiled as its plain utility, silently. A trailing `!` followed by `=` or a word is still read as code (`a !== b`, `ref!.focus()`). The candidate cache version moves to 7, so a cached scan from an older build is rescanned.
