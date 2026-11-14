import type { BrowserErrorKind } from "../signal/browserError";

export class RscClientErrorSender {
  static readonly path = "/_akan/client-report";
  static readonly maxBytes = 8_192;
  static readonly #pageLimit = 5;
  static readonly #limits = { name: 100, message: 1_000, stack: 4_000, digest: 64 } as const;
  readonly #requestId: string;
  readonly #sent = new Set<string>();
  readonly #seen = new WeakSet<object>();

  constructor(requestId: string) {
    this.#requestId = requestId;
  }

  send(error: unknown, kind: BrowserErrorKind, routeId: string | null) {
    if (RscClientErrorSender.#reportedByServer(error, kind)) return;
    if (typeof error === "object" && error !== null) {
      if (this.#seen.has(error)) return;
      this.#seen.add(error);
    }
    const { name, message, stack, digest } = RscClientErrorSender.#fields(error);
    const signature = `${kind}\n${name}\n${message}`;
    if (this.#sent.size >= RscClientErrorSender.#pageLimit || this.#sent.has(signature)) return;
    this.#sent.add(signature);
    const report = { requestId: this.#requestId, routeId, kind, name, message, digest };
    const body = [stack, stack?.slice(0, 1_000), null]
      .map((cut) => JSON.stringify({ ...report, stack: cut ?? null }))
      .find((text) => new TextEncoder().encode(text).byteLength <= RscClientErrorSender.maxBytes);
    if (!body) return;
    //? A string body goes as `text/plain`, which a page sends with no preflight and the server takes alone.
    fetch(RscClientErrorSender.path, {
      method: "POST",
      body,
      keepalive: true,
      credentials: "omit",
      cache: "no-store",
      referrerPolicy: "no-referrer",
    }).catch(() => undefined);
  }

  //? A digest marks a route control or a server error streamed into the page, which the server already reported.
  static #reportedByServer(error: unknown, kind: BrowserErrorKind): boolean {
    const digest = (error as { digest?: unknown } | null)?.digest;
    return typeof digest === "string" && (kind !== "recoverable" || digest.startsWith("AKAN_"));
  }

  static #fields(error: unknown) {
    const limits = RscClientErrorSender.#limits;
    const text = (value: unknown, limit: number) => (typeof value === "string" ? value.slice(0, limit) : null);
    if (!(error instanceof Error))
      return { name: "NonError", message: RscClientErrorSender.#describe(error), stack: null, digest: null };
    return {
      name: text(error.name, limits.name) ?? "Error",
      message: text(error.message, limits.message) ?? "",
      stack: text(error.stack, limits.stack),
      digest: text((error as { digest?: unknown }).digest, limits.digest),
    };
  }

  static #describe(value: unknown): string {
    try {
      return String(value).slice(0, RscClientErrorSender.#limits.message);
    } catch {
      return typeof value;
    }
  }
}
