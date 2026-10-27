import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import * as base from "akanjs/base";
import { AppHosts, TrustedProxy } from "akanjs/common";
import { SignalContext } from "akanjs/signal";

import { SsoOrigin } from "./ssoOrigin";

process.env.AKAN_PUBLIC_APP_NAME ??= "shared";
process.env.AKAN_PUBLIC_REPO_NAME ??= "soft-s2";
process.env.AKAN_PUBLIC_SERVE_DOMAIN ??= "localhost";

const requestOf = (url: string, headers: Record<string, string> = {}) => new Request(url, { headers });
const peerAt = (address: string | null) =>
  SignalContext.setHttpPeerResolver(() => (address === null ? null : { address, port: 50_000 }));
const env = base.getEnv();
const forwardedFrom = { "x-forwarded-host": "app.example.com, internal", "x-forwarded-proto": "https, http" };

beforeEach(() => {
  spyOn(base, "getEnv").mockReturnValue({ ...env, operationMode: "cloud" });
});

afterEach(() => {
  mock.restore();
  SignalContext.setHttpPeerResolver(null);
  AppHosts.reset();
  TrustedProxy.reset();
  delete process.env.AKAN_ALLOWED_HOSTS;
});

describe("SsoOrigin", () => {
  test("takes the request's own host and scheme, ignoring forwarded headers no trusted hop vouches for", () => {
    AppHosts.declare(["app.example.com"]);
    const forged = { "x-forwarded-host": "evil.example", "x-forwarded-proto": "http" };

    expect(SsoOrigin.of(requestOf("https://app.example.com/api/user/google", forged))).toBe("https://app.example.com");
    peerAt("203.0.113.9");
    expect(SsoOrigin.of(requestOf("https://app.example.com/api/user/google", forged))).toBe("https://app.example.com");
  });

  test("takes the first forwarded host and scheme from a trusted proxy or a unix socket", () => {
    AppHosts.declare(["app.example.com"]);

    peerAt("10.0.0.2");
    expect(SsoOrigin.of(requestOf("http://akan-child/api/user/google", forwardedFrom))).toBe("https://app.example.com");
    peerAt(null);
    expect(SsoOrigin.of(requestOf("http://akan-child/api/user/google", forwardedFrom))).toBe("https://app.example.com");
    peerAt("203.0.113.9");
    expect(() => SsoOrigin.of(requestOf("http://akan-child/api/user/google", forwardedFrom))).toThrow(
      "shared.error.invalidSsoOrigin",
    );
  });

  test("refuses a host the app does not declare, wherever it came from", () => {
    AppHosts.declare(["app.example.com"]);
    peerAt("10.0.0.2");

    expect(() => SsoOrigin.of(requestOf("https://evil.example/api/user/google"))).toThrow(
      "shared.error.invalidSsoOrigin",
    );
    expect(() =>
      SsoOrigin.of(
        requestOf("https://app.example.com/api/user/google", { "x-forwarded-host": "app.example.com.evil" }),
      ),
    ).toThrow("shared.error.invalidSsoOrigin");
  });

  test("accepts the default host, the service host and AKAN_ALLOWED_HOSTS, whatever the port or case", () => {
    const { appName, environment, serveDomain } = env;
    process.env.AKAN_ALLOWED_HOSTS = "other.example.com:443";

    expect(SsoOrigin.of(requestOf(`https://${appName}-${environment}.${serveDomain}/api/user/google`))).toBe(
      `https://${appName}-${environment}.${serveDomain}`,
    );
    expect(SsoOrigin.of(requestOf("https://login.example.com/api/user/google"), "login.example.com")).toBe(
      "https://login.example.com",
    );
    expect(SsoOrigin.of(requestOf("https://Other.Example.com:8443/api/user/google"))).toBe(
      "https://other.example.com:8443",
    );
  });

  test("refuses a forwarded value that does not form a bare http(s) origin", () => {
    AppHosts.declare(["app.example.com"]);
    peerAt("10.0.0.2");
    const originOf = (headers: Record<string, string>) =>
      SsoOrigin.of(requestOf("http://akan-child/api/user/google", headers));

    for (const headers of [
      { "x-forwarded-host": "app.example.com/evil", "x-forwarded-proto": "https" },
      { "x-forwarded-host": "evil.example@app.example.com", "x-forwarded-proto": "https" },
      { "x-forwarded-host": "app.example.com?x=1", "x-forwarded-proto": "https" },
      { "x-forwarded-host": "app.example.com", "x-forwarded-proto": "javascript" },
      { "x-forwarded-host": "app.example.com", "x-forwarded-proto": "https://evil.example#" },
    ])
      expect(() => originOf(headers)).toThrow("shared.error.invalidSsoOrigin");
  });

  test("a local server takes its own origin without declaring it", () => {
    spyOn(base, "getEnv").mockReturnValue({ ...env, operationMode: "local" });
    expect(SsoOrigin.of(requestOf("http://192.168.0.5:8282/api/user/google"))).toBe("http://192.168.0.5:8282");
  });
});
