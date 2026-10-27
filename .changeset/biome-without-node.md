---
"@akanjs/devkit": patch
"@akanjs/cli": patch
---

`akan lint`, `akan typecheck` and every sync that formats generated files now run where only Bun is installed: Biome's npm wrapper (`#!/usr/bin/env node`) runs through the Bun running akan, where before an image without Node failed with `env: 'node': No such file or directory` (exit 127).
