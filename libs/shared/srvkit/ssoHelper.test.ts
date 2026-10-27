import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import * as base from "akanjs/base";
import { authTokenKey, SessionCookies } from "akanjs/common";
import {
  adminRefreshTokenKey,
  makeAccessTokenResponse,
  makeSignoutResponse,
  makeSsoRedirectResponse,
  readRefreshTokenCookie,
  ssoSessionCookies,
  userRefreshTokenKey,
} from "./ssoHelper";

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
    expect(cookies).toContain(`userRefreshToken:${appName}=refresh; Path=/; SameSite=Lax; HttpOnly`);
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
    expect(cookies).toContain(`__Host-userRefreshToken:${appName}=refresh; Path=/; SameSite=Lax; Secure; HttpOnly`);
    expect(expired(cookies, "userRefreshToken")).toBe(true);
    expect(expired(cookies, `userRefreshToken:${appName}`)).toBe(true);
  });

  test("signout expires the current and every retired refresh cookie", () => {
    const cookies = cookieValues(makeSignoutResponse({ jwt: "" }));
    for (const name of [userRefreshTokenKey(), "userRefreshToken", `userRefreshToken:${appName}`])
      expect(expired(cookies, name)).toBe(true);
  });

  test("SSO redirect writes the session and refresh cookies and expires every retired name", () => {
    const cookies = cookieValues(makeSsoRedirectResponse("/home", ssoSessionCookies("token", "refresh", "user")));
    expect(cookies).toContain(`__Host-jwt:${appName}=token; Path=/; SameSite=Lax; Secure`);
    expect(cookies).toContain(`__Host-userRefreshToken:${appName}=refresh; Path=/; SameSite=Lax; Secure; HttpOnly`);
    for (const name of ["jwt", `jwt:${appName}`, "userRefreshToken", `userRefreshToken:${appName}`])
      expect(expired(cookies, name)).toBe(true);
    for (const name of ["adminRefreshToken", `adminRefreshToken:${appName}`]) expect(expired(cookies, name)).toBe(true);
  });
});
