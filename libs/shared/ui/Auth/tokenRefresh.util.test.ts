import { describe, expect, test } from "bun:test";
import { browserRefreshGraceMs } from "../../srvkit/refreshSession";

describe("isFinalRefreshError", () => {
  test("a rotated, revoked or expired refresh token stops the retries", async () => {
    const { isFinalRefreshError } = await import("./tokenRefresh.util");
    for (const key of [
      "shared.error.revokedRefreshToken",
      "shared.error.refreshTokenReuseDetected",
      "shared.error.expiredRefreshToken",
      "user.error.noRefreshToken",
      "user.error.userRestricted",
    ])
      expect(isFinalRefreshError(new Error(key))).toBe(true);
    expect(isFinalRefreshError(new Error("Failed to fetch"))).toBe(false);
  });
});

describe("retryDelayOf", () => {
  test("the first retry comes well inside the window the server answers a repeated refresh token in, the rest back off to ten minutes", async () => {
    const { retryDelayOf } = await import("./tokenRefresh.util");
    expect(retryDelayOf(1)).toBeLessThan(browserRefreshGraceMs / 2);
    expect([2, 3, 4].map(retryDelayOf)).toEqual([30_000, 60_000, 120_000]);
    expect(retryDelayOf(30)).toBe(10 * 60 * 1000);
  });
});
