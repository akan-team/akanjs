---
"akanjs": patch
---

fix(package): embed `use-agentic` into the akanjs build instead of depending on it

`use-agentic` is a workspace package, not a registry entry — it is not in `publishableAkanPackages` and
`release:build-packages` never builds it — so the `"use-agentic": "0.1.0"` line the dependency scanner wrote into
`pkgs/akanjs/package.json` pointed every consumer at something `bun install` cannot resolve.

The akanjs build now copies its source into `vendor/use-agentic` inside the dist and rewrites every
`from "use-agentic"` specifier to the relative path, in the shipped `.ts` sources and in the emitted `.d.ts` tree
alike — declarations for the embedded package are emitted into `types/vendor/use-agentic` by a second program, so
the published types resolve without the package existing anywhere. `PackageRunner` treats it as a bundled runtime
dependency the way `@akanjs/cli` already treats `@akanjs/devkit`, which keeps it out of both the dist and the
source `package.json` on every rebuild.

`@happy-dom/global-registrator` moved to an optional peer dependency alongside `@playwright/test` and `chance`,
the shape every other package the `test/` facet reaches already has. `test/registerDom.ts` is a value import, so
the scanner had promoted a test-only DOM shim into the runtime dependencies of every app that installs akanjs.

Nothing changes inside the monorepo: framework source keeps importing `"use-agentic"` and keeps resolving it
through the workspace. `GuideProps`, `ZoneProps`, and `AgentScopeProps` are now exported, because the `Agent`
namespace object cannot have its declaration emitted while the props it infers cannot be named (TS4023) — that
error had been failing `build-package akanjs` outright, since the release build runs the declaration emit with
`AKAN_BUILD_DECLARATION_DIAGNOSTICS=error`.
