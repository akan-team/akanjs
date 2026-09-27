import { type BridgeErrorBody, ERROR_CODES, type ErrorCode } from "./protocol.ts";

/**
 * The web-standard name of each code (bridge v1.1), so `error.name === "AbortError"` works as it does
 * for fetch; `code` stays the akan-native code.
 */
const ERROR_NAMES: Partial<Record<ErrorCode, string>> = {
  CANCELLED: "AbortError",
  TIMEOUT: "TimeoutError",
  PERMISSION_DENIED: "NotAllowedError",
  NOT_ALLOWED: "NotAllowedError",
  UNSUPPORTED: "NotSupportedError",
  NOT_FOUND: "NotFoundError",
};

export interface AkanNativeErrorOptions {
  cause?: unknown;
  /** Details a caller can act on, e.g. `{ reason: "packageManaged" }`. */
  data?: unknown;
  /** The same call may work later. */
  retryable?: boolean;
  /** Overrides the name derived from the code (DataCloneError for arguments JSON cannot carry). */
  name?: string;
}

export class AkanNativeError extends Error {
  readonly code: ErrorCode;
  readonly data?: unknown;
  readonly retryable: boolean;

  constructor(code: ErrorCode, message: string, options?: AkanNativeErrorOptions) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = options?.name ?? ERROR_NAMES[code] ?? "AkanNativeError";
    this.code = code;
    if (options?.data !== undefined) this.data = options.data;
    this.retryable = options?.retryable === true;
  }

  /**
   * Builds a real Error from a wire error so callers get a stack trace
   * (Capacitor copies native error fields onto an Error for the same reason:
   * capacitor/core/native-bridge.ts `returnResult`).
   */
  static fromBody(body: BridgeErrorBody | undefined, cause?: unknown): AkanNativeError {
    const code = body && ERROR_CODES.includes(body.code) ? body.code : "INTERNAL";
    return new AkanNativeError(code, body?.message ?? "unknown error", {
      data: body?.data,
      retryable: body?.retryable === true,
      cause,
    });
  }

  /** Normalizes anything thrown by an implementation into an AkanNativeError. */
  static from(error: unknown): AkanNativeError {
    if (error instanceof AkanNativeError) return error;
    if (error instanceof Error || isDomException(error)) {
      const e = error as Error;
      const code = FROM_NAMES[e.name];
      return new AkanNativeError(code ?? "INTERNAL", e.message, { cause: error });
    }
    return new AkanNativeError("INTERNAL", String(error));
  }

  /** The error body a host sends for this error. */
  toBody(): BridgeErrorBody {
    const body: BridgeErrorBody = { code: this.code, message: this.message };
    if (this.data !== undefined) body.data = this.data;
    if (this.retryable) body.retryable = true;
    return body;
  }
}

/** Web errors thrown by web implementations and the page's own signals. */
const FROM_NAMES: Record<string, ErrorCode> = {
  AbortError: "CANCELLED",
  TimeoutError: "TIMEOUT",
  NotAllowedError: "PERMISSION_DENIED",
  SecurityError: "PERMISSION_DENIED",
  NotSupportedError: "UNSUPPORTED",
  NotFoundError: "NOT_FOUND",
};

/** DOMException is not an Error subclass in every engine. */
function isDomException(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { name?: unknown }).name === "string" &&
    typeof (value as { message?: unknown }).message === "string"
  );
}

export function isAkanNativeError(error: unknown, code?: ErrorCode): error is AkanNativeError {
  return error instanceof AkanNativeError && (code === undefined || error.code === code);
}
