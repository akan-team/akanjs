import { describe, expect, test } from "bun:test";
import { dayjs } from "akanjs/base";
import { createDocumentQueryHelper } from "akanjs/document";
import { LiveSyncHub } from "./liveSyncHub";

const q = createDocumentQueryHelper();
const fields = { tags: { getProps: () => ({ isArray: true }) } };

const doc = (patch: Record<string, unknown> = {}) => ({
  id: "a".repeat(24),
  createdAt: dayjs(1000),
  updatedAt: dayjs(2000),
  org: "o1",
  status: "draft",
  tags: [] as string[],
  ...patch,
});

const hubWith = (rooms: { roomId: string; query?: object; fallback?: "invalidate" }[]) => {
  const hub = new LiveSyncHub();
  for (const room of rooms)
    hub.join({ refName: "task", roomId: room.roomId, query: room.query, fallback: room.fallback ?? null, fields });
  return hub;
};

describe("LiveSyncHub routing", () => {
  test("a create enters the rooms it belongs to and no others", () => {
    const hub = hubWith([
      { roomId: "inOrg-o1", query: { org: "o1" } },
      { roomId: "inOrg-o2", query: { org: "o2" } },
    ]);
    expect(hub.route("task", doc())).toEqual([
      { roomId: "inOrg-o1", op: "enter", invalidate: false, payload: "light" },
    ]);
  });

  test("a room over a field named kind routes by that field", () => {
    const hub = hubWith([{ roomId: "images", query: { kind: "image" } }]);
    expect(hub.route("task", doc({ kind: "image" }))).toEqual([
      { roomId: "images", op: "enter", invalidate: false, payload: "light" },
    ]);
    expect(hub.route("task", doc({ kind: "video" }))).toEqual([]);
  });

  test("an edit inside a room is an update", () => {
    const hub = hubWith([{ roomId: "inOrg-o1", query: { org: "o1" } }]);
    const targets = hub.route("task", doc({ status: "open" }), doc());
    expect(targets).toEqual([{ roomId: "inOrg-o1", op: "update", invalidate: false, payload: "light" }]);
  });

  test("an edit that moves a row out of a filter leaves that room and enters the other", () => {
    const hub = hubWith([
      { roomId: "byStatus-draft", query: { status: "draft" } },
      { roomId: "byStatus-archived", query: { status: "archived" } },
    ]);
    const targets = hub.route("task", doc({ status: "archived" }), doc());
    expect(targets).toEqual([
      { roomId: "byStatus-draft", op: "leave", invalidate: false, payload: "light" },
      { roomId: "byStatus-archived", op: "enter", invalidate: false, payload: "light" },
    ]);
  });

  test("a soft delete leaves every room it was in", () => {
    const hub = hubWith([{ roomId: "inOrg-o1", query: { org: "o1" } }]);
    const removed = doc({ removedAt: dayjs(3000) });
    expect(hub.route("task", removed, doc())).toEqual([
      { roomId: "inOrg-o1", op: "leave", invalidate: false, payload: "light" },
    ]);
  });

  test("a change touching neither side of a room is not routed to it", () => {
    const hub = hubWith([{ roomId: "inOrg-o2", query: { org: "o2" } }]);
    expect(hub.route("task", doc({ status: "open" }), doc())).toEqual([]);
  });

  test("a document already removed before and after reaches nobody", () => {
    const hub = hubWith([{ roomId: "inOrg-o1", query: { org: "o1" } }]);
    const before = doc({ removedAt: dayjs(3000) });
    const after = doc({ removedAt: dayjs(3000), status: "open" });
    expect(hub.route("task", after, before)).toEqual([]);
  });

  test("rooms of another model are untouched", () => {
    const hub = hubWith([{ roomId: "inOrg-o1", query: { org: "o1" } }]);
    expect(hub.route("story", doc())).toEqual([]);
  });

  test("an operator query routes without an index", () => {
    const hub = hubWith([{ roomId: "hot", query: { tags: q.has("hot") } }]);
    expect(hub.route("task", doc({ tags: ["hot"] }))).toEqual([
      { roomId: "hot", op: "enter", invalidate: false, payload: "light" },
    ]);
    expect(hub.route("task", doc({ tags: ["cold"] }))).toEqual([]);
    expect(hub.route("task", doc({ tags: ["cold"] }), doc({ tags: ["hot"] }))).toEqual([
      { roomId: "hot", op: "leave", invalidate: false, payload: "light" },
    ]);
  });
});

describe("LiveSyncHub fallback rooms", () => {
  test("an invalidation room takes every change to its model, unevaluated", () => {
    const hub = hubWith([{ roomId: "bySearch-x", query: q.search("x"), fallback: "invalidate" }]);
    expect(hub.route("task", doc())).toEqual([
      { roomId: "bySearch-x", op: "update", invalidate: true, payload: "light" },
    ]);
  });

  test("an unroutable query without a declared fallback is refused at subscribe", () => {
    const hub = new LiveSyncHub();
    expect(() => hub.join({ refName: "task", roomId: "bySearch-x", query: q.search("x"), fallback: null })).toThrow(
      /fallback: "invalidate"/,
    );
    expect(() => hub.join({ refName: "task", roomId: "raw", query: q.raw("1 = 1"), fallback: null })).toThrow(
      /cannot be routed in memory/,
    );
    expect(() => hub.join({ refName: "task", roomId: "ex", query: q.exists("note"), fallback: null })).toThrow(
      /q.empty\(\)/,
    );
    expect(hub.roomCount).toBe(0);
  });
});

describe("LiveSyncHub membership", () => {
  test("a room is shared by its subscribers and released only by the last one", () => {
    const hub = new LiveSyncHub();
    const registration = { refName: "task", roomId: "inOrg-o1", query: { org: "o1" }, fallback: null };
    hub.join(registration);
    hub.join(registration);
    expect(hub.roomCount).toBe(1);
    hub.leave("inOrg-o1");
    expect(hub.roomCountOf("task")).toBe(1);
    hub.leave("inOrg-o1");
    expect(hub.roomCount).toBe(0);
    expect(hub.roomCountOf("task")).toBe(0);
    hub.leave("inOrg-o1");
    expect(hub.roomCount).toBe(0);
  });

  test("a base column or an array field is never taken into the index", () => {
    const byId = hubWith([{ roomId: "byId", query: { id: "a".repeat(24) } }]);
    expect(byId.route("task", doc())).toEqual([{ roomId: "byId", op: "enter", invalidate: false, payload: "light" }]);
    const byCreatedAt = hubWith([{ roomId: "byCreatedAt", query: { createdAt: dayjs(1000) } }]);
    expect(byCreatedAt.route("task", doc())).toEqual([
      { roomId: "byCreatedAt", op: "enter", invalidate: false, payload: "light" },
    ]);
    // A bare value on an array field means membership, so the stored `["hot"]` is not the operand `"hot"`.
    const byTag = hubWith([{ roomId: "byTag", query: { tags: "hot" } }]);
    expect(byTag.route("task", doc({ tags: ["hot"] }))).toEqual([
      { roomId: "byTag", op: "enter", invalidate: false, payload: "light" },
    ]);
  });

  test("the equality index skips rooms without changing any answer", () => {
    const indexed = hubWith([{ roomId: "inOrg-o1", query: { org: "o1", status: "draft" } }]);
    expect(indexed.route("task", doc())).toEqual([
      { roomId: "inOrg-o1", op: "enter", invalidate: false, payload: "light" },
    ]);
    expect(indexed.route("task", doc({ org: "o2" }))).toEqual([]);
    // A leave still has to be found through the previous version, which the index is consulted for as well.
    expect(indexed.route("task", doc({ status: "open" }), doc())).toEqual([
      { roomId: "inOrg-o1", op: "leave", invalidate: false, payload: "light" },
    ]);
  });
});
