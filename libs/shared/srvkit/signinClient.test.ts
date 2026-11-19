import { describe, expect, test } from "bun:test";

import type { RefreshSession } from "./refreshSession";
import { SigninClient } from "./signinClient";

const chromeOnWindows =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";
const sessionOf = (session: Partial<RefreshSession>) =>
  ({ id: "s", subject: "user", subjectId: "u", refreshTokenHash: "h", expiresAt: "", ...session }) as RefreshSession;

describe("SigninClient", () => {
  test("keeps an address's network only: an IPv4 /24 or an IPv6 /48", () => {
    expect(SigninClient.networkOf("203.0.113.77")).toBe("203.0.113.0/24");
    expect(SigninClient.networkOf("2001:db8:85a3:8d3:1319:8a2e:370:7348")).toBe("2001:db8:85a3::/48");
    expect(SigninClient.networkOf("2001:DB8::1")).toBe("2001:db8:0::/48");
    expect(SigninClient.networkOf("fe80::1%en0")).toBe("fe80:0:0::/48");
    expect(SigninClient.networkOf(null)).toBeUndefined();
    expect(SigninClient.networkOf("unknown")).toBeUndefined();
  });

  test("remembers the device beside the account object it was resolved with, a native shell by its origin", () => {
    const browser = {};
    const native = {};
    SigninClient.remember(browser, new Headers({ "user-agent": chromeOnWindows }), "198.51.100.9");
    SigninClient.remember(native, new Headers({ origin: "https://app.localhost" }), null);
    expect(SigninClient.of(browser)).toEqual({
      kind: "browser",
      userAgent: chromeOnWindows,
      network: "198.51.100.0/24",
    });
    expect(SigninClient.of(native)).toEqual({ kind: "native", userAgent: undefined, network: undefined });
    expect(SigninClient.of({})).toEqual({});
    expect(SigninClient.of(null)).toEqual({});
  });

  test("a device is new unless a live first-party session has its label and network, or predates the records", () => {
    const device = { kind: "browser", userAgent: chromeOnWindows, network: "198.51.100.0/24" } as const;
    const updated = chromeOnWindows.replace("Chrome/131.0", "Chrome/132.0");
    expect(SigninClient.isNewAmong(device, [])).toBe(true);
    expect(SigninClient.isNewAmong(device, [sessionOf({ ...device, userAgent: updated })])).toBe(false);
    expect(SigninClient.isNewAmong(device, [sessionOf({ ...device, network: "198.51.101.0/24" })])).toBe(true);
    expect(SigninClient.isNewAmong(device, [sessionOf({ ...device, kind: "signinAs" })])).toBe(true);
    expect(SigninClient.isNewAmong(device, [sessionOf({ ...device, clientId: "dcr_claude" })])).toBe(true);
    expect(SigninClient.isNewAmong(device, [sessionOf({})])).toBe(false);
  });
});
