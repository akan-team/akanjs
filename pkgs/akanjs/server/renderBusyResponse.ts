import type { Logger } from "akanjs/common";
import { applySecurityHeaders } from "./assetHeaders";
import { GatewayStatusPage } from "./gateway/gatewayStatusPage";
import type { RscRenderRefusal } from "./rscRenderRefusal";
import { ScriptPolicy } from "./scriptPolicy";

export class RenderBusyResponse {
  static readonly #retryAfterSeconds = 1;
  static readonly #warnEveryMs = 10_000;
  static readonly #detail = "Too many pages are waiting to render";
  //? The same bytes in every response, so a script CSP covers it with one hash.
  static readonly script = `(() => {
  const key = "akan.busy";
  const now = Date.now();
  let refusals = 0;
  try {
    const [count, at] = (sessionStorage.getItem(key) || "").split(":").map(Number);
    if (now - at < 120000) refusals = count || 0;
    sessionStorage.setItem(key, refusals + 1 + ":" + now);
  } catch {}
  const seconds = Math.min(30, ${RenderBusyResponse.#retryAfterSeconds} * 2 ** refusals);
  setTimeout(() => location.reload(), (seconds + Math.random() * seconds) * 1000);
})();`;
  static readonly #html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Server is busy</title>
<style>
  body { margin: 0; padding: 48px 24px; background: #111827; color: #e5e7eb; font-family: ui-sans-serif, system-ui, sans-serif; }
  main { max-width: 720px; margin: 0 auto; }
  h1 { font-size: 20px; color: #f87171; }
  p { color: #9ca3af; font-size: 14px; }
</style>
</head>
<body>
<main>
<h1>Server is busy</h1>
<p>${RenderBusyResponse.#detail}. This page tries again by itself in a moment.</p>
</main>
<script>${RenderBusyResponse.script}</script>
</body>
</html>`;
  readonly #logger: Logger;
  #warnedAt = Number.NEGATIVE_INFINITY;
  #unreported = 0;

  constructor(logger: Logger) {
    this.#logger = logger;
  }

  document(req: Request, refusal: RscRenderRefusal): Response {
    this.#note(refusal);
    const accept = req.headers.get("accept") ?? "";
    if (accept.includes("text/html")) {
      const headers = new Headers({ "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      const scripts = { hashes: [ScriptPolicy.hashOf(RenderBusyResponse.script)] };
      return RenderBusyResponse.#answer(
        RenderBusyResponse.#html,
        applySecurityHeaders(headers, { html: true, scripts }),
      );
    }
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
    headers.set("Retry-After", String(RenderBusyResponse.#retryAfterSeconds));
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
