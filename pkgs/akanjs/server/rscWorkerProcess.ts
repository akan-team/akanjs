import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Logger, type LogRecord } from "akanjs/common";
import type { AkanMetricsReport } from "akanjs/service";
import { RestartSchedule } from "../common/restartSchedule";
import { ChildOutputReader } from "./logging/childOutputReader";

export type RscWorkerStatus = "starting" | "ready" | "restarting" | "stopped";
export type RscProcess = Bun.Subprocess;
export type RscWorkerErrorCode = "rscWorkerFailed" | "rscWorkerStopped";

interface RscWorkerProcessEvents {
  onMessage: (message: unknown, proc: RscProcess) => void;
  onExit: (proc: RscProcess, code: number | null) => void;
  logRecords: () => ((records: LogRecord[], dropped: number) => void) | null;
}

export class RscWorkerProcess {
  readonly ready: Promise<void>;
  proc: RscProcess;
  status: RscWorkerStatus = "starting";
  killed = false;
  booting: RscProcess | null = null;
  reloadsSinceSpawn = 0;
  lastWorkerMetrics: AkanMetricsReport = {};
  readonly restart = new RestartSchedule({ min: 200, max: 30_000 });
  #restartCount = 0;
  #resolveReady!: () => void;
  #rejectReady!: (err: Error) => void;
  #readyResolved = false;
  readonly #logger: Logger;
  readonly #events: RscWorkerProcessEvents;

  constructor(logger: Logger, events: RscWorkerProcessEvents) {
    this.#logger = logger;
    this.#events = events;
    this.ready = new Promise<void>((resolve, reject) => {
      this.#resolveReady = () => {
        if (this.#readyResolved) return;
        this.#readyResolved = true;
        resolve();
      };
      this.#rejectReady = (err) => {
        if (this.#readyResolved) return;
        this.#readyResolved = true;
        reject(err);
      };
    });

    this.proc = this.spawn();
  }

  get readyResolved() {
    return this.#readyResolved;
  }

  get restartCount() {
    return this.#restartCount;
  }

  resolveReady() {
    this.#resolveReady();
  }

  rejectReady(err: Error) {
    this.#rejectReady(err);
  }

  spawn(): RscProcess {
    this.status = "starting";
    this.reloadsSinceSpawn = 0;
    const workerPath = this.#resolveWorkerPath();
    let proc!: RscProcess;
    const earlyMessages: unknown[] = [];
    // Piped only under ndjson, where an inherited stdout would put text lines into the JSON stream.
    const piped = Logger.isNdjson;
    proc = Bun.spawn(["bun", "--conditions", "react-server", workerPath], {
      ipc: (message: unknown) => {
        if (!proc) {
          earlyMessages.push(message);
          return;
        }
        this.#events.onMessage(message, proc);
      },
      stdio: ["ignore", piped ? "pipe" : "inherit", piped ? "pipe" : "inherit"],
      serialization: "advanced",
      env: { ...process.env },
    });
    if (piped) this.#readOutput(proc);
    if (earlyMessages.length > 0) {
      setTimeout(() => {
        for (const message of earlyMessages.splice(0)) this.#events.onMessage(message, proc);
      }, 0);
    }
    proc.exited.then((code) => this.#events.onExit(proc, code));
    return proc;
  }

  #readOutput(proc: RscProcess) {
    const replicaIdx = Number(process.env.AKAN_REPLICA_IDX);
    const record = (type: "stdout" | "stderr", text: string) =>
      this.#events.logRecords()?.(
        [
          ChildOutputReader.toRecord({
            type,
            text,
            name: "rsc-worker",
            role: "rsc-worker",
            replicaIdx: Number.isInteger(replicaIdx) ? replicaIdx : null,
            pid: proc.pid,
          }),
        ],
        0,
      );
    const reader = new ChildOutputReader({
      onLine: (line) => record("stdout", line),
      onBlock: (lines) => record("stderr", lines.join("")),
    });
    void reader.pipe(proc.stdout instanceof ReadableStream ? proc.stdout : null, "stdout");
    void reader.pipe(proc.stderr instanceof ReadableStream ? proc.stderr : null, "stderr");
  }

  #resolveWorkerPath(): string {
    if (process.env.AKAN_RSC_WORKER_PATH) return path.resolve(process.env.AKAN_RSC_WORKER_PATH);

    const distWorkerPath = path.join(process.cwd(), "rscWorker.js");
    if (fs.existsSync(distWorkerPath)) return distWorkerPath;

    try {
      return Bun.resolveSync("akanjs/server/rsc-worker", import.meta.dir);
    } catch {
      return fileURLToPath(new URL("./rscWorker.tsx", import.meta.url));
    }
  }

  scheduleRestart(): void {
    this.status = "restarting";
    const delay = this.restart.schedule(() => {
      if (this.killed) return;
      try {
        this.proc = this.spawn();
      } catch (err) {
        this.#logger.error(`[rsc] failed to spawn worker: ${err instanceof Error ? err.message : String(err)}`);
        this.scheduleRestart();
      }
    });
    this.#restartCount += 1;
    this.#logger.verbose(`[rsc] worker crashed, restarting in ${delay}ms (attempt ${this.restart.attempts})`);
  }

  static isAlive(proc: RscProcess): boolean {
    return proc.exitCode === null && proc.signalCode === null && !proc.killed;
  }
}
