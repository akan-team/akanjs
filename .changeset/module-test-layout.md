---
"@akanjs/devkit": minor
"@akanjs/cli": minor
---

`akan sync` now refuses a test at the `lib/` root and a module test that is not named after the one module file it covers. A module keeps one suite per role (`chatMessage.signal.test.ts`, `ChatMessage.Zone.test.tsx`), so `chatMessage.trim.signal.test.ts` is refused just like `chatMessage.trim.signal.ts`. `akan quality scan` reports a test at the `lib/` root under `akan.layout.lib-facet-file`. Upgrade note: move a `lib/<model>.signal.test.ts` into `lib/<model>/`, fold every `<model>.<topic>.signal.test.ts` into `<model>.signal.test.ts` as a `describe` block, and move a suite that drives several modules into `srvkit/`, like `libs/shared/srvkit/guards.signal.test.ts`.
