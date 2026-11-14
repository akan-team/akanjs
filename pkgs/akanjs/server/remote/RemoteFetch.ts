import { lookup } from "node:dns/promises";
import { TrustedProxy } from "akanjs/common";
import { RemoteError } from "./remoteError";

export type RemoteAddressLookup = (hostname: string) => Promise<{ address: string; family?: number }[]>;

export interface RemoteFetchOptions {
  /** Reaches loopback and private addresses, over plain http too. For a developer's machine and tests only. */
  allowPrivate?: boolean;
  lookup?: RemoteAddressLookup;
  fetchImpl?: (input: URL, init: RequestInit & { tls?: { serverName: string } }) => Promise<Response>;
  timeoutMs?: number;
  maxBytes?: number;
}

export interface RemoteRequest {
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
  maxBytes?: number;
}

export interface RemoteResponse {
  status: number;
  headers: Headers;
  text: string;
}

// Security: the url is one a person typed or a record stored, so every request resolves the name first, refuses an
// address inside the server's own network, connects to the address it checked, and follows no redirect.
export class RemoteFetch {
  static readonly timeoutMs = 30_000;
  static readonly maxBytes = 2 * 1024 * 1024;

  readonly #options: RemoteFetchOptions;

  constructor(options: RemoteFetchOptions = {}) {
    this.#options = options;
  }

  get allowsPrivate(): boolean {
    return this.#options.allowPrivate === true;
  }

  /** The url as this fetch would take it, or a `RemoteError` naming why not. */
  parse(input: string | URL): URL {
    const url = typeof input === "string" ? URL.parse(input) : new URL(input.href);
    if (!url) throw new RemoteError("remoteUrlRejected", "That is not a URL.");
    const plain = url.protocol === "http:" && this.allowsPrivate;
    if (url.protocol !== "https:" && !plain) throw new RemoteError("remoteUrlRejected", "The URL must be https.");
    if (url.username || url.password)
      throw new RemoteError("remoteUrlRejected", "The URL may not carry a user name or a password.");
    return url;
  }

  async send(input: string | URL, request: RemoteRequest = {}): Promise<RemoteResponse> {
    const url = this.parse(input);
    const { timeoutMs = RemoteFetch.timeoutMs, fetchImpl = fetch } = this.#options;
    const timeout = AbortSignal.timeout(timeoutMs);
    const signal = request.signal ? AbortSignal.any([request.signal, timeout]) : timeout;
    try {
      const { target, tls } = await this.#pinned(url, signal);
      const headers = new Headers(request.headers);
      if (target.host !== url.host) headers.set("host", url.host);
      const response = await fetchImpl(target, {
        method: request.method ?? "GET",
        headers,
        ...(request.body === undefined ? {} : { body: request.body }),
        redirect: "manual",
        signal,
        ...(tls ? { tls } : {}),
      });
      if (response.status >= 300 && response.status < 400) {
        await response.body?.cancel().catch(() => undefined);
        throw new RemoteError("remoteUrlRejected", `${url.host} answered with a redirect, which is not followed.`);
      }
      const maxBytes = request.maxBytes ?? this.#options.maxBytes ?? RemoteFetch.maxBytes;
      const text = await RemoteFetch.#read(response, maxBytes, signal);
      return { status: response.status, headers: response.headers, text };
    } catch (error) {
      if (error instanceof RemoteError || request.signal?.aborted) throw error;
      throw new RemoteError("remoteUnavailable", `${url.host} did not answer: ${RemoteFetch.#reason(error)}`);
    }
  }

  async json(input: string | URL, request: RemoteRequest = {}): Promise<{ status: number; body: unknown }> {
    const { status, text } = await this.send(input, {
      ...request,
      headers: { accept: "application/json", ...request.headers },
    });
    try {
      return { status, body: text.trim() ? JSON.parse(text) : null };
    } catch {
      return { status, body: null };
    }
  }

  //? With the address in the url, `serverName` is what Bun sends as SNI and checks the certificate against.
  async #pinned(url: URL, signal: AbortSignal): Promise<{ target: URL; tls?: { serverName: string } }> {
    if (this.allowsPrivate) return { target: url };
    const host = url.hostname.startsWith("[") ? url.hostname.slice(1, -1) : url.hostname;
    const literal = /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(":");
    if (literal) {
      if (TrustedProxy.isPrivateAddress(host))
        throw new RemoteError("remoteUrlRejected", "The URL points into a private network.");
      return { target: url };
    }
    const resolve = this.#options.lookup ?? RemoteFetch.#lookup;
    const addresses = await RemoteFetch.#until(
      signal,
      resolve(host).catch(() => []),
    );
    if (!addresses.length) throw new RemoteError("remoteUrlRejected", `${host} does not resolve.`);
    //? Every record is checked: a name answering one public and one private address gets no second try.
    if (addresses.some(({ address }) => TrustedProxy.isPrivateAddress(address)))
      throw new RemoteError("remoteUrlRejected", "The URL points into a private network.");
    const { address } = addresses.find(({ family }) => family === 4) ?? addresses[0];
    const target = new URL(url.href);
    target.hostname = address.includes(":") ? `[${address}]` : address;
    return { target, tls: { serverName: host } };
  }

  static readonly #lookup: RemoteAddressLookup = async (hostname) => await lookup(hostname, { all: true });

  //? A chunked body states no length, so the cap is counted as it arrives.
  static async #read(response: Response, maxBytes: number, signal: AbortSignal): Promise<string> {
    if (Number(response.headers.get("content-length")) > maxBytes) {
      await response.body?.cancel().catch(() => undefined);
      throw new RemoteError("remoteTooLarge", `The answer is past ${maxBytes} bytes.`);
    }
    const reader = response.body?.getReader();
    if (!reader) return "";
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    const next = () =>
      RemoteFetch.#until(signal, reader.read()).catch(async (error: unknown) => {
        await reader.cancel().catch(() => undefined);
        throw error;
      });
    for (let chunk = await next(); !chunk.done; chunk = await next()) {
      bytes += chunk.value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new RemoteError("remoteTooLarge", `The answer is past ${maxBytes} bytes.`);
      }
      chunks.push(chunk.value);
    }
    return Buffer.concat(chunks).toString("utf8");
  }

  //? A lookup cannot be cancelled and a body the fetch implementation hands over may ignore the signal, so both race it.
  static #until<T>(signal: AbortSignal, work: Promise<T>): Promise<T> {
    if (signal.aborted) return Promise.reject(signal.reason);
    return new Promise<T>((resolve, reject) => {
      const stop = () => reject(signal.reason);
      signal.addEventListener("abort", stop, { once: true });
      work.then(resolve, reject).finally(() => signal.removeEventListener("abort", stop));
    });
  }

  static #reason(error: unknown): string {
    if (error instanceof Error && error.name === "TimeoutError") return "timed out";
    return error instanceof Error ? error.message : String(error);
  }
}
