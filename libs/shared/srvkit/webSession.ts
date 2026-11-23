import { AsyncLocalStorage } from "node:async_hooks";
import { accessTokenSeconds } from "@libs/util/common";
import { dayjs } from "akanjs/base";
import { CookieJar, SessionCookies, sessionTokenContract } from "akanjs/common";
import { CrossSiteGuard } from "akanjs/signal";

export interface SessionOptions {
  // true: a server-rendered page's sign-in, SSO completion and refresh are answered with the session cookies alone.
  cookieOnly?: boolean;
}

export class WebSession {
  static readonly cookieOnlyByDefault = true;
  //? Nothing renews a refused token in a native shell or another origin's app, so it keeps the pre-3.3.0 lifetime.
  static readonly cookielessAccessTokenSeconds = 7 * 24 * 60 * 60;
  static #cookieOnly: boolean = WebSession.cookieOnlyByDefault;
  static readonly #accessTokenSeconds = new AsyncLocalStorage<number>();

  static configure({ cookieOnly = WebSession.cookieOnlyByDefault }: SessionOptions = {}) {
    WebSession.#cookieOnly = cookieOnly;
  }

  static get cookieOnly() {
    return WebSession.#cookieOnly;
  }

  //? Security: asking is not enough. A page always sends its session cookies, so their holder gets cookies alone.
  static handsTokensTo(req: Request | undefined) {
    if (!WebSession.#cookieOnly) return true;
    return !!req && WebSession.#keepsTokensItself(req);
  }

  //? Security: seven days never go to a page on this server's own host, a browser that takes the session cookies.
  static answering<Answer>(req: Request | undefined, answer: () => Promise<Answer>): Promise<Answer> {
    const cookieless = !!req && WebSession.#keepsTokensItself(req) && !WebSession.#isOwnHostPage(req);
    const seconds = cookieless ? WebSession.cookielessAccessTokenSeconds : accessTokenSeconds;
    return WebSession.#accessTokenSeconds.run(seconds, answer);
  }

  static accessTokenExpiresAt() {
    return dayjs().add(WebSession.#accessTokenSeconds.getStore() ?? accessTokenSeconds, "second");
  }

  static #keepsTokensItself(req: Request) {
    if (!WebSession.#asksForTokens(req)) return false;
    const jar = CookieJar.parse(req.headers.get("cookie"));
    return !SessionCookies.names().some((name) => jar.has(name));
  }

  //? A native app released before the ask header calls from an allowlisted origin, which holds no cookie of this host.
  static #asksForTokens(req: Request) {
    if (sessionTokenContract.asksForBody(req.headers)) return true;
    return CrossSiteGuard.corsOrigin(req) !== null && !WebSession.#isOwnHostPage(req);
  }

  //? A browser's same-origin GET carries no `Origin`; `Sec-Fetch-Site` is a header no page script can set.
  static #isOwnHostPage(req: Request) {
    if (req.headers.get("sec-fetch-site") === "same-origin") return true;
    return CrossSiteGuard.isFromOwnHost(req, new URL(req.url));
  }
}
