import type { DevHostEvent, DevHostState, DevHostStateEvent } from "@akanjs/devkit/akanApp";
import type { App } from "@akanjs/devkit/commandDecorators";
import { openBrowser } from "../openBrowser";
import { DevBootConcurrency } from "./devBootConcurrency";
import { DevSessionLog } from "./devSessionLog";

export type DevUiMode = "stream" | "tui";

export interface DevAppStatus {
  app: App;
  name: string;
  port: number;
  url: string;
  shareUrl: string | null;
  state: DevHostState;
  detail: string;
  exitCode: number | null;
}

export interface DevSupervisorOptions {
  apps: App[];
  mode: DevUiMode;
  /** `null` leaves the wave size to `DevBootConcurrency`; a number is what the session asked for. */
  concurrency?: number | null;
  open?: boolean;
  write?: boolean;
  /** App name to the public URL `--share` opened for it. */
  shares?: Map<string, string> | null;
}

export interface DevSupervisorView {
  /** Every decoded chunk of a child's output, in arrival order, not split into lines. */
  onOutput: (app: string, kind: "stdout" | "stderr", text: string) => void;
  onStatus: (statuses: DevAppStatus[]) => void;
  /** Routed through the view, not stdout: a stray write corrupts the frame Ink repaints. */
  onNote: (text: string, level: "info" | "warn") => void;
  /** Resolves when the viewer wants the session to end — a quit key, or the stream view never. */
  waitForExit: () => Promise<void>;
  close?: () => void;
}

interface DevChild {
  status: DevAppStatus;
  proc: Bun.Subprocess<"ignore", "pipe", "pipe"> | null;
  booted: Promise<void>;
  markBooted: () => void;
  opened: boolean;
}

// One `akan start <app>` child process per app, not several `AkanAppHost`s in one: `prepareCommand` publishes
// per-app values into `process.env`, and a second app would read the first's `AKAN_DATABASE_MODE` as an override.
export class DevSupervisor {
  // Ink needs a terminal that reports a size; a pipe, a redirect or CI downgrades (and says so) rather than failing.
  static resolveDevUi(
    plain: boolean,
    {
      isTty = !!process.stdout.isTTY,
      columns = process.stdout.columns ?? 0,
    }: { isTty?: boolean; columns?: number } = {},
  ): { mode: DevUiMode; downgraded: boolean } {
    if (plain) return { mode: "stream", downgraded: false };
    if (!isTty || columns <= 0) return { mode: "stream", downgraded: true };
    return { mode: "tui", downgraded: false };
  }
  /** A child that sees it in its env reports its state over ipc instead of only printing it. */
  static readonly supervisedEnvKey = "AKAN_DEV_SUPERVISED";

  // Empty unless spawned by a supervisor, so the single-app path stays exactly as it was.
  static childHooks(): { stdio?: "pipe"; onDevEvent?: (event: DevHostEvent) => void } {
    if (process.env[DevSupervisor.supervisedEnvKey] !== "1" || !process.send) return {};
    const send = process.send.bind(process);
    return {
      stdio: "pipe",
      onDevEvent: (event) => {
        try {
          send(event);
        } catch {
          // The supervisor is gone; its own `onExit` already knows, and this child is next to be told.
        }
      },
    };
  }
  /** Past this, boot order stops being enforced: a child that never reports its boot over must not block the rest. */
  static readonly bootTimeoutMs = 180_000;
  static readonly shutdownGraceMs = 12_000;

  readonly #options: DevSupervisorOptions;
  readonly #children = new Map<string, DevChild>();
  readonly #sessionLog: DevSessionLog;
  #view: DevSupervisorView | null = null;
  #stopping = false;

  constructor(options: DevSupervisorOptions) {
    this.#options = options;
    this.#sessionLog = new DevSessionLog({
      workspaceRoot: options.apps[0]?.workspace.workspaceRoot ?? process.cwd(),
      apps: options.apps.map((app) => app.name),
    });
  }

  get statuses(): DevAppStatus[] {
    return [...this.#children.values()].map((child) => child.status);
  }

  // Held here rather than by a view so `--plain` keeps the log files too.
  get sessionLog(): DevSessionLog {
    return this.#sessionLog;
  }

  async run(view: DevSupervisorView) {
    this.#view = view;
    await this.#sessionLog.open();
    const ports = await this.#assignPorts();
    for (const app of this.#options.apps) this.#children.set(app.name, this.#makeChild(app, ports.get(app.name) ?? 0));
    this.#publishStatus();
    const logPaths = this.#sessionLog.appNames.map((name) => this.#sessionLog.relativePathOf(name));
    this.#note(`session log: ${logPaths.join(" · ")}`, "info");

    const stopped = this.#installSignalHandlers();
    void this.#bootInOrder();
    await Promise.race([view.waitForExit(), stopped]);
    await this.stop();
    view.close?.();
    await this.#sessionLog.close();
  }

  // `AKAN_DEV_PORT` would hand every app the same port (and ws port, `port + 10_000`), so each walks upward.
  async #assignPorts(): Promise<Map<string, number>> {
    const taken = new Set<number>();
    const ports = new Map<string, number>();
    for (const app of this.#options.apps) {
      let port = await app.getDevPort();
      while (taken.has(port)) port += 1;
      taken.add(port);
      ports.set(app.name, port);
    }
    return ports;
  }

  #makeChild(app: App, port: number): DevChild {
    const { promise: booted, resolve: markBooted } = Promise.withResolvers<void>();
    return {
      status: {
        app,
        name: app.name,
        port,
        url: `http://localhost:${port}`,
        shareUrl: this.#options.shares?.get(app.name) ?? null,
        state: "starting",
        detail: "queued",
        exitCode: null,
      },
      proc: null,
      booted,
      markBooted,
      opened: false,
    };
  }

  // Waves: a cold boot build is the builder's RSS peak, and each `scanSync` rewrites the shared libs' barrels.
  async #bootInOrder() {
    const queue = [...this.#children.values()];
    const plan = DevBootConcurrency.resolve(queue.length, this.#options.concurrency ?? null);
    const concurrency = plan.concurrency;
    if (queue.length > 1) this.#note(DevBootConcurrency.describe(queue.length, plan), "info");
    const waves: DevChild[][] = [];
    for (let idx = 0; idx < queue.length; idx += concurrency) waves.push(queue.slice(idx, idx + concurrency));
    for (const wave of waves) {
      if (this.#stopping) return;
      for (const child of wave) this.#spawnChild(child);
      this.#publishStatus();
      await Promise.all(wave.map(async (child) => await this.#waitForBoot(child)));
    }
  }

  async #waitForBoot(child: DevChild) {
    if (await DevSupervisor.timesOut(child.booted, DevSupervisor.bootTimeoutMs))
      this.#note(
        `${child.status.name} has not finished booting after ${Math.round(DevSupervisor.bootTimeoutMs / 1000)}s; starting the next app anyway`,
        "warn",
      );
  }

  // Cleared, not left to fire: the losing timer would hold the event loop open for its full budget.
  static async timesOut(work: Promise<unknown>, ms: number): Promise<boolean> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const expired = new Promise<true>((resolve) => {
      timer = setTimeout(() => resolve(true), ms);
    });
    try {
      return await Promise.race([work.then(() => false), expired]);
    } finally {
      clearTimeout(timer);
    }
  }

  // Static so a test checks every flag against `start`: a renamed option kills each child with `unknown option`.
  static childArgs(name: string, { write = true }: { write?: boolean } = {}): string[] {
    return [
      "start",
      name,
      // The child renders nothing itself: this process owns the terminal and reads the child's pipes.
      "--plain",
      // The supervisor owns the database and the boot order; a child that also did would race its siblings.
      "--dbup",
      "false",
      "--write",
      String(write),
    ];
  }

  #spawnChild(child: DevChild) {
    const { app, name, port } = child.status;
    const args = DevSupervisor.childArgs(name, { write: this.#options.write ?? true });
    const proc = Bun.spawn([process.execPath, Bun.main, ...args], {
      cwd: app.workspace.workspaceRoot,
      env: {
        ...process.env,
        [DevSupervisor.supervisedEnvKey]: "1",
        AKAN_PUBLIC_APP_NAME: name,
        // Pinned: `getDevPort` indexes the sorted app list, so a restart after a new app dir would move it.
        AKAN_DEV_PORT: String(port),
      },
      stdio: ["ignore", "pipe", "pipe"],
      ipc: (message: DevHostEvent) => {
        if (!message || typeof message !== "object") return;
        if ("booted" in message) child.markBooted();
        else if (typeof message.state === "string") this.#applyChildEvent(child, message);
      },
      serialization: "advanced",
      onExit: (_proc, exitCode, signalCode) => {
        child.proc = null;
        child.status.exitCode = exitCode;
        if (this.#stopping) return;
        child.status.state = "stopped";
        child.status.detail = signalCode ? `killed by ${signalCode}` : `exited with ${exitCode}`;
        // Unblocks a wave waiting on an app that will never finish booting.
        child.markBooted();
        this.#publishStatus();
      },
    });
    child.proc = proc;
    child.status.state = "starting";
    child.status.detail = `pid ${proc.pid}`;
    void this.#drain(proc.stdout, name, "stdout");
    void this.#drain(proc.stderr, name, "stderr");
  }

  #applyChildEvent(child: DevChild, event: DevHostStateEvent) {
    child.status.state = event.state;
    child.status.detail = event.detail ?? "";
    if (event.state === "ready") {
      // Once per session, not once per restart: a crash loop would otherwise open a tab per recovery.
      if (this.#options.open && !child.opened) {
        child.opened = true;
        void openBrowser(child.status.url);
      }
    }
    // A child that gave up is not coming back on its own, so the next wave must not wait for it.
    if (event.state === "failed") child.markBooted();
    this.#publishStatus();
  }

  async #drain(stream: ReadableStream<Uint8Array>, name: string, kind: "stdout" | "stderr") {
    const decoder = new TextDecoder();
    try {
      for await (const chunk of stream) {
        const text = decoder.decode(chunk, { stream: true });
        if (!text) continue;
        this.#view?.onOutput(name, kind, text);
        this.#sessionLog.write(name, kind, text);
      }
    } catch {
      // The stream closes when the child exits; `onExit` already reported that.
    }
  }

  #publishStatus() {
    this.#view?.onStatus(this.statuses);
    this.#sessionLog.status(this.statuses);
  }

  #note(text: string, level: "info" | "warn") {
    this.#view?.onNote(text, level);
    this.#sessionLog.note(text);
  }

  // Ctrl+C reaches the children through the process group; this only keeps this process alive to wait for them.
  #installSignalHandlers(): Promise<void> {
    return new Promise<void>((resolve) => {
      let asked = false;
      const onSignal = () => {
        if (asked) {
          this.#note("abandoning the wait; children may be left running", "warn");
          process.exit(130);
        }
        asked = true;
        resolve();
      };
      process.on("SIGINT", onSignal);
      process.on("SIGTERM", onSignal);
    });
  }

  // For what the dev host cannot recover itself: a change it did not classify, or a wedged process.
  async restart(name: string) {
    const child = this.#children.get(name);
    if (!child || this.#stopping) return;
    const running = child.proc;
    if (running) {
      running.kill("SIGTERM");
      await running.exited;
    }
    child.status.state = "starting";
    child.status.detail = "restarting";
    child.status.exitCode = null;
    this.#publishStatus();
    this.#spawnChild(child);
    this.#publishStatus();
  }

  async stop() {
    if (this.#stopping) return;
    this.#stopping = true;
    const running = [...this.#children.values()].filter((child): child is DevChild & { proc: Bun.Subprocess } =>
      Boolean(child.proc),
    );
    for (const child of running) child.proc.kill("SIGTERM");
    const exited = Promise.all(running.map(async (child) => await child.proc.exited));
    if (!(await DevSupervisor.timesOut(exited, DevSupervisor.shutdownGraceMs))) return;
    for (const child of running) {
      if (child.proc.killed) continue;
      this.#note(`${child.status.name} did not exit in time; killing it`, "warn");
      child.proc.kill("SIGKILL");
    }
  }
}
