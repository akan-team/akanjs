---
"akanjs": patch
"@akanjs/cli": patch
---

The `akanjs` package no longer ships `ARCHITECTURE.md`. The map of the framework's processes and messages is for contributors and stays in the repository (`pkgs/akanjs/ARCHITECTURE.md`); a coding agent building an app read its 11.9 KB from the unpacked package before scaffolding. Verifying a built `akanjs` dist now fails if the file is back in it.
