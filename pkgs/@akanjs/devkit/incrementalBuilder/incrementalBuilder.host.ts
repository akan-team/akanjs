import path from "node:path";
import { Logger } from "akanjs/common";
import type { BuilderMessage } from "akanjs/server";
import type { App } from "../commandDecorators";

const builderMsgTypeSet = new Set<BuilderMessage["type"]>([
  "build-route-res",
  "builder-ready",
  "invalidate",
  "css-updated",
  "pages-updated",
  "build-status",
]);
interface IncrementalBuilderHostOptions {
  app: App;
  entry: string;
  env: Record<string, string>;
  onMessage: (message: BuilderMessage) => void;
}

type IncrementalBuilderStatus = "starting" | "ready" | "restarting" | "stopped";

interface IncrementalBuilderStartOptions {
  onExit?: () => void;
  onReady?: () => void;
  onRestartReady?: () => void;
}

export class IncrementalBuilderHost {
  static readonly #restartBaseDelayMs = 1_000;
  static readonly #restartMaxDelayMs = 30_000;
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
  #manualStop = false;
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
  start(options: IncrementalBuilderStartOptions = {}) {
    if (this.#proc) this.stop();
    this.#manualStop = false;
    this.#startOptions = options;
    this.#spawn(false);
    return this;
  }
  #spawn(isRestart: boolean) {
    this.#status = isRestart ? "restarting" : "starting";
    this.ready = false;
    let proc!: Bun.Subprocess<"ignore", "inherit", "inherit">;
    proc = Bun.spawn(["bun", this.entry], {
      cwd: this.app.cwdPath,
      env: { ...this.env, AKAN_WATCH: "1" },
      stdio: ["ignore", "inherit", "inherit"],
      ipc: (msg: BuilderMessage) => {
        if (this.#proc !== proc) return;
        if (!msg || typeof msg !== "object") return;
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
        this.ready = false;
        if (this.#manualStop || this.#status === "stopped") return;
        if (!wasReady) {
          this.#status = "stopped";
          this.#startOptions.onExit?.();
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
  send(message: BuilderMessage): boolean {
    if (!this.#proc || this.#status !== "ready") {
      this.logger.warn(`incrementalBuilderHost is ${this.#status}; cannot send ${message.type}`);
      return false;
    }
    try {
      this.#proc.send(message);
      return true;
    } catch (error) {
      this.logger.warn(
        `failed to send ${message.type} to builder: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }
  stop() {
    this.#manualStop = true;
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
