import { afterEach, beforeAll, describe, expect, jest, mock, test } from "bun:test";

const session = { token: undefined as string | undefined };
const seen = { resets: 0, pageRefreshes: 0, cookieWrites: 0 };
const kept = new Map<string, string>();
const storageState = { hangs: false };
const cleanups: Array<() => void> = [];
const page = {
  window: Object.assign(new EventTarget(), { location: { protocol: "https:" } }),
  document: Object.assign(new EventTarget(), { visibilityState: "visible" }),
};
Object.defineProperty(page.document, "cookie", {
  get: () => "",
  set: () => {
    seen.cookieWrites += 1;
  },
});

interface Claims {
  self?: { id: string };
  me?: { id: string };
}
const encoded = (payload: object) => `h.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.s`;
const tokenOf = (expiresInSec: number, claims: Claims) =>
  encoded({ exp: Math.floor(Date.now() / 1000) + expiresInSec, ...claims });
const self = { id: "u1" };
const me = { id: "a1" };

let TokenRefresh: typeof import("./TokenRefresh").TokenRefresh;
let refreshSession: typeof import("../../webkit/refreshToken").refreshSession;
let SessionClock: typeof import("../../webkit/sessionClock").SessionClock;

beforeAll(async () => {
  mock.module("react", () => ({
    useEffect: (effect: () => () => void) => {
      cleanups.push(effect());
    },
  }));
  mock.module("akanjs/base", () => ({
    getEnv: () => ({ side: "client", renderMode: "ssr", appName: "shop" }),
  }));
  mock.module("akanjs/client", () => ({
    getAuthToken: () => session.token,
    getSessionClaims: () => undefined,
    getStoredAuthToken: async () => undefined,
    setAuth: ({ jwt }: { jwt?: string | null }) => {
      session.token = jwt || undefined;
    },
    resetAuth: () => {
      seen.resets += 1;
    },
    router: {
      refresh: () => {
        seen.pageRefreshes += 1;
      },
    },
    secretStorage: { getItem: async () => null, setItem: async () => undefined, removeItem: async () => undefined },
    storage: {
      getItem: (key: string) =>
        storageState.hangs ? new Promise<null>(() => undefined) : Promise.resolve(kept.get(key) ?? null),
      setItem: async (key: string, value: string) => {
        kept.set(key, value);
      },
    },
  }));
  Object.assign(globalThis, page);
  const refreshToken = await import("../../webkit/refreshToken");
  ({ SessionClock } = await import("../../webkit/sessionClock"));
  ({ refreshSession } = refreshToken);
  mock.module("@libs/shared/webkit", () => ({ ...refreshToken, SessionClock }));
  ({ TokenRefresh } = await import("./TokenRefresh"));
});

const unmount = () => {
  for (const cleanup of cleanups.splice(0)) cleanup();
};

afterEach(() => {
  unmount();
  jest.useRealTimers();
  SessionClock.reset();
  kept.clear();
  storageState.hangs = false;
  session.token = undefined;
  seen.resets = 0;
  seen.pageRefreshes = 0;
  seen.cookieWrites = 0;
});

const settle = async () => {
  for (let turn = 0; turn < 60; turn++) await Promise.resolve();
};

const pass = async (ms: number) => {
  jest.advanceTimersByTime(ms);
  await settle();
};

const mount = async (scope: "user" | "admin", onRefresh: () => Promise<void>) => {
  jest.useFakeTimers();
  TokenRefresh({ scope, onRefresh });
  await pass(1);
  await pass(1);
};

const refreshCounting = (answer: (call: number) => void = () => undefined) => {
  const calls = { num: 0 };
  const onRefresh = async () => {
    calls.num += 1;
    answer(calls.num);
  };
  return { calls, onRefresh };
};

describe("TokenRefresh", () => {
  test("a tab whose device slept past the token's expiry refreshes within a minute of waking, with no event at all", async () => {
    session.token = tokenOf(3600, { self });
    const { calls, onRefresh } = refreshCounting(() => {
      session.token = tokenOf(3600, { self });
    });
    await mount("user", onRefresh);
    await pass(5 * 60 * 1000);
    expect(calls.num).toBe(0);

    jest.setSystemTime(Date.now() + 2 * 3600 * 1000);
    await pass(60 * 1000);

    expect(calls.num).toBe(1);
    expect(seen.pageRefreshes).toBe(1);
  });

  test("the window taking focus again, or the network coming back, rechecks the token at once", async () => {
    for (const wake of ["focus", "online"]) {
      session.token = tokenOf(3600, { self });
      const { calls, onRefresh } = refreshCounting(() => {
        session.token = tokenOf(3600, { self });
      });
      await mount("user", onRefresh);

      jest.setSystemTime(Date.now() + 2 * 3600 * 1000);
      page.window.dispatchEvent(new Event(wake));
      await pass(1);
      await pass(1);

      expect({ wake, calls: calls.num }).toEqual({ wake, calls: 1 });
      unmount();
      jest.useRealTimers();
    }
  });

  test("a refresh that failed is tried again three seconds later, then half a minute after that", async () => {
    session.token = tokenOf(60, { self });
    const { calls, onRefresh } = refreshCounting(() => {
      throw new Error("Failed to fetch");
    });
    await mount("user", onRefresh);
    expect(calls.num).toBe(1);

    await pass(2_900);
    expect(calls.num).toBe(1);
    await pass(100);
    expect(calls.num).toBe(2);
    await pass(29_900);
    expect(calls.num).toBe(2);
    await pass(100);
    expect(calls.num).toBe(3);
  });

  test("an admin refresh that failed is still retried after the user's refresh left a token naming only the user", async () => {
    session.token = tokenOf(-60, { self, me });
    const { calls, onRefresh } = refreshCounting((call) => {
      if (call > 1) {
        session.token = tokenOf(3600, { self, me });
        return;
      }
      session.token = tokenOf(3600, { self });
      throw new Error("Failed to fetch");
    });
    await mount("admin", onRefresh);
    expect(calls.num).toBe(1);

    page.window.dispatchEvent(new Event("focus"));
    await pass(1);

    expect(calls.num).toBe(2);
    expect(seen.resets).toBe(0);
    await pass(10 * 60 * 1000);
    expect(calls.num).toBe(2);
  });

  test("an admin session that ended leaves the user's renewed session signed in, and an expired token of its own is reset", async () => {
    session.token = tokenOf(-60, { self, me });
    await mount("admin", async () => {
      session.token = tokenOf(3600, { self });
      throw new Error("shared.error.revokedRefreshToken");
    });
    expect(seen).toMatchObject({ resets: 0, pageRefreshes: 1 });
    unmount();
    jest.useRealTimers();
    seen.pageRefreshes = 0;

    session.token = tokenOf(-60, { self, me });
    await mount("admin", async () => {
      throw new Error("shared.error.revokedRefreshToken");
    });
    expect(seen).toMatchObject({ resets: 1, pageRefreshes: 1 });
  });

  test("an admin session found ended on the retry, before the old token's expiry, redraws the page for the user who is left", async () => {
    session.token = tokenOf(60, { self, me });
    const { calls, onRefresh } = refreshCounting((call) => {
      if (call > 1) throw new Error("shared.error.revokedRefreshToken");
      session.token = tokenOf(3600, { self });
      throw new Error("Failed to fetch");
    });
    await mount("admin", onRefresh);
    await pass(3_000);

    expect(calls.num).toBe(2);
    expect(seen).toMatchObject({ resets: 0, pageRefreshes: 1 });

    page.window.dispatchEvent(new Event("focus"));
    await pass(10 * 60 * 1000);
    expect(calls.num).toBe(2);
  });

  test("a refresh answered with a session that no longer names the admin, or with none, redraws the page before the old expiry", async () => {
    for (const left of [() => tokenOf(3600, { self }), () => undefined]) {
      session.token = tokenOf(60, { self, me });
      const { calls, onRefresh } = refreshCounting(() => {
        session.token = left();
      });
      await mount("admin", onRefresh);

      expect({ calls: calls.num, ...seen }).toMatchObject({ calls: 1, resets: 0, pageRefreshes: 1 });
      unmount();
      jest.useRealTimers();
      seen.pageRefreshes = 0;
    }
  });

  test("a refresh that keeps the scope before the old expiry leaves the page as it is", async () => {
    session.token = tokenOf(60, { self, me });
    const { calls, onRefresh } = refreshCounting(() => {
      session.token = tokenOf(3600, { self, me });
    });
    await mount("admin", onRefresh);

    expect({ calls: calls.num, ...seen }).toMatchObject({ calls: 1, resets: 0, pageRefreshes: 0 });
  });

  test("a component unmounted before its first check, or while its refresh is in flight, schedules nothing more", async () => {
    session.token = tokenOf(3600, { self });
    const early = refreshCounting();
    jest.useFakeTimers();
    TokenRefresh({ scope: "user", onRefresh: early.onRefresh });
    jest.advanceTimersByTime(1);
    unmount();
    await pass(5 * 60 * 1000);
    expect({ calls: early.calls.num, cookieWrites: seen.cookieWrites }).toEqual({ calls: 0, cookieWrites: 0 });
    jest.useRealTimers();

    session.token = tokenOf(60, { self });
    const answered: Array<() => void> = [];
    const calls = { num: 0 };
    await mount("user", () => {
      calls.num += 1;
      return new Promise<void>((resolve) => answered.push(resolve));
    });
    expect(calls.num).toBe(1);
    const cookieWrites = seen.cookieWrites;
    unmount();
    for (const answer of answered) answer();
    await pass(5 * 60 * 1000);
    expect({ calls: calls.num, cookieWrites: seen.cookieWrites }).toEqual({ calls: 1, cookieWrites });
  });
});

describe("TokenRefresh on a device whose clock is off", () => {
  const lifetimeSec = 3600;
  const serverBehind = (aheadMs: number) => {
    const now = () => Date.now() - aheadMs;
    const sign = (ageSec = 0) => {
      const iat = Math.floor(now() / 1000) - ageSec;
      return encoded({ iat, exp: iat + lifetimeSec, jti: crypto.randomUUID(), self });
    };
    const refuses = (jwt?: string) => {
      const { exp } = JSON.parse(Buffer.from(jwt?.split(".")[1] ?? "", "base64url").toString()) as { exp: number };
      return exp * 1000 <= now();
    };
    return { sign, refuses };
  };

  const watching = async (aheadMs: number, minutes: number) => {
    const server = serverBehind(aheadMs);
    const calledAt: number[] = [];
    let minute = 0;
    let refused = 0;
    session.token = server.sign();
    await mount("user", () =>
      refreshSession("user", async () => {
        calledAt.push(minute);
        return { jwt: server.sign() };
      }),
    );
    for (minute = 1; minute <= minutes; minute++) {
      await pass(60 * 1000);
      if (server.refuses(session.token)) refused += 1;
    }
    return { calledAt, refused };
  };

  test("an hour slow: the found token is measured at once, then renewed two minutes before the server's hour ends", async () => {
    expect(await watching(-3600 * 1000, 180)).toEqual({ calledAt: [0, 58, 116, 174], refused: 0 });
  });

  test("59 minutes fast: one early refresh measures the clock, then the token lives out its hour", async () => {
    expect(await watching(59 * 60 * 1000, 180)).toEqual({ calledAt: [0, 58, 116, 174], refused: 0 });
  });

  test("two hours fast: the token that reads long expired is renewed once, not in a loop", async () => {
    expect(await watching(2 * 3600 * 1000, 180)).toEqual({ calledAt: [0, 58, 116, 174], refused: 0 });
  });

  test("20 minutes fast: the clock is taken as it reads, so each refresh comes 20 minutes early", async () => {
    expect(await watching(20 * 60 * 1000, 180)).toEqual({ calledAt: [38, 76, 114, 152], refused: 0 });
  });

  test("the measurement is kept, so the next page load on the slow device asks nothing extra", async () => {
    const aheadMs = -3600 * 1000;
    await watching(aheadMs, 10);
    unmount();
    SessionClock.reset();
    seen.pageRefreshes = 0;

    const server = serverBehind(aheadMs);
    const calledAt: number[] = [];
    let minute = 0;
    jest.useFakeTimers();
    session.token = server.sign(10 * 60);
    await mount("user", () =>
      refreshSession("user", async () => {
        calledAt.push(minute);
        return { jwt: server.sign() };
      }),
    );
    for (minute = 1; minute <= 60; minute++) await pass(60 * 1000);

    expect(calledAt).toEqual([48]);
    expect(seen.pageRefreshes).toBe(0);
  });

  test("a fast clock set right while the tab is open is measured again on the next wake, and the hour still holds", async () => {
    const aheadMs = 2 * 3600 * 1000;
    const fast = serverBehind(aheadMs);
    const right = serverBehind(0);
    const calls = { num: 0 };
    let server = fast;
    session.token = fast.sign();
    await mount("user", () =>
      refreshSession("user", async () => {
        calls.num += 1;
        return { jwt: server.sign() };
      }),
    );
    await pass(10 * 60 * 1000);
    expect(calls.num).toBe(1);

    jest.setSystemTime(Date.now() - aheadMs);
    server = right;
    page.window.dispatchEvent(new Event("focus"));
    await pass(1);
    expect(calls.num).toBe(2);

    let refused = 0;
    for (let minute = 1; minute <= 120; minute++) {
      await pass(60 * 1000);
      if (right.refuses(session.token)) refused += 1;
    }
    expect({ calls: calls.num, refused }).toEqual({ calls: 4, refused: 0 });
  });

  test("storage that never answers holds the first expiry check up for a second, no longer", async () => {
    storageState.hangs = true;
    session.token = tokenOf(60, { self });
    const { calls, onRefresh } = refreshCounting(() => {
      session.token = tokenOf(3600, { self });
    });
    await mount("user", onRefresh);
    expect(calls.num).toBe(0);

    await pass(1000);
    await pass(1);
    expect(calls.num).toBe(1);
  });

  test("an app's own refresh, which measures nothing, still leaves the slow clock settled by the token it brought", async () => {
    const server = serverBehind(-3600 * 1000);
    const calledAt: number[] = [];
    let minute = 0;
    session.token = server.sign();
    await mount("user", async () => {
      calledAt.push(minute);
      session.token = server.sign();
    });
    for (minute = 1; minute <= 60; minute++) await pass(60 * 1000);

    expect(calledAt).toEqual([0, 58]);
  });

  test("a session that ended while the clock was in doubt is not asked for again on every wake", async () => {
    const server = serverBehind(-3600 * 1000);
    session.token = server.sign();
    const { calls, onRefresh } = refreshCounting(() => {
      throw new Error("shared.error.revokedRefreshToken");
    });
    await mount("user", onRefresh);
    expect(calls.num).toBe(1);

    page.window.dispatchEvent(new Event("focus"));
    await pass(1);
    page.window.dispatchEvent(new Event("online"));
    await pass(10 * 60 * 1000);

    expect({ calls: calls.num, ...seen }).toMatchObject({ calls: 1, resets: 0, pageRefreshes: 0 });
  });

  test("a token that reads due however often it is renewed is asked for once a minute at most", async () => {
    session.token = tokenOf(60, { self });
    const { calls, onRefresh } = refreshCounting(() => {
      session.token = tokenOf(60, { self });
    });
    await mount("user", onRefresh);
    await pass(59 * 1000);
    expect(calls.num).toBe(1);

    page.window.dispatchEvent(new Event("focus"));
    await pass(1);
    expect(calls.num).toBe(1);

    await pass(9 * 60 * 1000);
    expect(calls.num).toBeLessThanOrEqual(10);
    expect(calls.num).toBeGreaterThan(1);
  });
});
