---
"akanjs": minor
"@akanjs/devkit": patch
---

`LibsqlDatabase` is removed, along with the `@libsql/client` optional peer dependency, `LibsqlDatabaseConfig`, the `database.libsql` server env and the `LIBSQL_URL` / `LIBSQL_URI` / `LIBSQL_AUTH_TOKEN` variables. No database mode used it: `single` and `multiple` run on `SqliteDatabase`, `cluster` on `PostgresDatabase`. Upgrade note: an app that applied `LibsqlDatabase` itself moves to `SqliteDatabase` for a local file or to `cluster` mode for a shared server.
