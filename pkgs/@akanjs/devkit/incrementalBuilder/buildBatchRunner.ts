import path from "node:path";
import { Logger } from "akanjs/common";
import type { BuilderMessage } from "akanjs/server";
import type { BuildBatchMessage, BuildBatchRequest, BuildBatchResult } from "./buildBatchProtocol";

// No pool on purpose: a worker exiting after its batch returns the arenas `Bun.build` never frees. The callers order
// their own work (the slow lane, the css queue, the SSR registry's boot build beside them), so a few can overlap.
// A worker that dies without reporting must not take the watcher down; its needs come back as errors.
export class BuildBatchRunner {
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
    const candidates = [
      path.join(this.#workspaceRoot, "pkgs/@akanjs/devkit/incrementalBuilder/buildBatch.proc.ts"),
      path.join(this.#workspaceRoot, "node_modules/@akanjs/devkit/incrementalBuilder/buildBatch.proc.ts"),
      path.join(import.meta.dir, "buildBatch.proc.js"),
      path.join(import.meta.dir, "buildBatch.proc.ts"),
    ];
    for (const candidate of candidates) {
      if (!(await Bun.file(candidate).exists())) continue;
      this.#entry = candidate;
      return candidate;
    }
    throw new Error(`[build-batch] worker entry not found; looked in: ${candidates.join(", ")}`);
  }

  async run(
    request: BuildBatchRequest,
    onMessage: (message: BuilderMessage) => void = () => undefined,
  ): Promise<BuildBatchResult> {
    const started = Date.now();
    const entry = await this.#resolveEntry();
    let result: BuildBatchResult | null = null;
    const reported = new Map<string, string | undefined>();
    const payload = request.trace ? { ...request, trace: { ...request.trace, spawnAt: Date.now() } } : request;
    // argv rather than IPC, so the worker starts on its first tick instead of waiting for a handshake.
    const proc = Bun.spawn(["bun", entry, JSON.stringify(payload)], {
      cwd: this.#cwd,
      env: process.env,
      stdio: ["ignore", "inherit", "inherit"],
      serialization: "advanced",
      ipc: (message: BuildBatchMessage | BuilderMessage) => {
        if (!message || typeof message !== "object") return;
        if (message.type === "build-batch-result") result = message.data;
        else {
          if (message.type === "build-status") reported.set(message.data.phase, message.data.message);
          onMessage(message);
        }
      },
    });
    const exitCode = await proc.exited;
    if (result) {
      this.#logger.verbose(
        `[build-batch] generation=${request.generation} needs=${request.needs.join(",")} done in ${Date.now() - started}ms`,
      );
      return result;
    }
    // An OOM kill (code null, SIGKILL) reads like a crash without the signal, and needs the opposite fix.
    const message = proc.signalCode
      ? `build worker was killed by ${proc.signalCode} before reporting a result${
          proc.signalCode === "SIGKILL" ? " — most often the kernel OOM killer; check the sandbox's memory limit" : ""
        }`
      : `build worker exited with code ${exitCode} before reporting a result`;
    this.#logger.error(`[build-batch] generation=${request.generation} ${message}`);
    //? A need that reported before the crash keeps what it reported: a worker killed during pages built ssr and css.
    const crashedNeeds = request.needs.filter((need) => !reported.has(need));
    const failed = request.needs.flatMap((need) => {
      if (!reported.has(need)) return [[need, message] as const];
      const error = reported.get(need);
      return error ? [[need, error] as const] : [];
    });
    return { generation: request.generation, errors: Object.fromEntries(failed), crashed: true, crashedNeeds };
  }
}
