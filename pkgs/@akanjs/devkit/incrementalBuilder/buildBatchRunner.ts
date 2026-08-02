import path from "node:path";
import { Logger } from "akanjs/common";
import type { BuilderMessage } from "akanjs/server";
import type { BuildBatchMessage, BuildBatchRequest, BuildBatchResult } from "./buildBatchProtocol";

/**
 * Runs one `BuildBatchRequest` in a fresh process and resolves with what it produced.
 *
 * The watcher serializes every batch through its own work queue, so this deliberately has no pool: one
 * worker exists at a time, and it exits before the next one starts. That is the whole point — the
 * bundler arenas `Bun.build` never frees go back to the OS with the process.
 *
 * A worker that dies without reporting is not fatal. Every need it was given comes back as an error, the
 * watcher reports a red build-status for that generation, and the last-good artifact keeps serving —
 * the same contract a failed in-process build had. It must never take the watcher down with it: the
 * watcher is the dev server's file watcher, so nothing would notice the fix.
 */
export class BuildBatchRunner {
  static readonly #entryCandidates = (workspaceRoot: string) => [
    path.join(workspaceRoot, "pkgs/@akanjs/devkit/incrementalBuilder/buildBatch.proc.ts"),
    path.join(workspaceRoot, "node_modules/@akanjs/devkit/incrementalBuilder/buildBatch.proc.ts"),
    path.join(import.meta.dir, "buildBatch.proc.js"),
    path.join(import.meta.dir, "buildBatch.proc.ts"),
  ];
  #logger = new Logger("BuildBatchRunner");
  #entry: string | null = null;
  #workspaceRoot: string;
  #cwd: string;
  constructor({ workspaceRoot, cwd }: { workspaceRoot: string; cwd: string }) {
    this.#workspaceRoot = workspaceRoot;
    this.#cwd = cwd;
  }

  async #resolveEntry(): Promise<string> {
    if (this.#entry) return this.#entry;
    const candidates = BuildBatchRunner.#entryCandidates(this.#workspaceRoot);
    for (const candidate of candidates) {
      if (!(await Bun.file(candidate).exists())) continue;
      this.#entry = candidate;
      return candidate;
    }
    throw new Error(`[build-batch] worker entry not found; looked in: ${candidates.join(", ")}`);
  }

  /**
   * `onMessage` receives everything the worker streams as it goes — `pages-updated`, `css-updated`,
   * `build-status` — so the watcher can relay each one the moment it is produced instead of holding a
   * page reload until the whole batch is done.
   */
  async run(
    request: BuildBatchRequest,
    onMessage: (message: BuilderMessage) => void = () => undefined,
  ): Promise<BuildBatchResult> {
    const started = Date.now();
    const entry = await this.#resolveEntry();
    let result: BuildBatchResult | null = null;
    // The request travels in argv rather than over IPC so the worker can start on its first tick
    // instead of waiting for a handshake it would have to synchronize against.
    const proc = Bun.spawn(["bun", entry, JSON.stringify(request)], {
      cwd: this.#cwd,
      env: process.env,
      stdio: ["ignore", "inherit", "inherit"],
      serialization: "advanced",
      ipc: (message: BuildBatchMessage | BuilderMessage) => {
        if (!message || typeof message !== "object") return;
        if (message.type === "build-batch-result") result = message.data;
        else onMessage(message);
      },
    });
    const exitCode = await proc.exited;
    if (result) {
      this.#logger.verbose(
        `[build-batch] generation=${request.generation} needs=${request.needs.join(",")} done in ${Date.now() - started}ms`,
      );
      return result;
    }
    // A worker the kernel OOM-killed exits with code `null` and `SIGKILL`, which without the signal
    // reads exactly like an ordinary crash — and the two have opposite fixes: one is a build error to
    // find, the other is a memory limit to raise. The peak here is the largest transient in the tree
    // (a boot build measured 548MB on a tenant app, 1.1GB on apps/akan), so on a small sandbox this is
    // the process the kernel reaches for first.
    const message = proc.signalCode
      ? `build worker was killed by ${proc.signalCode} before reporting a result${
          proc.signalCode === "SIGKILL" ? " — most often the kernel OOM killer; check the sandbox's memory limit" : ""
        }`
      : `build worker exited with code ${exitCode} before reporting a result`;
    this.#logger.error(`[build-batch] generation=${request.generation} ${message}`);
    return {
      generation: request.generation,
      errors: Object.fromEntries(request.needs.map((need) => [need, message])),
      crashed: true,
    };
  }
}
