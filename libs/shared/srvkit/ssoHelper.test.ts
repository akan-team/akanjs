import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { sessionCookieMaxAgeSec } from "@libs/shared/common";
import * as base from "akanjs/base";
import { authTokenKey, SessionCookies, sessionTokenContract } from "akanjs/common";
import { SignupToken } from "./signupToken";
import {
  adminRefreshTokenKey,
  makeAccessTokenResponse,
  makeAdminAccessTokenResponse,
  makeAdminSignoutResponse,
  makeSignoutResponse,
  makeSignupTicketResponse,
  makeSsoRedirectResponse,
  makeSsoSigninResponse,
  readRefreshTokenCookie,
  ssoSessionCookies,
  userRefreshTokenKey,
} from "./ssoHelper";
import { WebSession } from "./webSession";

process.env.AKAN_PUBLIC_APP_NAME ??= "shared";
process.env.AKAN_PUBLIC_REPO_NAME ??= "soft-s2";
process.env.AKAN_PUBLIC_SERVE_DOMAIN ??= "localhost";

const cookieValues = (response: Response) => response.headers.getSetCookie();
const requestWith = (cookie: string) =>
  new Request("https://app.example.com/api/user/refreshJwt", { headers: { cookie } });

const pinOperationMode = (operationMode: "local" | "cloud") =>
  spyOn(base, "getEnv").mockReturnValue({ ...base.getEnv(), operationMode });
const expired = (cookies: string[], name: string) =>
  cookies.some((cookie) => cookie.startsWith(`${name}=;`) && cookie.includes("Max-Age=0"));

describe("ssoHelper auth cookies", () => {
  const { appName } = base.getEnv();

  beforeEach(() => {
    pinOperationMode("cloud");
  });

  afterEach(() => {
    mock.restore();
  });

  test("session cookie names are app-scoped and held to this host outside local", () => {
    const cookies = ssoSessionCookies("token", "refresh", "user");
    expect(Object.keys(cookies)).toEqual([`__Host-jwt:${appName}`, `__Host-userRefreshToken:${appName}`]);
    expect(Object.keys(cookies)).toEqual([authTokenKey(), userRefreshTokenKey()]);
    expect(adminRefreshTokenKey()).toBe(`__Host-adminRefreshToken:${appName}`);
  });

  test("a local server keeps the names without `__Host-`, whose Secure plain http cannot keep", () => {
    mock.restore();
    pinOperationMode("local");
    expect(Object.keys(ssoSessionCookies("token", "refresh", "admin"))).toEqual([
      `jwt:${appName}`,
      `adminRefreshToken:${appName}`,
    ]);
    const cookies = cookieValues(makeSsoRedirectResponse("/home", ssoSessionCookies("token", "refresh", "user")));
    expect(cookies).toContain(
      `userRefreshToken:${appName}=refresh; Path=/; SameSite=Lax; HttpOnly; Max-Age=${sessionCookieMaxAgeSec}`,
    );
    expect(cookies).toContain(
      `jwt:${appName}=token; Path=/; SameSite=Lax; HttpOnly; Max-Age=${sessionCookieMaxAgeSec}`,
    );
    expect(expired(cookies, `userRefreshToken:${appName}`)).toBe(false);
  });

  test("reads the app-scoped refresh cookie of its kind", () => {
    expect(
      readRefreshTokenCookie(requestWith(`userRefreshToken=legacy; ${userRefreshTokenKey()}=scoped`), "user"),
    ).toBe("scoped");
    expect(readRefreshTokenCookie(requestWith(`${adminRefreshTokenKey()}=admin`), "user")).toBeUndefined();
    expect(readRefreshTokenCookie(requestWith(`${adminRefreshTokenKey()}=admin`), "admin")).toBe("admin");
  });

  test("never reads a retired refresh cookie", () => {
    expect(readRefreshTokenCookie(requestWith("userRefreshToken=legacy"), "user")).toBeUndefined();
    expect(readRefreshTokenCookie(requestWith("adminRefreshToken=legacy"), "admin")).toBeUndefined();
    expect(readRefreshTokenCookie(requestWith(`userRefreshToken:${appName}=retired`), "user")).toBeUndefined();
  });

  test("a refresh cookie sent twice reads as none, in either order", () => {
    const scoped = userRefreshTokenKey();
    expect(readRefreshTokenCookie(requestWith(`${scoped}=mine; ${scoped}=planted`), "user")).toBeUndefined();
    expect(readRefreshTokenCookie(requestWith(`${scoped}=planted; ${scoped}=mine`), "user")).toBeUndefined();
    expect(
      readRefreshTokenCookie(requestWith(`${scoped}=mine; userRefreshToken=planted; ${scoped}=planted`), "user"),
    ).toBeUndefined();
  });

  test("the refresh cookies are watched for duplicates", () => {
    expect(SessionCookies.names()).toEqual(expect.arrayContaining([userRefreshTokenKey(), adminRefreshTokenKey()]));
  });

  test("access-token response writes the refresh cookie HttpOnly and expires every retired name", () => {
    const cookies = cookieValues(makeAccessTokenResponse({ jwt: "token", refreshToken: "refresh" }));
    expect(cookies).toContain(
      `__Host-userRefreshToken:${appName}=refresh; Path=/; SameSite=Lax; Secure; HttpOnly; Max-Age=${sessionCookieMaxAgeSec}`,
    );
    expect(expired(cookies, "userRefreshToken")).toBe(true);
    expect(expired(cookies, `userRefreshToken:${appName}`)).toBe(true);
  });

  test("access-token response issues the session HttpOnly beside a readable claims cookie", () => {
    const cookies = cookieValues(makeAccessTokenResponse({ jwt: "header.payload.signature" }));
    expect(cookies).toContain(
      `__Host-jwt:${appName}=header.payload.signature; Path=/; SameSite=Lax; Secure; HttpOnly; Max-Age=${sessionCookieMaxAgeSec}`,
    );
    expect(cookies).toContain(
      `__Host-jwt:${appName}.claims=header.payload; Path=/; SameSite=Lax; Secure; Max-Age=${sessionCookieMaxAgeSec}`,
    );
    expect(cookies.some((cookie) => cookie.includes("signupToken"))).toBe(false);
  });

  test("activation expires the signup cookie with the session it hands out", () => {
    const cookies = cookieValues(makeAccessTokenResponse({ jwt: "token" }, { endsSignup: true }));
    expect(expired(cookies, SignupToken.cookieKey())).toBe(true);
  });

  test("signout expires the session pair and the current and every retired refresh cookie", () => {
    const cookies = cookieValues(makeSignoutResponse({ jwt: "" }));
    for (const name of [userRefreshTokenKey(), "userRefreshToken", `userRefreshToken:${appName}`])
      expect(expired(cookies, name)).toBe(true);
    for (const name of [`__Host-jwt:${appName}`, `__Host-jwt:${appName}.claims`])
      expect(expired(cookies, name)).toBe(true);
    expect(expired(cookieValues(makeAdminSignoutResponse({ jwt: "" })), `__Host-jwt:${appName}`)).toBe(true);
  });

  test("a signup ticket hands its token over HttpOnly for as long as the token lives", () => {
    const cookies = cookieValues(makeSignupTicketResponse({ signupToken: "draft" }));
    expect(cookies).toEqual([
      `__Host-signupToken=draft; Path=/; SameSite=Lax; Secure; HttpOnly; Max-Age=${SignupToken.seconds}`,
    ]);
  });

  test("SSO redirect writes the session and refresh cookies and expires every retired name", () => {
    const cookies = cookieValues(makeSsoRedirectResponse("/home", ssoSessionCookies("token", "refresh", "user")));
    expect(cookies).toContain(
      `__Host-jwt:${appName}=token; Path=/; SameSite=Lax; Secure; HttpOnly; Max-Age=${sessionCookieMaxAgeSec}`,
    );
    expect(cookies).toContain(
      `__Host-jwt:${appName}.claims=token.; Path=/; SameSite=Lax; Secure; Max-Age=${sessionCookieMaxAgeSec}`,
    );
    expect(cookies).toContain(
      `__Host-userRefreshToken:${appName}=refresh; Path=/; SameSite=Lax; Secure; HttpOnly; Max-Age=${sessionCookieMaxAgeSec}`,
    );
    for (const name of ["jwt", `jwt:${appName}`, "userRefreshToken", `userRefreshToken:${appName}`])
      expect(expired(cookies, name)).toBe(true);
    for (const name of ["adminRefreshToken", `adminRefreshToken:${appName}`]) expect(expired(cookies, name)).toBe(true);
  });

  test("an SSO sign-up hands the signup token over HttpOnly", () => {
    const cookies = cookieValues(makeSsoRedirectResponse("/signup", { [SignupToken.cookieKey()]: "draft" }));
    expect(cookies).toContain(
      `__Host-signupToken=draft; Path=/; SameSite=Lax; Secure; HttpOnly; Max-Age=${sessionCookieMaxAgeSec}`,
    );
  });
});

describe("ssoHelper cookie-only web sessions", () => {
  const { appName } = base.getEnv();
  const tokens = { jwt: "header.payload.signature", refreshToken: "refresh", expiresAt: "2026-11-15T01:00:00.000Z" };
  const pageRequest = (cookie = "") =>
    new Request("https://app.example.com/api/user/signinWithPassword", { method: "POST", headers: { cookie } });
  const askingRequest = (cookie = "") =>
    new Request("https://app.example.com/api/user/signinWithPassword", {
      method: "POST",
      headers: { ...sessionTokenContract.makeHeaders(), cookie },
    });
  const issued = (response: Response, name: string) =>
    cookieValues(response).some((cookie) => cookie.startsWith(`${name}=`) && !cookie.includes("Max-Age=0"));

  beforeEach(() => {
    pinOperationMode("cloud");
  });

  afterEach(() => {
    WebSession.configure();
    mock.restore();
  });

  test("answers with the tokens in the body and in cookies while the option is off, whoever calls", async () => {
    for (const req of [undefined, pageRequest(), askingRequest(), askingRequest(`${authTokenKey()}=held`)]) {
      const response = makeAccessTokenResponse(tokens, { req });
      expect(await response.json()).toEqual(tokens);
      expect(issued(response, `__Host-jwt:${appName}`)).toBe(true);
      expect(issued(response, userRefreshTokenKey())).toBe(true);
    }
  });

  test("answers a page with the session cookies and a body that holds no token, once the option is on", async () => {
    WebSession.configure({ cookieOnly: true });
    for (const req of [undefined, pageRequest(), pageRequest(`${userRefreshTokenKey()}=held`)]) {
      const response = makeAccessTokenResponse(tokens, { req });
      expect(await response.json()).toEqual({ jwt: "", expiresAt: tokens.expiresAt });
      expect(issued(response, `__Host-jwt:${appName}`)).toBe(true);
      expect(issued(response, `__Host-jwt:${appName}.claims`)).toBe(true);
      expect(issued(response, userRefreshTokenKey())).toBe(true);
    }
  });

  test("answers an admin page the same way, with the admin refresh cookie", async () => {
    WebSession.configure({ cookieOnly: true });
    const response = makeAdminAccessTokenResponse(tokens, { req: pageRequest() });
    expect(await response.json()).toEqual({ jwt: "", expiresAt: tokens.expiresAt });
    expect(issued(response, `__Host-jwt:${appName}`)).toBe(true);
    expect(issued(response, adminRefreshTokenKey())).toBe(true);
    expect(await makeAdminAccessTokenResponse(tokens, { req: askingRequest() }).json()).toEqual(tokens);
  });

  test("hands a caller that asks and holds no session cookie the tokens in the body, and sets it none", async () => {
    WebSession.configure({ cookieOnly: true });
    const response = makeAccessTokenResponse(tokens, { req: askingRequest("theme=dark"), endsSignup: true });
    expect(await response.json()).toEqual(tokens);
    expect(issued(response, `__Host-jwt:${appName}`)).toBe(false);
    expect(issued(response, `__Host-jwt:${appName}.claims`)).toBe(false);
    expect(issued(response, userRefreshTokenKey())).toBe(false);
    expect(expired(cookieValues(response), SignupToken.cookieKey())).toBe(true);
  });

  test("keeps the tokens out of the body for a caller that asks while it holds a session cookie", async () => {
    WebSession.configure({ cookieOnly: true });
    for (const held of [authTokenKey(), userRefreshTokenKey(), adminRefreshTokenKey()]) {
      const response = makeAccessTokenResponse(tokens, { req: askingRequest(`${held}=held`) });
      expect(await response.json()).toEqual({ jwt: "", expiresAt: tokens.expiresAt });
      expect(issued(response, userRefreshTokenKey())).toBe(true);
    }
  });

  test("an SSO code exchange follows the same rule, and a sign-up answer passes through untouched", async () => {
    const signin = { jwt: tokens.jwt, refreshToken: tokens.refreshToken, redirect: "/home" };
    const signup = { jwt: null, signupToken: "draft", redirect: "/signup" };
    expect(makeSsoSigninResponse(signin, pageRequest())).toBe(signin);
    WebSession.configure({ cookieOnly: true });
    expect(makeSsoSigninResponse(signin, askingRequest())).toBe(signin);
    expect(makeSsoSigninResponse(signup, pageRequest())).toBe(signup);
    const response = makeSsoSigninResponse(signin, pageRequest());
    if (!(response instanceof Response)) throw new Error("a page's code exchange was answered with the tokens");
    expect(await response.json()).toEqual({ jwt: "", redirect: "/home" });
    expect(issued(response, `__Host-jwt:${appName}`)).toBe(true);
    expect(issued(response, userRefreshTokenKey())).toBe(true);
  });
});
