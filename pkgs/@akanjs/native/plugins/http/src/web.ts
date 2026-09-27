// Web: the page's own fetch, so the browser's rules apply and nothing is bypassed:
// - CORS: a cross-origin server must allow the page's origin (WV-4), and only CORS-safelisted or
//   Access-Control-Expose-Headers response headers are visible. Set-Cookie never is.
// - The page's Content-Security-Policy: akan-native's strict preset allows connect-src 'self' only.
// - The browser drops forbidden request headers (Cookie, Origin, Referer, …) and sends cookies
//   for same-origin requests.
// - The browser follows redirects itself (`redirect: "manual"` gives an opaque response), so the
//   app's scope is checked on the first and on the final URL.
import { defineWebPlugin, type WebCallContext } from "../../../packages/core/src/index.ts";
import { canonicalUrl, checkScope, encodeBody, networkError, prepare, responseHeaders } from "./common.ts";
import type { HttpSpec } from "./index.ts";

const HINT =
  " (on the web the server must allow this origin (CORS) and the page's Content-Security-Policy must allow it in connect-src)";

export const web = defineWebPlugin<HttpSpec>({
  methods: {
    async request(args, ctx?: WebCallContext) {
      const request = prepare(args);
      checkScope(ctx?.scope, request.url);
      let response: Response;
      let bytes: Uint8Array;
      try {
        response = await globalThis.fetch(request.url, {
          method: request.method,
          headers: request.headers,
          body: request.body as BodyInit | null,
          redirect: "follow",
          cache: "no-store",
          signal: AbortSignal.timeout(request.timeout),
        });
        bytes = new Uint8Array(await response.arrayBuffer());
      } catch (error) {
        throw networkError(error, request, HINT);
      }
      const url = (response.url && canonicalUrl(response.url)) || request.url;
      if (url !== request.url) checkScope(ctx?.scope, url, "redirect to");
      return {
        status: response.status,
        headers: responseHeaders(response.headers),
        data: encodeBody(bytes, request.responseType),
        url,
      };
    },
  },
});
