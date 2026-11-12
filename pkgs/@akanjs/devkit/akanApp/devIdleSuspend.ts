import type { Logger } from "akanjs/common";
import type { ChangeBatch } from "akanjs/server";
import type { App } from "../commandDecorators";
// Not via `../frontendBuild`: that barrel loads typescript and tailwind, which a suspended dev host must not hold.
import { HmrWatcher } from "../frontendBuild/hmrWatcher";
import { WatchRootResolver } from "../frontendBuild/watchRootResolver";
import { decideIdleSuspend, type IdleSuspendDecision, resolveIdleSuspendMs } from "./devHostPolicy";

interface DevIdleSuspendLinks {
  readiness: () => { builderReady: boolean; backendReady: boolean; buildFailed: boolean; restartPending: boolean };
  release: (detail: string) => void;
  wake: (batch: ChangeBatch | null) => Promise<void>;
  wakeFailed: (files: string[]) => void;
  flushHeld: () => void;
  awake: () => void;
}

export class DevIdleSuspend {
  readonly #app: App;
  readonly #logger: Logger;
  readonly #links: DevIdleSuspendLinks;
  #timer: ReturnType<typeof setTimeout> | null = null;
  #suspended = false;
  #waking = false;
  #stopped = false;
  #activity = 0;
  #wokeAtMono: number | null = null;
  #watcher: HmrWatcher | null = null;
  #suspendedChanges: ChangeBatch | null = null;

  constructor(app: App, { logger }: { logger: Logger }, links: DevIdleSuspendLinks) {
    this.#app = app;
    this.#logger = logger;
    this.#links = links;
  }

  static idleMs(): number | null {
    return resolveIdleSuspendMs(process.env.AKAN_DEV_IDLE_SUSPEND_MS);
  }

  get away(): boolean {
    return !this.#stopped && (this.#suspended || this.#waking);
  }

  markActivity(): void {
    this.#activity++;
    if (this.#suspended || this.#waking) return;
    this.arm();
  }

  arm(): void {
    const idleMs = DevIdleSuspend.idleMs();
    this.#cancel();
    if (idleMs === null || this.#stopped) return;
    this.#timer = setTimeout(() => {
      this.#timer = null;
      void this.#suspendWhenIdle(idleMs);
    }, idleMs);
  }

  #cancel(): void {
    if (!this.#timer) return;
    clearTimeout(this.#timer);
    this.#timer = null;
  }

  #stopWatcher(): void {
    this.#watcher?.stop();
    this.#watcher = null;
  }

  //? For good: a wake, a builder message or a relayed request that comes after the host stops must not re-arm it, and
  //? a request must reach the stopped builder, which refuses it, rather than wait on a wake that will not come.
  stop(): void {
    this.#stopped = true;
    this.#cancel();
    this.#stopWatcher();
  }

  async wake(reason: string): Promise<void> {
    if (!this.#suspended || this.#waking || this.#stopped) return;
    this.#waking = true;
    this.#cancel();
    this.#stopWatcher();
    const batch = this.#suspendedChanges;
    this.#suspendedChanges = null;
    const startedAtMono = performance.now();
    this.#logger.info(`[idle-suspend] waking (${reason})`);
    try {
      await this.#links.wake(batch);
      this.#logger.info(`[idle-suspend] awake in ${Math.round(performance.now() - startedAtMono)}ms`);
    } catch (err) {
      this.#logger.error(
        `[idle-suspend] wake failed; recovering the builder: ${err instanceof Error ? err.message : String(err)}`,
      );
      this.#links.wakeFailed(batch?.files ?? []);
    } finally {
      this.#suspended = false;
      this.#waking = false;
      this.#wokeAtMono = performance.now();
      this.#links.flushHeld();
      this.arm();
      // A wake often leaves the backend state untouched, so nothing else would tell a supervisor it came back.
      if (!this.#stopped) this.#links.awake();
    }
  }

  #decide(): IdleSuspendDecision {
    return decideIdleSuspend({
      enabled: true,
      suspended: this.#suspended,
      ...this.#links.readiness(),
      msSinceWake: this.#wokeAtMono === null ? null : performance.now() - this.#wokeAtMono,
    });
  }

  async #suspendWhenIdle(idleMs: number): Promise<void> {
    const decision = this.#decide();
    if (decision !== "suspend") {
      this.#logger.verbose(`[idle-suspend] skipped (${decision}); re-arming`);
      this.arm();
      return;
    }
    const activity = this.#activity;
    // Watch before stopping: an edit in the gap would be lost, and nothing would wake the dev server.
    const watcher = await this.#startWatcher();
    if (!watcher) {
      this.arm();
      return;
    }
    if (this.#stopped) {
      watcher.stop();
      return;
    }
    //? Decided again: a request or builder message that marked activity meanwhile is on the awake builder.
    const recheck = this.#activity === activity ? this.#decide() : "busy";
    if (recheck !== "suspend") {
      this.#logger.verbose(`[idle-suspend] skipped (${recheck} while the idle watcher started); re-arming`);
      watcher.stop();
      this.arm();
      return;
    }
    this.#watcher = watcher;
    this.#suspended = true;
    this.#links.release(`idle ${Math.round(idleMs / 1000)}s`);
    this.#logger.info(
      `[idle-suspend] no build activity for ${Math.round(idleMs / 1000)}s; released the builder — the next edit or route request brings it back`,
    );
  }

  async #startWatcher(): Promise<HmrWatcher | null> {
    let watcher: HmrWatcher | null = null;
    try {
      const roots = await new WatchRootResolver(this.#app).resolve();
      watcher = new HmrWatcher({
        roots,
        logger: this.#logger,
        onBatch: (batch) => {
          this.#recordSuspendedChange(batch);
          void this.wake(`${batch.files.length} file(s) changed`);
        },
      });
      // Awaited so the mtime baseline exists before the first edit; a file missing from the batch is never rebuilt.
      await watcher.start();
      return watcher;
    } catch (err) {
      this.#logger.warn(
        `[idle-suspend] could not install the idle watcher; staying awake: ${err instanceof Error ? err.message : String(err)}`,
      );
      watcher?.stop();
      return null;
    }
  }

  #recordSuspendedChange(batch: ChangeBatch): void {
    const current = this.#suspendedChanges;
    if (!current) {
      this.#suspendedChanges = { files: [...batch.files], kinds: new Set(batch.kinds) };
      return;
    }
    this.#suspendedChanges = {
      files: [...new Set([...current.files, ...batch.files])],
      kinds: new Set([...current.kinds, ...batch.kinds]),
    };
  }
}
