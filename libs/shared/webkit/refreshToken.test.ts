import { afterEach, beforeAll, describe, expect, jest, mock, test } from "bun:test";

const envState = { side: "client" as "client" | "server", renderMode: "csr" as "csr" | "ssr" };
const stored = new Map<string, string>();
const kept = new Map<string, string>();
const authToken = { value: null as string | null };
const sessionClaims = { value: undefined as string | undefined };
const authAnswers: Array<string | null | undefined> = [];
const jwtExpiringIn = (seconds: number, claims: Record<string, unknown> = { self: { id: "u1" } }) =>
  `h.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + seconds, ...claims })).toString("base64url")}.s`;

beforeAll(() => {
  mock.module("akanjs/base", () => ({
    getEnv: () => ({ ...envState, appName: "shop" }),
  }));
  mock.module("akanjs/client", () => ({
    getAuthToken: () => authToken.value ?? undefined,
    getSessionClaims: () => sessionClaims.value,
    setAuth: ({ jwt }: { jwt?: string | null }) => {
      authAnswers.push(jwt);
      authToken.value = jwt || null;
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
    storage: {
      getItem: async (key: string) => kept.get(key) ?? null,
      setItem: async (key: string, value: string) => {
        kept.set(key, value);
      },
    },
  }));
});

afterEach(async () => {
  (await import("./sessionClock")).SessionClock.reset();
  jest.useRealTimers();
  kept.clear();
  envState.side = "client";
  envState.renderMode = "csr";
  stored.clear();
  authToken.value = null;
  sessionClaims.value = undefined;
  authAnswers.length = 0;
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

  test("a session the server holds is judged by its claims cookie, so a fresh one is not refreshed on every load", async () => {
    envState.renderMode = "ssr";
    const { refreshSession } = await import("./refreshToken");
    const { calls, refresh } = refreshCounting();
    sessionClaims.value = jwtExpiringIn(600).split(".").slice(0, 2).join(".");
    await refreshSession("user", refresh);
    expect(calls).toHaveLength(0);
    sessionClaims.value = jwtExpiringIn(30).split(".").slice(0, 2).join(".");
    await refreshSession("user", refresh);
    expect(calls).toHaveLength(1);
  });

  test("a tab holding only the claims of an expired session renews it from the refresh cookie, token or no token in the answer", async () => {
    envState.renderMode = "ssr";
    const { refreshSession } = await import("./refreshToken");
    const calls: Array<string | null> = [];
    const refresh = async (refreshToken: string | null) => {
      calls.push(refreshToken);
      sessionClaims.value = jwtExpiringIn(3600).split(".").slice(0, 2).join(".");
      return { jwt: "" };
    };
    sessionClaims.value = jwtExpiringIn(-3600).split(".").slice(0, 2).join(".");
    await refreshSession("user", refresh);
    expect(calls).toEqual([null]);
    expect(authAnswers).toEqual([""]);
    expect(stored.size).toBe(0);
    await refreshSession("user", refresh);
    expect(calls).toHaveLength(1);
  });

  test("a user and an admin refresh started together past expiry go out in turn, the later with the token the first brought", async () => {
    const { refreshSession } = await import("./refreshToken");
    const both = { self: { id: "u1" }, me: { id: "a1" } };
    const expired = jwtExpiringIn(-60, both);
    const userOnly = jwtExpiringIn(3600);
    const sentWith: Array<string | null> = [];
    const answering = (jwt: string) => async () => {
      sentWith.push(authToken.value);
      await new Promise((resolve) => setTimeout(resolve, 5));
      return { jwt };
    };
    authToken.value = expired;

    await Promise.all([
      refreshSession("user", answering(userOnly)),
      refreshSession("admin", answering(jwtExpiringIn(3600, both))),
    ]);

    expect(sentWith).toEqual([expired, userOnly]);
  });

  test("a refresh that failed does not hold up the other scope's", async () => {
    const { refreshSession } = await import("./refreshToken");
    const { calls, refresh } = refreshCounting();
    const failing = refreshSession("user", async () => {
      throw new Error("Failed to fetch");
    });
    const next = refreshSession("admin", refresh);

    await expect(failing).rejects.toThrow("Failed to fetch");
    await next;
    expect(calls).toHaveLength(1);
  });

  test("both scopes wait on one lock, so two tabs never send the two refreshes together either", async () => {
    const { refreshSession } = await import("./refreshToken");
    const { refresh } = refreshCounting();
    const names: string[] = [];
    const locks = {
      request: (name: string, run: () => Promise<void>) => {
        names.push(name);
        return run();
      },
    };
    Object.defineProperty(navigator, "locks", { value: locks, configurable: true });
    try {
      await refreshSession("user", refresh);
      await refreshSession("admin", refresh);
    } finally {
      Object.defineProperty(navigator, "locks", { value: undefined, configurable: true });
    }

    expect(names).toEqual(["akan:refresh:shop", "akan:refresh:shop"]);
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

describe("refreshSession on a device whose clock is off", () => {
  const hourMs = 3600 * 1000;
  const signedBy = (serverAheadMs: number, ageSec = 0) => {
    const iat = Math.floor((Date.now() + serverAheadMs) / 1000) - ageSec;
    return `h.${Buffer.from(JSON.stringify({ iat, exp: iat + 3600, jti: crypto.randomUUID(), self: { id: "u1" } })).toString("base64url")}.s`;
  };
  const keptAheadMs = () => Number(kept.get("serverClockAheadMs:shop"));

  test("a token that reads two hours from expiry on a clock an hour slow is renewed once, and judged by the server's hour after that", async () => {
    const { refreshSession } = await import("./refreshToken");
    const calls = { num: 0 };
    const refresh = async () => {
      calls.num += 1;
      return { jwt: signedBy(hourMs) };
    };
    authToken.value = signedBy(hourMs);

    await refreshSession("user", refresh);
    expect(calls.num).toBe(1);
    expect(Math.abs(keptAheadMs() + hourMs)).toBeLessThan(2000);

    await refreshSession("user", refresh);
    expect(calls.num).toBe(1);

    authToken.value = signedBy(hourMs, 59 * 60);
    await refreshSession("user", refresh);
    expect(calls.num).toBe(2);
  });

  test("a slow answer is timed from the asking, so the token is never read as living longer than it does", async () => {
    const { refreshSession } = await import("./refreshToken");
    jest.useFakeTimers();
    authToken.value = signedBy(0, 59 * 60);

    await refreshSession("user", async () => {
      const jwt = signedBy(0);
      jest.setSystemTime(Date.now() + 30 * 1000);
      return { jwt };
    });

    expect(Math.abs(keptAheadMs())).toBeLessThan(2000);
  });

  test("an answer that leaves the held session as it was measures nothing", async () => {
    envState.renderMode = "ssr";
    const { refreshSession } = await import("./refreshToken");
    sessionClaims.value = signedBy(0, 59 * 60)
      .split(".")
      .slice(0, 2)
      .join(".");

    await refreshSession("user", async () => ({ jwt: "" }));

    expect(kept.size).toBe(0);
  });
});
