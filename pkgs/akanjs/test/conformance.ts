import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  DEFAULT_TOKENIZER,
  getSolidConfig,
  PostgresDatabase,
  PostgresDialect,
  RedisCache,
  Scheduler,
  type SearchConfig,
  SolidCache,
  type SqlDialect,
  SqliteDatabase,
  SqliteDialect,
} from "akanjs/service";

type ConformanceBackend = "redis" | "postgres";

export type ConformanceCacheKind = "solid" | "redis";

export type SqlDriverKind = "sqlite" | "postgres";

export interface SqlDriverOptions {
  insight?: boolean;
  memory?: boolean;
  search?: SearchConfig;
}

export interface SqlDriver {
  kind: SqlDriverKind;
  database: SqliteDatabase | PostgresDatabase;
  dialect: SqlDialect;
  /** A new adaptor on the same storage — what a process restart sees, so only what was committed. */
  restart: () => Promise<SqlDriver>;
  /** A second adaptor on the same storage while this one stays open: another process, with these search settings. */
  sibling: (search?: SearchConfig) => Promise<SqlDriver>;
  /** A restart with other text search settings — a redeploy that changed `AKAN_SEARCH_*`. */
  reconfigure: (search: SearchConfig) => Promise<SqlDriver>;
  close: () => Promise<void>;
}

const backendEnvNames = {
  redis: "AKAN_TEST_REDIS_URL",
  postgres: "AKAN_TEST_POSTGRES_URL",
} as const;

/** `bun run testConformance` (`infra/test/compose.yaml`) sets both backends; plain `bun test` runs SQLite. */
export class ConformanceEnv {
  static readonly #announced = new Set<string>();
  /** Where a deployment points an app at its data. A test that hands its storage in has these cleared first. */
  static readonly deploymentEnvKeys = [
    "AKAN_DATABASE_MODES",
    "AKAN_SOLID_DB_PATH",
    "SQLITE_DATABASE_PATH",
    "POSTGRES_URL",
    "POSTGRES_URI",
    "POSTGRES_HOST",
    "POSTGRES_PORT",
    "POSTGRES_DATABASE",
    "POSTGRES_DB",
    "POSTGRES_USER",
    "POSTGRES_PASSWORD",
    "POSTGRES_INSIGHT_URL",
  ] as const;

  /** This process's env without what a deployment would point the app at. */
  static isolatedProcessEnv() {
    const env: Record<string, string | undefined> = { ...process.env };
    for (const key of ConformanceEnv.deploymentEnvKeys) delete env[key];
    return env;
  }

  static url(backend: ConformanceBackend): string | null {
    return process.env[backendEnvNames[backend]]?.trim() || null;
  }

  /** Says once per suite and backend when it is missing: a skipped suite must never read as a passing one. */
  static has(suite: string, backend: ConformanceBackend): boolean {
    if (ConformanceEnv.url(backend)) return true;
    const key = `${suite}:${backend}`;
    if (!ConformanceEnv.#announced.has(key)) {
      ConformanceEnv.#announced.add(key);
      console.info(
        `[conformance] ${suite}: ${backend} cases skipped — set ${backendEnvNames[backend]}, or run \`bun run testConformance\``,
      );
    }
    return false;
  }

  static uniqueName(prefix: string) {
    return `${prefix}_${process.pid}_${crypto.randomUUID().replaceAll("-", "").slice(0, 8)}`;
  }

  static async tempDir(prefix: string) {
    const dir = await mkdtemp(path.join(tmpdir(), `${prefix}-`));
    return { dir, remove: async () => await rm(dir, { recursive: true, force: true }) };
  }

  /**
   * A throwaway schema and a URL pinning every pooled connection to it: postgres.js forwards unknown query parameters
   * as startup parameters, so `search_path` holds on later connections too. `insight` adds a login role, dropped too.
   */
  static async postgresSchema(prefix: string, { insight = false }: { insight?: boolean } = {}) {
    const base = ConformanceEnv.url("postgres");
    if (!base) throw new Error("postgresSchema() needs AKAN_TEST_POSTGRES_URL");
    const schema = ConformanceEnv.uniqueName(prefix).toLowerCase();
    const role = `${schema}_insight`;
    const { default: postgres } = await import("postgres");
    const admin = postgres(base, { max: 1, onnotice: () => undefined });
    await admin.unsafe(`CREATE SCHEMA "${schema}"`);
    const insightUrl = insight ? await ConformanceEnv.#createLoginRole(admin, base, role) : undefined;
    await admin.end();
    const url = new URL(base);
    url.searchParams.set("search_path", schema);
    return {
      schema,
      url: url.toString(),
      insightUrl,
      drop: async () => {
        const dropper = postgres(base, { max: 1, onnotice: () => undefined });
        await dropper.unsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        if (insight) await dropper.unsafe(`DROP ROLE IF EXISTS "${role}"`);
        await dropper.end();
      },
    };
  }

  /** A login role with no privilege and no membership, and the URL that logs in as it. */
  static async createPostgresLoginRole(role: string) {
    const base = ConformanceEnv.url("postgres");
    if (!base) throw new Error("createPostgresLoginRole() needs AKAN_TEST_POSTGRES_URL");
    const { default: postgres } = await import("postgres");
    const admin = postgres(base, { max: 1, onnotice: () => undefined });
    const url = await ConformanceEnv.#createLoginRole(admin, base, role);
    await admin.end();
    return {
      url,
      drop: async () => {
        const dropper = postgres(base, { max: 1, onnotice: () => undefined });
        await dropper.unsafe(`DROP OWNED BY "${role}"`);
        await dropper.unsafe(`DROP ROLE IF EXISTS "${role}"`);
        await dropper.end();
      },
    };
  }

  static async #createLoginRole(admin: { unsafe: (sql: string) => Promise<unknown> }, base: string, role: string) {
    const password = crypto.randomUUID().replaceAll("-", "");
    await admin.unsafe(`CREATE ROLE "${role}" LOGIN PASSWORD '${password}'`);
    const url = new URL(base);
    url.username = role;
    url.password = password;
    return url.toString();
  }

  static cacheKinds(suite: string): ConformanceCacheKind[] {
    return ConformanceEnv.has(suite, "redis") ? ["solid", "redis"] : ["solid"];
  }

  /** `app` stands for the app that built the cache: on Redis it is the key prefix, and closing deletes under it. */
  static async openCache(
    kind: ConformanceCacheKind,
    { app = ConformanceEnv.uniqueName("app") }: { app?: string } = {},
  ) {
    if (kind === "solid") {
      const { dir, remove } = await ConformanceEnv.tempDir("akan-cache");
      const cache = new SolidCache();
      Object.assign(cache, { config: getSolidConfig({ solid: { filePath: path.join(dir, `${app}.db`) } }) });
      await cache.onInit();
      return {
        cache: cache as SolidCache | RedisCache,
        close: async () => {
          await cache.onDestroy();
          await remove();
        },
      };
    }
    const { Redis } = await import("ioredis");
    const client = new Redis(ConformanceEnv.url("redis") as string, { lazyConnect: true });
    await client.connect();
    const cache = new RedisCache();
    const keyPrefix = `${app}:testing:`;
    Object.assign(cache, { redis: client, keyPrefix });
    return {
      cache: cache as SolidCache | RedisCache,
      close: async () => {
        const keys = await client.keys(`${keyPrefix}*`);
        if (keys.length) await client.del(...keys);
        await cache.onDestroy();
      },
    };
  }

  /** The local drivers always, and each remote one whose backend the suite can reach. */
  static sqlDrivers(suite: string): SqlDriverKind[] {
    const kinds: SqlDriverKind[] = ["sqlite"];
    if (ConformanceEnv.has(suite, "postgres")) kinds.push("postgres");
    return kinds;
  }

  /**
   * The real adaptor, initialised as the DI container would, on storage nothing else sees. `insight` gives Postgres a
   * login role for `InsightQuery`; `memory` puts SQLite in memory, as `TestServer` does.
   */
  static async openSqlDriver(kind: SqlDriverKind, options: SqlDriverOptions = {}): Promise<SqlDriver> {
    return await ConformanceEnv.#openSqlAdaptor(kind, await ConformanceEnv.#sqlStorage(kind, options));
  }

  static async #sqlStorage(
    kind: SqlDriverKind,
    { insight = false, memory = false, search: searchConfig }: SqlDriverOptions,
  ): Promise<{ config: object; remove: () => Promise<void> }> {
    const search = { enabled: true, tokenizer: DEFAULT_TOKENIZER, ...searchConfig };
    if (kind === "postgres") {
      const { url, insightUrl, drop } = await ConformanceEnv.postgresSchema("akan_sql", { insight });
      return { config: { url, insightUrl, search }, remove: drop };
    }
    if (memory)
      return {
        config: { filePath: ":memory:", journalMode: "MEMORY", synchronous: "OFF", foreignKeys: true, search },
        remove: async () => undefined,
      };
    const { dir, remove } = await ConformanceEnv.tempDir(`akan-${kind}`);
    const filePath = path.join(dir, "conformance.db");
    return {
      config: { filePath, journalMode: "WAL", busyTimeoutMs: 5000, synchronous: "NORMAL", foreignKeys: true, search },
      remove,
    };
  }

  static #withSearch(config: object, search: SearchConfig) {
    const current = (config as { search?: SearchConfig }).search;
    return { ...config, search: { ...current, ...search } };
  }

  static async #openSqlAdaptor(
    kind: SqlDriverKind,
    storage: { config: object; remove: () => Promise<void> },
  ): Promise<SqlDriver> {
    const scheduler = new Scheduler();
    const database = kind === "postgres" ? new PostgresDatabase() : new SqliteDatabase();
    Object.assign(database, { scheduler, config: storage.config });
    await database.onInit();
    const shutdown = async () => {
      await database.onDestroy();
      await scheduler.onDestroy();
    };
    return {
      kind,
      database,
      dialect: kind === "postgres" ? new PostgresDialect() : new SqliteDialect(),
      restart: async () => {
        await shutdown();
        return await ConformanceEnv.#openSqlAdaptor(kind, storage);
      },
      sibling: async (search: SearchConfig = {}) =>
        await ConformanceEnv.#openSqlAdaptor(kind, {
          config: ConformanceEnv.#withSearch(storage.config, search),
          remove: async () => undefined,
        }),
      reconfigure: async (search: SearchConfig) => {
        await shutdown();
        return await ConformanceEnv.#openSqlAdaptor(kind, {
          ...storage,
          config: ConformanceEnv.#withSearch(storage.config, search),
        });
      },
      close: async () => {
        await shutdown();
        await storage.remove();
      },
    };
  }
}
