import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";

const calls: Array<{ endpoint: string; refreshToken: string | null }> = [];
const saved: Array<[string, string | null | undefined]> = [];
const setAuthCalls: string[] = [];
const kept = new Map<string, string>([
  ["user", "r-user-0"],
  ["admin", "r-admin-0"],
]);

const answer = (endpoint: string) => async (refreshToken: string | null) => {
  calls.push({ endpoint, refreshToken });
  await new Promise((resolve) => setTimeout(resolve, 5));
  return { jwt: `${endpoint}-jwt-${calls.length}`, refreshToken: `${endpoint}-r-${calls.length}` };
};

beforeAll(() => {
  mock.module("@libs/shared/client", () => ({
    fetch: { refreshJwt: answer("user"), refreshAdminJwt: answer("admin") },
  }));
  mock.module("@libs/shared/webkit", () => ({
    loadRefreshToken: async (scope: string) => kept.get(scope) ?? null,
    saveRefreshToken: async (scope: string, refreshToken?: string | null) => {
      saved.push([scope, refreshToken]);
    },
  }));
  mock.module("akanjs/client", () => ({
    setAuth: ({ jwt }: { jwt: string }) => setAuthCalls.push(jwt),
  }));
});

afterEach(() => {
  calls.length = 0;
  saved.length = 0;
  setAuthCalls.length = 0;
});

describe("refreshToken", () => {
  test("sends the kept token and keeps the rotated one", async () => {
    const { refreshToken } = await import("./tokenRefresh.util");

    await refreshToken("user");

    expect(calls).toEqual([{ endpoint: "user", refreshToken: "r-user-0" }]);
    expect(setAuthCalls).toEqual(["user-jwt-1"]);
    expect(saved).toEqual([["user", "user-r-1"]]);
  });

  test("a second refresh of the same scope while one is in flight rides the first", async () => {
    const { refreshToken } = await import("./tokenRefresh.util");

    await Promise.all([refreshToken("user"), refreshToken("user")]);
    expect(calls).toHaveLength(1);

    await refreshToken("user");
    expect(calls).toHaveLength(2);
  });

  test("the user and admin scopes refresh independently", async () => {
    const { refreshToken } = await import("./tokenRefresh.util");

    await Promise.all([refreshToken("user"), refreshToken("admin")]);

    expect(calls.map(({ endpoint, refreshToken }) => [endpoint, refreshToken])).toEqual([
      ["user", "r-user-0"],
      ["admin", "r-admin-0"],
    ]);
  });
});
