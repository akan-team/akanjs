import { getEnv } from "akanjs/base";
import { authTokenKey, legacyAuthTokenKey } from "akanjs/common";

import { Err } from "../lib/dict";

export interface SsoCookie {
  signupToken?: string;
  ssoState?: string;
  ssoFor: "user" | "admin";
  signinRedirect: string;
  signupRedirect: string;
  adminRedirect?: string;
  errorRedirect?: string;
}

export interface AccessTokenResponse {
  jwt: string;
  refreshToken?: string;
  expiresAt?: unknown;
}

const headerSafeLocation = (redirect: string) => redirect.replace(/[^ -~]/gu, (char) => encodeURIComponent(char));

const userRefreshTokenLegacyKey = "userRefreshToken";
const adminRefreshTokenLegacyKey = "adminRefreshToken";
// A plain-http local server cannot keep a Secure cookie, so only local drops it.
const cookieAttrs = () => `Path=/; SameSite=Lax${getEnv().operationMode === "local" ? "" : "; Secure"}`;

export const userRefreshTokenKey = () => `${userRefreshTokenLegacyKey}:${getEnv().appName}`;
export const adminRefreshTokenKey = () => `${adminRefreshTokenLegacyKey}:${getEnv().appName}`;

type RefreshKind = "user" | "admin";

const refreshTokenKeys = (kind: RefreshKind) =>
  kind === "user"
    ? { scoped: userRefreshTokenKey(), legacy: userRefreshTokenLegacyKey }
    : { scoped: adminRefreshTokenKey(), legacy: adminRefreshTokenLegacyKey };

export const readRefreshTokenCookie = (
  cookies: { get: (key: string) => string | null | undefined },
  kind: RefreshKind,
) => {
  const { scoped, legacy } = refreshTokenKeys(kind);
  return cookies.get(scoped) ?? cookies.get(legacy) ?? undefined;
};

export const ssoSessionCookies = (jwt: string, refreshToken: string, kind: RefreshKind): Record<string, string> => ({
  [authTokenKey()]: jwt,
  [refreshTokenKeys(kind).scoped]: refreshToken,
});

export const expireCookie = (key: string, httpOnly = false) =>
  `${key}=; ${cookieAttrs()}${httpOnly ? "; HttpOnly" : ""}; Max-Age=0`;

export const setHttpOnlyCookie = (key: string, value: string, maxAgeSec?: number) =>
  `${key}=${encodeURIComponent(value)}; ${cookieAttrs()}; HttpOnly${maxAgeSec ? `; Max-Age=${maxAgeSec}` : ""}`;

const isRefreshTokenCookieKey = (key: string) =>
  key === userRefreshTokenLegacyKey ||
  key === adminRefreshTokenLegacyKey ||
  key.startsWith(`${userRefreshTokenLegacyKey}:`) ||
  key.startsWith(`${adminRefreshTokenLegacyKey}:`);

const appendRefreshTokenCookies = (headers: Headers, kind: RefreshKind, refreshToken?: string) => {
  const { scoped, legacy } = refreshTokenKeys(kind);
  headers.append("Set-Cookie", refreshToken ? setHttpOnlyCookie(scoped, refreshToken) : expireCookie(scoped, true));
  headers.append("Set-Cookie", expireCookie(legacy, true));
};

export const makeSsoRedirectResponse = (
  redirect: string,
  cookie?: Record<string, string>,
  extraSetCookies: string[] = [],
) => {
  const headers = new Headers({
    Location: headerSafeLocation(redirect),
    "X-Redirect-Method": "replace",
    "Cache-Control": "no-store",
  });

  if (cookie) {
    for (const [key, value] of Object.entries(cookie)) {
      const httpOnly = isRefreshTokenCookieKey(key) ? "; HttpOnly" : "";
      headers.append("Set-Cookie", `${key}=${encodeURIComponent(value)}; ${cookieAttrs()}${httpOnly}`);
    }
    headers.append("Set-Cookie", expireCookie(legacyAuthTokenKey));
    headers.append("Set-Cookie", expireCookie(userRefreshTokenLegacyKey, true));
    headers.append("Set-Cookie", expireCookie(adminRefreshTokenLegacyKey, true));
  }
  for (const setCookie of extraSetCookies) headers.append("Set-Cookie", setCookie);

  return new Response(null, { status: 302, headers });
};

export const makeAccessTokenResponse = (accessToken: AccessTokenResponse) => {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (accessToken.refreshToken) appendRefreshTokenCookies(headers, "user", accessToken.refreshToken);
  return new Response(JSON.stringify(accessToken), { headers });
};

export const makeSignoutResponse = (accessToken: AccessTokenResponse) => {
  const headers = new Headers({ "Content-Type": "application/json" });
  appendRefreshTokenCookies(headers, "user");
  return new Response(JSON.stringify(accessToken), { headers });
};

export const makeAdminAccessTokenResponse = (accessToken: AccessTokenResponse) => {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (accessToken.refreshToken) appendRefreshTokenCookies(headers, "admin", accessToken.refreshToken);
  return new Response(JSON.stringify(accessToken), { headers });
};

export const makeAdminSignoutResponse = (accessToken: AccessTokenResponse) => {
  const headers = new Headers({ "Content-Type": "application/json" });
  appendRefreshTokenCookies(headers, "admin");
  return new Response(JSON.stringify(accessToken), { headers });
};

export const getSsoOrigin = (request: Bun.BunRequest) => {
  const origin = request.cookies.get("ssoOrigin");
  if (!origin) throw new Err("shared.error.invalidSsoCallbackMissingOrigin");
  return origin;
};
