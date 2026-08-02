import path from "node:path";
import { Logger } from "akanjs/common";
import type { BuilderMessage } from "akanjs/server";
import { MemoryLimit } from "akanjs/server/memoryLimit";
import type { App } from "../commandDecorators";

const builderMsgTypeSet = new Set<BuilderMessage["type"]>([
  "build-route-res",
  "build-csr-res",
  "builder-ready",
  "invalidate",
  "css-updated",
  "pages-updated",
  "build-status",
  "builder-metrics",
]);
interface IncrementalBuilderHostOptions {
  app: App;
  entry: string;
  env: Record<string, string>;
  onMessage: (message: BuilderMessage) => void;
}

/**
 * `recycling` is the drain: the builder is still alive and still holds the work it accepted, but it
 * refuses anything new. Saying so here is what lets the host hold those requests for the replacement
 * instead of handing the developer the refusal.
 */
export type IncrementalBuilderStatus = "starting" | "ready" | "recycling" | "restarting" | "stopped";

interface IncrementalBuilderStartOptions {
  onExit?: () => void;
  onReady?: () => void;
  onRestartReady?: () => void;
  /**
   * The builder is gone and a replacement is on its way. Distinct from `onExit`, which reports the
   * builder giving up: this one says the dev server is temporarily without a watcher.
   */
  onAway?: () => void;
  /**
   * Ask the builder to re-announce the artifact it boots with. Needed whenever a *previous* builder's
   * artifact may still be live in a running backend — after an rss recycle, and after an idle wake.
   */
  announceBootState?: boolean;
}

export class IncrementalBuilderHost {
  static readonly #restartBaseDelayMs = 1_000;
  static readonly #restartMaxDelayMs = 30_000;
  /**
   * A builder that has stopped answering has to be replaced anyway; killing it after this long turns
   * a wedged drain into an ordinary restart instead of leaving the recycle stuck forever.
   */
  static readonly #recycleDrainTimeoutMs = 30_000;
  /**
   * Dev has no memory limit to derive a fraction from, so this is what bounds the builder there. Well
   * above a fresh boot (~300-600MB depending on app size) with room for one full rebuild on top.
   */
  static readonly #devMaxRssBytes = 1_200 * 1024 * 1024;
  logger = new Logger("IncrementalBuilderHost");
  entry: string;
  env: Record<string, string>;
  app: App;
  ready = false;
  readonly #onMessage: (message: BuilderMessage) => void;
  #proc: Bun.Subprocess<"ignore", "inherit", "inherit"> | null = null;
  #status: IncrementalBuilderStatus = "stopped";
  #restartAttempts = 0;
  #restartTimer: ReturnType<typeof setTimeout> | null = null;
  #recycleTimer: ReturnType<typeof setTimeout> | null = null;
  #recycleRequested: boolean = false;
  #spawnAfterRecycle: boolean = false;
  #manualStop = false;
  /**
   * Requests handed to the running builder that it has not answered yet, keyed by the backend's
   * correlation id.
   *
   * Nothing else answers a request whose builder exits while holding it: the builder only refuses
   * requests that arrive *after* it starts shutting down, a kill or crash sends nothing at all, and even
   * a clean drain races its own `process.exit`. The builder exits routinely — it is recycled whenever its
   * RSS passes the ceiling — so a page request that happened to be mid route-build left the backend's
   * promise pending and the browser tab spinning with no error and nothing to retry.
   */
  readonly #inFlight = new Map<number, "build-route" | "build-csr">();
  #startOptions: IncrementalBuilderStartOptions = {};
  constructor({ app, entry, env, onMessage }: IncrementalBuilderHostOptions) {
    this.app = app;
    this.entry = entry;
    this.env = env;
    this.#onMessage = onMessage;
  }
  get status() {
    return this.#status;
  }
  /**
   * The running builder's pid, so the host can read its RSS from the OS between builds. The builder
   * only reports its own metrics at work-completion points, which is the *peak*; on a platform that
   * returns bundler arenas to the OS while idle, that sample goes stale within seconds.
   */
  get pid(): number | null {
    return this.#proc?.pid ?? null;
  }
  start(options: IncrementalBuilderStartOptions = {}) {
    if (this.#proc) this.stop();
    this.#manualStop = false;
    this.#startOptions = options;
    this.#spawnAfterRecycle = options.announceBootState ?? false;
    this.#spawn(false);
    return this;
  }
  #spawn(isRestart: boolean) {
    this.#status = isRestart ? "restarting" : "starting";
    this.ready = false;
    // A fresh builder rebuilds every artifact while the running backend still holds the previous one;
    // the flag is what tells it to re-announce what it booted with.
    const afterRecycle = this.#spawnAfterRecycle;
    this.#spawnAfterRecycle = false;
    let proc!: Bun.Subprocess<"ignore", "inherit", "inherit">;
    proc = Bun.spawn(["bun", this.entry], {
      cwd: this.app.cwdPath,
      env: { ...this.env, AKAN_WATCH: "1", ...(afterRecycle ? { AKAN_BUILDER_ANNOUNCE_BOOT: "1" } : {}) },
      stdio: ["ignore", "inherit", "inherit"],
      ipc: (msg: BuilderMessage) => {
        if (this.#proc !== proc) return;
        if (!msg || typeof msg !== "object") return;
        if (msg.type === "build-route-res" || msg.type === "build-csr-res") this.#inFlight.delete(msg.id);
        if (builderMsgTypeSet.has(msg.type)) this.#onMessage(msg);
        if (msg.type === "builder-ready" && !this.ready) {
          this.ready = true;
          this.#status = "ready";
          this.#restartAttempts = 0;
          if (isRestart) this.#startOptions.onRestartReady?.();
          else this.#startOptions.onReady?.();
        }
      },
      serialization: "advanced",
      onExit: () => {
        if (this.#proc !== proc) return;
        this.#proc = null;
        const wasReady = this.ready;
        const wasRecycle = this.#recycleRequested;
        this.#clearRecycle();
        this.ready = false;
        this.#failInFlight(
          wasRecycle
            ? "builder exited to release bundler memory before answering; reload to retry"
            : "builder exited unexpectedly before answering; reload once it is back",
        );
        if (this.#manualStop || this.#status === "stopped") return;
        if (!wasReady) {
          this.#status = "stopped";
          this.#startOptions.onExit?.();
          return;
        }
        // Said once for both branches below, because both leave the tree unwatched until a replacement
        // has primed its own index — and an edit that lands in that window is reported by nobody.
        this.#startOptions.onAway?.();
        // A recycle is a planned exit, so it neither counts as a failed attempt nor waits out the
        // crash backoff — the dev server is without a watcher until the replacement is up.
        if (wasRecycle) {
          this.logger.verbose("builder exited for a recycle; spawning its replacement now");
          this.#spawnAfterRecycle = true;
          this.#spawn(true);
          return;
        }
        this.#scheduleRestart();
      },
    });
    this.#proc = proc;
    this.logger.verbose(`builder spawned pid=${proc.pid} entry=${this.entry}${isRestart ? " restart=1" : ""}`);
  }
  #scheduleRestart() {
    if (this.#manualStop || this.#restartTimer) return;
    this.#status = "restarting";
    const attempt = this.#restartAttempts;
    const delay = Math.min(
      IncrementalBuilderHost.#restartBaseDelayMs * 2 ** attempt,
      IncrementalBuilderHost.#restartMaxDelayMs,
    );
    this.#restartAttempts = attempt + 1;
    this.logger.warn(`builder exited after ready; restarting in ${delay}ms (attempt ${this.#restartAttempts})`);
    this.#restartTimer = setTimeout(() => {
      this.#restartTimer = null;
      if (this.#manualStop) return;
      this.#spawn(true);
    }, delay);
  }
  /**
   * Ask the builder to drain its queues and exit so the OS reclaims the bundler arenas `Bun.build`
   * never gives back; `onExit` then spawns the replacement. Graceful rather than `kill()` so a rebuild
   * in flight is never truncated, with a watchdog for a builder that stops answering.
   */
  recycle(reason: string): boolean {
    if (!this.#proc || this.#status !== "ready" || this.#recycleRequested) return false;
    const proc = this.#proc;
    if (!this.send({ type: "builder-shutdown", reason })) return false;
    this.#recycleRequested = true;
    // From here the builder answers nothing new — it refuses every request that arrives during the
    // drain. Leaving the status at `ready` is what used to let those requests through to be refused,
    // one at a time, into the dev error page a recycle is supposed to be invisible to. `ready` the
    // field is deliberately untouched: `onExit` reads it to tell a planned exit from a boot failure.
    this.#status = "recycling";
    this.logger.info(`recycling builder pid=${proc.pid} (${reason})`);
    this.#recycleTimer = setTimeout(() => {
      this.#recycleTimer = null;
      if (this.#proc !== proc) return;
      this.logger.warn(
        `builder pid=${proc.pid} did not exit within ${IncrementalBuilderHost.#recycleDrainTimeoutMs}ms of the recycle request; killing it`,
      );
      proc.kill();
    }, IncrementalBuilderHost.#recycleDrainTimeoutMs);
    return true;
  }
  #clearRecycle() {
    this.#recycleRequested = false;
    if (!this.#recycleTimer) return;
    clearTimeout(this.#recycleTimer);
    this.#recycleTimer = null;
  }
  /**
   * RSS at which the builder is recycled: an explicit override, else a share of the container's limit
   * (the builder is one of several dev processes), else the dev default. Set
   * `AKAN_BUILDER_MAX_RSS_MB=0` to leave it unbounded.
   */
  static maxRssBytes(): number | null {
    if (process.env.AKAN_BUILDER_MAX_RSS_MB === "0") return null;
    return MemoryLimit.resolveMaxRssBytes({
      megabytesEnv: "AKAN_BUILDER_MAX_RSS_MB",
      bytesEnv: "AKAN_BUILDER_MAX_RSS",
      limitFraction: 0.35,
      fallbackBytes: IncrementalBuilderHost.#devMaxRssBytes,
    });
  }
  send(message: BuilderMessage): boolean {
    if (!this.#proc || this.#status !== "ready") {
      // A builder on its way back is routine and the host holds what it refuses here, so only the
      // states nothing is recovering from are worth a warning.
      if (this.#status === "recycling" || this.#status === "restarting")
        this.logger.verbose(`incrementalBuilderHost is ${this.#status}; ${message.type} is for the replacement`);
      else this.logger.warn(`incrementalBuilderHost is ${this.#status}; cannot send ${message.type}`);
      return false;
    }
    try {
      this.#proc.send(message);
      if (message.type === "build-route" || message.type === "build-csr") this.#inFlight.set(message.id, message.type);
      return true;
    } catch (error) {
      this.logger.warn(
        `failed to send ${message.type} to builder: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }
  /**
   * Answer every request the departing builder still owed, as if it had failed them itself. `onExit`
   * cannot do this alone: `stop()` clears `#proc` first, so the exit callback bails on its identity check.
   */
  #failInFlight(reason: string): void {
    if (!this.#inFlight.size) return;
    const lost = [...this.#inFlight];
    this.#inFlight.clear();
    this.logger.warn(`failing ${lost.length} unanswered builder request(s): ${reason}`);
    for (const [id, type] of lost) {
      if (type === "build-route") this.#onMessage({ type: "build-route-res", id, ok: false, error: reason });
      else this.#onMessage({ type: "build-csr-res", id, ok: false, error: reason });
    }
  }
  stop() {
    this.#manualStop = true;
    this.#clearRecycle();
    this.#failInFlight("builder was stopped before answering");
    if (this.#restartTimer) {
      clearTimeout(this.#restartTimer);
      this.#restartTimer = null;
    }
    if (this.#proc) this.#proc.kill();
    this.#proc = null;
    this.ready = false;
    this.#status = "stopped";
  }
  static async create(app: App, env: Record<string, string>, onMessage: (message: BuilderMessage) => void) {
    const candidates = [
      path.join(app.workspace.workspaceRoot, "pkgs/@akanjs/devkit/incrementalBuilder/incrementalBuilder.proc.ts"),
      path.join(
        app.workspace.workspaceRoot,
        "node_modules/@akanjs/devkit/incrementalBuilder/incrementalBuilder.proc.ts",
      ),
      path.join(import.meta.dir, "incrementalBuilder.proc.js"),
      path.join(import.meta.dir, "incrementalBuilder.proc.ts"),
    ];
    for (const c of candidates)
      if (await Bun.file(c).exists()) return new IncrementalBuilderHost({ app, entry: c, env, onMessage });
    throw new Error(`[cli] frontend builder entry not found; looked in: ${candidates.join(", ")}`);
  }
}
