import { afterEach, describe, expect, test } from "bun:test";
import { sessionTokenContract } from "akanjs/common";
import { CrossSiteGuard } from "akanjs/signal";

import { WebSession } from "./webSession";

const keys = ["__Host-jwt:app", "__Host-userRefreshToken:app", "__Host-adminRefreshToken:app"];
const requestWith = (headers: Record<string, string> = {}) =>
  new Request("https://app.example.com/api/user/refreshJwt", { method: "POST", headers });
const asking = sessionTokenContract.makeHeaders();

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
    expect(WebSession.handsTokensTo(undefined, keys)).toBe(true);
    expect(WebSession.handsTokensTo(requestWith({ cookie: `${keys[0]}=token` }), keys)).toBe(true);
  });

  test("hands the tokens only to a caller that asks, once the option is on", () => {
    WebSession.configure({ cookieOnly: true });
    expect(WebSession.handsTokensTo(undefined, keys)).toBe(false);
    expect(WebSession.handsTokensTo(requestWith(), keys)).toBe(false);
    expect(WebSession.handsTokensTo(requestWith({ [sessionTokenContract.header]: "cookie" }), keys)).toBe(false);
    expect(WebSession.handsTokensTo(requestWith(asking), keys)).toBe(true);
  });

  test("takes a page on a native shell's or an allowlisted origin to ask, and one on the server's own host not to", () => {
    WebSession.configure({ cookieOnly: true });
    CrossSiteGuard.configure({ allowedOrigins: ["https://csr.example.com", "https://app.example.com"] });
    for (const origin of [...CrossSiteGuard.nativeOrigins, "https://csr.example.com"])
      expect(WebSession.handsTokensTo(requestWith({ origin }), keys)).toBe(true);
    expect(WebSession.handsTokensTo(requestWith({ origin: "https://app.example.com" }), keys)).toBe(false);
    expect(WebSession.handsTokensTo(requestWith({ origin: "https://other.example.com" }), keys)).toBe(false);
    expect(
      WebSession.handsTokensTo(
        requestWith({ origin: "https://app.example.com", "x-forwarded-host": "app.example.com", host: "10.0.0.7" }),
        keys,
      ),
    ).toBe(false);
  });

  test("answers a caller that holds any session cookie with cookies, whatever it asks for", () => {
    WebSession.configure({ cookieOnly: true });
    for (const key of keys) {
      const cookie = `theme=dark; ${key}=held`;
      expect(WebSession.handsTokensTo(requestWith({ ...asking, cookie }), keys)).toBe(false);
      expect(WebSession.handsTokensTo(requestWith({ ...asking, origin: "app://localhost", cookie }), keys)).toBe(false);
    }
    expect(WebSession.handsTokensTo(requestWith({ ...asking, cookie: "theme=dark" }), keys)).toBe(true);
  });
});
