import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";

const kept = new Map<string, string>();
const storageState = { refuses: false };
const hourMs = 3600 * 1000;
const tokenIssuedAt = (iat: number) =>
  `h.${Buffer.from(JSON.stringify({ iat, exp: iat + 3600 })).toString("base64url")}.s`;
const nowSec = () => Math.floor(Date.now() / 1000);

let SessionClock: typeof import("./sessionClock").SessionClock;

beforeAll(async () => {
  mock.module("akanjs/base", () => ({
    getEnv: () => ({ side: "client", renderMode: "ssr", appName: "shop" }),
  }));
  mock.module("akanjs/client", () => ({
    storage: {
      getItem: async (key: string) => {
        if (storageState.refuses) throw new Error("refused");
        return kept.get(key) ?? null;
      },
      setItem: async (key: string, value: string) => {
        if (storageState.refuses) throw new Error("refused");
        kept.set(key, value);
      },
    },
  }));
  ({ SessionClock } = await import("./sessionClock"));
});

afterEach(() => {
  SessionClock.reset();
  kept.clear();
  storageState.refuses = false;
});

describe("SessionClock", () => {
  test("a measurement is kept under the app's key and read back by the next page", async () => {
    const iat = nowSec() + 3600;
    SessionClock.measure(tokenIssuedAt(iat), iat * 1000 - hourMs);
    await Promise.resolve();
    expect(kept.get("serverClockAheadMs:shop")).toBe(String(-hourMs));

    SessionClock.reset();
    expect(SessionClock.expiresAt(iat + 3600, iat)).toBe((iat + 3600) * 1000);
    await SessionClock.ready();
    expect(SessionClock.expiresAt(iat + 3600, iat)).toBe((iat + 3600) * 1000 - hourMs);
  });

  test("a kept value that is not a number is ignored", async () => {
    kept.set("serverClockAheadMs:shop", "soon");
    await SessionClock.ready();
    expect(SessionClock.expiresAt(nowSec() + 3600, nowSec())).toBe((nowSec() + 3600) * 1000);
  });

  test("a measurement taken while the kept one is still loading is the one that stands", async () => {
    kept.set("serverClockAheadMs:shop", String(2 * hourMs));
    const iat = nowSec() + 3600;
    const loading = SessionClock.ready();
    SessionClock.measure(tokenIssuedAt(iat), iat * 1000 - hourMs);
    await loading;
    expect(SessionClock.expiresAt(iat + 3600, iat)).toBe((iat + 3600) * 1000 - hourMs);
  });

  test("storage a browser refuses costs only the keeping", async () => {
    storageState.refuses = true;
    const iat = nowSec() + 3600;
    await SessionClock.ready();
    SessionClock.measure(tokenIssuedAt(iat), iat * 1000 - hourMs);
    await Promise.resolve();
    expect(SessionClock.expiresAt(iat + 3600, iat)).toBe((iat + 3600) * 1000 - hourMs);
    expect(kept.size).toBe(0);
  });

  test("a token that cannot be read, or carries no issue time, measures nothing and is never doubted", async () => {
    SessionClock.measure("not-a-token", Date.now());
    SessionClock.measure(`h.${Buffer.from(JSON.stringify({ exp: nowSec() + 3600 })).toString("base64url")}.s`, 0);
    await Promise.resolve();
    expect(kept.size).toBe(0);
    expect(SessionClock.isDoubted(undefined)).toBe(false);
  });

  test("a token issued in this device's future is doubted until it is conceded, and an older token concedes nothing more", () => {
    const iat = nowSec() + 3600;
    expect(SessionClock.isDoubted(iat)).toBe(true);
    SessionClock.concede(iat);
    expect(SessionClock.isDoubted(iat)).toBe(false);
    const expiresAt = SessionClock.expiresAt(iat + 3600, iat);
    expect(Math.abs(expiresAt - Date.now() - hourMs)).toBeLessThan(2000);

    SessionClock.concede(iat - 1800);
    expect(SessionClock.expiresAt(iat + 3600, iat)).toBe(expiresAt);
  });
});
