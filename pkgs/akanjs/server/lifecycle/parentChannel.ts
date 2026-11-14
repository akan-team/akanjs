import type { Logger } from "akanjs/common";
import type { AkanIpcMessage } from "akanjs/service";
import type { AkanServer } from "../akanServer";
import type { ServerLogging } from "../logging/serverLogging";
import type { WebRouter } from "../webRouter";
import { OrphanGroup } from "./orphanGroup";

type ParentChannelOwner = Pick<AkanServer, "logger" | "shutdownTimeoutMs" | "stop">;

export class ParentChannel {
  readonly #owner: ParentChannelOwner;
  readonly #logger: Logger;
  readonly #logging: ServerLogging;
  readonly #webRouter: () => WebRouter | null;
  #parentGone: boolean = false;
  #orphanExiting = false;

  constructor(owner: ParentChannelOwner, logging: ServerLogging, webRouter: () => WebRouter | null) {
    this.#owner = owner;
    this.#logger = owner.logger;
    this.#logging = logging;
    this.#webRouter = webRouter;
  }

  get gone() {
    return this.#parentGone;
  }

  register() {
    if (!process.listeners("disconnect").includes(this.#handleParentDisconnect)) {
      process.on("message", (message) => this.#handleIpcMessage(message as AkanIpcMessage));
      process.on("disconnect", this.#handleParentDisconnect);
    }
    //? A channel that closed before these listeners existed never calls them; `connected` is what is left of it.
    if (process.send && !process.connected) this.#handleParentDisconnect();
  }

  //? Bun answers a send on a closed channel with false and throws nothing.
  sendReady(message: AkanIpcMessage) {
    if (process.send?.(message) === false) this.#handleParentDisconnect();
  }

  // Fires when the gateway dies, even by SIGKILL; exiting keeps orphan replicas from holding ports into the next boot.
  readonly #handleParentDisconnect = () => {
    if (this.#parentGone) return;
    this.#parentGone = true;
    this.#logger.warn("Parent IPC channel closed; shutting down to avoid an orphaned replica");
    setTimeout(() => this.#exitOrphaned(1), this.#owner.shutdownTimeoutMs + 1_000);
    void this.#owner
      .stop()
      .then(() => this.#exitOrphaned(0))
      .catch(() => this.#exitOrphaned(1));
  };

  #exitOrphaned(code: number) {
    if (this.#orphanExiting) return;
    this.#orphanExiting = true;
    OrphanGroup.exit(code);
  }

  #handleIpcMessage(message: AkanIpcMessage) {
    if (!message || typeof message !== "object") return;
    if (message.type === "health.ping")
      process.send?.({
        type: "health.pong",
        nonce: message.nonce,
        sentAt: message.sentAt,
        pid: process.pid,
        rscWorker: this.#webRouter()?.rscWorkerStatus ?? null,
      } satisfies AkanIpcMessage);
    else if (message.type === "log.level") {
      this.#logging.setMinSev(message.minSev);
      this.#webRouter()?.setLogLevel(message.minSev);
    } else if (message.type === "shutdown") {
      void this.#owner
        .stop()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
    }
  }
}
