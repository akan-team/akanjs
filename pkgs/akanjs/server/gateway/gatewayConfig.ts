import path from "node:path";
import type { AkanChildRole, AkanUpstream } from "akanjs/service";
import { getApiPrefix, getWsPrefix, normalizeRoutePrefix } from "../../base/baseEnv";
import type { RestartPolicy } from "../../common/restartSchedule";
import { resolveRuntimeDir } from "../lifecycle/runtimeDir";
import { getWebConfigFromEnv } from "../types";

export interface AkanAppOptions {
  replica?: number | string;
  serverPath?: string;
  runtimeDir?: string;
  port?: number;
  wsBasePort?: number;
  openapi?: boolean;
  /** Signal endpoint mount, `/api` by default; handed down as `AKAN_API_PREFIX` (CSR/mobile follow akan.config.ts). */
  prefix?: string;
  /** Where the websocket upgrade sits under `prefix`, `/ws` by default. Handed down as `AKAN_WS_PREFIX`. */
  websocketPrefix?: string;
  /** Boot only these modules and what they reach; omitted or empty mounts every enabled one. `AKAN_MODULES`. */
  modules?: string[];
  /** Mount all but these and whatever reaches them, applied after `modules`. `AKAN_DISABLE_MODULES`. */
  disableModules?: string[];
  /** Like `disableModules`, by owning lib. `AKAN_DISABLE_LIBS`. */
  disableLibs?: string[];
  /** In-process replica; default on for one env-set traffic replica, off if `replica` is passed or AKAN_SOLO=false. */
  solo?: boolean;
}

interface AkanReplicaConfig {
  federation: number;
  batch: number;
  all: number;
  total: number;
  value: string;
}

export interface GatewayUpstream {
  http: Extract<AkanUpstream, { type: "unix" }>;
  ws?: Extract<AkanUpstream, { type: "tcp" }>;
}

export class GatewayConfig {
  static readonly devMaxChildBootFailures = 3;

  readonly devHosted = process.env.AKAN_COMMAND_TYPE === "start";
  readonly childRestartPolicy: RestartPolicy = {
    min: 1_000,
    max: 30_000,
    ...(this.devHosted ? { maxAttempts: GatewayConfig.devMaxChildBootFailures - 1 } : {}),
  };
  readonly healthTimeoutMs = GatewayConfig.#parseHealthTimeoutMs();
  readonly upstreamWaitMs = GatewayConfig.#parseUpstreamWaitMs();
  /** Child stderr is mostly bundler/runtime noise, kept to the log file; with none it may be a crash's only trace. */
  readonly printChildStderr = process.env.AKAN_CHILD_STDERR === "1";
  readonly serverPath: string;
  readonly artifactDir: string;
  readonly replica: AkanReplicaConfig;
  readonly runtimeDir: string;
  readonly socketRunId = `${process.pid}-${Date.now().toString(36)}`;
  readonly port: number;
  readonly wsBasePort: number;
  readonly openapi?: boolean;
  readonly prefix: string;
  readonly websocketPrefix: string;
  readonly web = getWebConfigFromEnv();
  readonly modules: string[];
  readonly disableModules: string[];
  readonly disableLibs: string[];
  readonly solo: boolean;

  constructor(serverPath: string, options: AkanAppOptions) {
    this.serverPath = GatewayConfig.#resolveServerPath(options.serverPath ?? serverPath);
    this.artifactDir = path.resolve(path.dirname(this.serverPath), ".akan", "artifact");
    this.replica = GatewayConfig.#parseReplicaConfig(options.replica);
    this.runtimeDir = resolveRuntimeDir(options.runtimeDir);
    this.port = Number(options.port ?? process.env.PORT ?? 8282);
    this.wsBasePort = Number(options.wsBasePort ?? process.env.AKAN_WS_BASE_PORT ?? this.port + 10_000);
    this.openapi = options.openapi;
    this.prefix = normalizeRoutePrefix(options.prefix) ?? getApiPrefix();
    this.websocketPrefix = normalizeRoutePrefix(options.websocketPrefix) ?? getWsPrefix();
    this.modules = options.modules ?? [];
    this.disableModules = options.disableModules ?? [];
    this.disableLibs = options.disableLibs ?? [];
    this.solo = GatewayConfig.#resolveSolo(options, this.replica);
  }

  // Batch-only never listens (the gateway answers health); `akan start` needs the gateway as builder relay and port holder.
  static #resolveSolo(options: AkanAppOptions, replica: AkanReplicaConfig) {
    if (options.solo !== undefined) return options.solo;
    if (process.env.AKAN_SOLO === "false" || process.env.AKAN_SOLO === "0") return false;
    if (process.env.AKAN_COMMAND_TYPE === "start") return false;
    if (options.replica !== undefined) return false;
    return replica.total === 1 && replica.batch === 0;
  }

  static #resolveServerPath(serverPath: string) {
    const baseDir = path.dirname(Bun.main);
    const resolved = path.isAbsolute(serverPath) ? serverPath : path.resolve(baseDir, serverPath);
    if (path.extname(resolved)) return resolved;
    return Bun.main.endsWith(".js") ? `${resolved}.js` : `${resolved}.ts`;
  }

  static #parseReplicaConfig(value?: number | string): AkanReplicaConfig {
    const configured = value ?? process.env.AKAN_REPLICA;
    const raw = String(configured ?? "0,0,1").trim();
    const [federationRaw, batchRaw, allRaw] = raw.split(",");
    const federation = GatewayConfig.#parseReplicaCount(federationRaw, 0);
    const batch = GatewayConfig.#parseReplicaCount(batchRaw, 0);
    const all = GatewayConfig.#parseReplicaCount(allRaw, configured == null ? 1 : 0);
    const normalizedAll = federation + batch + all > 0 ? all : 1;
    return {
      federation,
      batch,
      all: normalizedAll,
      total: federation + batch + normalizedAll,
      value: `${federation},${batch},${normalizedAll}`,
    };
  }

  static #parseReplicaCount(value: string | undefined, fallback: number) {
    const parsed = Number.parseInt(value ?? "", 10);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : fallback;
  }

  // The command outranks NODE_ENV: a dev child told `production` expects the manifest only `akan build` writes.
  static #defaultChildNodeEnv() {
    if (process.env.AKAN_COMMAND_TYPE === "start") return "development";
    if (process.env.AKAN_COMMAND_TYPE === "build") return "production";
    if (process.env.NODE_ENV) return process.env.NODE_ENV;
    return Bun.main.endsWith(".js") ? "production" : "development";
  }

  // Dev builds and first-touch transpiles stall a child's event loop well past the production pong budget.
  static #parseHealthTimeoutMs() {
    const configured = Number(process.env.AKAN_HEALTH_TIMEOUT_MS);
    if (Number.isFinite(configured) && configured > 0) return configured;
    return process.env.AKAN_COMMAND_TYPE === "start" ? 15_000 : 5_000;
  }

  static #parseUpstreamWaitMs() {
    const configured = Number(process.env.AKAN_UPSTREAM_WAIT_MS);
    if (Number.isFinite(configured) && configured >= 0) return configured;
    return process.env.AKAN_COMMAND_TYPE === "start" ? 15_000 : 5_000;
  }

  // Must exceed `AkanServer.#defaultShutdownTimeoutMs` so children exit on their own before the gateway stops waiting.
  static childShutdownWaitMs() {
    const configured = Number(process.env.AKAN_CHILD_SHUTDOWN_WAIT_MS);
    if (Number.isFinite(configured) && configured > 0) return configured;
    return process.env.AKAN_COMMAND_TYPE === "start" ? 5_000 : 30_000;
  }

  childEnv(idx: number, role: AkanChildRole) {
    return {
      PORT: String(this.port),
      NODE_ENV: GatewayConfig.#defaultChildNodeEnv(),
      AKAN_REPLICA: this.replica.value,
      AKAN_REPLICA_IDX: String(idx),
      AKAN_APP_DIR: path.dirname(this.serverPath),
      SERVER_MODE: role,
      AKAN_API_PREFIX: this.prefix,
      AKAN_WS_PREFIX: this.websocketPrefix,
      ...(this.openapi === undefined ? {} : { AKAN_OPENAPI: this.openapi ? "true" : "false" }),
      ...(this.modules.length ? { AKAN_MODULES: this.modules.join(",") } : {}),
      ...(this.disableModules.length ? { AKAN_DISABLE_MODULES: this.disableModules.join(",") } : {}),
      ...(this.disableLibs.length ? { AKAN_DISABLE_LIBS: this.disableLibs.join(",") } : {}),
    };
  }

  roleOf(idx: number): AkanChildRole {
    if (idx < this.replica.federation) return "federation";
    if (idx < this.replica.federation + this.replica.batch) return "batch";
    return "all";
  }

  childUpstreamOf(idx: number, role: AkanChildRole): GatewayUpstream {
    return {
      http: { type: "unix", socketPath: path.join(this.runtimeDir, `akan-child-${this.socketRunId}-${idx}.sock`) },
      ws: role === "batch" ? undefined : { type: "tcp", host: "127.0.0.1", port: this.wsBasePort + idx },
    };
  }

  isWebSocketPath(pathname: string) {
    return pathname === `${this.prefix}${this.websocketPrefix}` || pathname === "/_akan/hmr";
  }
}
