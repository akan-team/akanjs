---
"@akanjs/cli": patch
---

A new workspace no longer lists `tailwindcss` in its `package.json`: the CLI compiles Tailwind with its own copy, and an app's `@import "tailwindcss"` resolves to it under both Bun's hoisted and isolated installs. An existing workspace that lists it keeps working unchanged.
