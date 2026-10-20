---
"akanjs": minor
"@akanjs/devkit": minor
"@akanjs/cli": minor
---

Data migrations: a change that reshapes stored documents ships a script in `apps/<app>/script/migration/`, which every environment runs the same way.

- **`akan create-migration <name> <app>`** writes `script/migration/<yyyyMMddHHmm>_<name>.ts`, a default-exported `migration(title)` from `akanjs/server` with empty `.plan()`, `.apply()` and `.verify()` stages, which also takes `.param()`, `.rollback()` and `.config()`. A migration writes only through `table(refName)`, which records every value it changes.
- **`akan migrate <app> [list|plan|apply|verify|rollback] [id]`** runs them locally, and `bun main.js ops migrate` takes the same arguments in a built image. `plan` prints a `planHash`, and `apply --expect <planHash>` refuses when the data changed since that plan was reviewed. `--json` prints the result as the last line, even when the command line itself is refused; the exit code is 0 on success, 2 when the command, a parameter or the id is wrong, 3 when verify finds problems (an apply's changes stay committed), and 1 otherwise.
- **Runs are recorded in the app's own database** (`_akan_migration_run`, `_akan_migration_change`) under a lease, so one runs at a time; `db-export` and `db-import` carry them along, and no insight query can read them. `rollback` restores what an apply changed, deletes the rows it inserted or copied, skips a row edited since, and still works once the script is deleted, then with the default undo. `.config({ transaction: false })` commits as it goes, and a failed run is left `partial` to resume.
- The generated `server.ts` exports a `migrations` manifest of that folder, and the `Err` lint rule leaves `script/migration/**` alone, since an operator reads its messages.
