import { CookieJar, hostFromRequest, sessionTokenContract } from "akanjs/common";
import { CrossSiteGuard } from "akanjs/signal";

export interface SessionOptions {
  // true: a server-rendered page's sign-in, SSO completion and refresh are answered with the session cookies alone.
  cookieOnly?: boolean;
}

export class WebSession {
  static readonly cookieOnlyByDefault = false;
  static #cookieOnly = WebSession.cookieOnlyByDefault;

  static configure({ cookieOnly = WebSession.cookieOnlyByDefault }: SessionOptions = {}) {
    WebSession.#cookieOnly = cookieOnly;
  }

  static get cookieOnly() {
    return WebSession.#cookieOnly;
  }

  //? Security: asking is not enough. A page always sends its session cookies, so their holder gets cookies alone.
  static handsTokensTo(req: Request | undefined, sessionCookieKeys: string[]) {
    if (!WebSession.#cookieOnly) return true;
    if (!req || !WebSession.#asksForTokens(req)) return false;
    const jar = CookieJar.parse(req.headers.get("cookie"));
    return !sessionCookieKeys.some((key) => jar.has(key));
  }

  //? A native app released before the ask header calls from an allowlisted origin, which holds no cookie of this host.
  static #asksForTokens(req: Request) {
    if (sessionTokenContract.asksForBody(req.headers)) return true;
    const origin = CrossSiteGuard.corsOrigin(req);
    return origin !== null && URL.parse(origin)?.host !== hostFromRequest(req.headers, new URL(req.url));
  }
}
