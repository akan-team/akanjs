---
"@akanjs/devkit": patch
---

On Windows, a generated root layout named its layout files with backslashes, as in `page\_layout.tsx`. The names appear in the route-convention errors that `resolveRouteModule` and `assertGuardOnChain` throw. They now use `/` on every OS (`page/_layout.tsx`), so the generated file reads the same everywhere.
