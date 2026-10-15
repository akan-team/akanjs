import { beforeAll, describe, expect, mock, test } from "bun:test";

const calls: Array<{ scope: string; refresh: unknown }> = [];
const fetchStub = { refreshJwt: async () => ({ jwt: "u" }), refreshAdminJwt: async () => ({ jwt: "a" }) };

beforeAll(() => {
  mock.module("@libs/shared/client", () => ({ fetch: fetchStub }));
  mock.module("@libs/shared/webkit", () => ({
    refreshSession: async (scope: string, refresh: unknown) => {
      calls.push({ scope, refresh });
    },
  }));
});

describe("refreshToken", () => {
  test("each scope refreshes through its own endpoint, on the shared single-flight", async () => {
    const { refreshToken } = await import("./tokenRefresh.util");
    await refreshToken("user");
    await refreshToken("admin");
    expect(calls).toEqual([
      { scope: "user", refresh: fetchStub.refreshJwt },
      { scope: "admin", refresh: fetchStub.refreshAdminJwt },
    ]);
  });

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
