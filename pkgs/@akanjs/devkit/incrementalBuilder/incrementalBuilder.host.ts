import fs from "node:fs";
import path from "node:path";
import { Logger } from "akanjs/common";
import type { BuilderMessage } from "akanjs/server";
import { CSR_DEV_DIRNAME, CSR_DEV_PATCHING_MARKER, SSR_DEV_DIRNAME } from "akanjs/server/hmr/csrDevManifest";
import { MemoryLimit } from "akanjs/server/memoryLimit";
import type { App } from "../commandDecorators";

const builderMsgTypeSet = new Set<BuilderMessage["type"]>([
  "build-route-res",
  "build-csr-res",
  "builder-ready",
  "invalidate",
  "css-updated",
  "pages-updated",
  "csr-updated",
  "ssr-updated",
  "build-status",
  "builder-metrics",
  "boot-armed",
]);
/** Prefer `"pipe"` under a TUI: a Bun child that inherits the terminal restores its spawn-time termios on exit. */
export type DevStdioMode = "inherit" | "pipe";

interface IncrementalBuilderHostOptions {
  app: App;
  entry: string;
  env: Record<string, string>;
  stdio?: DevStdioMode;
  onMessage: (message: BuilderMessage) => void;
  /** Required with `stdio: "pipe"` (an undrained pipe blocks the builder); receives decoded chunks, not lines. */
  onOutput?: (kind: "stdout" | "stderr", text: string) => void;
  /** Carried over from the host this one replaces: a patcher a crash turned off stays off. */
  patcherOff?: boolean;
}

/** `recycling`: the builder finishes accepted work but refuses new requests; hold them for the replacement. */
export type IncrementalBuilderStatus = "starting" | "ready" | "recycling" | "restarting" | "stopped";

interface IncrementalBuilderStartOptions {
  onExit?: () => void;
  onReady?: () => void;
  onRestartReady?: () => void;
  /** The builder is gone and a replacement is coming (unwatched until then); `onExit` means it gave up. */
  onAway?: () => void;
  /** Re-announce the boot artifact, for when a previous builder's artifact may still be live in the backend. */
  announceBootState?: boolean;
}

export class IncrementalBuilderHost {
  static readonly #restartBaseDelayMs = 1_000;
  static readonly #restartMaxDelayMs = 30_000;
  static readonly #recycleDrainTimeoutMs = 30_000;
  // apps/akan's builder peaks near 950MB holding the SSR registry's patcher through a route build, and arming CSR adds
  // a second patcher: this recycles only a builder grown well past both.
  static readonly #devMaxRssBytes = 2_048 * 1024 * 1024;
  logger = new Logger("IncrementalBuilderHost");
  entry: string;
  env: Record<string, string>;
  app: App;
  ready = false;
  readonly #onMessage: (message: BuilderMessage) => void;
  readonly #stdio: DevStdioMode;
  readonly #onOutput: ((kind: "stdout" | "stderr", text: string) => void) | null;
  #proc: Bun.Subprocess<"ignore", "inherit" | "pipe", "inherit" | "pipe"> | null = null;
  #status: IncrementalBuilderStatus = "stopped";
  #restartAttempts = 0;
  #restartTimer: ReturnType<typeof setTimeout> | null = null;
  #recycleTimer: ReturnType<typeof setTimeout> | null = null;
  #recycleRequested: boolean = false;
  #spawnAfterRecycle: boolean = false;
  #patcherOff: boolean = false;
  #manualStop = false;
  // Nothing else answers a request whose builder exits holding it: a crash or kill sends nothing, and a drain races
  // its own exit, so an unanswered page request would spin forever.
  readonly #inFlight = new Map<number, "build-route" | "build-csr">();
  #startOptions: IncrementalBuilderStartOptions = {};
  constructor({
    app,
    entry,
    env,
    stdio = "inherit",
    onMessage,
    onOutput,
    patcherOff = false,
  }: IncrementalBuilderHostOptions) {
    this.app = app;
    this.entry = entry;
    this.env = env;
    this.#stdio = stdio;
    this.#onMessage = onMessage;
    this.#onOutput = onOutput ?? null;
    this.#patcherOff = patcherOff;
  }
  get status() {
    return this.#status;
  }
  get patcherOff(): boolean {
    return this.#patcherOff;
  }
  /** For reading RSS between builds: the builder's own metrics sample the post-work peak, stale once arenas return. */
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
    const afterRecycle = this.#spawnAfterRecycle;
    this.#spawnAfterRecycle = false;
    this.#checkPatchingMarker(isRestart && !afterRecycle);
    let proc!: Bun.Subprocess<"ignore", "inherit" | "pipe", "inherit" | "pipe">;
    proc = Bun.spawn(["bun", this.entry], {
      cwd: this.app.cwdPath,
      env: {
        ...this.env,
        AKAN_WATCH: "1",
        ...(afterRecycle ? { AKAN_BUILDER_ANNOUNCE_BOOT: "1" } : {}),
        ...(this.#patcherOff ? { AKAN_DEV_CSR_PATCHER: "off" } : {}),
      },
      stdio: ["ignore", this.#stdio, this.#stdio],
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
        // Both branches below leave the tree unwatched until the replacement primes its index.
        this.#startOptions.onAway?.();
        // A planned exit: no failed attempt, no crash backoff.
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
    // Re-attached per spawn, not once per host: a recycle or a crash-restart brings new pipes.
    if (this.#stdio === "pipe" && this.#onOutput) {
      void this.#drain(proc.stdout as unknown as ReadableStream<Uint8Array> | undefined, "stdout");
      void this.#drain(proc.stderr as unknown as ReadableStream<Uint8Array> | undefined, "stderr");
    }
    this.logger.verbose(`builder spawned pid=${proc.pid} entry=${this.entry}${isRestart ? " restart=1" : ""}`);
  }
  //? The resident builder patches the dev CSR bundle in its own process, so a bundler crash there takes the file watcher
  //? with it. A builder that died holding the marker hands every later CSR save to build workers for this session;
  //? a marker any other exit left behind (Ctrl-C mid-patch) is cleared so it cannot turn the patcher off next session.
  #checkPatchingMarker(afterCrash: boolean): void {
    const markers = [CSR_DEV_DIRNAME, SSR_DEV_DIRNAME]
      .map((dirName) => path.join(this.app.cwdPath, ".akan/artifact", dirName, CSR_DEV_PATCHING_MARKER))
      .filter((marker) => fs.existsSync(marker));
    if (markers.length === 0) return;
    if (afterCrash && !this.#patcherOff) {
      this.#patcherOff = true;
      this.logger.warn(
        "the builder died while patching a dev module registry; registry saves go to a build worker until the next config or metadata restart (AKAN_DEV_CSR_PATCHER=off)",
      );
    }
    for (const marker of markers) fs.rmSync(marker, { force: true });
  }

  async #drain(stream: ReadableStream<Uint8Array> | undefined | null, kind: "stdout" | "stderr") {
    if (!stream) return;
    const decoder = new TextDecoder();
    try {
      for await (const chunk of stream) {
        const text = decoder.decode(chunk, { stream: true });
        if (text) this.#onOutput?.(kind, text);
      }
    } catch {
      // The stream closes when the builder exits; nothing further to surface here.
    }
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
  /** Drain-and-exit rather than `kill()`, so no rebuild is truncated; false when the request was not sent. */
  recycle(reason: string): boolean {
    if (!this.#proc || this.#status !== "ready" || this.#recycleRequested) return false;
    const proc = this.#proc;
    if (!this.send({ type: "builder-shutdown", reason })) return false;
    this.#recycleRequested = true;
    // Not `ready`: the draining builder refuses new requests. The `ready` field stays, since `onExit` reads it to tell
    // a planned exit from a boot failure.
    this.#status = "recycling";
    this.logger.debug(`recycling builder pid=${proc.pid} (${reason})`);
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
  /** RSS that triggers a recycle; `null` (`AKAN_BUILDER_MAX_RSS_MB=0`) means unbounded. */
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
      // Recycling/restarting is routine (the caller holds the message), so only unrecoverable states warn.
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
  // Called from `stop()` too: it clears `#proc` first, so `onExit` bails on its identity check.
  #failInFlight(reason: string): void {
    if (!this.#inFlight.size) return;
    const lost = [...this.#inFlight];
    this.#inFlight.clear();
    this.logger.warn(`failing ${lost.length} unanswered builder request(s): ${reason}`);
    for (const [id, type] of lost) this.#onMessage({ type: `${type}-res`, id, ok: false, error: reason });
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
  static async create(
    app: App,
    env: Record<string, string>,
    onMessage: (message: BuilderMessage) => void,
    {
      stdio = "inherit",
      onOutput,
      patcherOff = false,
    }: Pick<IncrementalBuilderHostOptions, "stdio" | "onOutput" | "patcherOff"> = {},
  ) {
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
      if (await Bun.file(c).exists())
        return new IncrementalBuilderHost({ app, entry: c, env, stdio, onMessage, onOutput, patcherOff });
    throw new Error(`[cli] frontend builder entry not found; looked in: ${candidates.join(", ")}`);
  }
}
