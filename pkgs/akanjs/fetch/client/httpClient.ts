import type { SerializedArg } from "akanjs/signal";

export interface ErrorResponsePayload {
  error: string;
  statusCode?: number;
  data?: Record<string, unknown>;
  details?: unknown;
  path?: string;
  timestamp?: string;
}

export interface RestoredError extends Error {
  error?: string;
  statusCode?: number;
  data?: unknown;
  details?: unknown;
  path?: string;
  timestamp?: string;
}

export interface ErrorConstructor {
  fromJSON: (payload: ErrorResponsePayload) => RestoredError;
}

interface FetchOptions {
  headers?: Record<string, string>;
  baseUrl?: string;
}

export class HttpClient {
  readonly baseUrl: string;
  constructor(
    baseUrl: string,
    private ErrorCls?: ErrorConstructor,
  ) {
    this.baseUrl = baseUrl;
  }

  setErrorConstructor(ErrorCls?: ErrorConstructor) {
    this.ErrorCls = ErrorCls;
  }
  #resolveBaseUrl(baseUrl?: string) {
    return (baseUrl ?? this.baseUrl).replace(/\/$/, "");
  }
  async get<Returns = unknown>(url: string, options: FetchOptions = {}): Promise<Returns> {
    const res = await fetch(`${this.#resolveBaseUrl(options.baseUrl)}${url}`, {
      headers: { "Content-Type": "application/json", ...options.headers },
    });
    return await this.#readJsonResponse<Returns>(res);
  }
  #makeReqContent(data: FormData | Record<string, unknown>): { body: BodyInit; headers: Record<string, string> } {
    // FormData: do not set Content-Type — fetch adds multipart boundary; a bare
    // "multipart/form-data" without boundary makes servers throw ERR_FORMDATA_PARSE_ERROR.
    if (data instanceof FormData) return { body: data, headers: {} };
    return { body: JSON.stringify(data), headers: { "Content-Type": "application/json" } };
  }
  async put<Returns = unknown>(
    url: string,
    data: FormData | Record<string, unknown>,
    options: FetchOptions = {},
  ): Promise<Returns> {
    const { body, headers } = this.#makeReqContent(data);
    const res = await fetch(`${this.#resolveBaseUrl(options.baseUrl)}${url}`, {
      method: "PUT",
      body,
      headers: { ...headers, ...options.headers },
    });
    return await this.#readJsonResponse<Returns>(res);
  }
  async post<Returns = unknown>(
    url: string,
    data: FormData | Record<string, unknown>,
    options: FetchOptions = {},
  ): Promise<Returns> {
    const { body, headers } = this.#makeReqContent(data);
    const res = await fetch(`${this.#resolveBaseUrl(options.baseUrl)}${url}`, {
      method: "POST",
      body,
      headers: { ...headers, ...options.headers },
    });
    return await this.#readJsonResponse<Returns>(res);
  }
  async delete<Returns = unknown>(url: string, options: FetchOptions = {}): Promise<Returns> {
    const res = await fetch(`${this.#resolveBaseUrl(options.baseUrl)}${url}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", ...options.headers },
    });
    return await this.#readJsonResponse<Returns>(res);
  }

  async #readJsonResponse<Returns>(res: Response): Promise<Returns> {
    const body = await res.json();
    if (res.ok) return body as Returns;
    throw this.#restoreError(body, res.status);
  }

  #restoreError(body: unknown, fallbackStatusCode: number): RestoredError {
    const payload =
      body && typeof body === "object" && "error" in body
        ? ({ statusCode: fallbackStatusCode, ...(body as Record<string, unknown>) } as ErrorResponsePayload)
        : ({ error: String(body), statusCode: fallbackStatusCode } satisfies ErrorResponsePayload);
    if (this.ErrorCls) return this.ErrorCls.fromJSON(payload);
    const error = new Error(payload.error);
    Object.assign(error, payload);
    return error;
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
      if (arg.arrDepth && Array.isArray(argValue))
        argValue.forEach((value) => {
          searchParams.append(arg.name, String(value));
        });
      else searchParams.set(arg.name, String(argValue));
    });
    const searchPath = searchParams.size > 0 ? `?${searchParams.toString()}` : "";
    const paramedPath = path.replace(/:(\w+)/g, (match, p1) => {
      const value = argMap.get(p1);
      return value === null || value === undefined ? match : String(value);
    });
    return `${paramedPath}${searchPath}`;
  }
  static makeBody(bodyArgs: SerializedArg[], uploadArgs: SerializedArg[], argMap: Map<string, unknown>) {
    if (uploadArgs.length > 0) {
      const formData = new FormData();
      uploadArgs.forEach((arg) => {
        const argValue = argMap.get(arg.name);
        if (arg.nullable && (argValue === null || argValue === undefined)) return;
        if (!arg.nullable && (argValue === null || argValue === undefined))
          throw new Error(`Argument ${arg.name} is required`);
        if (Array.isArray(argValue)) {
          argValue.forEach((value) => {
            formData.append(arg.name, value as Blob | string);
          });
        } else formData.append(arg.name, argValue as Blob | string);
      });
      bodyArgs.forEach((arg) => {
        const argValue = argMap.get(arg.name);
        if (arg.nullable && (argValue === null || argValue === undefined)) return;
        if (!arg.nullable && (argValue === null || argValue === undefined))
          throw new Error(`Argument ${arg.name} is required`);
        formData.append(arg.name, typeof argValue === "string" ? argValue : JSON.stringify(argValue));
      });
      return formData;
    } else {
      const body: Record<string, unknown> = {};
      bodyArgs.forEach((arg) => {
        const argValue = argMap.get(arg.name);
        if (!arg.nullable && (argValue === null || argValue === undefined))
          throw new Error(`Argument ${arg.name} is required`);
        body[arg.name] = argValue;
      });
      return body;
    }
  }
}
