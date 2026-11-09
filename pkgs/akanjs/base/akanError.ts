export interface AkanErrorOptions<Data = unknown> {
  statusCode?: number;
  cause?: unknown;
  data?: Data;
}

export interface AkanErrorPayload {
  error: string;
  statusCode: number;
  code?: string;
  data?: unknown;
}

//* `statusCode` is the status the request path answers with when this error reaches it.
export class AkanError<Code extends string = string, Data = unknown> extends Error {
  //* Interned: a server bundle and main.js each carry a copy of this class, and either one's errors must be known.
  static readonly #marker = Symbol.for("akan.error");
  static readonly #statuses: { readonly [statusCode: number]: readonly [code: string, reason: string] } = {
    400: ["badRequest", "Bad Request"],
    401: ["unauthorized", "Unauthorized"],
    403: ["forbidden", "Forbidden"],
    404: ["notFound", "Not Found"],
    409: ["conflict", "Conflict"],
    413: ["payloadTooLarge", "Payload Too Large"],
    415: ["unsupportedMediaType", "Unsupported Media Type"],
    429: ["tooManyRequests", "Too Many Requests"],
    500: ["internalError", "Internal Server Error"],
    502: ["badGateway", "Bad Gateway"],
    503: ["serviceUnavailable", "Service Unavailable"],
    504: ["gatewayTimeout", "Gateway Timeout"],
  };

  readonly code: Code;
  readonly statusCode: number;
  readonly data?: Data;

  constructor(code: Code, message: string, { statusCode = 500, cause, data }: AkanErrorOptions<Data> = {}) {
    super(message, cause === undefined ? undefined : { cause });
    this.code = code;
    this.statusCode = statusCode;
    this.data = data;
    Object.defineProperty(this, AkanError.#marker, { value: true });
  }

  //* True when the request path sends `toJSON()` to the caller as it is. Otherwise only the code and status go out,
  //* since a message can name a table, a file or what a provider answered.
  get forwarded(): boolean {
    return false;
  }

  toJSON(): AkanErrorPayload {
    return {
      error: this.message,
      code: this.code,
      statusCode: this.statusCode,
      ...(this.data !== undefined ? { data: this.data } : {}),
    };
  }

  static codeOfStatus(statusCode: number) {
    return AkanError.#statuses[statusCode]?.[0] ?? `http${statusCode}`;
  }

  static reasonOf(statusCode: number) {
    return AkanError.#statuses[statusCode]?.[1] ?? (statusCode >= 500 ? "Internal Server Error" : "Request Failed");
  }

  static is<E extends AkanError>(
    this: abstract new (
      ...args: never[]
    ) => E,
    error: unknown,
    ...codes: E["code"][]
  ): error is E {
    const matched =
      (this as unknown) === AkanError
        ? typeof error === "object" && error !== null && (error as Record<symbol, unknown>)[AkanError.#marker] === true
        : error instanceof this;
    return matched && (!codes.length || codes.includes((error as E).code));
  }
}
