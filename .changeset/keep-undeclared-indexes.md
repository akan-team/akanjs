---
"akanjs": minor
"@akanjs/cli": patch
---

A boot no longer drops an index akan built that the release no longer declares. Since 3.1.0 the first instance of a new release to boot, `akan migrate` included, dropped those indexes while instances of the previous release were still serving queries from them. An older instance that restarted during the rollout, or after a rollback, built the index again (on SQLite a blocking build inside its boot), and the next new boot dropped it again.

- Each boot keeps such an index and warns about each one. A unique one is named as unique, because it keeps refusing a duplicate of its key that the new release would write.
- `akan migrate <app> indexes` (`bun main.js ops migrate indexes` in a built image) lists them. `akan migrate <app> prune-indexes` drops them, concurrently on Postgres. Run it once no instance of an earlier release is serving. An index made by hand, outside akan, is never listed or dropped.
- Through the ops channel, `prune-indexes` needs a token with a `sub`, like `apply` and `rollback`.

Upgrade step: after every instance runs this release, run `prune-indexes` once to drop what earlier releases left; until then the warnings at boot list those indexes. `migrationActions` and `MigrationAction` gain `indexes` and `prune-indexes`, so code that switches over every action needs the two new cases; nothing else changes for a caller.
