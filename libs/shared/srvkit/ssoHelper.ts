import { hostOnlyCookieKey } from "@libs/shared/common";
import { getEnv } from "akanjs/base";
import { authTokenKey, CookieJar, retiredAuthTokenKeys, SessionCookies } from "akanjs/common";

export interface SsoCookie {
  signupToken?: string;
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

type RefreshKind = "user" | "admin";

const refreshTokenKeys = (kind: RefreshKind) => {
  const legacy = kind === "user" ? userRefreshTokenLegacyKey : adminRefreshTokenLegacyKey;
  const appScoped = `${legacy}:${getEnv().appName}`;
  const scoped = hostOnlyCookieKey(appScoped);
  return { scoped, retired: [legacy, appScoped].filter((key) => key !== scoped) };
};

export const userRefreshTokenKey = () => refreshTokenKeys("user").scoped;
export const adminRefreshTokenKey = () => refreshTokenKeys("admin").scoped;
SessionCookies.watch(userRefreshTokenKey);
SessionCookies.watch(adminRefreshTokenKey);

export const readRefreshTokenCookie = (req: Request, kind: RefreshKind) =>
  CookieJar.parse(req.headers.get("cookie")).read(refreshTokenKeys(kind).scoped).value || undefined;

export const ssoSessionCookies = (jwt: string, refreshToken: string, kind: RefreshKind): Record<string, string> => ({
  [authTokenKey()]: jwt,
  [refreshTokenKeys(kind).scoped]: refreshToken,
});

export const expireCookie = (key: string, httpOnly = false) =>
  `${key}=; ${cookieAttrs()}${httpOnly ? "; HttpOnly" : ""}; Max-Age=0`;

export const setHttpOnlyCookie = (key: string, value: string, maxAgeSec?: number) =>
  `${key}=${encodeURIComponent(value)}; ${cookieAttrs()}; HttpOnly${maxAgeSec ? `; Max-Age=${maxAgeSec}` : ""}`;

const isRefreshTokenCookieKey = (key: string) => {
  const name = key.startsWith("__Host-") ? key.slice("__Host-".length) : key;
  return [userRefreshTokenLegacyKey, adminRefreshTokenLegacyKey].some(
    (legacy) => name === legacy || name.startsWith(`${legacy}:`),
  );
};

const appendRefreshTokenCookies = (headers: Headers, kind: RefreshKind, refreshToken?: string) => {
  const { scoped, retired } = refreshTokenKeys(kind);
  headers.append("Set-Cookie", refreshToken ? setHttpOnlyCookie(scoped, refreshToken) : expireCookie(scoped, true));
  for (const key of retired) headers.append("Set-Cookie", expireCookie(key, true));
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
    for (const key of retiredAuthTokenKeys()) headers.append("Set-Cookie", expireCookie(key));
    for (const kind of ["user", "admin"] as const)
      for (const key of refreshTokenKeys(kind).retired) headers.append("Set-Cookie", expireCookie(key, true));
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
