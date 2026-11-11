import { Logger } from "akanjs/common";
import type { BuilderMessage } from "akanjs/server";
import type { App } from "../commandDecorators";
import { createTunnel } from "../createTunnel";
import { WorkspaceExecutor } from "../executors";
import type { DevStdioMode } from "../incrementalBuilder";
import { BackendImportGraph } from "./BackendImportGraph";
import { BuilderGap } from "./builderGap";
import { BuilderRequestRelay } from "./builderRequestRelay";
import { BuilderRssRecycler } from "./builderRssRecycler";
import { DevBackend } from "./devBackend";
import { DevBootLatch } from "./devBootLatch";
import { DevBuilder } from "./devBuilder";
import { DevBuildStatusBoard } from "./devBuildStatusBoard";
import {
  type DevHostEvent,
  type DevHostState,
  devHostStateOf,
  redisTunnelPolicy,
  UNAVAILABLE_REDIS_HOST,
} from "./devHostPolicy";
import { DevIdleSuspend } from "./devIdleSuspend";
import { DevRecycler } from "./devRecycler";
import { ProcessRss } from "./processRss";

export class AkanAppHost {
  readonly logger = new Logger("AkanAppHost");
  readonly stdio: DevStdioMode;
  readonly env: Record<string, string>;
  readonly #onDevEvent: ((event: DevHostEvent) => void) | null;
  #lastDevState: DevHostState | null = null;
  readonly #bootLatch = new DevBootLatch(() => this.#onDevEvent?.({ app: this.app.name, booted: true }));
  #stopping = false;
  #builderMessageQueue: Promise<void> = Promise.resolve();
  readonly #backendGraph: BackendImportGraph;
  readonly #statuses: DevBuildStatusBoard;
  readonly #backend: DevBackend;
  readonly #gap: BuilderGap;
  readonly #requests: BuilderRequestRelay;
  readonly #rss: BuilderRssRecycler;
  readonly #builder: DevBuilder;
  readonly #idle: DevIdleSuspend;
  readonly #recycler: DevRecycler;
  constructor(
    private readonly app: App,
    {
      env,
      stdio = "inherit",
      onDevEvent,
    }: { env: Record<string, string>; stdio?: DevStdioMode; onDevEvent?: (event: DevHostEvent) => void },
  ) {
    this.env = env;
    this.stdio = stdio;
    this.#onDevEvent = onDevEvent ?? null;
    this.#backendGraph = new BackendImportGraph(app, this.logger);
    const { logger } = this;
    const graph = this.#backendGraph;
    const isStopping = () => this.#stopping;
    const statuses = new DevBuildStatusBoard(logger);
    this.#statuses = statuses;
    this.#backend = new DevBackend(
      app,
      { env, stdio, logger, statuses, graph },
      {
        isStopping,
        emit: (state, detail) => this.#emitDevEvent(state, detail),
        beforeSpawn: () => {
          // Before the spawn: the new backend numbers its requests from 1 again, so old answers must not reach it.
          this.#requests.startGeneration();
          this.#requests.discard("the backend restarted while the builder was away");
        },
        toBuilder: (message) => this.#requests.send(message),
      },
    );
    this.#gap = new BuilderGap({ graph, backend: this.#backend, logger });
    this.#requests = new BuilderRequestRelay(
      { logger, env },
      {
        builder: () => this.#builder.current,
        toBackend: (message) => this.#backend.send(message),
        markActivity: () => this.#idle.markActivity(),
        away: () => this.#idle.away,
        wake: (reason) => void this.#idle.wake(reason),
      },
    );
    this.#rss = new BuilderRssRecycler(
      { logger, statuses },
      {
        builder: () => this.#builder.current,
        away: () => this.#idle.away,
        restartQueued: () => this.#recycler.pending || this.#backend.restartScheduled,
        onRecycle: () => this.#gap.open("builder recycle"),
      },
    );
    this.#builder = new DevBuilder(
      app,
      { env, stdio, logger },
      {
        isStopping,
        onMessage: (message) => this.#enqueueBuilderMessage(message),
        onAway: () => this.#gap.open("builder replacement"),
        onReady: () => this.#requests.flush(),
        onRestartReady: () => {
          this.logger.verbose("[builder-recovery] builder ready after restart; replaying latest state");
          this.#backend.replay();
          this.#requests.flush();
          void this.#gap.restartBackendForChanges();
          void this.#rss.checkRecycledFloor();
        },
        onStartFailed: () => this.#requests.fail("builder failed to start"),
        onStop: () => this.#rss.cancel(),
        onRecovered: (reason) => this.#recycler.builderRecovered(reason),
      },
    );
    this.#idle = new DevIdleSuspend(
      app,
      { logger },
      {
        readiness: () => ({
          builderReady: this.#builder.current?.status === "ready",
          backendReady: this.#backend.ready,
          buildFailed: this.#statuses.failing,
          restartPending: this.#restartPending,
        }),
        release: (detail) => {
          this.#emitDevEvent("suspended", detail);
          this.#builder.stop();
          this.#gap.open("idle suspend");
        },
        wake: (batch) => this.#recycler.applyIdleWake(batch),
        wakeFailed: (files) => this.#builder.scheduleRecovery({ files }),
        flushHeld: () => this.#requests.flush(),
        awake: () => this.#emitDevEvent(devHostStateOf(this.#backend.lifecycleState, this.#backend.gaveUp)),
      },
    );
    this.#recycler = new DevRecycler(app, {
      env,
      logger,
      isStopping,
      graph,
      statuses,
      backend: this.#backend,
      builder: this.#builder,
      gap: this.#gap,
      rss: this.#rss,
    });
  }
  #emitDevEvent(state: DevHostState, detail?: string) {
    if (!this.#onDevEvent || state === this.#lastDevState) return;
    this.#lastDevState = state;
    this.#onDevEvent({ app: this.app.name, state, ...(detail ? { detail } : {}) });
    if (state === "ready") this.#bootLatch.ready();
  }
  async start() {
    if (this.#backend.running) await this.#backend.stop();
    if (this.#builder.current) this.#builder.stop();
    const [redisHost] = await Promise.all([
      this.#prepareDatabase("redis"),
      this.#backendGraph.refresh(),
      this.#builder.start(),
    ]);
    Object.assign(this.env, { REDIS_HOST: redisHost });
    this.#backend.start();
    this.#idle.arm();
    return this;
  }
  async stop() {
    //? Nothing reapplies once it stops: a pages ok received meanwhile would bring children back after it.
    this.#stopping = true;
    this.#recycler.drop();
    this.#idle.cancel();
    this.#idle.stopWatcher();
    this.#backend.cancelTimers();
    this.#builder.cancelRecovery();
    //? A stopped builder sends no exit: a start waiting for its ready would sit out the ready timeout, then retry.
    this.#builder.abandonStart(new Error("dev server stopped before the builder was ready"));
    this.#backend.dropPendingRestart();
    // Before the backend goes away, while it can still receive the answer.
    this.#requests.fail("dev server is shutting down");
    await this.#backend.restarting;
    await this.#backend.stop();
    this.#builder.stop();
    return this;
  }
  kill() {
    void this.stop();
  }

  async #prepareDatabase(type: "redis") {
    const environment = WorkspaceExecutor.getBaseDevEnv().env;
    const policy = redisTunnelPolicy({ environment, databaseMode: this.env.AKAN_DATABASE_MODE });
    if (policy === "none") return "localhost";
    if (policy === "required") return await createTunnel(type, { app: this.app, environment });
    try {
      return await createTunnel(type, { app: this.app, environment });
    } catch (error) {
      this.logger.warn(
        `${error instanceof Error ? error.message : String(error)} - continuing without Redis: the single database mode does not use it unless an app adaptor does`,
      );
      return UNAVAILABLE_REDIS_HOST;
    }
  }
  #enqueueBuilderMessage(message: BuilderMessage) {
    this.#builderMessageQueue = this.#builderMessageQueue
      .then(() => this.#handleBuilderMessage(message))
      .catch((err) => {
        this.logger.warn(`failed to handle builder message: ${err instanceof Error ? err.message : String(err)}`);
      });
  }
  async #handleBuilderMessage(message: BuilderMessage) {
    if (this.#stopping) return;
    this.#idle.markActivity();
    this.#builder.trackGeneration(message);
    if (message.type === "build-status") {
      this.#statuses.record(message.data);
      this.#backend.sendOrQueueStatus(message.data);
      this.#backend.reviveAfterGreenBuild(message.data);
      await this.#recycler.resumeFailed(message.data);
      return;
    }
    if (message.type === "builder-metrics") {
      this.#rss.handleMetrics(message.data);
      return;
    }
    if (message.type === "boot-armed") {
      this.logger.verbose("[builder] boot builds settled");
      this.#bootLatch.armed();
      return;
    }
    if (message.type === "pages-updated" || message.type === "css-updated") {
      const recycled = message.data.reason === "builder-recycle";
      if (recycled && !this.#statuses.shouldRelayRecycled(message)) return;
      this.#statuses.recordLastGood(message, { supersede: recycled });
    }
    if (message.type === "invalidate") {
      await this.#recycler.handleInvalidate(message);
      return;
    }
    if (message.type === "build-route-res" || message.type === "build-csr-res" || message.type === "build-graph-res") {
      const answer = this.#requests.settle(message);
      if (!answer) {
        this.logger.verbose(`[builder] dropped a ${message.type} no live backend is waiting for (id=${message.id})`);
        return;
      }
      this.#backend.send(answer);
      return;
    }
    this.#backend.send(message);
  }
  get #restartPending(): boolean {
    return this.#recycler.pending || this.#backend.restartPending || this.#builder.recovering || this.#rss.armed;
  }
  /** Null when unreadable, meaning "no new information", never zero. */
  static async readProcessRssBytes(pid: number): Promise<number | null> {
    return await ProcessRss.bytesOf(pid);
  }
  /** `AKAN_DEV_IDLE_SUSPEND_MS=0` keeps the builder resident for the whole session. */
  static idleSuspendMs(): number | null {
    return DevIdleSuspend.idleMs();
  }
}
