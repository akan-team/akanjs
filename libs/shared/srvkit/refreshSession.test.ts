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
  revokeRefreshSessions,
  revokeRefreshSessionsBut,
  rotateRefreshSession,
} from "./refreshSession";
import { RevokedSessions } from "./revokedSessions";
import { type SecuritySignal, setSecuritySignalHook } from "./securitySignalHook";

const expiresAt = () => dayjs().add(30, "day").toDate();

const pauseListing = (cache: CacheDatabase, refreshTokenHash: string) => {
  let reach: () => void = () => undefined;
  let release: () => void = () => undefined;
  const reached = new Promise<void>((resolve) => {
    reach = resolve;
  });
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  const paused = new Proxy(cache, {
    get(target, property) {
      if (property === "hset")
        return async (...args: Parameters<CacheDatabase["hset"]>) => {
          if (args[2] === refreshTokenHash) {
            reach();
            await released;
          }
          return await target.hset(...args);
        };
      const value = Reflect.get(target, property) as unknown;
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  return { paused, reached, release };
};

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

    test("names the OAuth client of a reused lineage in the signal, and none for a first-party one", async () => {
      const signals: SecuritySignal[] = [];
      setSecuritySignalHook({ onSignal: (signal) => void signals.push(signal) });
      try {
        for (const [prefix, clientId] of [
          ["c", undefined],
          ["o", "dcr_claude"],
        ] as const) {
          await createRefreshSession(cache, {
            subject: "user",
            subjectId: "u1",
            refreshTokenHash: `${prefix}0`,
            expiresAt: expiresAt(),
            ...(clientId ? { clientId } : {}),
          });
          const option = { reuseRevokes: "lineage", ...(clientId ? { clientId } : {}) } as const;
          await rotateRefreshSession(cache, `${prefix}0`, `${prefix}1`, expiresAt(), option);
          await expect(rotateRefreshSession(cache, `${prefix}0`, `${prefix}2`, expiresAt(), option)).rejects.toThrow(
            "shared.error.refreshTokenReuseDetected",
          );
        }
        await Bun.sleep(0);
        expect(signals).toEqual([
          { kind: "refreshReuse", subject: "user", subjectId: "u1", revokes: "lineage" },
          { kind: "refreshReuse", subject: "user", subjectId: "u1", revokes: "lineage", clientId: "dcr_claude" },
        ]);
      } finally {
        setSecuritySignalHook({});
      }
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

    test("keeps the device through a rotation and stamps when the session was last used", async () => {
      const issued = await createRefreshSession(cache, {
        subject: "user",
        subjectId: "u1",
        refreshTokenHash: "d0",
        expiresAt: expiresAt(),
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
        kind: "native",
        network: "203.0.113.0/24",
      });
      expect(issued.lastUsedAt).toBeUndefined();
      const now = dayjs().add(1, "hour");
      const rotated = await rotateRefreshSession(cache, "d0", "d1", expiresAt(), { now });
      expect(rotated).toMatchObject({
        id: issued.id,
        kind: "native",
        network: "203.0.113.0/24",
        userAgent: issued.userAgent,
        createdAt: issued.createdAt,
        lastUsedAt: now.toISOString(),
      });
    });

    test("revokes every session but the kept ones, a session from before devices included, with their tokens", async () => {
      const marked = new Set<string>();
      RevokedSessions.use(null, async (sessionId) => void marked.add(sessionId));
      try {
        const current = await createRefreshSession(cache, {
          subject: "user",
          subjectId: "u1",
          refreshTokenHash: "c0",
          expiresAt: expiresAt(),
          kind: "browser",
        });
        await cache.set("refreshSessionByTokenHash", "old", {
          id: "old-id",
          subject: "user",
          subjectId: "u1",
          refreshTokenHash: "old",
          expiresAt: dayjs().add(1, "day").toISOString(),
        });
        await cache.hset("refreshSessionHashes", "user:u1", "old", 1, { expireAt: dayjs().add(1, "day") });
        const app = await createRefreshSession(cache, {
          subject: "user",
          subjectId: "u1",
          refreshTokenHash: "a0",
          expiresAt: expiresAt(),
          clientId: "dcr_claude",
        });
        const stranger = await createRefreshSession(cache, {
          subject: "user",
          subjectId: "u2",
          refreshTokenHash: "s0",
          expiresAt: expiresAt(),
        });
        const isKept = (session: { id: string; clientId?: string }) => !!session.clientId || session.id === current.id;
        expect(await revokeRefreshSessionsBut(cache, "user", "u1", isKept)).toEqual(["old-id"]);
        expect([...marked]).toEqual(["old-id"]);
        await expect(rotateRefreshSession(cache, "old", "old1", expiresAt())).rejects.toThrow(
          "shared.error.revokedRefreshToken",
        );
        expect((await listRefreshSessions(cache, "user", "u1")).map((session) => session.id).sort()).toEqual(
          [current.id, app.id].sort(),
        );
        expect((await listRefreshSessions(cache, "user", "u2")).map((session) => session.id)).toEqual([stranger.id]);
        expect(await revokeRefreshSessionsBut(cache, "user", "u1", isKept)).toEqual([]);
      } finally {
        RevokedSessions.use(null);
      }
    });

    for (const [name, revoke] of [
      ["every session", async (_id: string) => await revokeRefreshSessions(cache, "user", "u1")],
      ["every other session", async (_id: string) => await revokeRefreshSessionsBut(cache, "user", "u1", () => false)],
      ["the one session", async (id: string) => await revokeRefreshSessionBySid(cache, "user", "u1", id)],
    ] as const)
      test(`signing out ${name} while a refresh is between its new entry and the owner's list ends it`, async () => {
        const session = await createRefreshSession(cache, {
          subject: "user",
          subjectId: "u1",
          refreshTokenHash: "h0",
          expiresAt: expiresAt(),
        });
        const { paused, reached, release } = pauseListing(cache, "h1");
        const refresh = rotateRefreshSession(paused, "h0", "h1", expiresAt());
        await reached;
        await revoke(session.id);
        release();
        await expect(refresh).rejects.toThrow("shared.error.revokedRefreshToken");
        await expect(rotateRefreshSession(cache, "h1", "h2", expiresAt())).rejects.toThrow(
          "shared.error.revokedRefreshToken",
        );
        expect(await listRefreshSessions(cache, "user", "u1")).toEqual([]);
      });

    test("a refresh replaces its entry in the owner's list, and a token rotated away still sets off reuse", async () => {
      await createRefreshSession(cache, {
        subject: "user",
        subjectId: "u1",
        refreshTokenHash: "h0",
        expiresAt: expiresAt(),
      });
      for (let idx = 0; idx < 20; idx++) await rotateRefreshSession(cache, `h${idx}`, `h${idx + 1}`, expiresAt());
      expect(await cache.hkeys("refreshSessionHashes", "user:u1")).toEqual(["h20"]);
      await expect(rotateRefreshSession(cache, "h3", "x1", expiresAt())).rejects.toThrow(
        "shared.error.refreshTokenReuseDetected",
      );
      await expect(rotateRefreshSession(cache, "h20", "h21", expiresAt())).rejects.toThrow(
        "shared.error.revokedRefreshToken",
      );
    });

    test("a token rotated away from a session signed out since is refused as revoked, not read as a reuse", async () => {
      const session = await createRefreshSession(cache, {
        subject: "user",
        subjectId: "u1",
        refreshTokenHash: "h0",
        expiresAt: expiresAt(),
      });
      const other = await createRefreshSession(cache, {
        subject: "user",
        subjectId: "u1",
        refreshTokenHash: "g0",
        expiresAt: expiresAt(),
      });
      await rotateRefreshSession(cache, "h0", "h1", expiresAt());
      await revokeRefreshSessionBySid(cache, "user", "u1", session.id);
      await expect(rotateRefreshSession(cache, "h0", "h2", expiresAt())).rejects.toThrow(
        "shared.error.revokedRefreshToken",
      );
      expect((await listRefreshSessions(cache, "user", "u1")).map(({ id }) => id)).toEqual([other.id]);
    });

    test("a session from before devices were recorded takes the refreshing request's; others keep their own", async () => {
      const phone = { kind: "native", userAgent: "ZiPR/1.0 (iPhone)", network: "198.51.100.0/24" } as const;
      await createRefreshSession(cache, {
        subject: "user",
        subjectId: "u1",
        refreshTokenHash: "l0",
        expiresAt: expiresAt(),
        userAgent: "Mozilla/5.0 (Old)",
      });
      expect(await rotateRefreshSession(cache, "l0", "l1", expiresAt(), { device: phone })).toMatchObject(phone);
      const laptop = { kind: "browser", userAgent: "Mozilla/5.0 (Macintosh)", network: "203.0.113.0/24" } as const;
      expect(await rotateRefreshSession(cache, "l1", "l2", expiresAt(), { device: laptop })).toMatchObject(phone);
      await createRefreshSession(cache, {
        subject: "user",
        subjectId: "u1",
        refreshTokenHash: "a0",
        expiresAt: expiresAt(),
        clientId: "dcr_claude",
      });
      const app = await rotateRefreshSession(cache, "a0", "a1", expiresAt(), { clientId: "dcr_claude", device: phone });
      expect([app.kind, app.network]).toEqual([undefined, undefined]);
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
