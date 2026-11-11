import { type Logger, RestartSchedule } from "akanjs/common";
import type { BuilderMessage } from "akanjs/server";
import type { App } from "../commandDecorators";
import { type DevStdioMode, IncrementalBuilderHost } from "../incrementalBuilder";

const BUILDER_READY_TIMEOUT_MS = 150000;

const BUILDER_START_MAX_ATTEMPTS = 3;

export interface BuilderRecoveryReason {
  generation?: number;
  files: string[];
}

interface DevBuilderLinks {
  isStopping: () => boolean;
  onMessage: (message: BuilderMessage) => void;
  onAway: () => void;
  onReady: () => void;
  onRestartReady: () => void;
  onStartFailed: () => void;
  onStop: () => void;
  onRecovered: (reason: BuilderRecoveryReason) => void;
}

export class DevBuilder {
  readonly #app: App;
  readonly #env: Record<string, string>;
  readonly #stdio: DevStdioMode;
  readonly #logger: Logger;
  readonly #links: DevBuilderLinks;
  #host: IncrementalBuilderHost | null = null;
  //? Outlives the builder host, which idle wake and recovery replace; a config or metadata restart clears it.
  #patcherOff = false;
  //? The builder is the file watcher, so unlike the backend its recovery never gives up; it only backs off.
  readonly #recovery = new RestartSchedule({ min: 2_000, max: 60_000 });
  #abandonStart: ((error: Error) => void) | null = null;
  #generation = 0;

  constructor(
    app: App,
    { env, stdio, logger }: { env: Record<string, string>; stdio: DevStdioMode; logger: Logger },
    links: DevBuilderLinks,
  ) {
    this.#app = app;
    this.#env = env;
    this.#stdio = stdio;
    this.#logger = logger;
    this.#links = links;
  }

  get current(): IncrementalBuilderHost | null {
    return this.#host;
  }

  get recovering(): boolean {
    return this.#recovery.pending;
  }

  async start({ announceBootState = false }: { announceBootState?: boolean } = {}): Promise<IncrementalBuilderHost> {
    const startTime = Date.now();
    this.#app.verbose(`[cli] waiting for builder to complete initial base build…`);
    let lastError: unknown;
    for (let attempt = 1; attempt <= BUILDER_START_MAX_ATTEMPTS; attempt++) {
      const builder = await IncrementalBuilderHost.create(
        this.#app,
        this.#env,
        (msg) => {
          this.#links.onMessage(msg);
        },
        {
          stdio: this.#stdio,
          onOutput: (kind, text) => void (kind === "stderr" ? process.stderr : process.stdout).write(text),
          patcherOff: this.#patcherOff,
        },
      );
      if (this.#links.isStopping()) {
        builder.stop();
        throw new Error("dev server stopped before the builder started");
      }
      this.#host = builder;
      try {
        await this.#waitForReady(attempt, { announceBootState });
        this.#app.verbose(`[cli] base build ready in ${Date.now() - startTime}ms — starting backend`);
        return this.#host;
      } catch (err) {
        lastError = err;
        this.stop();
        if (attempt >= BUILDER_START_MAX_ATTEMPTS || this.#links.isStopping()) break;
        this.#app.verbose(`[cli] builder failed before ready; retrying (${attempt + 1}/${BUILDER_START_MAX_ATTEMPTS})`);
      }
    }
    this.#links.onStartFailed();
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  stop(): void {
    this.#links.onStop();
    if (!this.#host) return;
    if (this.#host.patcherOff) this.#patcherOff = true;
    this.#host.stop();
    this.#host = null;
  }

  abandonStart(error: Error): void {
    this.#abandonStart?.(error);
  }

  cancelRecovery(): void {
    this.#recovery.cancel();
  }

  resetRecovery(): void {
    this.#recovery.reset();
  }

  clearPatcherOff(): void {
    this.#patcherOff = false;
  }

  scheduleRecovery(reason: BuilderRecoveryReason): void {
    if (this.#links.isStopping() || this.#recovery.pending || this.#host) return;
    const delay = this.#recovery.schedule(() => {
      if (this.#links.isStopping() || this.#host) return;
      void this.#recover(reason);
    });
    this.#logger.warn(
      `[builder-recovery] builder is down; retrying start in ${delay}ms (attempt ${this.#recovery.attempts})`,
    );
  }

  // In `env`, which every builder spawn re-reads: a replacement (recycled, crashed, restarted) continues from here.
  trackGeneration(message: BuilderMessage): void {
    const generation = DevBuilder.#generationOf(message);
    if (generation === undefined || generation <= this.#generation) return;
    this.#generation = generation;
    Object.assign(this.#env, { AKAN_BUILDER_INITIAL_GENERATION: String(generation) });
  }

  // Not `csr-updated` / `ssr-updated`: their generation is the registry's.
  static #generationOf(message: BuilderMessage): number | undefined {
    if (message.type === "invalidate") return message.generation;
    if (message.type === "build-status" || message.type === "builder-metrics") return message.data.generation;
    if (message.type === "pages-updated" || message.type === "css-updated") return message.data.generation;
    return undefined;
  }

  async #recover(reason: BuilderRecoveryReason): Promise<void> {
    try {
      await this.start();
    } catch (err) {
      if (this.#links.isStopping()) return;
      this.#logger.warn(`[builder-recovery] builder start failed: ${err instanceof Error ? err.message : String(err)}`);
      this.scheduleRecovery(reason);
      return;
    }
    this.#recovery.reset();
    this.#logger.info("[builder-recovery] builder recovered");
    this.#links.onRecovered(reason);
  }

  #waitForReady(attempt: number, { announceBootState = false }: { announceBootState?: boolean } = {}): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (!this.#host) throw new Error("Builder Not Found");
      let settled = false;
      const settle = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (this.#abandonStart === abandon) this.#abandonStart = null;
        fn();
      };
      const abandon = (error: Error) => settle(() => reject(error));
      this.#abandonStart = abandon;
      const timeout = setTimeout(() => {
        settle(() => reject(new Error("[cli] builder timed out before emitting builder-ready")));
      }, BUILDER_READY_TIMEOUT_MS);
      this.#host.start({
        announceBootState,
        onExit: () => {
          settle(() => reject(new Error(`[cli] builder exited before emitting builder-ready (attempt ${attempt})`)));
        },
        onAway: () => {
          this.#links.onAway();
        },
        onReady: () => {
          settle(resolve);
          this.#links.onReady();
        },
        onRestartReady: () => {
          this.#links.onRestartReady();
        },
      });
    });
  }
}
