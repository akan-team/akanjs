import path from "node:path";
import { getEnv } from "../../base/baseEnv";
import { resolveDefaultSqliteFile } from "../../service/predefinedAdaptor/sqlitePath";
import type { SnapshotSources } from "./snapshotTypes";

/**
 * Where the SQLite files live, by the same precedence the adaptors use — deployment env first, then the default
 * layout. A path an app sets only in `env.server.ts` is invisible here; the solo server passes the adaptor's own
 * answer instead, and a gateway deployment names it with SQLITE_DATABASE_PATH / AKAN_SOLID_DB_PATH.
 */
export class SqliteFiles {
  static fromEnv(): SnapshotSources {
    const { appName, environment, operationMode, databaseMode } = getEnv();
    const workspaceRoot = process.env.AKAN_WORKSPACE_ROOT;
    const isProduction = process.env.NODE_ENV === "production";
    const main =
      process.env.SQLITE_DATABASE_PATH ??
      resolveDefaultSqliteFile({
        appName,
        fileName: `${appName}-${environment}.db`,
        isProduction,
        operationMode,
        workspaceRoot,
      });
    //* Only `single` keeps queue and cache in the solid file; `multiple` moved them to Redis.
    const solid =
      databaseMode === "single"
        ? (process.env.AKAN_SOLID_DB_PATH ??
          resolveDefaultSqliteFile({
            appName,
            fileName: `${appName}-${environment}_solid.db`,
            isProduction,
            operationMode,
            workspaceRoot,
          }))
        : null;
    return { main: path.resolve(main), solid: solid ? path.resolve(solid) : null };
  }

  static snapshotDir(sources: SnapshotSources) {
    return process.env.AKAN_OPS_SNAPSHOT_DIR ?? path.join(path.dirname(sources.main), "snapshots");
  }
}
