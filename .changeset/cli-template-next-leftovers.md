---
"@akanjs/cli": patch
"@akanjs/devkit": patch
---

A new app's `tsconfig.json` no longer names the Next.js TS plugin or includes `.next/types`, and a new workspace's `bunfig.toml` no longer loads `bun-plugin-tailwind`, which was never installed. Akan compiles Tailwind and inlines `AKAN_PUBLIC_*` itself, so nothing read either. `akan doctor` warns (`config-leftover`) about the same lines in an existing workspace.
