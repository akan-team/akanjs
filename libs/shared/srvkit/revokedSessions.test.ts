import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { Logger } from "akanjs/common";

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

  test("an answering check decides alone, whichever way the caller asked to fail", async () => {
    RevokedSessions.use(async (sessionId) => sessionId === "revoked");
    expect(await RevokedSessions.has("revoked")).toBe(true);
    expect(await RevokedSessions.has("live", { failClosed: true })).toBe(false);
    expect(await RevokedSessions.has(undefined, { failClosed: true })).toBe(false);
  });
});
