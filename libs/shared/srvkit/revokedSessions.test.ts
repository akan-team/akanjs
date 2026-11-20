import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { accessTokenSeconds } from "@libs/util/common";
import { type Dayjs, dayjs } from "akanjs/base";
import { Logger } from "akanjs/common";
import { WsCredentialRevocation } from "akanjs/server";

import { RevokedSessions } from "./revokedSessions";

const failingCheck = async (): Promise<boolean> => {
  throw new Error("cache unreachable");
};

describe("RevokedSessions", () => {
  afterEach(() => {
    RevokedSessions.use(null);
  });

  test("a failed check lets a user's session live and refuses one asked to fail closed, warning each time", async () => {
    RevokedSessions.use(failingCheck);
    const warn = spyOn(Logger.prototype, "warn");
    try {
      expect(await RevokedSessions.has("user-session")).toBe(false);
      expect(await RevokedSessions.has("admin-session", { failClosed: true })).toBe(true);
      expect(warn).toHaveBeenCalledTimes(2);
    } finally {
      warn.mockRestore();
    }
  });

  test("denies a revoked session for as long as an access token of it can still live", async () => {
    const marks: Array<{ sessionId: string; until: Dayjs }> = [];
    RevokedSessions.use(null, async (sessionId, until) => void marks.push({ sessionId, until }));
    await RevokedSessions.markRevoked(["s1", "s2"]);
    expect(marks.map(({ sessionId }) => sessionId)).toEqual(["s1", "s2"]);
    const sevenDays = 7 * 24 * 60 * 60;
    expect(RevokedSessions.deniedSeconds).toBeGreaterThanOrEqual(accessTokenSeconds);
    expect(RevokedSessions.deniedSeconds).toBeGreaterThanOrEqual(sevenDays);
    for (const { until } of marks)
      expect(Math.abs(until.diff(dayjs(), "second") - RevokedSessions.deniedSeconds)).toBeLessThanOrEqual(2);
  });

  test("closes every socket a revoked session holds, under whichever claim its token names it, once it is marked", async () => {
    const steps: string[] = [];
    RevokedSessions.use(null, async (sessionId) => void steps.push(`mark ${sessionId}`));
    const revoke = spyOn(WsCredentialRevocation, "revoke").mockImplementation(() => void steps.push("close"));
    try {
      await RevokedSessions.markRevoked(["s1", "s2"]);
      expect(steps).toEqual(["mark s1", "mark s2", "close"]);
      expect(revoke).toHaveBeenCalledWith({ sid: ["s1", "s2"], selfSid: ["s1", "s2"], meSid: ["s1", "s2"] });
    } finally {
      revoke.mockRestore();
    }
  });

  test("an answering check decides alone, whichever way the caller asked to fail", async () => {
    RevokedSessions.use(async (sessionId) => sessionId === "revoked");
    expect(await RevokedSessions.has("revoked")).toBe(true);
    expect(await RevokedSessions.has("live", { failClosed: true })).toBe(false);
    expect(await RevokedSessions.has(undefined, { failClosed: true })).toBe(false);
  });
});
