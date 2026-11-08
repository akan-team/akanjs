import { describe, expect, test } from "bun:test";

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
