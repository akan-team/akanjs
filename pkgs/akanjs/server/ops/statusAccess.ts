import { createHash, timingSafeEqual } from "node:crypto";
import { bearerTokenOf, Logger } from "akanjs/common";

interface StatusAccessOptions {
  tokens: (string | null | undefined)[];
  open?: boolean;
}

// Security: the detail names pids, restart causes, the last child error and the load. `AKAN_STATUS_TOKEN` unlocks this
// alone, for a scraper; `AKAN_LOG_STREAM_TOKEN` also does, since its holder already reads every log line. An ops token
// is single-use and opens snapshots, so a poller must not carry one. `local` stays open for the dev tooling that reads
// readiness and metrics over HTTP.
export class StatusAccess {
  static readonly #noStore = { "cache-control": "no-store" };
  static readonly #warned = new Set<string>();
  readonly #digests: Buffer[];
  readonly #open: boolean;

  constructor({ tokens, open = false }: StatusAccessOptions) {
    this.#digests = tokens.filter((token): token is string => !!token).map((token) => StatusAccess.#digest(token));
    this.#open = open;
  }

  static fromEnv(): StatusAccess {
    return new StatusAccess({
      tokens: [StatusAccess.#tokenOf("AKAN_STATUS_TOKEN"), StatusAccess.#tokenOf("AKAN_LOG_STREAM_TOKEN")],
      open: process.env.AKAN_PUBLIC_ENV === "local",
    });
  }

  static #tokenOf(name: string): string | null {
    const token = process.env[name]?.trim();
    if (!token) return null;
    if (!/\s/.test(token)) return token;
    if (!StatusAccess.#warned.has(name))
      new Logger("StatusAccess").warn(`${name} must be one word, with no whitespace; it does not unlock status detail`);
    StatusAccess.#warned.add(name);
    return null;
  }

  //? Digests have one length, so the comparison takes the same time whatever length was presented.
  static #digest(token: string): Buffer {
    return createHash("sha256").update(token).digest();
  }

  allows(req: Request): boolean {
    if (this.#open) return true;
    const token = bearerTokenOf(req.headers.get("authorization"));
    if (!token) return false;
    const presented = StatusAccess.#digest(token);
    return this.#digests.reduce((matched, digest) => timingSafeEqual(presented, digest) || matched, false);
  }

  health(req: Request, detail: () => { status: string }): Response {
    const body = detail();
    return Response.json(this.allows(req) ? body : { status: body.status }, { headers: StatusAccess.#noStore });
  }

  metrics(req: Request, detail: () => unknown): Response {
    if (!this.allows(req))
      return new Response("Unauthorized", { status: 401, headers: { "www-authenticate": "Bearer" } });
    return Response.json(detail(), { headers: StatusAccess.#noStore });
  }
}
