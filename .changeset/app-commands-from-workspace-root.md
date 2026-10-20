---
"@akanjs/cli": patch
---

`akan script`, `akan console`, `akan db-export` and `akan db-import` run the app from the workspace root, as `akan start` does, so they open the same local SQLite database. They ran from `apps/<app>/`, where the default path named a new, empty database and left an `apps/<app>/local/` folder that the next `akan sync` refuses. Upgrade note: a script that reads a path relative to its app folder now resolves it from the workspace root; build it from `import.meta.dir`. A `SQLITE_DATABASE_PATH=$PWD/…` set only to reach the `akan start` database is no longer needed.
