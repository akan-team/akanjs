import { afterEach, describe, expect, test } from "bun:test";
import { accessTokenSeconds } from "@libs/util/common";
import { dayjs } from "akanjs/base";
import { authTokenKey, sessionTokenContract } from "akanjs/common";
import { CrossSiteGuard } from "akanjs/signal";

import { adminRefreshTokenKey, userRefreshTokenKey } from "./ssoHelper";
import { WebSession } from "./webSession";

process.env.AKAN_PUBLIC_APP_NAME ??= "shared";
process.env.AKAN_PUBLIC_REPO_NAME ??= "soft-s2";
process.env.AKAN_PUBLIC_SERVE_DOMAIN ??= "localhost";

const sessionCookieKeys = () => [authTokenKey(), userRefreshTokenKey(), adminRefreshTokenKey()];
const requestWith = (headers: Record<string, string> = {}) =>
  new Request("https://app.example.com/api/user/refreshJwt", { method: "POST", headers });
const asking = sessionTokenContract.makeHeaders();
const secondsFor = (req?: Request) =>
  WebSession.answering(req, async () => Math.round(WebSession.accessTokenExpiresAt().diff(dayjs()) / 1000));

describe("WebSession", () => {
  afterEach(() => {
    WebSession.configure();
    CrossSiteGuard.reset();
  });

  test("is off until an app turns it on, and an app that names no session option keeps the default", () => {
    expect(WebSession.cookieOnlyByDefault).toBe(false);
    expect(WebSession.cookieOnly).toBe(WebSession.cookieOnlyByDefault);
    WebSession.configure({ cookieOnly: true });
    expect(WebSession.cookieOnly).toBe(true);
    WebSession.configure({});
    expect(WebSession.cookieOnly).toBe(WebSession.cookieOnlyByDefault);
  });

  test("hands every caller the tokens while the option is off", () => {
    expect(WebSession.handsTokensTo(undefined)).toBe(true);
    expect(WebSession.handsTokensTo(requestWith({ cookie: `${authTokenKey()}=token` }))).toBe(true);
  });

  test("hands the tokens only to a caller that asks, once the option is on", () => {
    WebSession.configure({ cookieOnly: true });
    expect(WebSession.handsTokensTo(undefined)).toBe(false);
    expect(WebSession.handsTokensTo(requestWith())).toBe(false);
    expect(WebSession.handsTokensTo(requestWith({ [sessionTokenContract.header]: "cookie" }))).toBe(false);
    expect(WebSession.handsTokensTo(requestWith(asking))).toBe(true);
  });

  test("takes a page on a native shell's or an allowlisted origin to ask, and one on the server's own host not to", () => {
    WebSession.configure({ cookieOnly: true });
    CrossSiteGuard.configure({ allowedOrigins: ["https://csr.example.com", "https://app.example.com"] });
    for (const origin of [...CrossSiteGuard.nativeOrigins, "https://csr.example.com"])
      expect(WebSession.handsTokensTo(requestWith({ origin }))).toBe(true);
    expect(WebSession.handsTokensTo(requestWith({ origin: "https://app.example.com" }))).toBe(false);
    expect(WebSession.handsTokensTo(requestWith({ origin: "https://other.example.com" }))).toBe(false);
    expect(
      WebSession.handsTokensTo(
        requestWith({ origin: "https://app.example.com", "x-forwarded-host": "app.example.com", host: "10.0.0.7" }),
      ),
    ).toBe(false);
  });

  test("answers a caller that holds any session cookie with cookies, whatever it asks for", () => {
    WebSession.configure({ cookieOnly: true });
    for (const key of sessionCookieKeys()) {
      const cookie = `theme=dark; ${key}=held`;
      expect(WebSession.handsTokensTo(requestWith({ ...asking, cookie }))).toBe(false);
      expect(WebSession.handsTokensTo(requestWith({ ...asking, origin: "app://localhost", cookie }))).toBe(false);
    }
    expect(WebSession.handsTokensTo(requestWith({ ...asking, cookie: "theme=dark" }))).toBe(true);
  });

  test("signs a token for one hour outside a request, and for a request that does not ask for its tokens", async () => {
    expect(Math.round(WebSession.accessTokenExpiresAt().diff(dayjs()) / 1000)).toBe(accessTokenSeconds);
    expect(await secondsFor()).toBe(accessTokenSeconds);
    expect(await secondsFor(requestWith())).toBe(accessTokenSeconds);
    expect(await secondsFor(requestWith({ origin: "https://other.example.com" }))).toBe(accessTokenSeconds);
  });

  test("keeps seven days for a caller that asks and holds no session cookie, with the option on or off", async () => {
    CrossSiteGuard.configure({ allowedOrigins: ["https://csr.example.com"] });
    for (const cookieOnly of [false, true]) {
      WebSession.configure({ cookieOnly });
      for (const headers of [
        asking,
        { ...asking, cookie: "theme=dark" },
        { origin: "https://csr.example.com" },
        ...CrossSiteGuard.nativeOrigins.map((origin) => ({ origin })),
      ])
        expect({ cookieOnly, headers, seconds: await secondsFor(requestWith(headers)) }).toEqual({
          cookieOnly,
          headers,
          seconds: WebSession.cookielessAccessTokenSeconds,
        });
    }
    expect(WebSession.cookielessAccessTokenSeconds).toBe(7 * 24 * 60 * 60);
  });

  test("gives a browser one hour: one that holds any session cookie, or a page on the server's own host, whatever it asks", async () => {
    CrossSiteGuard.configure({ allowedOrigins: ["https://app.example.com"] });
    for (const cookieOnly of [false, true]) {
      WebSession.configure({ cookieOnly });
      for (const headers of [
        ...sessionCookieKeys().map((key) => ({ ...asking, cookie: `${key}=held` })),
        ...sessionCookieKeys().map((key) => ({ origin: "app://localhost", cookie: `${key}=held` })),
        { ...asking, origin: "https://app.example.com" },
        { ...asking, origin: "https://app.example.com", "x-forwarded-host": "app.example.com", host: "10.0.0.7" },
      ])
        expect({ cookieOnly, headers, seconds: await secondsFor(requestWith(headers)) }).toEqual({
          cookieOnly,
          headers,
          seconds: accessTokenSeconds,
        });
    }
  });

  test("keeps each request's lifetime to itself while two are answered at once", async () => {
    const [cookieless, browser] = await Promise.all([
      WebSession.answering(requestWith(asking), async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return Math.round(WebSession.accessTokenExpiresAt().diff(dayjs()) / 1000);
      }),
      secondsFor(requestWith()),
    ]);
    expect([cookieless, browser]).toEqual([WebSession.cookielessAccessTokenSeconds, accessTokenSeconds]);
  });
});
