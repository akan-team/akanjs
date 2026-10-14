import { isRecord } from "akanjs/common";

//? The body is kept whole for reading the server's answer; only the message is cut, as it lands in a terminal.
export class CloudHttpError extends Error {
  static readonly #errKey = /^[\w$-]+\.error\.[\w$-]+$/;

  override readonly name = "CloudHttpError";

  constructor(
    readonly status: number,
    readonly statusText: string,
    readonly url: string,
    readonly body: string,
    readonly headers: Headers = new Headers(),
  ) {
    super(`${status} ${statusText} from ${url}: ${body.slice(0, 200)}`);
  }

  static async of(response: Response, url: string) {
    return new CloudHttpError(response.status, response.statusText, url, await response.text(), response.headers);
  }

  static statusOf(error: unknown) {
    return error instanceof CloudHttpError ? error.status : null;
  }

  /** The `error` of a JSON refusal: an Err key from the server itself, or whatever a proxy put there. */
  get error(): string | null {
    try {
      const parsed: unknown = JSON.parse(this.body);
      return isRecord(parsed) && typeof parsed.error === "string" ? parsed.error : null;
    } catch {
      return null;
    }
  }

  /** `error` when it is an Err key (`release.error.uploadCommitInProgress`), which only the server's own answer names. */
  get errKey(): string | null {
    const { error } = this;
    return error && CloudHttpError.#errKey.test(error) ? error : null;
  }

  get retryAfterMs(): number | null {
    return CloudHttpError.retryAfterMs(this.headers.get("retry-after"));
  }

  /** Retry-After in milliseconds from now: whole seconds, or an HTTP date. */
  static retryAfterMs(header: string | null): number | null {
    const value = header?.trim() ?? "";
    if (!value) return null;
    const ms = /^\d+$/.test(value) ? Number(value) * 1000 : Date.parse(value) - Date.now();
    return Number.isFinite(ms) ? Math.max(0, ms) : null;
  }
}
