import { afterEach, describe, expect, test } from "bun:test";
import { authTokenKey } from "akanjs/common";
import { SessionCookie } from "akanjs/fetch";

import { PageSession, type SessionRefreshTokens } from "./pageSession";
import { adminRefreshTokenKey, userRefreshTokenKey } from "./ssoHelper";

process.env.AKAN_PUBLIC_APP_NAME ??= "shared";
process.env.AKAN_PUBLIC_REPO_NAME ??= "soft-s2";
process.env.AKAN_PUBLIC_SERVE_DOMAIN ??= "localhost";

const tokenExpiring = (secondsFromNow: number) => {
  const part = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${part({ alg: "HS256" })}.${part({ exp: Math.floor(Date.now() / 1000) + secondsFromNow })}.signature`;
};
const pageLoad = (cookies: Record<string, string>) =>
  new Request("https://app.example.com/inbox", {
    headers: {
      cookie: Object.entries(cookies)
        .map(([name, value]) => `${name}=${value}`)
        .join("; "),
    },
  });
const issued = (cookies: string[] | null, name: string) =>
  cookies?.find((cookie) => cookie.startsWith(`${name}=`) && !cookie.includes("Max-Age=0"));

describe("PageSession", () => {
  const asked: SessionRefreshTokens[] = [];
  const renewWith = (jwt: string | null, refreshTokens: SessionRefreshTokens = {}) =>
    PageSession.use(async (held) => {
      asked.push(held);
      return jwt ? { jwt, refreshTokens } : null;
    });

  afterEach(() => {
    PageSession.use(null);
    asked.length = 0;
  });

  test("renews nothing until a service registers the renewal", async () => {
    const request = pageLoad({ [authTokenKey()]: tokenExpiring(-60), [userRefreshTokenKey()]: "held" });
    expect(await PageSession.renewedCookies(request)).toBeNull();
  });

  test("leaves a session alone until its access token has expired, and one that holds no access token", async () => {
    renewWith(tokenExpiring(3600), { user: "next" });
    const live = pageLoad({ [authTokenKey()]: tokenExpiring(30), [userRefreshTokenKey()]: "held" });
    expect(await PageSession.renewedCookies(live)).toBeNull();
    expect(await PageSession.renewedCookies(pageLoad({ [userRefreshTokenKey()]: "held" }))).toBeNull();
    expect(await PageSession.renewedCookies(pageLoad({ [authTokenKey()]: "not-a-token" }))).toBeNull();
    expect(await PageSession.renewedCookies(new Request("https://app.example.com/inbox"))).toBeNull();
    expect(asked).toEqual([]);
  });

  test("renews an expired session from every refresh cookie the page load carries", async () => {
    const jwt = tokenExpiring(3600);
    renewWith(jwt, { user: "next-user", admin: "next-admin" });
    const cookies = await PageSession.renewedCookies(
      pageLoad({
        [authTokenKey()]: tokenExpiring(-1),
        [userRefreshTokenKey()]: "held-user",
        [adminRefreshTokenKey()]: "held-admin",
      }),
    );
    expect(asked).toEqual([{ user: "held-user", admin: "held-admin" }]);
    expect(issued(cookies, authTokenKey())).toContain(`${authTokenKey()}=${jwt};`);
    expect(issued(cookies, authTokenKey())).toContain("HttpOnly");
    expect(issued(cookies, SessionCookie.claimsKey())).toBeTruthy();
    expect(issued(cookies, userRefreshTokenKey())).toContain("next-user");
    expect(issued(cookies, userRefreshTokenKey())).toContain("HttpOnly");
    expect(issued(cookies, adminRefreshTokenKey())).toContain("next-admin");
  });

  test("sets only the refresh cookie of the identity that was renewed", async () => {
    renewWith(tokenExpiring(3600), { user: "next-user" });
    const cookies = await PageSession.renewedCookies(
      pageLoad({
        [authTokenKey()]: tokenExpiring(-1),
        [userRefreshTokenKey()]: "held-user",
        [adminRefreshTokenKey()]: "held-admin",
      }),
    );
    expect(issued(cookies, userRefreshTokenKey())).toBeTruthy();
    expect(cookies?.some((cookie) => cookie.startsWith(`${adminRefreshTokenKey()}=`))).toBe(false);
  });

  test("renews nothing without a refresh cookie, or when no identity could be renewed", async () => {
    renewWith(null);
    expect(await PageSession.renewedCookies(pageLoad({ [authTokenKey()]: tokenExpiring(-1) }))).toBeNull();
    expect(asked).toEqual([]);
    const held = pageLoad({ [authTokenKey()]: tokenExpiring(-1), [userRefreshTokenKey()]: "held-user" });
    expect(await PageSession.renewedCookies(held)).toBeNull();
    expect(asked).toEqual([{ user: "held-user", admin: undefined }]);
  });
});
