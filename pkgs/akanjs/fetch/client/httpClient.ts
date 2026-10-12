import { Backoff, type RetryPolicy } from "akanjs/common";
import type { HttpMutationMethod, SerializedArg } from "akanjs/signal";
import { type ErrorConstructor, type RestoredError, restoreRemoteError } from "./remoteError";

export interface HttpClientOptions {
  headers?: Record<string, string>;
  /** Milliseconds before the request is abandoned; `false` waits as long as the browser will. */
  timeout?: number | false;
  ErrorCls?: ErrorConstructor;
}

interface FetchOptions extends Pick<HttpClientOptions, "headers" | "timeout"> {
  baseUrl?: string;
  /** Over the client's default; `false` sends once. */
  retry?: RetryPolicy | false;
  idempotencyKey?: string;
}

const jsonContentType = /^application\/(?:[\w.+-]+\+)?json\b/i;

const transportErrorKeyMap = {
  408: "base.error.gatewayTimeout",
  429: "base.error.tooManyRequests",
  502: "base.error.serverUnavailable",
  503: "base.error.serverUnavailable",
  504: "base.error.gatewayTimeout",
} as const;

const serverUnreachableKey = "base.error.serverUnreachable";
//* What a later try can change: no answer, a restart, a slow upstream, a rate limit, or the same key still running.
const retryableKeys = new Set([
  serverUnreachableKey,
  "base.error.serverUnavailable",
  "base.error.gatewayTimeout",
  "base.error.tooManyRequests",
  "base.error.idempotencyInFlight",
]);
const unexpectedResponseKey = "base.error.unexpectedResponse";
const transportDetailLimit = 200;
// A solo process has no gateway to answer a dead upstream with a 504, and a severed connection answers nothing at all.
const DEFAULT_TIMEOUT_MS = 30_000;

export class HttpClient {
  readonly baseUrl: string;
  #headers: Record<string, string>;
  #timeout?: number | false;
  #retry: RetryPolicy | false = false;
  private ErrorCls?: ErrorConstructor;
  constructor(baseUrl: string, options: HttpClientOptions = {}) {
    this.baseUrl = baseUrl;
    this.#headers = options.headers ?? {};
    this.#timeout = options.timeout;
    this.ErrorCls = options.ErrorCls;
  }

  setErrorConstructor(ErrorCls?: ErrorConstructor) {
    this.ErrorCls = ErrorCls;
  }
  /** The budget every call that names none takes. `false` waits as long as the runtime will. */
  setTimeout(timeout?: number | false) {
    this.#timeout = timeout;
  }
  /** What every call that names no `retry` of its own does; `false`, the default, sends once. */
  setRetry(retry: RetryPolicy | false) {
    this.#retry = retry;
  }
  #resolveUrl(url: string, options: FetchOptions) {
    return `${(options.baseUrl ?? this.baseUrl).replace(/\/$/, "")}${url}`;
  }
  // Without `Accept: application/json` a proxy takes this call for a navigation and answers with its own HTML page.
  #makeHeaders(headers: Record<string, string>, options: FetchOptions) {
    return { Accept: "application/json", ...this.#headers, ...headers, ...options.headers };
  }
  async get<Returns = unknown>(url: string, options: FetchOptions = {}): Promise<Returns> {
    return await this.#request<Returns>(
      this.#resolveUrl(url, options),
      { headers: this.#makeHeaders({ "Content-Type": "application/json" }, options) },
      options,
    );
  }
  #makeReqContent(data: FormData | Record<string, unknown>): { body: BodyInit; headers: Record<string, string> } {
    // No Content-Type: fetch adds the boundary, and a bare "multipart/form-data" throws ERR_FORMDATA_PARSE_ERROR.
    if (data instanceof FormData) return { body: data, headers: {} };
    return { body: JSON.stringify(data), headers: { "Content-Type": "application/json" } };
  }
  async send<Returns = unknown>(
    method: HttpMutationMethod,
    url: string,
    data: FormData | Record<string, unknown>,
    options: FetchOptions = {},
  ): Promise<Returns> {
    const { body, headers } = this.#makeReqContent(data);
    return await this.#request<Returns>(
      this.#resolveUrl(url, options),
      { method, body, headers: this.#makeHeaders(headers, options) },
      options,
    );
  }
  async put<Returns = unknown>(
    url: string,
    data: FormData | Record<string, unknown>,
    options: FetchOptions = {},
  ): Promise<Returns> {
    return await this.send<Returns>("PUT", url, data, options);
  }
  async post<Returns = unknown>(
    url: string,
    data: FormData | Record<string, unknown>,
    options: FetchOptions = {},
  ): Promise<Returns> {
    return await this.send<Returns>("POST", url, data, options);
  }
  async delete<Returns = unknown>(url: string, options: FetchOptions = {}): Promise<Returns> {
    return await this.#request<Returns>(
      this.#resolveUrl(url, options),
      { method: "DELETE", headers: this.#makeHeaders({ "Content-Type": "application/json" }, options) },
      options,
    );
  }

  //* A mutation retries only under an Idempotency-Key — named, or minted once for every try of this call — so a try
  //* whose answer was lost runs once on the server. An upload is sent once: its body may be a stream already read.
  async #request<Returns>(url: string, init: RequestInit, options: FetchOptions = {}): Promise<Returns> {
    const retry = options.retry ?? this.#retry;
    const mutation = !!init.method && init.method !== "GET";
    const idempotencyKey = options.idempotencyKey ?? (retry && mutation ? crypto.randomUUID() : undefined);
    const sent: RequestInit = idempotencyKey
      ? { ...init, headers: { ...(init.headers as Record<string, string>), "Idempotency-Key": idempotencyKey } }
      : init;
    const policy = retry && !(init.body instanceof FormData) ? retry : null;
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.#requestOnce<Returns>(url, sent, options);
      } catch (error) {
        const wait = policy ? HttpClient.retryWait(error, attempt, policy) : null;
        if (wait === null) throw error;
        await new Promise((resolve) => setTimeout(resolve, wait));
      }
    }
  }

  /** The wait before the next try, or `null` when this error is final or the tries are spent. */
  static retryWait(error: unknown, attempt: number, { attempts = 4, ...backoff }: RetryPolicy): number | null {
    const restored = error as RestoredError | undefined;
    if (attempt >= attempts || !retryableKeys.has(restored?.error ?? "")) return null;
    const wait = Backoff.delay(attempt, { min: 500, ...backoff });
    const seconds = (restored?.data as { seconds?: unknown } | undefined)?.seconds;
    return typeof seconds === "number" && seconds > 0 ? Math.max(wait, seconds * 1000) : wait;
  }

  async #requestOnce<Returns>(url: string, init: RequestInit, options: FetchOptions): Promise<Returns> {
    const res = await this.#fetch(url, this.#withTimeout(init, options));
    const body = await this.#readBody(res);
    if (res.ok) return body as Returns;
    throw this.#restoreError(body, res.status);
  }

  //* An upload gets no deadline: a large file on a slow uplink is a long request that is still working.
  #withTimeout(init: RequestInit, options: FetchOptions): RequestInit {
    const timeout = options.timeout ?? (init.body instanceof FormData ? false : (this.#timeout ?? DEFAULT_TIMEOUT_MS));
    if (timeout === false || !Number.isFinite(timeout) || timeout <= 0) return init;
    return { ...init, signal: AbortSignal.timeout(timeout) };
  }

  //* `fetch` rejects only when no response arrived: the server is unreachable, not `TypeError: Failed to fetch`.
  async #fetch(url: string, init: RequestInit) {
    try {
      return await fetch(url, init);
    } catch (error) {
      // A caller's own abort stays an `AbortError`; `AbortSignal.timeout`'s `TimeoutError` is this client giving up.
      if (error instanceof Error && error.name === "TimeoutError")
        throw this.#restoreError({ error: transportErrorKeyMap[408], data: { status: 408 } }, 408);
      if (error instanceof Error && error.name === "AbortError") throw error;
      throw this.#restoreError({ error: serverUnreachableKey, details: String(error) }, 503);
    }
  }

  //* A proxy answers a restarting upstream with its own page (nginx HTML, the gateway's plain-text 503), not our JSON.
  async #readBody(res: Response) {
    if (jsonContentType.test(res.headers.get("content-type") ?? "")) {
      try {
        return (await res.json()) as unknown;
      } catch (error) {
        throw this.#transportError(res, String(error));
      }
    }
    const raw = await res.text();
    const parsed = HttpClient.#parseJson(raw);
    if (parsed === undefined) throw this.#transportError(res, raw);
    return parsed;
  }

  // A body without the JSON content-type may still be ours — a proxy can strip the header.
  static #parseJson(raw: string): unknown {
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      return undefined;
    }
  }

  #transportError(res: Response, detail: string): RestoredError {
    const { status } = res;
    const error = transportErrorKeyMap[status as keyof typeof transportErrorKeyMap] ?? unexpectedResponseKey;
    const data = status === 429 ? { status, seconds: HttpClient.#retryAfterSeconds(res) } : { status };
    return this.#restoreError({ error, data, details: detail.slice(0, transportDetailLimit) }, status);
  }

  // A proxy's own 429 may name no wait at all; a minute is what the message then promises.
  static #retryAfterSeconds(res: Response): number {
    const header = res.headers.get("retry-after")?.trim() ?? "";
    const seconds = /^\d+$/.test(header) ? Number(header) : Math.ceil((Date.parse(header) - Date.now()) / 1000);
    return Number.isFinite(seconds) && seconds > 0 ? seconds : 60;
  }

  #restoreError(body: unknown, fallbackStatusCode: number): RestoredError {
    return restoreRemoteError(body, fallbackStatusCode, this.ErrorCls);
  }
  static makePath(key: string, paramArgs: SerializedArg[], prefix?: string) {
    const paramPath = paramArgs.length > 0 ? `/${paramArgs.map((arg) => `:${arg.name}`).join("/")}` : "";
    return `${prefix ? `/${prefix}` : ""}/${key}${paramPath}`;
  }
  static makeUrl(path: string, searchArgs: SerializedArg[], argMap: Map<string, unknown>) {
    const searchParams = new URLSearchParams();
    searchArgs.forEach((arg) => {
      const argValue = argMap.get(arg.name);
      if (argValue === null || argValue === undefined) return;
      // `String(value)` would send "[object Object]"; `HttpExecutionContext` parses this back by the same rule.
      if (arg.refName === "Any") {
        // A function or symbol stringifies to `undefined`, which `set` would send as "undefined": left out instead.
        const encoded = JSON.stringify(argValue);
        if (encoded !== undefined) searchParams.set(arg.name, encoded);
      } else if (arg.arrDepth && Array.isArray(argValue))
        argValue.forEach((value) => {
          searchParams.append(arg.name, String(value));
        });
      else searchParams.set(arg.name, String(argValue));
    });
    const searchPath = searchParams.size > 0 ? `?${searchParams.toString()}` : "";
    const paramedPath = path.replace(/:(\w+)/g, (match, p1) => {
      const value = argMap.get(p1);
      return value === null || value === undefined ? match : encodeURIComponent(String(value));
    });
    return `${paramedPath}${searchPath}`;
  }
  // A FileList is not an array: appended as one value it would send "[object FileList]".
  static #toUploadValues(argValue: unknown): (Blob | string)[] {
    if (Array.isArray(argValue)) return argValue as (Blob | string)[];
    if (typeof FileList !== "undefined" && argValue instanceof FileList) return Array.from(argValue);
    return [argValue as Blob | string];
  }
  static makeBody(bodyArgs: SerializedArg[], uploadArgs: SerializedArg[], argMap: Map<string, unknown>) {
    const valueOf = (arg: SerializedArg) => {
      const argValue = argMap.get(arg.name);
      if (!arg.nullable && (argValue === null || argValue === undefined))
        throw new Error(`Argument ${arg.name} is required`);
      return argValue;
    };
    if (!uploadArgs.length) return Object.fromEntries(bodyArgs.map((arg) => [arg.name, valueOf(arg)]));
    const formData = new FormData();
    uploadArgs.forEach((arg) => {
      const argValue = valueOf(arg);
      if (argValue === null || argValue === undefined) return;
      HttpClient.#toUploadValues(argValue).forEach((value) => {
        formData.append(arg.name, value);
      });
    });
    bodyArgs.forEach((arg) => {
      const argValue = valueOf(arg);
      if (argValue === null || argValue === undefined) return;
      formData.append(arg.name, typeof argValue === "string" ? argValue : JSON.stringify(argValue));
    });
    return formData;
  }
}
