import type { Logger } from "akanjs/common";
import type { BuilderMessage, BuildPhase, DevBuildStatus } from "akanjs/server";
import {
  buildStatusReplaySequence,
  createBackendBuildStatus,
  hasAnyBuildFailure,
  hasBuildFailureForGeneration,
  shouldKeepBuildFailure,
  shouldMarkBuildPhaseRecovered,
  shouldRelayRecycledFrontendState,
  shouldReplaceLastGoodMessage,
} from "./devHostPolicy";

type FrontendStateMessage =
  | Extract<BuilderMessage, { type: "pages-updated" }>
  | Extract<BuilderMessage, { type: "css-updated" }>;

interface LastGoodFrontendState {
  pages?: Extract<BuilderMessage, { type: "pages-updated" }>;
  css?: Extract<BuilderMessage, { type: "css-updated" }>;
}

export class DevBuildStatusBoard {
  readonly #logger: Logger;
  readonly #byPhase = new Map<BuildPhase, DevBuildStatus>();
  #backendGeneration = 0;
  #lastGood: LastGoodFrontendState = {};

  constructor(logger: Logger) {
    this.#logger = logger;
  }

  get lastGood(): Readonly<LastGoodFrontendState> {
    return this.#lastGood;
  }

  get failing(): boolean {
    return hasAnyBuildFailure(this.#byPhase);
  }

  phase(phase: BuildPhase): DevBuildStatus | undefined {
    return this.#byPhase.get(phase);
  }

  failedAt(generation: number | undefined): boolean {
    return hasBuildFailureForGeneration(this.#byPhase, generation);
  }

  replaySequence(queued: readonly DevBuildStatus[]): DevBuildStatus[] {
    return buildStatusReplaySequence(queued, this.#byPhase);
  }

  nextBackendGeneration(generation?: number): number {
    if (typeof generation === "number") {
      this.#backendGeneration = Math.max(this.#backendGeneration, generation);
      return generation;
    }
    this.#backendGeneration += 1;
    return this.#backendGeneration;
  }

  record(status: DevBuildStatus): void {
    const recovered = shouldMarkBuildPhaseRecovered(this.#byPhase, status);
    if (shouldKeepBuildFailure(this.#byPhase, status)) return;
    this.#byPhase.set(status.phase, status);
    const label = `[build-status] generation=${status.generation} phase=${status.phase} ok=${status.ok} files=${status.files.length}`;
    if (status.ok) this.#logger.verbose(`${label}${recovered ? " recovered=1" : ""}`);
    else this.#logger.warn(`${label}${status.message ? ` message=${status.message}` : ""}`);
  }

  recordBackend({
    generation,
    ok,
    files,
    message,
  }: {
    generation?: number;
    ok: boolean;
    files?: string[];
    message?: string;
  }): DevBuildStatus {
    const status = createBackendBuildStatus({
      generation: this.nextBackendGeneration(generation),
      ok,
      files,
      message,
    });
    this.record(status);
    return status;
  }

  forgetRoute(): void {
    this.#byPhase.delete("route");
  }

  reset(): void {
    this.#lastGood = {};
    this.#byPhase.clear();
  }

  // `supersede`: a recycled builder's re-announcement is what is on disk now, whatever generation it carries.
  recordLastGood(message: FrontendStateMessage, { supersede = false }: { supersede?: boolean } = {}): void {
    if (message.type === "pages-updated") {
      if (!supersede && !shouldReplaceLastGoodMessage(this.#lastGood.pages, message)) return;
      this.#lastGood.pages = message;
      this.#logger.verbose(
        `[last-good] pages generation=${message.data.generation ?? "(unknown)"} buildId=${message.data.buildId}`,
      );
      return;
    }
    if (!supersede && !shouldReplaceLastGoodMessage(this.#lastGood.css, message)) return;
    this.#lastGood.css = message;
    this.#logger.verbose(
      `[last-good] css generation=${message.data.generation ?? "(unknown)"} assets=${Object.keys(message.data.cssAssets).length}`,
    );
  }

  // The backend reads `base-artifact.json` once, so a recycled builder re-announces it; unchanged hashes are dropped.
  shouldRelayRecycled(message: FrontendStateMessage): boolean {
    const current = message.type === "pages-updated" ? this.#lastGood.pages : this.#lastGood.css;
    if (shouldRelayRecycledFrontendState(current, message)) {
      this.#logger.verbose(`[builder-recycle] ${message.type} moved during the recycle; pushing it to the backend`);
      return true;
    }
    this.#logger.verbose(`[builder-recycle] ${message.type} unchanged after the recycle; backend left as is`);
    return false;
  }
}
