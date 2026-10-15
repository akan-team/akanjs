import type { YjsRelayTransport } from "./useYjsRelay";

export class YjsRelayRoom {
  readonly #id: string;
  readonly #transport: YjsRelayTransport;
  #queue: Uint8Array[] = [];
  #onFrame: ((frame: Uint8Array) => void) | null = null;
  #unsubscribe: (() => void) | null = null;

  constructor(id: string, transport: YjsRelayTransport) {
    this.#id = id;
    this.#transport = transport;
  }

  async join() {
    this.#open();
    return await this.#transport.join(this.#id);
  }

  attach(onFrame: (frame: Uint8Array) => void) {
    this.#open();
    this.#onFrame = onFrame;
    for (const frame of this.#queue.splice(0)) onFrame(frame);
  }

  close() {
    this.#unsubscribe?.();
    this.#unsubscribe = null;
    this.#onFrame = null;
    this.#queue = [];
  }

  #open() {
    if (this.#unsubscribe) return;
    this.#unsubscribe = this.#transport.subscribe(this.#id, (frame) => {
      if (this.#onFrame) this.#onFrame(frame);
      else this.#queue.push(frame);
    });
  }
}
