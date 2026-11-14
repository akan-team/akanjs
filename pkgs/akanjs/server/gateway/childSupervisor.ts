import { mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { Logger } from "akanjs/common";
import type { AkanChildRole, AkanIpcMessage } from "akanjs/service";
import { RestartSchedule } from "../../common/restartSchedule";
import { CrossSiteGuard } from "../../signal/CrossSiteGuard";
import type { BuilderMessage } from "../artifact";
import { ChildOutputReader } from "../logging/childOutputReader";
import type { DevHostChannel } from "./devHostChannel";
import type { ChildState, GatewayChildren } from "./gatewayChildren";
import { GatewayConfig } from "./gatewayConfig";
import type { GatewayLogging } from "./gatewayLogging";
import type { GatewayRooms } from "./gatewayRooms";

type ChildMessageHandler = (
  idx: number,
  message: AkanIpcMessage | BuilderMessage,
  proc?: Bun.Subprocess<"ignore", "pipe", "pipe">,
) => void;

interface ChildSupervisorParts {
  config: GatewayConfig;
  children: GatewayChildren;
  rooms: GatewayRooms;
  logging: GatewayLogging;
  host: DevHostChannel;
  logger: Logger;
  onMessage: ChildMessageHandler;
}

export class ChildSupervisor {
  static readonly #childRestartGraceMs = 5_000;

  readonly #config: GatewayConfig;
  readonly #children: GatewayChildren;
  readonly #rooms: GatewayRooms;
  readonly #logging: GatewayLogging;
  readonly #host: DevHostChannel;
  readonly #logger: Logger;
  readonly #onMessage: ChildMessageHandler;

  constructor({ config, children, rooms, logging, host, logger, onMessage }: ChildSupervisorParts) {
    this.#config = config;
    this.#children = children;
    this.#rooms = rooms;
    this.#logging = logging;
    this.#host = host;
    this.#logger = logger;
    this.#onMessage = onMessage;
  }

  async prepareRuntimeDir() {
    await mkdir(this.#config.runtimeDir, { recursive: true });
    // Run-scoped socket names never conflict but never get reused either, so sweep every leftover.
    const entries = await readdir(this.#config.runtimeDir).catch(() => []);
    await Promise.all(
      entries
        .filter((name) => /^akan-(child-.*|control)\.sock$/.test(name))
        .map((name) => rm(path.join(this.#config.runtimeDir, name), { force: true }).catch(() => undefined)),
    );
  }

  spawn(idx: number) {
    const role = this.#config.roleOf(idx);
    const upstream = this.#config.childUpstreamOf(idx, role);
    //? Windows drops an ipc message sent right before `process.exit`; exit from its send callback.
    const childCode = `import(${JSON.stringify(path.resolve(this.#config.serverPath))}).then((mod)=>{ const server = mod.server ?? mod.app; if (!server?.start) throw new Error("server.ts must export server or app with start()"); return server.start({ listen: process.env.SERVER_MODE !== "batch" }); }).catch((error)=>{ const exit = () => process.exit(1); setTimeout(exit, 2000); if (!process.send) return exit(); process.send({ type: "error", message: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined, pid: process.pid }, undefined, undefined, exit); });`;
    const proc: Bun.Subprocess<"ignore", "pipe", "pipe"> = Bun.spawn(["bun", "-e", childCode], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        // PORT included: its loopback fetches (SSR, its RSC worker) come back through this gateway.
        ...this.#config.childEnv(idx, role),
        AKAN_CHILD_SOCKET: upstream.http.socketPath,
        AKAN_CHILD_WS_PORT: upstream.ws ? String(upstream.ws.port) : "",
        ...(this.#config.printChildStderr || Logger.isNdjson ? {} : { AKAN_CHILD_STDERR_HIDDEN: "1" }),
      },
      ipc: (message) => this.#onMessage(idx, message as AkanIpcMessage, proc),
      stdout: "pipe",
      stderr: "pipe",
      stdin: "ignore",
    });
    const previous = this.#children.get(idx);
    this.#children.set(idx, {
      idx,
      role,
      proc,
      ready: false,
      status: "starting",
      metrics: {},
      //? Carried across respawns so a replica's failures add up; only a fired restart respawns, so it is never pending.
      restart: previous?.restart ?? new RestartSchedule(this.#config.childRestartPolicy),
      restartCount: previous?.restartCount ?? 0,
      restartPending: false,
      lastExitCode: previous?.lastExitCode,
      lastRestartAt: previous?.lastRestartAt,
      lastRestartReason: previous?.lastRestartReason,
    });
    this.#children.invalidateFederation();
    const output = new ChildOutputReader({
      onLine: (line) => this.#logging.writeChildLine(idx, role, proc.pid, "stdout", line),
      onBlock: (lines) => this.#logging.writeChildStderrBlock(idx, role, proc.pid, lines),
    });
    void output.pipe(proc.stdout, "stdout");
    void output.pipe(proc.stderr, "stderr");
    proc.exited.then((code) => this.#handleChildExit(idx, proc, code));
  }

  #handleChildExit(idx: number, proc: Bun.Subprocess<"ignore", "pipe", "pipe">, code: number | null) {
    this.#host.dropChild(proc);
    const child = this.#children.get(idx);
    if (!child || child.proc !== proc) return;
    if (child.status === "crashed") return;
    child.status = "exited";
    child.lastExitCode = code;
    this.#children.invalidateFederation();
    this.#rooms.removeChildRooms(idx);
    if (this.#children.stopping) return;
    void this.scheduleRestart(child, proc, `exit:${code ?? "unknown"}`);
  }

  scheduleRestart(child: ChildState, proc: Bun.Subprocess<"ignore", "pipe", "pipe">, reason: string): void {
    if (this.#children.stopping) return;
    if (child.proc !== proc) return;
    if (child.restartPending || child.restart.pending) {
      child.lastRestartReason = reason;
      return;
    }
    if (child.restart.exhausted && !child.ready) {
      this.#markChildCrashed(child, reason);
      return;
    }

    child.restartPending = true;
    child.ready = false;
    child.status = reason === "health-timeout" || reason === "upstream-open-failed" ? "unhealthy" : "exited";
    child.upstream = undefined;
    child.wsUpstream = undefined;
    child.healthPath = undefined;
    this.#children.invalidateFederation();
    child.lastRestartReason = reason;
    child.lastRestartAt = Date.now();
    this.#rooms.removeChildRooms(child.idx);

    const delay = child.restart.next();
    child.restartCount += 1;
    this.#logger.error(
      `Child ${child.idx}/${child.role} failed (${reason}); restarting in ${delay}ms (attempt ${child.restart.attempts})`,
    );

    void this.#restartChildAfterDelay(child.idx, proc, reason, delay).catch((error) => {
      const current = this.#children.get(child.idx);
      if (!current || current.proc !== proc || this.#children.stopping) return;
      current.restartPending = false;
      this.#logger.error(
        `Failed to restart child ${child.idx}/${child.role}: ${error instanceof Error ? error.message : String(error)}`,
      );
      this.scheduleRestart(current, proc, "restart-failed");
    });
  }

  async #restartChildAfterDelay(
    idx: number,
    proc: Bun.Subprocess<"ignore", "pipe", "pipe">,
    reason: string,
    delay: number,
  ) {
    const child = this.#children.get(idx);
    if (!child || child.proc !== proc || this.#children.stopping) return;
    await this.#stopChildForRestart(child, proc, reason);
    if (this.#children.stopping) return;
    const current = this.#children.get(idx);
    if (!current || current.proc !== proc) return;
    current.restart.arm(delay, () => {
      void this.#respawnChild(idx, proc).catch((error) => {
        const latest = this.#children.get(idx);
        if (!latest || latest.proc !== proc || this.#children.stopping) return;
        latest.restartPending = false;
        this.#logger.error(
          `Failed to respawn child ${idx}/${latest.role}: ${error instanceof Error ? error.message : String(error)}`,
        );
        this.scheduleRestart(latest, proc, "respawn-failed");
      });
    });
  }

  async #respawnChild(idx: number, proc: Bun.Subprocess<"ignore", "pipe", "pipe">) {
    if (this.#children.stopping) return;
    const current = this.#children.get(idx);
    if (!current || current.proc !== proc) return;
    await this.#removeChildSocket(idx, current.role);
    if (this.#children.stopping) return;
    current.restartPending = false;
    this.spawn(idx);
  }

  // Dev-only terminal state, cleared when the dev host replaces this gateway on the next server-side edit.
  #markChildCrashed(child: ChildState, reason: string) {
    // The child's `error` IPC and its exit event both funnel here; report only once.
    if (child.status === "crashed") return;
    child.ready = false;
    child.status = "crashed";
    child.restartPending = false;
    child.upstream = undefined;
    child.wsUpstream = undefined;
    child.healthPath = undefined;
    child.lastRestartReason = reason;
    this.#children.invalidateFederation();
    this.#rooms.removeChildRooms(child.idx);
    const attempts = child.restart.attempts + 1;
    const detail = child.lastErrorMessage ?? reason;
    const message = `Backend replica ${child.idx}/${child.role} failed ${attempts} consecutive boots; waiting for a code change to retry: ${detail}`;
    this.#logger.error(`[child-crash-loop] ${message}`);
    this.#host.reportBackendBuildStatus({ ok: false, message });
  }

  async #stopChildForRestart(child: ChildState, proc: Bun.Subprocess<"ignore", "pipe", "pipe">, reason: string) {
    if (reason.startsWith("exit:") || proc.killed) return;
    this.#children.send(child, { type: "shutdown", signal: reason } satisfies AkanIpcMessage);
    const result = await Promise.race([
      proc.exited.then(() => "exited" as const).catch(() => "exited" as const),
      new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), ChildSupervisor.#childRestartGraceMs)),
    ]);
    if (result === "timeout" && !proc.killed) {
      this.#logger.warn(
        `Child ${child.idx}/${child.role} did not stop in ${ChildSupervisor.#childRestartGraceMs}ms; killing`,
      );
      proc.kill();
      await proc.exited.catch(() => undefined);
    }
  }

  async #removeChildSocket(idx: number, role: AkanChildRole) {
    const socketPath = this.#config.childUpstreamOf(idx, role).http.socketPath;
    try {
      await rm(socketPath, { force: true });
    } catch {
      // Best-effort cleanup for stale Unix sockets.
    }
  }

  markReady(idx: number, message: Extract<AkanIpcMessage, { type: "ready" }>) {
    const child = this.#children.get(idx);
    if (!child) return;
    child.ready = true;
    child.status = "ready";
    child.pid = message.pid;
    child.upstream = message.upstream;
    child.wsUpstream = message.wsUpstream;
    child.healthPath = message.healthPath;
    child.rscWorker = message.rscWorker;
    if (message.crossSite) CrossSiteGuard.configure(message.crossSite);
    child.lastPongAtMono = performance.now();
    child.restart.reset();
    // A child that (re)spawned after subscribers arrived has never heard the floor.
    const hub = this.#logging.hub;
    if (hub && hub.floor !== null) this.#children.send(child, { type: "log.level", minSev: hub.floor });
    child.restartPending = false;
    child.lastErrorMessage = undefined;
    this.#children.invalidateFederation();
    // Batch children serve no HTTP/HMR traffic, so they must not gate frontend readiness.
    const trafficChildren = [...this.#children.values()].filter((item) => item.role !== "batch");
    //? A gateway that lost its port stops only after its replicas exit, and one may boot in that wait.
    if (!this.#children.stopping && child.role !== "batch" && trafficChildren.every((item) => item.ready)) {
      process.send?.({ type: "backend-ready", pid: process.pid } satisfies BuilderMessage);
    }
    if ([...this.#children.values()].every((item) => item.ready)) {
      this.#logger.verbose(`All ${this.#children.size} child process(es) are ready`);
    }
  }

  markHealthy(idx: number, message: Extract<AkanIpcMessage, { type: "health.pong" }>) {
    const child = this.#children.get(idx);
    if (!child) return;
    child.status = "healthy";
    child.rscWorker = message.rscWorker;
    child.lastPongAtMono = performance.now();
    this.#children.invalidateFederation();
  }

  checkHealth() {
    const nowMono = performance.now();
    for (const child of this.#children.values()) {
      if (this.#children.isUnavailable(child)) continue;
      if (child.lastPongAtMono && nowMono - child.lastPongAtMono > this.#config.healthTimeoutMs) {
        child.status = "unhealthy";
        this.#children.invalidateFederation();
        void this.scheduleRestart(child, child.proc, "health-timeout");
        continue;
      }
      const sent = this.#children.send(child, {
        type: "health.ping",
        nonce: crypto.randomUUID(),
        sentAt: Date.now(),
      } satisfies AkanIpcMessage);
      if (!sent) {
        child.status = "unhealthy";
        this.#children.invalidateFederation();
        void this.scheduleRestart(child, child.proc, "health-send-failed");
      }
    }
  }

  crashLoopDetail(): string | null {
    if (!this.#config.devHosted) return null;
    const trafficChildren = [...this.#children.values()].filter((child) => child.role !== "batch");
    if (trafficChildren.length === 0) return null;
    if (!trafficChildren.every((child) => child.status === "crashed")) return null;
    return (
      trafficChildren.map((child) => child.lastErrorMessage ?? child.lastRestartReason).find(Boolean) ??
      "unknown boot error"
    );
  }

  async stopAll(signal: string) {
    for (const child of this.#children.values()) {
      child.restart.cancel();
      this.#children.send(child, { type: "shutdown", signal } satisfies AkanIpcMessage);
    }
    await Promise.race([
      Promise.all([...this.#children.values()].map((child) => child.proc.exited.catch(() => undefined))),
      new Promise((resolve) => setTimeout(resolve, GatewayConfig.childShutdownWaitMs())),
    ]);
    // Anything alive after the full budget is stuck or trapping SIGTERM, so escalate straight to SIGKILL.
    const stragglers = [...this.#children.values()].filter((child) => !child.proc.killed);
    for (const child of stragglers) child.proc.kill("SIGKILL");
    await Promise.all(stragglers.map((child) => child.proc.exited.catch(() => undefined)));
    this.#children.clear();
  }
}
