import type { Logger } from "akanjs/common";
import type { BuilderMessage, BuilderResponse } from "akanjs/server";
import type { IncrementalBuilderHost } from "../incrementalBuilder";
import { BuilderRequestRouter } from "../incrementalBuilder/builderRequestRouter";
import { shouldHoldForReturningBuilder } from "./devHostPolicy";

interface BuilderRequestRelayLinks {
  builder: () => IncrementalBuilderHost | null;
  toBackend: (message: BuilderMessage) => void;
  markActivity: () => void;
  away: () => boolean;
  wake: (reason: string) => void;
}

export class BuilderRequestRelay {
  readonly #logger: Logger;
  readonly #env: Record<string, string>;
  readonly #links: BuilderRequestRelayLinks;
  readonly #requests = new BuilderRequestRouter();
  #held: BuilderMessage[] = [];

  constructor({ logger, env }: { logger: Logger; env: Record<string, string> }, links: BuilderRequestRelayLinks) {
    this.#logger = logger;
    this.#env = env;
    this.#links = links;
  }

  startGeneration(): void {
    this.#requests.startGeneration();
  }

  settle<T extends BuilderResponse>(message: T): T | null {
    return this.#requests.settle(message);
  }

  send(message: BuilderMessage): void {
    this.#links.markActivity();
    if (this.#links.away()) {
      this.#held.push(message);
      this.#links.wake(`${message.type} arrived while suspended`);
      return;
    }
    // In `env`, which every builder spawn re-reads, so a restarted builder stays armed for a mobile dev session. A view's
    // shell is asked for per read, so it arms nothing.
    if (message.type === "build-csr" && !message.shell && this.#env.AKAN_DEV_CSR_REBUILD !== "1") {
      Object.assign(this.#env, { AKAN_DEV_CSR_REBUILD: "1" });
      this.#logger.verbose(`[csr] armed dev CSR rebuilds (${message.reason})`);
    }
    const builder = this.#links.builder();
    // Renumbered per backend generation; the failure replies below use that backend's own `message.id`.
    if (message.type === "build-route" || message.type === "build-csr" || message.type === "build-graph") {
      const outgoing = this.#requests.issue(message);
      if (builder?.send(outgoing)) return;
      this.#requests.withdraw(outgoing.id);
    } else if (builder?.send(message)) return;
    const status = builder?.status ?? "stopped";
    // A returning builder is a gap, not a failure: hold the request (`BuilderRpc`'s timeout still bounds it).
    if (shouldHoldForReturningBuilder({ status, heldCount: this.#held.length })) {
      this.#held.push(message);
      this.#logger.verbose(
        `[builder] holding ${message.type} until the builder is ready (${this.#held.length} waiting)`,
      );
      return;
    }
    if (this.#failRequest(message, `builder is ${status}; reload after the builder is ready`)) return;
    this.#logger.warn("akanAppHost builder is not running");
  }

  flush(): void {
    const pending = this.#held.splice(0);
    if (pending.length === 0) return;
    this.#logger.verbose(`[builder] replaying ${pending.length} request(s) held while the builder was away`);
    for (const message of pending) this.send(message);
  }

  // Held requests carry the departing backend's ids, which the new one reissues from 1, so a replay would
  // misdeliver answers; nothing is answered because the old backend is already stopped.
  discard(reason: string): void {
    const held = this.#held.splice(0);
    if (held.length === 0) return;
    this.#logger.verbose(`[builder] dropped ${held.length} held builder request(s): ${reason}`);
  }

  fail(reason: string): void {
    const held = this.#held.splice(0);
    if (held.length === 0) return;
    this.#logger.warn(`failing ${held.length} held builder request(s): ${reason}`);
    for (const message of held) this.#failRequest(message, reason);
  }

  #failRequest(message: BuilderMessage, error: string): boolean {
    if (message.type === "build-route")
      this.#links.toBackend({ type: "build-route-res", id: message.id, ok: false, error, kind: "unavailable" });
    else if (message.type === "build-csr")
      this.#links.toBackend({ type: "build-csr-res", id: message.id, ok: false, error, kind: "unavailable" });
    else if (message.type === "build-graph")
      this.#links.toBackend({ type: "build-graph-res", id: message.id, ok: false, error, kind: "unavailable" });
    else return false;
    return true;
  }
}
