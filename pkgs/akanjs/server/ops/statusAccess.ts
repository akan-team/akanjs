import { createHash, timingSafeEqual } from "node:crypto";
import { bearerTokenOf, Logger } from "akanjs/common";
import { isLocalDevRuntime } from "../../signal/trace";
import { FailureLimiter } from "./failureLimiter";

interface StatusAccessOptions {
  tokens: (string | null | undefined)[];
  open?: boolean;
  failuresPerMinute?: number;
}

// Security: the detail names pids, restart causes, the last child error and the load. `AKAN_STATUS_TOKEN` unlocks this
// alone, for a scraper; `AKAN_LOG_STREAM_TOKEN` also does, since its holder already reads every log line. An ops token
// is single-use and opens snapshots, so a poller must not carry one. A local dev runtime stays open for the dev
// tooling that reads readiness and metrics over HTTP.
export class StatusAccess {
  static readonly minTokenLength = 32;
  static readonly #noStore = { "cache-control": "no-store" };
  static readonly #warned = new Set<string>();
  readonly #digests: Buffer[];
  readonly #open: boolean;
  readonly #failures: FailureLimiter;

  constructor({ tokens, open = false, failuresPerMinute = 10 }: StatusAccessOptions) {
    this.#digests = tokens.filter((token): token is string => !!token).map((token) => StatusAccess.digest(token));
    this.#open = open;
    this.#failures = new FailureLimiter({ limit: failuresPerMinute });
  }

  static fromEnv(): StatusAccess {
    return new StatusAccess({
      tokens: [StatusAccess.tokenOf("AKAN_STATUS_TOKEN"), StatusAccess.tokenOf("AKAN_LOG_STREAM_TOKEN")],
      open: isLocalDevRuntime(),
    });
  }

  static tokenOf(name: string): string | null {
    const token = process.env[name]?.trim();
    if (!token) return null;
    if (/\s/.test(token)) {
      StatusAccess.#warnOnce(`${name} must be one word, with no whitespace; it unlocks nothing`);
      return null;
    }
    if (token.length < StatusAccess.minTokenLength)
      StatusAccess.#warnOnce(
        `${name} is shorter than ${StatusAccess.minTokenLength} characters, short enough to guess; use a random one`,
      );
    return token;
  }

  static #warnOnce(message: string) {
    if (StatusAccess.#warned.has(message)) return;
    StatusAccess.#warned.add(message);
    new Logger("StatusAccess").warn(message);
  }

  //? Digests have one length, so the comparison takes the same time whatever length was presented.
  static digest(token: string): Buffer {
    return createHash("sha256").update(token).digest();
  }

  allows(req: Request, client?: string | null): boolean {
    if (this.#open) return true;
    const token = bearerTokenOf(req.headers.get("authorization"));
    if (!token || this.#failures.blocked(client)) return false;
    const presented = StatusAccess.digest(token);
    const matched = this.#digests.reduce((matched, digest) => timingSafeEqual(presented, digest) || matched, false);
    if (!matched) this.#failures.fail(client);
    return matched;
  }

  health(req: Request, detail: () => { status: string }, client?: string | null): Response {
    const body = detail();
    return Response.json(this.allows(req, client) ? body : { status: body.status }, { headers: StatusAccess.#noStore });
  }

  metrics(req: Request, detail: () => unknown, client?: string | null): Response {
    if (!this.allows(req, client))
      return new Response("Unauthorized", { status: 401, headers: { "www-authenticate": "Bearer" } });
    return Response.json(detail(), { headers: StatusAccess.#noStore });
  }
}
