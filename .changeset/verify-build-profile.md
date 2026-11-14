---
"@akanjs/cli": patch
"@akanjs/devkit": patch
---

`akan verify` now builds only each changed app's server and SSR routes, then checks the route JS budget, and skips the browser bundle, font pruning, compression and production metadata, so its build step finishes sooner. `ApplicationBuildRunner` takes a `verify` option for this.

**Upgrading.** After `akan verify`, `dist/apps/<app>` is not a deployable build: its `akan.build.json` says `"profile": "verify"`, and its `main.js` exits at once, telling you to run `akan build <app>`. Run `akan build` before you deploy or start it. A page that compiles for the server but not for the browser is no longer reported by `akan verify`, only by `akan build`.
