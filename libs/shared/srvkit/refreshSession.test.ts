import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { dayjs } from "akanjs/base";
import { CacheDatabase } from "akanjs/document";
import { ConformanceEnv } from "akanjs/test";
import {
  createRefreshSession,
  getRefreshSession,
  listRefreshSessions,
  refreshRotationGraceMs,
  revokeRefreshSessionBySid,
  rotateRefreshSession,
} from "./refreshSession";

const expiresAt = () => dayjs().add(30, "day").toDate();

// Every case runs on the real cache adaptors: an in-memory Map hands objects back by reference, which is what hid
// [A-1] (`local/database-modes/03-single-instance-assumptions.md`).
for (const kind of ConformanceEnv.cacheKinds("refresh session")) {
  describe(`refresh sessions on the ${kind} cache`, () => {
    let opened: Awaited<ReturnType<typeof ConformanceEnv.openCache>>;
    let cache: CacheDatabase;
    beforeEach(async () => {
      opened = await ConformanceEnv.openCache(kind);
      cache = new CacheDatabase("user", opened.cache);
    });
    afterEach(async () => {
      await opened.close();
    });

    test("rotates once, honours a reuse inside the grace window, and revokes the family past it", async () => {
      await createRefreshSession(cache, {
        subject: "user",
        subjectId: "u1",
        refreshTokenHash: "h0",
        expiresAt: expiresAt(),
      });
      const first = await rotateRefreshSession(cache, "h0", "h1", expiresAt());
      expect(first.refreshTokenHash).toBe("h1");
      // The same token again, a second later: a client holding it in two places, answered with a sibling.
      const sibling = await rotateRefreshSession(cache, "h0", "h2", expiresAt(), {
        graceMs: refreshRotationGraceMs,
        now: dayjs().add(1, "second"),
      });
      expect(sibling.refreshTokenHash).toBe("h2");
      // Both children are live.
      expect((await rotateRefreshSession(cache, "h1", "h3", expiresAt())).refreshTokenHash).toBe("h3");
      expect((await rotateRefreshSession(cache, "h2", "h4", expiresAt())).refreshTokenHash).toBe("h4");
      // Past the window the reuse is theft: the whole family goes.
      const late = dayjs().add(refreshRotationGraceMs + 1000, "millisecond");
      await expect(
        rotateRefreshSession(cache, "h0", "h5", expiresAt(), { graceMs: refreshRotationGraceMs, now: late }),
      ).rejects.toThrow("shared.error.refreshTokenReuseDetected");
      await expect(rotateRefreshSession(cache, "h3", "h6", expiresAt())).rejects.toThrow(
        "shared.error.revokedRefreshToken",
      );
      await expect(rotateRefreshSession(cache, "h4", "h7", expiresAt())).rejects.toThrow(
        "shared.error.revokedRefreshToken",
      );
    });

    test("measures the window from the first rotation, so re-presenting cannot keep it open", async () => {
      await createRefreshSession(cache, {
        subject: "admin",
        subjectId: "a1",
        refreshTokenHash: "h0",
        expiresAt: expiresAt(),
      });
      await rotateRefreshSession(cache, "h0", "h1", expiresAt());
      const half = dayjs().add(refreshRotationGraceMs / 2, "millisecond");
      await rotateRefreshSession(cache, "h0", "h2", expiresAt(), { graceMs: refreshRotationGraceMs, now: half });
      const past = dayjs().add(refreshRotationGraceMs + 500, "millisecond");
      await expect(
        rotateRefreshSession(cache, "h0", "h3", expiresAt(), { graceMs: refreshRotationGraceMs, now: past }),
      ).rejects.toThrow("shared.error.refreshTokenReuseDetected");
    });

    test("revokes only the reused token's lineage when asked, leaving the subject's other grants alive", async () => {
      await createRefreshSession(cache, {
        subject: "user",
        subjectId: "u1",
        refreshTokenHash: "h0",
        expiresAt: expiresAt(),
      });
      await createRefreshSession(cache, {
        subject: "user",
        subjectId: "u1",
        refreshTokenHash: "g0",
        expiresAt: expiresAt(),
      });
      await rotateRefreshSession(cache, "h0", "h1", expiresAt());
      await expect(rotateRefreshSession(cache, "h0", "h2", expiresAt(), { reuseRevokes: "lineage" })).rejects.toThrow(
        "shared.error.refreshTokenReuseDetected",
      );
      // The replayed lineage is gone …
      await expect(rotateRefreshSession(cache, "h1", "h3", expiresAt())).rejects.toThrow(
        "shared.error.revokedRefreshToken",
      );
      // … and the other grant — another client, the browser — still rotates.
      expect((await rotateRefreshSession(cache, "g0", "g1", expiresAt())).refreshTokenHash).toBe("g1");
    });

    test("stays strictly single-use unless a grace window is asked for", async () => {
      await createRefreshSession(cache, {
        subject: "user",
        subjectId: "u1",
        refreshTokenHash: "h0",
        expiresAt: expiresAt(),
      });
      await rotateRefreshSession(cache, "h0", "h1", expiresAt());
      await expect(rotateRefreshSession(cache, "h0", "h2", expiresAt())).rejects.toThrow(
        "shared.error.refreshTokenReuseDetected",
      );
    });

    test("presented twice at once, a token rotates once and the second presentation revokes the account", async () => {
      for (const refreshTokenHash of ["h0", "g0"])
        await createRefreshSession(cache, {
          subject: "user",
          subjectId: "u1",
          refreshTokenHash,
          expiresAt: expiresAt(),
        });
      const settled = await Promise.allSettled([
        rotateRefreshSession(cache, "h0", "h1", expiresAt()),
        rotateRefreshSession(cache, "h0", "h2", expiresAt()),
      ]);
      const rotated = settled.flatMap((result) =>
        result.status === "fulfilled" ? [result.value.refreshTokenHash] : [],
      );
      const refused = settled.flatMap((result) =>
        result.status === "rejected" ? [(result.reason as Error).message] : [],
      );
      expect(rotated).toHaveLength(1);
      expect(refused).toEqual(["shared.error.refreshTokenReuseDetected"]);
      const [winner] = rotated;
      await expect(rotateRefreshSession(cache, winner, "h3", expiresAt())).rejects.toThrow(
        "shared.error.revokedRefreshToken",
      );
      await expect(rotateRefreshSession(cache, "g0", "g1", expiresAt())).rejects.toThrow(
        "shared.error.revokedRefreshToken",
      );
      expect(await listRefreshSessions(cache, "user", "u1")).toEqual([]);
    });

    test("with a grace window, two presentations of one token at once both rotate and both stay live", async () => {
      await createRefreshSession(cache, {
        subject: "user",
        subjectId: "u1",
        refreshTokenHash: "h0",
        expiresAt: expiresAt(),
      });
      const option = { graceMs: refreshRotationGraceMs, reuseRevokes: "lineage" } as const;
      const both = await Promise.all([
        rotateRefreshSession(cache, "h0", "h1", expiresAt(), option),
        rotateRefreshSession(cache, "h0", "h2", expiresAt(), option),
      ]);
      expect(both.map((session) => session.refreshTokenHash)).toEqual(["h1", "h2"]);
      expect((await rotateRefreshSession(cache, "h1", "h3", expiresAt())).refreshTokenHash).toBe("h3");
      expect((await rotateRefreshSession(cache, "h2", "h4", expiresAt())).refreshTokenHash).toBe("h4");
    });

    test("judges a token rotated before rotations were claimed by its rotatedAt, as before", async () => {
      const session = await createRefreshSession(cache, {
        subject: "user",
        subjectId: "u1",
        refreshTokenHash: "old",
        expiresAt: expiresAt(),
      });
      await cache.set("refreshSessionByTokenHash", "old", {
        ...session,
        rotatedAt: dayjs().toISOString(),
        replacedBy: "new",
      });
      const sibling = await rotateRefreshSession(cache, "old", "h1", expiresAt(), { graceMs: refreshRotationGraceMs });
      expect(sibling.refreshTokenHash).toBe("h1");
      await expect(rotateRefreshSession(cache, "old", "h2", expiresAt())).rejects.toThrow(
        "shared.error.refreshTokenReuseDetected",
      );
    });

    test("still refuses an unknown, revoked or expired token", async () => {
      await expect(rotateRefreshSession(cache, "nope", "h1", expiresAt())).rejects.toThrow(
        "shared.error.invalidRefreshToken",
      );
      await createRefreshSession(cache, {
        subject: "user",
        subjectId: "u1",
        refreshTokenHash: "old",
        expiresAt: dayjs().add(1, "hour").toDate(),
      });
      await expect(
        rotateRefreshSession(cache, "old", "h1", expiresAt(), { now: dayjs().add(2, "hour") }),
      ).rejects.toThrow("shared.error.expiredRefreshToken");
    });

    test("answers an OAuth client's token as unknown anywhere but that client, and spends nothing doing so", async () => {
      const agent = await createRefreshSession(cache, {
        subject: "user",
        subjectId: "u1",
        refreshTokenHash: "a0",
        expiresAt: expiresAt(),
        clientId: "dcr_claude",
      });
      await createRefreshSession(cache, {
        subject: "user",
        subjectId: "u1",
        refreshTokenHash: "b0",
        expiresAt: expiresAt(),
      });
      for (const option of [{}, { graceMs: refreshRotationGraceMs, reuseRevokes: "lineage" } as const])
        await expect(rotateRefreshSession(cache, "a0", "x1", expiresAt(), option)).rejects.toThrow(
          "shared.error.invalidRefreshToken",
        );
      await expect(rotateRefreshSession(cache, "a0", "x2", expiresAt(), { clientId: "dcr_other" })).rejects.toThrow(
        "shared.error.invalidRefreshToken",
      );
      await expect(rotateRefreshSession(cache, "b0", "x3", expiresAt(), { clientId: "dcr_claude" })).rejects.toThrow(
        "shared.error.invalidRefreshToken",
      );
      const untouched = await getRefreshSession(cache, "a0");
      expect(untouched?.rotatedAt).toBeUndefined();
      expect(untouched?.revokedAt).toBeUndefined();
      for (const hash of ["x1", "x2", "x3"]) expect(await getRefreshSession(cache, hash)).toBeUndefined();
      expect((await rotateRefreshSession(cache, "a0", "a1", expiresAt(), { clientId: "dcr_claude" })).id).toBe(
        agent.id,
      );
      expect((await rotateRefreshSession(cache, "b0", "b1", expiresAt())).refreshTokenHash).toBe("b1");
    });

    test("a rotated-away OAuth token presented at a first-party refresh is refused, not read as a reuse", async () => {
      for (const [refreshTokenHash, clientId] of [
        ["a0", "dcr_claude"],
        ["b0", undefined],
      ] as const)
        await createRefreshSession(cache, {
          subject: "user",
          subjectId: "u1",
          refreshTokenHash,
          expiresAt: expiresAt(),
          clientId,
        });
      await rotateRefreshSession(cache, "a0", "a1", expiresAt(), { clientId: "dcr_claude" });
      await expect(rotateRefreshSession(cache, "a0", "x1", expiresAt())).rejects.toThrow(
        "shared.error.invalidRefreshToken",
      );
      expect(
        (await listRefreshSessions(cache, "user", "u1")).map((session) => session.refreshTokenHash).sort(),
      ).toEqual(["a1", "b0"]);
    });

    test("lists the live heads only: rotated-away, revoked and expired entries drop out", async () => {
      const browser = await createRefreshSession(cache, {
        subject: "user",
        subjectId: "u1",
        refreshTokenHash: "b0",
        expiresAt: expiresAt(),
      });
      const agent = await createRefreshSession(cache, {
        subject: "user",
        subjectId: "u1",
        refreshTokenHash: "a0",
        expiresAt: expiresAt(),
        clientId: "dcr_claude",
        userAgent: "Claude Code",
      });
      expect(agent.createdAt).toBeTruthy();
      await rotateRefreshSession(cache, "a0", "a1", expiresAt(), { clientId: "dcr_claude" });
      const expired = await createRefreshSession(cache, {
        subject: "user",
        subjectId: "u1",
        refreshTokenHash: "x0",
        expiresAt: dayjs().subtract(1, "day").toDate(),
        clientId: "dcr_old",
      });
      const live = await listRefreshSessions(cache, "user", "u1");
      expect(live.map((session) => session.refreshTokenHash).sort()).toEqual(["a1", "b0"]);
      // The rotated head keeps the lineage id, which is what a connected-apps list groups by.
      expect(live.find((session) => session.refreshTokenHash === "a1")?.id).toBe(agent.id);
      expect(live.some((session) => session.id === expired.id)).toBe(false);
      await revokeRefreshSessionBySid(cache, "user", "u1", agent.id);
      expect((await listRefreshSessions(cache, "user", "u1")).map((session) => session.id)).toEqual([browser.id]);
      expect((await getRefreshSession(cache, "a1"))?.revokedAt).toBeTruthy();
      // Another subject's list is untouched by all of it.
      expect(await listRefreshSessions(cache, "user", "u2")).toEqual([]);
    });

    test("[A-1] a user who signs in twice keeps both sessions", async () => {
      for (const hash of ["first", "second"])
        await createRefreshSession(cache, {
          subject: "user",
          subjectId: "u1",
          refreshTokenHash: hash,
          expiresAt: expiresAt(),
        });
      const live = await listRefreshSessions(cache, "user", "u1");
      expect(live.map((session) => session.refreshTokenHash).sort((a, b) => a.localeCompare(b))).toEqual([
        "first",
        "second",
      ]);
    });

    test("[A-2] sign-ins at the same moment all land in the owner's list", async () => {
      const hashes = Array.from({ length: 8 }, (_, idx) => `h${idx}`);
      await Promise.all(
        hashes.map(
          async (hash) =>
            await createRefreshSession(cache, {
              subject: "user",
              subjectId: "u1",
              refreshTokenHash: hash,
              expiresAt: expiresAt(),
            }),
        ),
      );
      await revokeRefreshSessionBySid(cache, "user", "u1", (await getRefreshSession(cache, "h3"))?.id);
      const live = await listRefreshSessions(cache, "user", "u1");
      expect(live.map((session) => session.refreshTokenHash).sort((a, b) => a.localeCompare(b))).toEqual(
        hashes.filter((hash) => hash !== "h3"),
      );
    });

    test("still finds sessions an earlier version listed as one array value", async () => {
      await cache.set("refreshSessionByTokenHash", "legacy", {
        id: "legacy-id",
        subject: "user",
        subjectId: "u1",
        refreshTokenHash: "legacy",
        expiresAt: dayjs().add(1, "day").toISOString(),
      });
      await cache.set("refreshSessionHashes", "user:u1", ["legacy"]);
      await createRefreshSession(cache, {
        subject: "user",
        subjectId: "u1",
        refreshTokenHash: "new",
        expiresAt: expiresAt(),
      });
      const live = await listRefreshSessions(cache, "user", "u1");
      expect(live.map((session) => session.refreshTokenHash).sort((a, b) => a.localeCompare(b))).toEqual([
        "legacy",
        "new",
      ]);
    });
  });
}
