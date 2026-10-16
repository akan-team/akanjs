import { trimTrailingSlashes } from "./trimSlashes";

export interface RestClientOptions {
  baseUrl?: string;
  headers?: HeadersInit;
  timeout?: number;
}

export interface RestRequestOptions extends Omit<RequestInit, "body" | "headers" | "method"> {
  headers?: HeadersInit;
  timeout?: number;
}

export class RestClient {
  readonly baseUrl: string;
  readonly headers: Headers;
  readonly timeout: number | undefined;

  constructor(options: string | RestClientOptions = {}) {
    const normalized = typeof options === "string" ? { baseUrl: options } : options;
    this.baseUrl = trimTrailingSlashes(normalized.baseUrl ?? "");
    this.headers = new Headers(normalized.headers);
    this.timeout = normalized.timeout;
  }

  async get<Returns>(url: string, options?: RestRequestOptions): Promise<Returns> {
    return await this.#request<Returns>("GET", url, undefined, options);
  }

  async post<Returns>(url: string, data?: unknown, options?: RestRequestOptions): Promise<Returns> {
    return await this.#request<Returns>("POST", url, data, options);
  }

  async put<Returns>(url: string, data?: unknown, options?: RestRequestOptions): Promise<Returns> {
    return await this.#request<Returns>("PUT", url, data, options);
  }

  async delete<Returns>(url: string, options?: RestRequestOptions): Promise<Returns> {
    return await this.#request<Returns>("DELETE", url, undefined, options);
  }

  async #request<Returns>(
    method: string,
    url: string,
    data?: unknown,
    options: RestRequestOptions = {},
  ): Promise<Returns> {
    const { body, headers } = this.#makeBody(data);
    const timeout = options.timeout ?? this.timeout;
    const response = await fetch(this.#makeUrl(url), {
      ...options,
      method,
      body,
      headers: this.#makeHeaders(headers, options.headers),
      signal: timeout ? AbortSignal.timeout(timeout) : undefined,
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    if (response.status === 204) {
      return undefined as Returns;
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      return (await response.json()) as Returns;
    }

    const text = await response.text();
    return (text.length > 0 ? text : undefined) as Returns;
  }

  #makeUrl(url: string) {
    if (/^https?:\/\//.test(url) || !this.baseUrl) return url;
    return `${this.baseUrl}${url.startsWith("/") ? url : `/${url}`}`;
  }

  #makeHeaders(...headersList: Array<HeadersInit | undefined>) {
    const headers = new Headers(this.headers);
    for (const headerList of headersList) {
      new Headers(headerList).forEach((value, key) => {
        headers.set(key, value);
      });
    }
    return headers;
  }

  #makeBody(data: unknown): { body?: BodyInit; headers?: HeadersInit } {
    if (data === undefined) return {};
    if (
      typeof data === "string" ||
      data instanceof FormData ||
      data instanceof URLSearchParams ||
      data instanceof Blob ||
      data instanceof ArrayBuffer
    )
      return { body: data };
    return {
      body: JSON.stringify(data),
      headers: { "Content-Type": "application/json" },
    };
  }
}
