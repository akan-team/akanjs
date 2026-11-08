import net from "node:net";
import { type TunnelOpenFrame, tunnelWireContract } from "akanjs/common";
import { type TunnelStream, type TunnelStreamLink, tunnelResetCodeOf } from "./tunnelStream";

/** A raw TCP stream to a local port (SSH); provider side only — nothing opens one in wire version 1 yet. */
export class TunnelTcpStream implements TunnelStream {
  readonly #open: TunnelOpenFrame;
  readonly #link: TunnelStreamLink;
  readonly #hostname: string;
  readonly #ports: readonly number[];
  #socket: net.Socket | null = null;
  #forwarding: Promise<void> = Promise.resolve();
  #closed: boolean = false;
  #gatewayEnded: boolean = false;

  constructor(open: TunnelOpenFrame, link: TunnelStreamLink, hostname: string, ports: readonly number[]) {
    this.#open = open;
    this.#link = link;
    this.#hostname = hostname;
    this.#ports = ports;
  }

  async run() {
    const { streamId, port } = this.#open;
    if (!port || !this.#ports.includes(port)) {
      const message = port ? `tcp port ${port} is not shared` : "tcp open carries no port";
      this.#link.sendFrame({ type: "reset", streamId, code: "protocol", message });
      this.#link.closeSocket();
      return;
    }
    try {
      await new Promise<void>((resolve, reject) => {
        // Not `Bun.connect`: after `shutdown(true)` it fires its own `end` and drops the origin's reply (Bun 1.4).
        const socket = net.connect({ host: this.#hostname, port, allowHalfOpen: true });
        this.#socket = socket;
        socket.on("connect", () =>
          this.#link.sendFrame({ type: "head", streamId, status: 200, headers: [], body: true }),
        );
        socket.on("data", (data: Buffer) => {
          socket.pause();
          this.#forwarding = this.#forward(socket, data);
        });
        // Bun emits `end` and `close` on a paused socket as soon as the last chunk is handed out.
        socket.on("end", () =>
          this.#afterForward(() => {
            if (!this.#closed) this.#link.sendFrame({ type: "end", streamId });
          }),
        );
        socket.on("error", reject);
        socket.on("close", () =>
          this.#afterForward(() => {
            this.#finish();
            resolve();
          }),
        );
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.#link.sendFrame({ type: "reset", streamId, code: tunnelResetCodeOf(error), message });
      this.#finish();
    }
  }

  push(data: Uint8Array) {
    if (this.#closed || this.#gatewayEnded) return;
    this.#socket?.write(data);
  }

  end() {
    this.#gatewayEnded = true;
    this.#socket?.end();
  }

  reset() {
    this.#finish();
  }

  async #forward(socket: net.Socket, data: Uint8Array) {
    try {
      for (let at = 0; at < data.byteLength; at += tunnelWireContract.chunkBytes)
        await this.#link.sendPayload(data.subarray(at, at + tunnelWireContract.chunkBytes));
    } finally {
      if (!this.#closed) socket.resume();
    }
  }

  #afterForward(fn: () => void) {
    void this.#forwarding.then(fn, fn);
  }

  #finish() {
    if (this.#closed) return;
    this.#closed = true;
    this.#socket?.destroy();
    this.#socket = null;
    // A raw stream owns its data socket for its whole life, so the socket goes with it rather than being pooled.
    this.#link.closeSocket();
  }
}
