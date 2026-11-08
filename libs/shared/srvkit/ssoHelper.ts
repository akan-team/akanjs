import { hostOnlyCookieKey, sessionCookieMaxAgeSec } from "@libs/shared/common";
import { getEnv } from "akanjs/base";
import { authTokenKey, CookieJar, retiredAuthTokenKeys, SessionCookies } from "akanjs/common";
import { SessionCookie } from "akanjs/fetch";

import { SignupToken } from "./signupToken";

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

const appendSessionCookies = (headers: Headers, jwt: string) => {
  for (const setCookie of SessionCookie.issue(jwt, { maxAge: sessionCookieMaxAgeSec }))
    headers.append("Set-Cookie", setCookie);
};

const appendRefreshTokenCookies = (headers: Headers, kind: RefreshKind, refreshToken?: string) => {
  const { scoped, retired } = refreshTokenKeys(kind);
  headers.append(
    "Set-Cookie",
    refreshToken ? setHttpOnlyCookie(scoped, refreshToken, sessionCookieMaxAgeSec) : expireCookie(scoped, true),
  );
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
      if (key === authTokenKey()) appendSessionCookies(headers, value);
      else headers.append("Set-Cookie", setHttpOnlyCookie(key, value, sessionCookieMaxAgeSec));
    }
    for (const key of retiredAuthTokenKeys()) headers.append("Set-Cookie", expireCookie(key));
    for (const kind of ["user", "admin"] as const)
      for (const key of refreshTokenKeys(kind).retired) headers.append("Set-Cookie", expireCookie(key, true));
  }
  for (const setCookie of extraSetCookies) headers.append("Set-Cookie", setCookie);

  return new Response(null, { status: 302, headers });
};

interface AccessTokenResponseOption {
  endsSignup?: boolean;
}

const makeTokenResponse = (
  accessToken: AccessTokenResponse,
  kind: RefreshKind,
  { endsSignup = false }: AccessTokenResponseOption,
) => {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (accessToken.jwt) appendSessionCookies(headers, accessToken.jwt);
  if (accessToken.refreshToken) appendRefreshTokenCookies(headers, kind, accessToken.refreshToken);
  if (endsSignup) headers.append("Set-Cookie", expireCookie(SignupToken.cookieKey(), true));
  return new Response(JSON.stringify(accessToken), { headers });
};

const makeTokenEndResponse = (accessToken: AccessTokenResponse, kind: RefreshKind) => {
  const headers = new Headers({ "Content-Type": "application/json" });
  for (const setCookie of SessionCookie.expire()) headers.append("Set-Cookie", setCookie);
  appendRefreshTokenCookies(headers, kind);
  return new Response(JSON.stringify(accessToken), { headers });
};

export const makeAccessTokenResponse = (accessToken: AccessTokenResponse, option: AccessTokenResponseOption = {}) =>
  makeTokenResponse(accessToken, "user", option);

export const makeSignoutResponse = (accessToken: AccessTokenResponse) => makeTokenEndResponse(accessToken, "user");

export const makeAdminAccessTokenResponse = (accessToken: AccessTokenResponse) =>
  makeTokenResponse(accessToken, "admin", {});

export const makeAdminSignoutResponse = (accessToken: AccessTokenResponse) =>
  makeTokenEndResponse(accessToken, "admin");

export const makeSignupTicketResponse = (ticket: { signupToken: string }) => {
  const headers = new Headers({ "Content-Type": "application/json" });
  headers.append("Set-Cookie", setHttpOnlyCookie(SignupToken.cookieKey(), ticket.signupToken, SignupToken.seconds));
  return new Response(JSON.stringify(ticket), { headers });
};
