import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";

const envState = { side: "client" as "client" | "server", renderMode: "csr" as "csr" | "ssr" };
const stored = new Map<string, string>();
const authToken = { value: null as string | null };
const jwtExpiringIn = (seconds: number) =>
  `h.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + seconds, self: { id: "u1" } })).toString("base64url")}.s`;

beforeAll(() => {
  mock.module("akanjs/base", () => ({
    getEnv: () => ({ ...envState, appName: "shop" }),
  }));
  mock.module("akanjs/client", () => ({
    getAuthToken: () => authToken.value,
    setAuth: ({ jwt }: { jwt: string }) => {
      authToken.value = jwt;
    },
    secretStorage: {
      getItem: async (key: string) => stored.get(key) ?? null,
      setItem: async (key: string, value: string) => {
        stored.set(key, value);
      },
      removeItem: async (key: string) => {
        stored.delete(key);
      },
    },
  }));
});

afterEach(() => {
  envState.side = "client";
  envState.renderMode = "csr";
  stored.clear();
  authToken.value = null;
});

describe("refresh token keeping", () => {
  test("a CSR client keeps each scope's token under the key the server's cookie uses", async () => {
    const { loadRefreshToken, saveRefreshToken } = await import("./refreshToken");

    await saveRefreshToken("user", "r-user");
    await saveRefreshToken("admin", "r-admin");

    expect(stored.get("userRefreshToken:shop")).toBe("r-user");
    expect(await loadRefreshToken("user")).toBe("r-user");
    expect(await loadRefreshToken("admin")).toBe("r-admin");
  });

  test("an answer without a token, or a sign-out, drops the kept one", async () => {
    const { loadRefreshToken, saveRefreshToken } = await import("./refreshToken");

    await saveRefreshToken("user", "r-user");
    await saveRefreshToken("user", undefined);
    expect(await loadRefreshToken("user")).toBeNull();

    await saveRefreshToken("admin", "r-admin");
    await saveRefreshToken("admin", null);
    expect(await loadRefreshToken("admin")).toBeNull();
  });

  test("an SSR tab leaves the refresh token to its HttpOnly cookie", async () => {
    envState.renderMode = "ssr";
    const { loadRefreshToken, saveRefreshToken } = await import("./refreshToken");

    await saveRefreshToken("user", "r-user");

    expect(stored.size).toBe(0);
    expect(await loadRefreshToken("user")).toBeNull();
  });
});

describe("refreshSession", () => {
  const refreshCounting = () => {
    const calls: Array<string | null> = [];
    const refresh = async (refreshToken: string | null) => {
      calls.push(refreshToken);
      await new Promise((resolve) => setTimeout(resolve, 5));
      return { jwt: jwtExpiringIn(600), refreshToken: `r-${calls.length}` };
    };
    return { calls, refresh };
  };

  test("a second refresh of the same scope while one is in flight rides the first", async () => {
    const { refreshSession } = await import("./refreshToken");
    const { calls, refresh } = refreshCounting();
    await Promise.all([refreshSession("user", refresh), refreshSession("user", refresh)]);
    expect(calls).toHaveLength(1);
  });

  test("a token another tab already refreshed is left alone, unless forced", async () => {
    const { refreshSession } = await import("./refreshToken");
    const { calls, refresh } = refreshCounting();
    authToken.value = jwtExpiringIn(600);
    await refreshSession("user", refresh);
    expect(calls).toHaveLength(0);
    await refreshSession("user", refresh, { force: true });
    expect(calls).toHaveLength(1);
  });

  test("a token about to expire is refreshed and the rotated one is kept", async () => {
    const { refreshSession, loadRefreshToken } = await import("./refreshToken");
    const { calls, refresh } = refreshCounting();
    authToken.value = jwtExpiringIn(30);
    await refreshSession("user", refresh);
    expect(calls).toHaveLength(1);
    expect(await loadRefreshToken("user")).toBe("r-1");
  });
});
