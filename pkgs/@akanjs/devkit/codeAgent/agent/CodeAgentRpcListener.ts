import { existsSync, rmSync } from "node:fs";
import type { Socket, SocketListener } from "bun";
import type { CodeAgentRpcHost } from "./CodeAgentRpcHost";

export type CodeAgentRpcAddress = { unix: string } | { hostname: string; port: number };

interface ClientState {
  pending: Buffer | null;
  decoder: TextDecoder;
}

/**
 * `akan code --rpc-listen <unix:PATH | tcp:[HOST:]PORT>` — the RPC host on a socket instead of stdio, so the agent
 * outlives the process driving it. A control plane that restarts reconnects and resumes with
 * `get_state { sinceSeq }`; the turn it was watching kept running in the meantime.
 *
 * One client at a time: a new connection replaces the old one, which is what a reconnecting control plane whose
 * previous socket has not timed out yet needs. TCP binds 127.0.0.1 unless a host is named, because the wire has
 * no authentication of its own — reach a pod through its unix socket and whatever the orchestrator already
 * authenticates.
 */
export class CodeAgentRpcListener {
  readonly #host: CodeAgentRpcHost;
  readonly #address: CodeAgentRpcAddress;
  #listener: SocketListener<ClientState> | null = null;
  #client: Socket<ClientState> | null = null;

  constructor(host: CodeAgentRpcHost, address: CodeAgentRpcAddress) {
    this.#host = host;
    this.#address = address;
  }

  static parse(spec: string): CodeAgentRpcAddress {
    if (spec.startsWith("unix:")) return { unix: spec.slice("unix:".length) };
    const rest = spec.startsWith("tcp:") ? spec.slice("tcp:".length) : spec;
    const separator = rest.lastIndexOf(":");
    const hostname = separator >= 0 ? rest.slice(0, separator) : "127.0.0.1";
    const port = Number(separator >= 0 ? rest.slice(separator + 1) : rest);
    if (!Number.isInteger(port) || port < 0 || port > 65_535)
      throw new Error(`--rpc-listen takes unix:<path> or tcp:[host:]<port>, not "${spec}"`);
    return { hostname: hostname || "127.0.0.1", port };
  }

  get port() {
    return this.#listener && "port" in this.#listener ? this.#listener.port : null;
  }

  listen() {
    if ("unix" in this.#address && existsSync(this.#address.unix)) rmSync(this.#address.unix);
    const socket = {
      open: (client: Socket<ClientState>) => this.#open(client),
      data: (client: Socket<ClientState>, data: Buffer) => this.#data(client, data),
      drain: (client: Socket<ClientState>) => this.#drain(client),
      close: (client: Socket<ClientState>) => this.#close(client),
      error: (client: Socket<ClientState>) => this.#close(client),
    };
    this.#listener =
      "unix" in this.#address
        ? Bun.listen<ClientState>({ unix: this.#address.unix, socket })
        : Bun.listen<ClientState>({ hostname: this.#address.hostname, port: this.#address.port, socket });
    this.#host.start();
    return this;
  }

  async serve() {
    if (!this.#listener) this.listen();
    await this.#host.shutdown;
    this.stop();
  }

  stop() {
    this.#client?.end();
    this.#client = null;
    this.#host.attach(null);
    this.#listener?.stop(true);
    this.#listener = null;
    if ("unix" in this.#address && existsSync(this.#address.unix)) rmSync(this.#address.unix);
  }

  #open(client: Socket<ClientState>) {
    client.data = { pending: null, decoder: new TextDecoder() };
    const previous = this.#client;
    this.#client = client;
    previous?.end();
    this.#host.attach((line) => this.#write(client, line));
  }

  #data(client: Socket<ClientState>, data: Buffer) {
    if (client !== this.#client) return;
    void this.#host.feed(client.data.decoder.decode(data, { stream: true }));
  }

  //* A socket write may take only part of a frame; the rest waits for `drain`, and frames behind it queue in order.
  #write(client: Socket<ClientState>, line: string) {
    if (client !== this.#client) return;
    const bytes = Buffer.from(line);
    if (client.data.pending) {
      client.data.pending = Buffer.concat([client.data.pending, bytes]);
      return;
    }
    const written = client.write(bytes);
    if (written < bytes.length) client.data.pending = bytes.subarray(Math.max(0, written));
  }

  #drain(client: Socket<ClientState>) {
    const pending = client.data.pending;
    if (!pending) return;
    const written = client.write(pending);
    client.data.pending = written < pending.length ? pending.subarray(Math.max(0, written)) : null;
  }

  #close(client: Socket<ClientState>) {
    if (client !== this.#client) return;
    this.#client = null;
    this.#host.attach(null);
  }
}
