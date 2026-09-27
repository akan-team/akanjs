import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";

const envState = { side: "client" as "client" | "server", renderMode: "csr" as "csr" | "ssr" };
const stored = new Map<string, string>();

beforeAll(() => {
  mock.module("akanjs/base", () => ({
    getEnv: () => ({ ...envState, appName: "shop" }),
  }));
  mock.module("akanjs/client", () => ({
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
