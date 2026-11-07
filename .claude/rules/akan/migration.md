---
description: Data migrations under script/migration: table() writes, plan hashing and resumable applies.
paths:
  - "apps/*/script/migration/**"
  - "libs/*/script/migration/**"
---

<!-- akan:generated -->

# Data Migrations

A change that reshapes stored documents ships a migration: `akan create-migration <name> <app>` writes
`script/migration/<yyyyMMddHHmm>_<name>.ts`, a default-exported `migration(title)` from `akanjs/server`, which
`akan migrate <app>` runs locally and `bun main.js ops migrate` in a built container (the `cheatsheet/dev/migration`
docs page).

- The new code reads both shapes until every environment has applied it — a deploy serves traffic first.
- Write only through `table(refName)`, never a service, a document or raw `sql` — a service write runs the model's
  hooks, and none of them reaches the change log a rollback reverts. Call nothing outside the database.
- `plan` reads only and must hash the same on unchanged data: a timestamp, `createId()` or random value in it makes
  every `apply --expect <planHash>` refuse as `planChanged`.
- Past about five seconds on SQLite, an apply's one transaction makes the live server's writes fail. Take
  `.config({ transaction: false })`, which commits each `rewrite` batch and resumes a `partial` run from the top of
  `apply` — so a second run must change nothing (a `where` the new shape no longer matches).
- `$ne` leaves out rows whose path is missing or `null` (match them with `{ path: null }`; `$exists: false` misses a
  stored `null`); `find`, `count` and `rewrite` include removed rows unless `{ withRemoved: false }`; a `table()` write
  leaves `updatedAt` alone.
- Throw a plain `Error` an operator can act on. Never edit a migration an environment has applied — write another;
  delete it once every environment has, unless its `.rollback(fn)` may still be needed: without the file a rollback
  runs the default undo.
