import { afterEach, beforeAll, describe, expect, jest, mock, test } from "bun:test";

const session = { token: undefined as string | undefined };
const seen = { resets: 0, pageRefreshes: 0 };
const cleanups: Array<() => void> = [];
const page = { window: new EventTarget(), document: Object.assign(new EventTarget(), { visibilityState: "visible" }) };

const tokenOf = (expiresInSec: number, claims: { self?: { id: string }; me?: { id: string } }) =>
  `h.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + expiresInSec, ...claims })).toString("base64url")}.s`;
const self = { id: "u1" };
const me = { id: "a1" };

let TokenRefresh: typeof import("./TokenRefresh").TokenRefresh;

beforeAll(async () => {
  mock.module("react", () => ({
    useEffect: (effect: () => () => void) => {
      cleanups.push(effect());
    },
  }));
  mock.module("@libs/shared/webkit", () => ({
    persistAuthCookie: () => undefined,
    refreshBeforeMs: 2 * 60 * 1000,
    sessionTokenOf: () => session.token,
  }));
  mock.module("akanjs/client", () => ({
    getStoredAuthToken: async () => undefined,
    resetAuth: () => {
      seen.resets += 1;
    },
    router: {
      refresh: () => {
        seen.pageRefreshes += 1;
      },
    },
  }));
  Object.assign(globalThis, page);
  ({ TokenRefresh } = await import("./TokenRefresh"));
});

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  jest.useRealTimers();
  session.token = undefined;
  seen.resets = 0;
  seen.pageRefreshes = 0;
});

const pass = async (ms: number) => {
  jest.advanceTimersByTime(ms);
  for (let turn = 0; turn < 20; turn++) await Promise.resolve();
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
      for (const cleanup of cleanups.splice(0)) cleanup();
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
    expect(seen.resets).toBe(0);
    for (const cleanup of cleanups.splice(0)) cleanup();
    jest.useRealTimers();

    session.token = tokenOf(-60, { self, me });
    await mount("admin", async () => {
      throw new Error("shared.error.revokedRefreshToken");
    });
    expect(seen.resets).toBe(1);
  });
});
