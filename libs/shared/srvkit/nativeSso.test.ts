import { describe, expect, test } from "bun:test";
import { OAuthPkce } from "akanjs/server";

import { NativeSso } from "./nativeSso";

process.env.AKAN_PUBLIC_APP_NAME ??= "shared";
process.env.AKAN_PUBLIC_REPO_NAME ??= "soft-s2";
process.env.AKAN_PUBLIC_SERVE_DOMAIN ??= "localhost";

const challenge = OAuthPkce.challengeOf("v".repeat(64));
const startRequest = (query: string, headers: Record<string, string> = {}) =>
  new Request(`http://10.0.0.7:8080/api/user/google?${query}`, { headers });
const origin = "https://office.akanjs.com";
const desktop = { callbackScheme: "angelo", nonce: "n1", lang: "ko", returnPage: true };

describe("NativeSso", () => {
  test("a start without a callback scheme is a web start", () => {
    expect(NativeSso.parseStart(startRequest("state=abc"), origin)).toBeNull();
  });

  test("a native start needs a well-formed PKCE challenge and the app's state", () => {
    expect(() => NativeSso.parseStart(startRequest("callbackScheme=angelo&state=abc"), origin)).toThrow();
    expect(() =>
      NativeSso.parseStart(startRequest("callbackScheme=angelo&codeChallenge=short&state=abc"), origin),
    ).toThrow();
    expect(() =>
      NativeSso.parseStart(startRequest(`callbackScheme=angelo&codeChallenge=${challenge}`), origin),
    ).toThrow();
  });

  test("a native start keeps the origin the flow resolved, never one from its own headers", () => {
    const start = NativeSso.parseStart(
      startRequest(`callbackScheme=angelo&codeChallenge=${challenge}&state=abc&lang=ko&returnPage=1`, {
        "x-forwarded-proto": "https",
        "x-forwarded-host": "evil.example",
      }),
      origin,
    );
    expect(start).toEqual({
      callbackScheme: "angelo",
      codeChallenge: challenge,
      nonce: "abc",
      origin,
      lang: "ko",
      returnPage: true,
    });
  });

  test("the page language falls back to the browser's, then to English", () => {
    const query = `callbackScheme=angelo&codeChallenge=${challenge}&state=abc`;
    expect(NativeSso.parseStart(startRequest(query, { "accept-language": "ko-KR,ko;q=0.9" }), origin)?.lang).toBe("ko");
    expect(NativeSso.parseStart(startRequest(`${query}&lang=<script>`), origin)?.lang).toBe("en");
    expect(NativeSso.parseStart(startRequest(query), origin)?.returnPage).toBe(false);
  });

  test("the callback deep link echoes the nonce beside the code or the error", () => {
    const withCode = new URL(NativeSso.callbackUrl({ callbackScheme: "angelo", nonce: "n 1" }, { code: "c+d" }));
    expect(withCode.protocol).toBe("angelo:");
    expect(withCode.searchParams.get("code")).toBe("c+d");
    expect(withCode.searchParams.get("state")).toBe("n 1");
    const withError = new URL(NativeSso.callbackUrl({ callbackScheme: "angelo", nonce: "n" }, { error: "denied" }));
    expect(withError.searchParams.get("error")).toBe("denied");
  });

  test("a phone gets a bare redirect its auth sheet catches", () => {
    const response = NativeSso.respond({ ...desktop, returnPage: false }, { code: "c" });
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("angelo://sso/callback?code=c&state=n1");
  });

  test("a desktop browser gets a page that opens the app and offers a button", async () => {
    const response = NativeSso.respond(desktop, { code: "c" });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(response.headers.get("cache-control")).toBe("no-store");
    const html = await response.text();
    expect(html).toContain('href="angelo://sso/callback?code=c&amp;state=n1"');
    expect(html).toContain('location.replace("angelo://sso/callback?code=c&state=n1")');
  });

  test("an error string cannot break out of the page's markup or script", async () => {
    const html = await NativeSso.respond(desktop, { error: '"</script><img src=x onerror=alert(1)>' }).text();
    expect(html).not.toContain("<img");
    expect(html).not.toContain("</script><");
  });
});
