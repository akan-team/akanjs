import type { Logger } from "akanjs/common";
import { GatewayStatusPage } from "./gateway/gatewayStatusPage";
import type { RscRenderRefusal } from "./rscRenderRefusal";

export class RenderBusyResponse {
  static readonly #retryAfterSeconds = "1";
  static readonly #warnEveryMs = 10_000;
  static readonly #detail = "Too many pages are waiting to render";
  readonly #logger: Logger;
  #warnedAt = Number.NEGATIVE_INFINITY;
  #unreported = 0;

  constructor(logger: Logger) {
    this.#logger = logger;
  }

  document(req: Request, refusal: RscRenderRefusal): Response {
    this.#note(refusal);
    const accept = req.headers.get("accept") ?? "";
    if (accept.includes("text/html"))
      return RenderBusyResponse.#answer(
        GatewayStatusPage.html({
          heading: "Server is busy",
          detail: RenderBusyResponse.#detail,
          note: "This page reloads itself as soon as the server answers.",
        }),
        GatewayStatusPage.headers("text/html; charset=utf-8"),
      );
    if (!accept.includes("application/json"))
      return RenderBusyResponse.#answer(
        RenderBusyResponse.#detail,
        GatewayStatusPage.headers("text/plain; charset=utf-8"),
      );
    return RenderBusyResponse.#answer(
      JSON.stringify({
        error: "base.error.serverUnavailable",
        statusCode: 503,
        data: { status: 503 },
        details: RenderBusyResponse.#detail,
      }),
      GatewayStatusPage.headers("application/json; charset=utf-8"),
    );
  }

  rsc(refusal: RscRenderRefusal): Response {
    this.#note(refusal);
    return RenderBusyResponse.#answer("Service Unavailable", GatewayStatusPage.headers("text/plain; charset=utf-8"));
  }

  static #answer(body: string, headers: Headers): Response {
    headers.set("Retry-After", RenderBusyResponse.#retryAfterSeconds);
    return new Response(body, { status: 503, headers });
  }

  #note(refusal: RscRenderRefusal) {
    this.#unreported += 1;
    const now = performance.now();
    if (now - this.#warnedAt < RenderBusyResponse.#warnEveryMs) return;
    this.#logger.warn(`[SSR] ${this.#unreported} render(s) answered 503 code=${refusal.code}: ${refusal.message}`);
    this.#warnedAt = now;
    this.#unreported = 0;
  }
}
