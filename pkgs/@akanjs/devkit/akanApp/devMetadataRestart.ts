import type { Logger } from "akanjs/common";
import type { BuilderMessage, DevBuildStatus } from "akanjs/server";
import type { DevBackend } from "./devBackend";
import type { DevBuildStatusBoard } from "./devBuildStatusBoard";
import { backendRestartReasonFromMessage, mergeInvalidateMessages, runtimeMetadataFilesOf } from "./devHostPolicy";

type InvalidateMessage = Extract<BuilderMessage, { type: "invalidate" }>;
type BatchUpdate = Extract<BuilderMessage, { type: "pages-updated" | "ssr-updated" | "csr-updated" }>;

//* A signal or dictionary save restarts the backend, never the builder, once a pages build at or past the save is green
//* and no registry build since the save failed: that pages build rebuilt the dictionary assets and rewrote the base
//* artifact a backend boots on, after its batch's registry builds reported. Until then the running backend keeps the
//* state from before the save, and each batch's updates wait here instead of reaching it.
export class DevMetadataRestart {
  readonly #logger: Logger;
  readonly #statuses: DevBuildStatusBoard;
  readonly #backend: DevBackend;
  #pending: { generation: number; message: InvalidateMessage } | null = null;
  #held: BatchUpdate[] | null = null;

  constructor({ logger, statuses, backend }: { logger: Logger; statuses: DevBuildStatusBoard; backend: DevBackend }) {
    this.#logger = logger;
    this.#statuses = statuses;
    this.#backend = backend;
  }

  get pending(): boolean {
    return !!this.#pending;
  }

  /** True when the save's backend restart joins the pending one; the running backend still takes the invalidate. */
  defers(message: InvalidateMessage): boolean {
    const pending = this.#pending;
    const metadata = runtimeMetadataFilesOf(message.devPlan);
    if (!pending && metadata.length === 0) return false;
    this.#held ??= [];
    const merged = pending ? mergeInvalidateMessages(pending.message, message) : message;
    if (metadata.length === 0 && pending) {
      this.#pending = { generation: pending.generation, message: merged };
      return true;
    }
    const generation = Math.max(pending?.generation ?? -1, message.devPlan?.generation ?? message.generation ?? -1);
    this.#pending = { generation, message: merged };
    this.#logger.verbose(
      `[dev-host] runtime metadata generation=${generation} files=${metadata.length}: the backend restarts once its pages build is green; the builder keeps running`,
    );
    return true;
  }

  /** Before the status reaches the backend: a red build hands it the updates it held first. */
  settle(status: DevBuildStatus): void {
    const pending = this.#pending;
    if (!pending || status.phase !== "pages" || status.generation < pending.generation) return;
    if (!status.ok || this.#registryFailedSince(pending.generation)) {
      this.#release();
      return;
    }
    this.#pending = null;
    this.#held = null;
    this.#logger.verbose(
      `[dev-host] runtime metadata generation=${pending.generation} built at generation=${status.generation}; restarting the backend onto it`,
    );
    this.#backend.scheduleRestart(backendRestartReasonFromMessage(pending.message));
  }

  holds(message: BuilderMessage): boolean {
    if (!this.#held) return false;
    if (message.type !== "pages-updated" && message.type !== "ssr-updated" && message.type !== "csr-updated")
      return false;
    this.#held.push(message);
    return true;
  }

  /** A dev-host restart replaces the builder and backend itself, onto a boot build of its own. */
  drop(): void {
    this.#pending = null;
    this.#held = null;
  }

  //? The registry a failed build leaves is the one from before the save: a backend booted beside it would pair them.
  #registryFailedSince(generation: number): boolean {
    return (["csr", "ssr"] as const).some((phase) => {
      const status = this.#statuses.phase(phase);
      return status?.ok === false && status.generation >= generation;
    });
  }

  #release(): void {
    const held = this.#held ?? [];
    this.#held = null;
    for (const update of held) this.#backend.send(update);
  }
}
