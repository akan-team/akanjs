import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BackendEnv } from "akanjs/base";
import { Logger, sleep } from "akanjs/common";
import { type AkanLib, AkanServer } from "akanjs/server";

const MAX_RETRY = 5;
const TEST_LISTEN_PORT_BASE = 38080;
const MIN_ACTIVATION_TIME = 0;
const MAX_ACTIVATION_TIME = 30000;

type TestDatabaseMode = "memory" | "tempFile";

export interface TestServerOptions {
  workerId?: number;
  port?: number;
  databaseMode?: TestDatabaseMode;
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
  readonly #env: BackendEnv;
  readonly #databaseMode: TestDatabaseMode;
  readonly #serverMode: "federation" | "batch" | "all";
  readonly #listen: boolean;
  readonly #web: boolean;
  readonly #port: number;
  readonly #previousEnv = new Map<(typeof TEST_ENV_KEYS)[number], string | undefined>();
  workerId: number;
  #startAt = Date.now();
  #server?: AkanServer;
  #tempDir?: string;
  static initClient(env: BackendEnv, workerId?: number) {
    TestServer.applyProcessEnv(env, {
      workerId,
      port: TEST_LISTEN_PORT_BASE + resolveWorkerId(workerId),
      serverMode: "all",
    });
  }
  static applyProcessEnv(
    env: BackendEnv,
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
  constructor(env: BackendEnv, libs: AkanLib | AkanLib[], options: TestServerOptions = {}) {
    this.workerId = resolveWorkerId(options.workerId);
    this.#port = options.port ?? TEST_LISTEN_PORT_BASE + this.workerId;
    this.#env = { ...env };
    this.#libs = Array.isArray(libs) ? libs : [libs];
    this.#databaseMode = options.databaseMode ?? "memory";
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
    this.#logger.log(`Test System #${this.workerId} Initializing...`);
    this.#rememberProcessEnv();
    TestServer.applyProcessEnv(this.#env, { workerId: this.workerId, port: this.#port, serverMode: this.#serverMode });
    const { databaseFilePath, solidFilePath } = await this.#makeDatabaseFiles();
    this.#env.port = this.#port;
    this.#env.database = {
      driver: "sqlite",
      sqlite: {
        filePath: databaseFilePath,
        journalMode: this.#databaseMode === "memory" ? "MEMORY" : "WAL",
        synchronous: this.#databaseMode === "memory" ? "OFF" : "NORMAL",
        foreignKeys: true,
      },
    };
    this.#env.solid = {
      filePath: solidFilePath,
      journalMode: this.#databaseMode === "memory" ? "MEMORY" : "WAL",
      synchronous: this.#databaseMode === "memory" ? "OFF" : "NORMAL",
      cleanupIntervalMs: 60_000,
      queuePollIntervalMs: 60_000,
      queueLeaseMs: 30_000,
    };
    this.#env.onCleanup = async () => {
      await this.cleanup();
    };
    this.#server = new AkanServer(this.#env.appName, this.#env, this.#serverMode, ...this.#libs);
    await this.#server.start({ listen: this.#listen, web: this.#web });
    this.#logger.log(`Test System #${this.workerId} Initialized, SQLite: ${this.#databaseMode}`);
    this.#startAt = Date.now();
    this.#logger.log(`Test System #${this.workerId} Activation Time: ${this.#startAt - now}ms`);
  }
  async cleanup() {
    this.#logger.log("SQLite test database cleanup is handled by server termination.");
  }
  async terminate() {
    const now = Date.now();
    const elapsed = now - this.#startAt;
    await sleep(50); // cooldown
    await this.#server?.stop();
    this.#server = undefined;
    if (this.#tempDir) {
      await rm(this.#tempDir, { recursive: true, force: true });
      this.#tempDir = undefined;
    }
    this.#restoreProcessEnv();
    if (elapsed < MIN_ACTIVATION_TIME) {
      this.#logger.log(`waiting for ${MIN_ACTIVATION_TIME - elapsed}`);
      await sleep(MIN_ACTIVATION_TIME - elapsed);
    }
    this.#logger.log(`System Terminated in ${Date.now() - now}ms`);
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
  }
  async #makeDatabaseFiles() {
    if (this.#databaseMode === "memory") return { databaseFilePath: ":memory:", solidFilePath: ":memory:" };
    this.#tempDir = await mkdtemp(join(tmpdir(), `akan-${this.#env.appName}-${this.workerId}-`));
    return {
      databaseFilePath: join(this.#tempDir, `${this.#env.appName}.db`),
      solidFilePath: join(this.#tempDir, `${this.#env.appName}.solid.db`),
    };
  }
}
