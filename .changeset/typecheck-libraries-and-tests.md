---
"@akanjs/devkit": minor
"@akanjs/cli": minor
---

`akan typecheck` takes a library too (`akan typecheck <lib>`: its `server.ts`, `client.ts`, `index.ts` and pages), and checks the target's own `*.test.ts` / `*.spec.ts` as well, which nothing imports and Bun runs unchecked; `--tests false` leaves them out, and a build's typecheck phase still does. Each mode keeps its own tsconfig and incremental cache under `.akan/typecheck`.
