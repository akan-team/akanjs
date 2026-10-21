import { describe, expect, test } from "bun:test";
import { dayjs } from "akanjs/base";
import { createDocumentQueryHelper } from "./documentQuery";
import { LiveRowScope } from "./liveRowScope";

const q = createDocumentQueryHelper();

describe("LiveRowScope", () => {
  test("names a removedAt condition only a removed row can meet, through all, any and not", () => {
    expect(LiveRowScope.conflictOf(q.exists("removedAt"))).toBe("removedAt exists asks for removed rows");
    expect(LiveRowScope.conflictOf(q.not(q.empty("removedAt")))).toBe("not(removedAt empty) asks for removed rows");
    expect(LiveRowScope.conflictOf(q.not(q.not(q.exists("removedAt"))))).toBe("removedAt exists asks for removed rows");
    expect(LiveRowScope.conflictOf({ removedAt: q.ne(null) })).toBe("removedAt ne(null) asks for removed rows");
    expect(LiveRowScope.conflictOf({ removedAt: { exists: true } })).toBe(
      "removedAt { exists: true } asks for removed rows",
    );
    expect(LiveRowScope.conflictOf({ removedAt: { empty: false } })).toBe(
      "removedAt { empty: false } asks for removed rows",
    );
    expect(LiveRowScope.conflictOf(q.any({ title: "a" }, q.all({ score: 1 }, q.exists("removedAt"))))).toBe(
      "removedAt exists asks for removed rows",
    );
    expect(LiveRowScope.conflictOf({ kind: "image", removedAt: q.ne(null) })).toBe(
      "removedAt ne(null) asks for removed rows",
    );
  });

  test("names a removedAt value comparison whatever its polarity", () => {
    expect(LiveRowScope.conflictOf({ removedAt: q.gte(dayjs()) })).toBe(
      "removedAt gte compares a value no live row holds",
    );
    expect(LiveRowScope.conflictOf(q.not({ removedAt: q.lt(dayjs()) }))).toBe(
      "not(removedAt lt) compares a value no live row holds",
    );
    expect(LiveRowScope.conflictOf({ removedAt: dayjs() })).toBe("removedAt eq compares a value no live row holds");
    expect(LiveRowScope.conflictOf({ removedAt: { gt: 0 } })).toBe("removedAt gt compares a value no live row holds");
  });

  test("lets an IS NULL form through, and what it cannot read", () => {
    const passing = [
      undefined,
      {},
      q.empty("removedAt"),
      q.missing("removedAt"),
      { removedAt: null },
      { removedAt: q.eq(null) },
      { removedAt: { empty: true } },
      { removedAt: { missing: true } },
      { removedAt: { exists: false } },
      { removedAt: { empty: true }, title: "a" },
      q.not(q.exists("removedAt")),
      q.not(q.any({ title: "a" }, q.exists("removedAt"))),
      { removedAt: q.oneOf([]) },
      { createdAt: q.gt(dayjs(0)) },
      q.exists("title"),
      q.raw(`"removedAt" IS NOT NULL`),
      q.search("revenue"),
    ];
    for (const query of passing) expect(LiveRowScope.conflictOf(query)).toBeNull();
  });
});
