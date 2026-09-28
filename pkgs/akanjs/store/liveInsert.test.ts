import { describe, expect, test } from "bun:test";
import { dayjs } from "akanjs/base";
import { type LiveSortableRow, livePlacementIndex } from "./liveInsert";

const sorts = { latest: { createdAt: -1 as const }, oldest: { createdAt: 1 as const }, byAt: { at: 1 as const } };
const row = (id: string, at: number) => ({ id, createdAt: dayjs(at), at });
const list = [row("c", 300), row("b", 200), row("a", 100)];

const place = (patch: Partial<Parameters<typeof livePlacementIndex>[0]> = {}) =>
  livePlacementIndex({
    list,
    row: row("new", 250),
    page: 1,
    limit: 5,
    cumulative: false,
    hasMore: false,
    sortKey: "latest",
    allowedSorts: ["latest"],
    sorts,
    ...patch,
  });

describe("livePlacementIndex", () => {
  test("places a row by the declared sort", () => {
    expect(place()).toBe(1);
    expect(place({ row: row("new", 400) })).toBe(0);
    expect(place({ row: row("new", 50) })).toBe(3);
  });

  test("an ascending sort places from the other end", () => {
    expect(place({ sortKey: "oldest", allowedSorts: ["oldest"], list: [...list].reverse() })).toBe(2);
  });

  test("a sort the slice did not allowlist refuses to guess", () => {
    expect(place({ sortKey: "byAt", allowedSorts: ["latest"] })).toBeNull();
    expect(place({ sortKey: "relevance", allowedSorts: ["latest", "relevance"] })).toBeNull();
    expect(place({ sorts: undefined })).toBeNull();
  });

  test("only the first page can place a row", () => {
    expect(place({ page: 2 })).toBeNull();
  });

  test("a row past the end of a full window belongs to a later page", () => {
    expect(place({ row: row("new", 50), limit: 3 })).toBeNull();
    expect(place({ row: row("new", 50), limit: 4 })).toBe(3);
  });

  test("a cumulative list takes a row past its tail only once the server has nothing left", () => {
    const past = { row: row("new", 50), cumulative: true, limit: 3 };
    expect(place({ ...past, hasMore: true })).toBeNull();
    expect(place({ ...past, hasMore: false })).toBe(3);
  });

  test("an empty window takes the first row", () => {
    expect(place({ list: [] })).toBe(0);
  });

  test("a row missing the sorted field refuses to guess", () => {
    expect(place({ row: { id: "new" } })).toBeNull();
    expect(place({ row: { id: "new", createdAt: { at: 1 } } })).toBeNull();
  });

  test("ties break by id in the direction of the last sort key, as the server's ORDER BY does", () => {
    expect(place({ row: row("bz", 200) })).toBe(1);
    expect(place({ row: row("a0", 200) })).toBe(2);
    expect(place({ row: row("bz", 200), sortKey: "oldest", allowedSorts: ["oldest"], list: [...list].reverse() })).toBe(
      2,
    );
  });

  test("null sorts below every value: last when descending, first when ascending", () => {
    const byScore = { desc: { score: -1 as const }, asc: { score: 1 as const } };
    const scored = (id: string, score: number | null) => ({ id, score });
    const at = (sortKey: "desc" | "asc", items: LiveSortableRow[], score: number | null) =>
      place({ list: items, row: scored("new", score), sortKey, allowedSorts: [sortKey], sorts: byScore });
    const descending = [scored("a", 0.5), scored("b", 0.2), scored("c", null)];
    expect(at("desc", descending, 0.1)).toBe(2);
    expect(at("desc", descending, null)).toBe(2);
    const ascending = [scored("c", null), scored("b", 0.2), scored("a", 0.5)];
    expect(at("asc", ascending, 0.1)).toBe(1);
    expect(at("asc", ascending, null)).toBe(1);
  });

  test("strings order by code point, as SQL's byte order does, not by UTF-16 unit", () => {
    const byName = { name: { name: 1 as const } };
    const named = [
      { id: "a", name: "B" },
      { id: "b", name: "a" },
      { id: "c", name: "ｱ" },
      { id: "d", name: "😀" },
    ];
    const at = (name: string) =>
      place({ list: named, row: { id: "new", name }, sortKey: "name", allowedSorts: ["name"], sorts: byName });
    expect(at("C")).toBe(1);
    expect(at("😁")).toBe(4);
    expect(at("ｲ")).toBe(3);
  });

  test("a row that would pass a value it cannot order refuses to guess", () => {
    const odd = [row("c", 300), { id: "b", createdAt: { at: 200 } }, row("a", 100)];
    expect(place({ list: odd, row: row("new", 400) })).toBe(0);
    expect(place({ list: odd, row: row("new", 250) })).toBeNull();
  });

  test("a multi-field sort falls through to the next field", () => {
    const tiered = { tier: { rank: 1 as const, createdAt: -1 as const } };
    const ranked = [
      { id: "x", rank: 1, createdAt: dayjs(500) },
      { id: "y", rank: 2, createdAt: dayjs(900) },
      { id: "z", rank: 2, createdAt: dayjs(100) },
    ];
    const at = (rank: number, createdAt: number) =>
      livePlacementIndex({
        list: ranked,
        row: { id: "new", rank, createdAt: dayjs(createdAt) },
        page: 1,
        limit: 5,
        cumulative: false,
        hasMore: false,
        sortKey: "tier",
        allowedSorts: ["tier"],
        sorts: tiered,
      });
    expect(at(1, 100)).toBe(1);
    expect(at(2, 950)).toBe(1);
    expect(at(3, 950)).toBe(3);
  });
});
