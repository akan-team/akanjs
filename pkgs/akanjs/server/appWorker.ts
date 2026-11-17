import { existsSync } from "node:fs";
import path from "node:path";
import { Logger } from "akanjs/common";
import { AppWorkerError } from "./appWorkerError";
import { AppWorkerPath } from "./appWorkerPath";
import { SelfExec } from "./selfExec";

export interface AppWorkerOptions<Message = unknown> {
  args?: string[];
  /** Added to the few variables a process needs to start (PATH, HOME, …): the server's own env stays out of it. */
  env?: { [key: string]: string | undefined };
  /** Hands the worker the server's whole env, its secrets included. */
  inheritEnv?: boolean;
  /** `false` leaves a worker that exited with an error down; the delays double from `minMs` up to `maxMs`. */
  restart?: boolean | { minMs?: number; maxMs?: number };
  logger?: Logger;
  onStart?: () => void;
  /** Opens the IPC channel: the worker's `process.send(message)` arrives here, and `send` reaches its `process.on("message")`. */
  onMessage?: (message: Message) => void;
  /** Every exit but the one `stop` causes; `null` when a signal ended it. */
  onExit?: (exitCode: number | null) => void;
}

interface PathLookup {
  appDir?: string;
  env?: NodeJS.ProcessEnv;
}

export class AppWorker<Message = unknown> {
  static readonly killWaitMs = 2_000;
  static readonly minRestartMs = 1_000;
  static readonly maxRestartMs = 30_000;
  static readonly startEnv = ["PATH", "Path", "HOME", "USERPROFILE", "SystemRoot", "TMPDIR", "TEMP", "TMP", "TZ"];
  static readonly #running = new Set<AppWorker<never>>();

  readonly name: string;
  readonly #script: string;
  readonly #options: AppWorkerOptions<Message>;
  readonly #logger: Logger;
  readonly #minRestartMs: number;
  readonly #maxRestartMs: number;
  #child: Bun.Subprocess<"ignore", "pipe", "pipe"> | null = null;
  #generation = 0;
  #restartMs: number;

  private constructor(name: string, options: AppWorkerOptions<Message>) {
    const restart = typeof options.restart === "object" ? options.restart : {};
    this.name = name;
    this.#script = AppWorker.pathOf(name);
    this.#options = options;
    this.#logger = options.logger ?? new Logger(`Worker:${name}`);
    this.#minRestartMs = restart.minMs ?? AppWorker.minRestartMs;
    this.#maxRestartMs = restart.maxMs ?? AppWorker.maxRestartMs;
    this.#restartMs = this.#minRestartMs;
  }

  static pathOf(
    name: string,
    { appDir = process.env.AKAN_APP_DIR ?? path.dirname(Bun.main), env = process.env }: PathLookup = {},
  ) {
    const declare = `declare it in akan.config.ts (workers: { ${AppWorkerPath.validName.test(name) ? name : "<name>"}: "<entry file>" })`;
    if (!AppWorkerPath.validName.test(name))
      throw new AppWorkerError("workerNotDeclared", `${JSON.stringify(name)} is not a worker's name; ${declare}.`);
    const built = AppWorkerPath.built(appDir, name);
    if (existsSync(built)) return built;
    const source = AppWorkerPath.sources(env)[name];
    if (source) return source;
    throw new AppWorkerError(
      "workerNotDeclared",
      `No worker "${name}" in ${path.join(appDir, AppWorkerPath.dir)}: ${declare}, then build again or restart akan start.`,
    );
  }

  static spawn<Message = unknown>(name: string, options: AppWorkerOptions<Message> = {}): AppWorker<Message> {
    const worker = new AppWorker<Message>(name, options);
    if (!AppWorker.#running.size) process.once("exit", AppWorker.#signalAll);
    AppWorker.#running.add(worker as AppWorker<never>);
    worker.#generation += 1;
    void worker.#run(worker.#generation);
    return worker;
  }

  //? `exit` handlers run synchronously, so a signal is all there is time for: a worker that ignores SIGTERM outlives it.
  static readonly #signalAll = () => {
    for (const worker of AppWorker.#running) worker.#child?.kill("SIGTERM");
  };

  #retire() {
    AppWorker.#running.delete(this as AppWorker<never>);
    if (!AppWorker.#running.size) process.off("exit", AppWorker.#signalAll);
  }

  get pid(): number | null {
    return this.#child?.pid ?? null;
  }

  send(message: unknown) {
    if (!this.#child || !this.#options.onMessage)
      throw new AppWorkerError(
        "workerNotConnected",
        `Worker "${this.name}" takes no message: ${this.#options.onMessage ? "it is not running" : "pass onMessage to open its IPC channel"}.`,
      );
    this.#child.send(message);
  }

  async stop() {
    this.#generation += 1;
    this.#retire();
    const child = this.#child;
    this.#child = null;
    if (!child) return;
    child.kill("SIGTERM");
    const force = setTimeout(() => child.kill("SIGKILL"), AppWorker.killWaitMs);
    await child.exited;
    clearTimeout(force);
  }

  async #run(generation: number) {
    while (generation === this.#generation) {
      const startedAt = Date.now();
      const exitCode = await this.#work();
      if (generation !== this.#generation) return;
      this.#options.onExit?.(exitCode);
      if (exitCode === 0 || this.#options.restart === false) {
        this.#retire();
        if (exitCode !== 0) this.#logger.error(`exited ${exitCode ?? "on a signal"} and stays down`);
        return;
      }
      if (Date.now() - startedAt >= this.#maxRestartMs) this.#restartMs = this.#minRestartMs;
      this.#logger.warn(`exited ${exitCode ?? "on a signal"}; restarting in ${this.#restartMs}ms`);
      await Bun.sleep(this.#restartMs);
      this.#restartMs = Math.min(this.#restartMs * 2, this.#maxRestartMs);
    }
  }

  async #work() {
    const { args = [], env = {}, inheritEnv = false, onMessage } = this.#options;
    const base = inheritEnv
      ? process.env
      : Object.fromEntries(AppWorker.startEnv.flatMap((key) => (process.env[key] ? [[key, process.env[key]]] : [])));
    //? A source run starts in the workspace root, whose `.env` Bun would load into a worker that was handed none.
    const [bun = process.execPath, ...rest] = SelfExec.command(this.#script, ...args);
    const child = Bun.spawn([bun, ...(rest.includes("--no-env-file") ? [] : ["--no-env-file"]), ...rest], {
      env: SelfExec.env({ ...base, ...env }),
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      ...(onMessage
        ? {
            ipc: (message: Message) => {
              this.#restartMs = this.#minRestartMs;
              onMessage(message);
            },
          }
        : {}),
    });
    this.#child = child;
    this.#options.onStart?.();
    const [exitCode] = await Promise.all([
      child.exited,
      this.#relay(child.stdout, "info"),
      this.#relay(child.stderr, "warn"),
    ]);
    if (this.#child === child) this.#child = null;
    return child.signalCode ? null : exitCode;
  }

  async #relay(stream: ReadableStream<Uint8Array>, level: "info" | "warn") {
    const decoder = new TextDecoder();
    let rest = "";
    for await (const chunk of stream) {
      const lines = `${rest}${decoder.decode(chunk, { stream: true })}`.split("\n");
      rest = lines.pop() ?? "";
      for (const line of lines) if (line.trim()) this.#logger[level](line);
    }
    if (rest.trim()) this.#logger[level](rest);
  }
}
