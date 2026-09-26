import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type BackendEnv, type BaseEnv, type DatabaseMode, DatabaseModes, resetEnvCache } from "akanjs/base";
import { Logger, sleep } from "akanjs/common";
import { type AkanLib, AkanServer } from "akanjs/server";
import { ConformanceEnv } from "./conformance";

const MAX_RETRY = 5;
const TEST_LISTEN_PORT_BASE = 38080;
const MIN_ACTIVATION_TIME = 0;
const MAX_ACTIVATION_TIME = 30000;

type TestStorage = "memory" | "tempFile";

/** `BackendEnv` carries server options only, so a harness that also stamps `process.env` needs the identity beside it. */
export type TestEnv = BaseEnv & BackendEnv;

export interface TestServerOptions {
  workerId?: number;
  port?: number;
  /** Where the SQLite files live. */
  storage?: TestStorage;
  serverMode?: "federation" | "batch" | "all";
  listen?: boolean;
  web?: boolean;
}

const TEST_ENV_KEYS = [
  "NODE_ENV",
  "SERVER_MODE",
  "PORT",
  "AKAN_PUBLIC_APP_NAME",
  "AKAN_PUBLIC_REPO_NAME",
  "AKAN_PUBLIC_SERVE_DOMAIN",
  "AKAN_PUBLIC_ENV",
  "AKAN_PUBLIC_OPERATION_MODE",
  "AKAN_PUBLIC_SERVER_PORT",
  "SERVER_HTTP_PROTOCOL",
  "AKAN_DATABASE_MODE",
  "REDIS_URI",
  ...ConformanceEnv.deploymentEnvKeys,
] as const;

const resolveWorkerId = (workerId?: number) => {
  if (workerId !== undefined) return workerId;
  const bunWorkerId = Number(process.env.BUN_WORKER_ID);
  if (Number.isInteger(bunWorkerId) && bunWorkerId > 0) return bunWorkerId;
  return Math.max(process.pid % 1000, 1);
};

export class TestServer {
  readonly #logger = new Logger("TestServer");
  readonly #libs: AkanLib[];
  readonly #env: TestEnv;
  readonly #storage: TestStorage;
  readonly #mode: DatabaseMode = TestServer.#modeFromEnv();
  #dropSchema: (() => Promise<void>) | null = null;
  readonly #serverMode: "federation" | "batch" | "all";
  readonly #listen: boolean;
  readonly #web: boolean;
  readonly #port: number;
  readonly #previousEnv = new Map<(typeof TEST_ENV_KEYS)[number], string | undefined>();
  workerId: number;
  #startAt = Date.now();
  #server?: AkanServer;
  #tempDir?: string;
  static initClient(env: BaseEnv, workerId?: number) {
    TestServer.applyProcessEnv(env, {
      workerId,
      port: TEST_LISTEN_PORT_BASE + resolveWorkerId(workerId),
      serverMode: "all",
    });
  }
  static applyProcessEnv(
    env: BaseEnv,
    {
      workerId,
      port,
      serverMode = "all",
    }: { workerId?: number; port?: number; serverMode?: "federation" | "batch" | "all" } = {},
  ) {
    const resolvedPort = port ?? TEST_LISTEN_PORT_BASE + resolveWorkerId(workerId);
    process.env.NODE_ENV = "test";
    process.env.SERVER_MODE = serverMode;
    process.env.PORT = String(resolvedPort);
    process.env.AKAN_PUBLIC_APP_NAME = env.appName;
    process.env.AKAN_PUBLIC_REPO_NAME = env.repoName;
    process.env.AKAN_PUBLIC_SERVE_DOMAIN = env.serveDomain;
    process.env.AKAN_PUBLIC_ENV = env.environment;
    process.env.AKAN_PUBLIC_OPERATION_MODE = env.operationMode;
    process.env.AKAN_PUBLIC_SERVER_PORT = String(resolvedPort);
    process.env.SERVER_HTTP_PROTOCOL = "http:";
  }
  constructor(env: TestEnv, libs: AkanLib | AkanLib[], options: TestServerOptions = {}) {
    this.workerId = resolveWorkerId(options.workerId);
    this.#port = options.port ?? TEST_LISTEN_PORT_BASE + this.workerId;
    this.#env = { ...env };
    this.#libs = Array.isArray(libs) ? libs : [libs];
    this.#storage = options.storage ?? "memory";
    this.#serverMode = options.serverMode ?? "all";
    this.#listen = options.listen ?? true;
    this.#web = options.web ?? false;
  }
  async init() {
    let lastError: unknown;
    for (let i = 0; i < MAX_RETRY; i++) {
      try {
        const watchdog = setTimeout(() => {
          throw new Error("TestServer Init Timeout");
        }, MAX_ACTIVATION_TIME);
        await this.#init();
        clearTimeout(watchdog);
        return;
      } catch (e) {
        lastError = e;
        this.#logger.error(e as string);
        await this.terminate();
      }
    }
    throw lastError instanceof Error ? lastError : new Error("TestServer Init Failed");
  }
  async #init() {
    const now = Date.now();
    this.#logger.info(`Test System #${this.workerId} Initializing...`);
    this.#rememberProcessEnv();
    // A developer's shell may point at a real database, and the deployment's env wins over the one a test hands in.
    for (const key of ConformanceEnv.deploymentEnvKeys) delete process.env[key];
    TestServer.applyProcessEnv(this.#env, { workerId: this.workerId, port: this.#port, serverMode: this.#serverMode });
    const { databaseFilePath, solidFilePath } = await this.#makeDatabaseFiles();
    this.#env.port = this.#port;
    this.#env.database = {
      sqlite: {
        filePath: databaseFilePath,
        journalMode: this.#storage === "memory" ? "MEMORY" : "WAL",
        synchronous: this.#storage === "memory" ? "OFF" : "NORMAL",
        foreignKeys: true,
      },
    };
    this.#env.solid = {
      filePath: solidFilePath,
      journalMode: this.#storage === "memory" ? "MEMORY" : "WAL",
      synchronous: this.#storage === "memory" ? "OFF" : "NORMAL",
      cleanupIntervalMs: 60_000,
      queuePollIntervalMs: 60_000,
      queueLeaseMs: 30_000,
    };
    this.#env.onCleanup = async () => {
      await this.cleanup();
    };
    await this.#applyDatabaseMode();
    this.#server = new AkanServer(this.#env.appName, this.#env, this.#serverMode, ...this.#libs);
    await this.#server.start({ listen: this.#listen, web: this.#web });
    this.#logger.info(
      `Test System #${this.workerId} Initialized, database mode: ${this.#mode}, SQLite: ${this.#storage}`,
    );
    this.#startAt = Date.now();
    this.#logger.info(`Test System #${this.workerId} Activation Time: ${this.#startAt - now}ms`);
  }
  async cleanup() {
    this.#logger.info("SQLite test database cleanup is handled by server termination.");
  }
  async terminate() {
    const now = Date.now();
    const elapsed = now - this.#startAt;
    await sleep(50); // cooldown
    await this.#server?.stop();
    this.#server = undefined;
    await this.#dropSchema?.();
    this.#dropSchema = null;
    if (this.#tempDir) {
      await rm(this.#tempDir, { recursive: true, force: true });
      this.#tempDir = undefined;
    }
    this.#restoreProcessEnv();
    if (elapsed < MIN_ACTIVATION_TIME) {
      this.#logger.info(`waiting for ${MIN_ACTIVATION_TIME - elapsed}`);
      await sleep(MIN_ACTIVATION_TIME - elapsed);
    }
    this.#logger.info(`System Terminated in ${Date.now() - now}ms`);
  }
  /**
   * Which database mode's adaptors the server runs: `single` unless `AKAN_TEST_DATABASE_MODE` names another, and never
   * whatever `AKAN_DATABASE_MODE` a developer's shell happens to hold — the suite pins it, so it cannot drift silently.
   */
  static #modeFromEnv(): DatabaseMode {
    return DatabaseModes.parse(process.env.AKAN_TEST_DATABASE_MODE?.trim() || "single", "AKAN_TEST_DATABASE_MODE");
  }

  async #applyDatabaseMode() {
    process.env.AKAN_DATABASE_MODE = this.#mode;
    resetEnvCache();
    if (this.#mode === "single") return;
    const redisUrl = ConformanceEnv.url("redis");
    const postgresUrl = ConformanceEnv.url("postgres");
    const missing = [
      ...(redisUrl ? [] : ["AKAN_TEST_REDIS_URL"]),
      ...(this.#mode === "cluster" && !postgresUrl ? ["AKAN_TEST_POSTGRES_URL"] : []),
    ];
    if (!redisUrl || missing.length)
      throw new Error(
        `AKAN_TEST_DATABASE_MODE=${this.#mode} needs ${missing.join(" and ")}; \`bun run testConformance --keep\` starts both`,
      );
    // One logical Redis database per worker, emptied first. Pub/sub channels are not per database and every worker
    // runs the same app, so a room two workers both joined would hear the other's events.
    const redis = new URL(redisUrl);
    redis.pathname = `/${this.workerId % 16}`;
    process.env.REDIS_URI = redis.toString();
    const { Redis } = await import("ioredis");
    const client = new Redis(redis.toString(), { lazyConnect: true });
    await client.connect();
    await client.flushdb();
    client.disconnect();
    if (this.#mode === "multiple") return;
    const { url, insightUrl, drop } = await ConformanceEnv.postgresSchema(`akan_test_w${this.workerId}`, {
      insight: true,
    });
    this.#env.database = { ...this.#env.database, postgres: { url, insightUrl } };
    this.#dropSchema = drop;
  }
  #rememberProcessEnv() {
    this.#previousEnv.clear();
    TEST_ENV_KEYS.forEach((key) => {
      this.#previousEnv.set(key, process.env[key]);
    });
  }
  #restoreProcessEnv() {
    this.#previousEnv.forEach((value, key) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
    this.#previousEnv.clear();
    resetEnvCache();
  }
  async #makeDatabaseFiles() {
    if (this.#storage === "memory") return { databaseFilePath: ":memory:", solidFilePath: ":memory:" };
    this.#tempDir = await mkdtemp(join(tmpdir(), `akan-${this.#env.appName}-${this.workerId}-`));
    return {
      databaseFilePath: join(this.#tempDir, `${this.#env.appName}.db`),
      solidFilePath: join(this.#tempDir, `${this.#env.appName}.solid.db`),
    };
  }
}
