// Desktop: Bun's fetch from the Bun Worker, outside the WebView, so no CORS.
// - Redirects are followed here (`redirect: "manual"` hands back the 3xx with its Location), so
//   every hop is checked against the app's scope. tauri-plugins-workspace/plugins/http checks
//   redirect hops only with its opt-in `scopeRedirects` (src/commands.rs:181-213, src/config.rs:11-25)
//   and warns that leaving it off is an open-redirect/SSRF risk; akan-native always checks.
// - One AbortSignal.timeout covers every hop and the body. Tauri has only a connect timeout
//   (src/commands.rs:310-312), Capacitor's Android default is none (HttpRequestHandler.java:112-113).
// - A POST/PUT/PATCH without a body sends Content-Length: 0 (Tauri does too, src/commands.rs:328-332).
// - Bun decodes gzip/deflate/br/zstd itself; Content-Encoding and Content-Length then go
//   (common.ts responseHeaders). No cookie jar, no cache.

import { AkanNativeError } from "../../../packages/core/src/index.ts";
import { defineDesktopPlugin } from "../../../packages/desktop/src/plugin.ts";
import {
  BODY_METHODS,
  checkScope,
  encodeBody,
  MAX_REDIRECTS,
  networkError,
  prepare,
  REDIRECTS,
  redirected,
  redirectTarget,
  responseHeaders,
} from "./common.ts";
import type { HttpSpec } from "./index.ts";

/** `send` is replaceable for tests; the default is Bun's fetch. */
export function createDesktopHttp(send: typeof fetch = globalThis.fetch) {
  return defineDesktopPlugin<HttpSpec>({
    id: "http",
    methods: {
      async request(args, ctx) {
        const request = prepare(args);
        checkScope(ctx.scope, request.url);
        // The request's own time limit, and the call's signal (the page gave up on it, or is gone).
        const signal = ctx.signal
          ? AbortSignal.any([AbortSignal.timeout(request.timeout), ctx.signal])
          : AbortSignal.timeout(request.timeout);
        let url = request.url;
        let hop = { method: request.method, headers: request.headers, body: request.body };
        try {
          for (let redirects = 0; ; redirects++) {
            const body = hop.body ?? (BODY_METHODS.has(hop.method) ? new Uint8Array(0) : null);
            const response = await send(url, {
              method: hop.method,
              headers: hop.headers,
              body: body as BodyInit | null,
              redirect: "manual",
              signal,
            });
            const location = REDIRECTS.has(response.status) ? response.headers.get("location") : null;
            if (location === null) {
              const bytes = new Uint8Array(await response.arrayBuffer());
              return {
                status: response.status,
                headers: responseHeaders(response.headers),
                data: encodeBody(bytes, request.responseType),
                url,
              };
            }
            await response.body?.cancel();
            if (redirects === MAX_REDIRECTS)
              throw new AkanNativeError("INTERNAL", `${request.url} redirected more than ${MAX_REDIRECTS} times`);
            const next = redirectTarget(location, url);
            checkScope(ctx.scope, next, "redirect to");
            hop = redirected(response.status, hop, url, next);
            url = next;
          }
        } catch (error) {
          throw networkError(error, request);
        }
      },
    },
  });
}

export default createDesktopHttp();
