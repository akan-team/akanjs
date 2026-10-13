---
"@akanjs/devkit": minor
"@akanjs/cli": minor
---

`akan typecheck` takes a library too (`akan typecheck <lib>`: its `server.ts`, `client.ts`, `index.ts` and pages), and checks the target's own `*.test.ts` / `*.spec.ts` as well, which nothing imports and Bun runs unchecked; `--tests false` leaves them out, and a build's typecheck phase still does. Each mode keeps its own tsconfig and incremental cache under `.akan/typecheck`. Upgrade note: `akan typecheck` now checks tests and specs by default, so type errors they already had can fail a CI run that passed before; fix them, or pass `--tests false` for the old scope.
