import type { Logger } from "akanjs/common";
import type { BackendImportGraph } from "./BackendImportGraph";
import type { DevBackend } from "./devBackend";
import { filesChangedSince, type SourceFingerprints } from "./devHostPolicy";

export class BuilderGap {
  readonly #graph: BackendImportGraph;
  readonly #backend: DevBackend;
  readonly #logger: Logger;
  #stamp: Promise<SourceFingerprints | null> | null = null;

  constructor({ graph, backend, logger }: { graph: BackendImportGraph; backend: DevBackend; logger: Logger }) {
    this.#graph = graph;
    this.#backend = backend;
    this.#logger = logger;
  }

  // Until a builder is back nothing watches (Bun's `fs.watch` drops events, a new builder primes from disk), so
  // stamp the backend graph now. Earliest open wins: over-reporting costs a restart, under-reporting stale code.
  open(reason: string): void {
    if (this.#stamp) return;
    if (!this.#graph.ready) {
      this.#logger.verbose(`[builder-gap] no backend graph yet; a save during this ${reason} goes unnoticed`);
      return;
    }
    this.#stamp = this.#graph
      .fingerprint()
      .then((stamps) => {
        this.#logger.verbose(`[builder-gap] stamped ${stamps.size} backend file(s) (${reason})`);
        return stamps;
      })
      .catch((err) => {
        this.#logger.warn(
          `[builder-gap] could not stamp the backend files: ${err instanceof Error ? err.message : String(err)}`,
        );
        return null;
      });
  }

  async take(): Promise<string[]> {
    const stamping = this.#stamp;
    this.#stamp = null;
    const before = stamping ? await stamping : null;
    if (!before) return [];
    const moved = filesChangedSince(before, await this.#graph.fingerprint());
    if (moved.length === 0) {
      this.#logger.verbose(`[builder-gap] none of the ${before.size} stamped backend file(s) moved`);
      return moved;
    }
    this.#logger.info(
      `[builder-gap] ${moved.length} backend file(s) changed while the builder was away; the backend is running the old ones`,
    );
    return moved;
  }

  // A baseline left open is compared against the next gap, where everything saved since reads as changed.
  discard(reason: string): void {
    if (!this.#stamp) return;
    this.#stamp = null;
    this.#logger.verbose(`[builder-gap] stamps dropped (${reason})`);
  }

  async restartBackendForChanges(): Promise<void> {
    const moved = await this.take();
    if (moved.length === 0) return;
    this.#backend.scheduleRestart({ files: moved, roles: [] });
  }
}
