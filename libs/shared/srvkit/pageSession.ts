import { CookieJar, decodeJwtPayload, readSessionToken } from "akanjs/common";
import { readRefreshTokenCookie, renewedSessionCookies } from "./ssoHelper";

export interface SessionRefreshTokens {
  user?: string;
  admin?: string;
}

export interface RenewedSession {
  jwt: string;
  refreshTokens: SessionRefreshTokens;
}

type SessionRenew = (refreshTokens: SessionRefreshTokens) => Promise<RenewedSession | null>;

//* `option.setSessionRefresh` runs where no service can be injected, so the user service registers the renewal at boot.
export class PageSession {
  static #renew: SessionRenew | null = null;

  static use(renew: SessionRenew | null) {
    PageSession.#renew = renew;
  }

  //? Only past expiry: before it the page's own refresh is due, and one refresh token used twice can read as reuse.
  static async renewedCookies(request: Request): Promise<string[] | null> {
    const renew = PageSession.#renew;
    if (!renew || !PageSession.#isExpired(request)) return null;
    const refreshTokens = {
      user: readRefreshTokenCookie(request, "user"),
      admin: readRefreshTokenCookie(request, "admin"),
    };
    if (!refreshTokens.user && !refreshTokens.admin) return null;
    const renewed = await renew(refreshTokens);
    return renewed ? renewedSessionCookies(renewed.jwt, renewed.refreshTokens) : null;
  }

  static #isExpired(request: Request) {
    const { token } = readSessionToken(CookieJar.parse(request.headers.get("cookie")));
    if (!token) return false;
    try {
      const { exp } = decodeJwtPayload<{ exp?: number }>(token);
      return !!exp && exp * 1000 <= Date.now();
    } catch {
      return false;
    }
  }
}
