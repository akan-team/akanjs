import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { chmodSync, existsSync, rmSync } from "node:fs";
import type { Socket, SocketListener } from "bun";
import type { CodeAgentRpcHost } from "./CodeAgentRpcHost";
import { codeAgentIsLoopback } from "./codeAgentHosts";

export type CodeAgentRpcAddress = { unix: string } | { hostname: string; port: number };

export interface CodeAgentRpcListenerOptions {
  token?: string | null;
}

interface ClientState {
  pending: Buffer | null;
  decoder: TextDecoder;
  admitted: boolean;
  preface: string;
  timer: ReturnType<typeof setTimeout> | null;
}

// One client at a time: a reconnecting control plane replaces a socket that has not timed out yet.
// A connection is a client only once its first line authenticates: until then it cannot displace the current one.
export class CodeAgentRpcListener {
  static readonly prefaceLimit = 4_096;
  static readonly prefaceMs = 5_000;
  readonly #host: CodeAgentRpcHost;
  readonly #address: CodeAgentRpcAddress;
  readonly #token: string | null;
  #listener: SocketListener<ClientState> | null = null;
  #client: Socket<ClientState> | null = null;

  constructor(host: CodeAgentRpcHost, address: CodeAgentRpcAddress, options: CodeAgentRpcListenerOptions = {}) {
    this.#host = host;
    this.#address = address;
    this.#token =
      options.token !== undefined ? options.token : "unix" in address ? null : CodeAgentRpcListener.newToken();
  }

  static newToken() {
    return randomBytes(32).toString("base64url");
  }

  static parse(spec: string, { anyHost = false }: { anyHost?: boolean } = {}): CodeAgentRpcAddress {
    if (spec.startsWith("unix:")) return { unix: spec.slice("unix:".length) };
    const rest = spec.startsWith("tcp:") ? spec.slice("tcp:".length) : spec;
    const separator = rest.lastIndexOf(":");
    const hostname = (separator >= 0 ? rest.slice(0, separator) : "") || "127.0.0.1";
    const port = Number(separator >= 0 ? rest.slice(separator + 1) : rest);
    if (!Number.isInteger(port) || port < 0 || port > 65_535)
      throw new Error(`--rpc-listen takes unix:<path> or tcp:[host:]<port>, not "${spec}"`);
    if (!anyHost && !codeAgentIsLoopback(hostname))
      throw new Error(
        `--rpc-listen ${spec} would be reachable from other machines. Bind 127.0.0.1, or pass --rpc-bind-any to mean it.`,
      );
    return { hostname, port };
  }

  get port(): number | null {
    const port = this.#listener && "port" in this.#listener ? this.#listener.port : null;
    return typeof port === "number" ? port : null;
  }

  get token() {
    return this.#token;
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
    if ("unix" in this.#address) {
      // Created owner-only, so no other user can connect in the moment before the chmod.
      const umask = process.umask(0o177);
      try {
        this.#listener = Bun.listen<ClientState>({ unix: this.#address.unix, socket });
      } finally {
        process.umask(umask);
      }
      chmodSync(this.#address.unix, 0o600);
    } else
      this.#listener = Bun.listen<ClientState>({ hostname: this.#address.hostname, port: this.#address.port, socket });
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
    client.data = { pending: null, decoder: new TextDecoder(), admitted: false, preface: "", timer: null };
    client.data.timer = setTimeout(() => {
      if (!client.data.admitted) client.end();
    }, CodeAgentRpcListener.prefaceMs);
  }

  #data(client: Socket<ClientState>, data: Buffer) {
    const text = client.data.decoder.decode(data, { stream: true });
    if (client.data.admitted) {
      if (client === this.#client) void this.#host.feed(text);
      return;
    }
    client.data.preface += text;
    const preface = client.data.preface.trimStart();
    // A browser or any other protocol speaks first with something other than a JSON frame.
    if (preface && !preface.startsWith("{")) {
      client.end();
      return;
    }
    if (!this.#token) {
      this.#admit(client);
      return void this.#host.feed(preface);
    }
    const newline = preface.indexOf("\n");
    if (newline < 0) {
      if (preface.length > CodeAgentRpcListener.prefaceLimit) client.end();
      return;
    }
    if (!this.#authenticates(preface.slice(0, newline))) {
      client.write(`${JSON.stringify({ type: "reply", id: "auth", ok: false, error: "unauthorized" })}\n`);
      client.end();
      return;
    }
    this.#admit(client);
    this.#write(client, `${JSON.stringify({ type: "reply", id: "auth", ok: true })}\n`);
    const rest = preface.slice(newline + 1);
    if (rest) void this.#host.feed(rest);
  }

  #admit(client: Socket<ClientState>) {
    if (client.data.timer) clearTimeout(client.data.timer);
    client.data.timer = null;
    client.data.admitted = true;
    client.data.preface = "";
    const previous = this.#client;
    this.#client = client;
    previous?.end();
    this.#host.attach((line) => this.#write(client, line));
  }

  #authenticates(line: string) {
    if (!this.#token) return true;
    let auth: unknown;
    try {
      auth = (JSON.parse(line) as { auth?: unknown }).auth;
    } catch {
      return false;
    }
    if (typeof auth !== "string") return false;
    const digest = (value: string) => createHash("sha256").update(value).digest();
    return timingSafeEqual(digest(auth), digest(this.#token));
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
    if (client.data?.timer) clearTimeout(client.data.timer);
    if (client !== this.#client) return;
    this.#client = null;
    this.#host.attach(null);
  }
}
