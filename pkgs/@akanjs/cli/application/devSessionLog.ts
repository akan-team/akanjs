import { mkdir, rename } from "node:fs/promises";
import path from "node:path";
import { stripAnsi } from "@akanjs/devkit/util/stripAnsi";
import dayjs from "dayjs";
import type { DevAppStatus } from "./devSupervisor";

export interface DevSessionLogOptions {
  workspaceRoot: string;
  apps: string[];
  now?: () => Date;
}

// Outlives the full-screen view's scrollback. `AkanApp`'s `runtime/logs` only holds the gateway's replicas, so
// this is the one file that also holds the dev host's own build output.
export class DevSessionLog {
  static readonly fileName = "dev.log";
  static readonly previousFileName = "dev.prev.log";
  /** Batches a busy boot without leaving a quiet session unwritten longer than a `tail -f` blink. */
  static readonly flushMs = 200;
  static readonly bufferBytes = 64 * 1024;

  readonly #workspaceRoot: string;
  readonly #appNames: string[];
  readonly #now: () => Date;
  readonly #writers = new Map<string, Bun.FileSink>();
  readonly #partial = new Map<string, string>();
  readonly #lastState = new Map<string, DevAppStatus["state"]>();
  #flushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor({ workspaceRoot, apps, now = () => new Date() }: DevSessionLogOptions) {
    this.#workspaceRoot = workspaceRoot;
    this.#appNames = [...apps];
    this.#now = now;
  }

  get appNames(): string[] {
    return [...this.#appNames];
  }

  pathOf(app: string): string {
    return path.join(this.#runtimeDirOf(app), DevSessionLog.fileName);
  }

  previousPathOf(app: string): string {
    return path.join(this.#runtimeDirOf(app), DevSessionLog.previousFileName);
  }

  relativePathOf(app: string): string {
    return path.relative(this.#workspaceRoot, this.pathOf(app));
  }

  async open() {
    const stamp = dayjs(this.#now()).format("YYYY-MM-DD HH:mm:ss");
    for (const app of this.#appNames) {
      const file = this.pathOf(app);
      await mkdir(path.dirname(file), { recursive: true });
      // `Bun.file().writer()` does not truncate, so moving the old file away is what leaves an empty one.
      await rename(file, this.previousPathOf(app)).catch(() => undefined);
      this.#writers.set(app, Bun.file(file).writer({ highWaterMark: DevSessionLog.bufferBytes }));
      this.#writeLine(app, `── akan start · ${app} · ${stamp} ──`);
    }
  }

  write(app: string, kind: "stdout" | "stderr", chunk: string) {
    const key = `${app}:${kind}`;
    const parts = `${this.#partial.get(key) ?? ""}${chunk}`.split("\n");
    this.#partial.set(key, parts.pop() ?? "");
    // Stripped per completed line, never per chunk: an escape sequence can straddle a chunk boundary.
    for (const line of parts) this.#writeLine(app, stripAnsi(line));
  }

  // Session-level, so it goes to every app's file.
  note(text: string) {
    for (const app of this.#appNames) this.#writeLine(app, `[akan] ${text}`);
  }

  status(statuses: DevAppStatus[]) {
    for (const status of statuses) {
      if (this.#lastState.get(status.name) === status.state) continue;
      this.#lastState.set(status.name, status.state);
      const detail = status.detail ? ` (${status.detail})` : "";
      const where = status.state === "ready" ? ` — ${status.url}` : "";
      this.#writeLine(status.name, `[akan] ${status.name} ${status.state}${detail}${where}`);
    }
  }

  async close() {
    for (const [key, remainder] of this.#partial) {
      if (!remainder) continue;
      this.#writeLine(key.slice(0, key.lastIndexOf(":")), stripAnsi(remainder));
    }
    this.#partial.clear();
    if (this.#flushTimer) clearTimeout(this.#flushTimer);
    this.#flushTimer = null;
    await Promise.all([...this.#writers.values()].map(async (writer) => await writer.end()));
    this.#writers.clear();
  }

  #runtimeDirOf(app: string): string {
    return path.join(this.#workspaceRoot, "local", "apps", app, "runtime");
  }

  #writeLine(app: string, text: string) {
    const writer = this.#writers.get(app);
    if (!writer) return;
    writer.write(`${text}\n`);
    this.#scheduleFlush();
  }

  #scheduleFlush() {
    if (this.#flushTimer) return;
    this.#flushTimer = setTimeout(() => {
      this.#flushTimer = null;
      for (const writer of this.#writers.values()) void writer.flush();
    }, DevSessionLog.flushMs);
  }
}
