import { describe, expect, setSystemTime, spyOn, test } from "bun:test";
import { dayjs } from "akanjs/base";
import { Logger } from "akanjs/common";
import { createDocumentQueryHelper, type DocumentQuery, DocumentQueryEvaluator } from "akanjs/document";
import { LiveRoomLimit } from "./liveRoomLimit";
import { LiveRoomLimitError } from "./liveRoomLimitError";
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

describe("LiveSyncHub room ceiling", () => {
  test("defaults to 50,000 rooms per model on a server", () => {
    expect(LiveRoomLimit.roomsPerModel).toBe(50_000);
  });

  test("refuses a new room past a model's ceiling with 429 liveRoomLimit, warning once a minute", () => {
    LiveRoomLimit.configure({ roomsPerModel: 2 });
    const warn = spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    try {
      setSystemTime(new Date(1_000_000));
      const hub = hubWith([
        { roomId: "inOrg-o1", query: { org: "o1" } },
        { roomId: "inOrg-o2", query: { org: "o2" } },
      ]);
      const join = (roomId: string, refName = "task") =>
        hub.join({ refName, roomId, query: { org: roomId }, fallback: null, fields });

      expect(() => join("inOrg-o3")).toThrow(LiveRoomLimitError);
      let refused: unknown;
      try {
        join("inOrg-o4");
      } catch (error) {
        refused = error;
      }
      expect((refused as LiveRoomLimitError).toJSON()).toMatchObject({
        error: "base.error.liveRoomLimit",
        code: "liveRoomLimit",
        statusCode: 429,
        data: { limit: 2, per: "model" },
      });
      expect(warn).toHaveBeenCalledTimes(1);
      setSystemTime(new Date(1_060_000));
      expect(() => join("inOrg-o5")).toThrow(LiveRoomLimitError);
      expect(warn).toHaveBeenCalledTimes(2);

      hub.join({ refName: "task", roomId: "inOrg-o1", query: { org: "o1" }, fallback: null, fields });
      join("note-o1", "note");
      expect(hub.route("task", doc({ org: "o2" }))).toEqual([
        { roomId: "inOrg-o2", op: "enter", invalidate: false, payload: "light" },
      ]);
      hub.leave("inOrg-o2");
      join("inOrg-o6");
      expect(hub.roomCountOf("task")).toBe(2);
    } finally {
      setSystemTime();
      warn.mockRestore();
      LiveRoomLimit.reset();
    }
  });
});

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

  test("a save that changed nothing, updatedAt included, still reaches its rooms as an update", () => {
    const hub = hubWith([{ roomId: "inOrg-o1", query: { org: "o1" } }]);
    expect(hub.route("task", doc(), doc())).toEqual([
      { roomId: "inOrg-o1", op: "update", invalidate: false, payload: "light" },
    ]);
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

  test("announces the models it holds rooms for when one gains its first room or loses its last", () => {
    const hub = new LiveSyncHub();
    const announced: string[][] = [];
    hub.onModelsChange((models) => announced.push(models));
    hub.join({ refName: "task", roomId: "a", query: { org: "o1" }, fallback: null });
    hub.join({ refName: "task", roomId: "b", query: { org: "o2" }, fallback: null });
    hub.join({ refName: "story", roomId: "c", query: {}, fallback: null });
    hub.leave("a");
    hub.leave("b");
    hub.leave("c");
    expect(announced).toEqual([["task"], ["task", "story"], ["story"], []]);
  });

  test("a room is shared only with a subscriber of the same query, whatever its key order", () => {
    const hub = new LiveSyncHub();
    hub.join({ refName: "task", roomId: "inOrg", query: { org: "o1", status: "draft" }, fallback: null });
    hub.join({ refName: "task", roomId: "inOrg", query: { status: "draft", org: "o1" }, fallback: null });
    expect(() => hub.join({ refName: "task", roomId: "inOrg", query: { org: "o2" }, fallback: null })).toThrow(
      'Live room "inOrg" is already held for another query',
    );
    expect(hub.route("task", doc({ org: "o2" }))).toEqual([]);
  });

  test("a base column routes by its stored encoding, and an array field's bare value by membership", () => {
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

const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let mixed = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
  return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
};

describe("LiveSyncHub index", () => {
  const roomsOf = (count: number) =>
    Array.from({ length: count }, (_, idx) => ({
      roomId: `r${idx}`,
      query: { org: `o${idx % 100}`, status: q.oneOf(["draft", "open"]) },
    }));

  test("a write evaluates the rooms its values are filed under, not every room of the model", () => {
    const hub = hubWith(roomsOf(1_000));
    const evaluate = spyOn(DocumentQueryEvaluator.prototype, "evaluate");
    try {
      expect(hub.route("task", doc({ org: "o7", status: "open" }), doc({ org: "o7" }))).toHaveLength(10);
      expect(evaluate.mock.calls.length).toBeLessThan(100);
    } finally {
      evaluate.mockRestore();
    }
  });

  test("a value matches across the stored encoding: a date, a boolean, a nested path", () => {
    const hub = hubWith([
      { roomId: "since", query: { createdAt: dayjs(1000) } },
      { roomId: "flagged", query: q.all({ flagged: true }, { org: "o1" }) },
      { roomId: "kind", query: { "meta.kind": q.eq("a") } },
      { roomId: "numeric", query: { priority: 2 } },
    ]);
    const routed = hub.route("task", doc({ flagged: true, meta: { kind: "a" }, priority: "2" }));
    expect(routed.map(({ roomId }) => roomId)).toEqual(["since", "flagged", "kind"]);
  });

  test("a room is found again through the bucket it was filed under after others leave", () => {
    const hub = hubWith(roomsOf(300));
    for (let idx = 0; idx < 300; idx += 1) if (idx % 3) hub.leave(`r${idx}`);
    expect(hub.roomCountOf("task")).toBe(100);
    expect(hub.route("task", doc({ org: "o3" })).map(({ roomId }) => roomId)).toEqual(["r3"]);
    hub.join({ refName: "task", roomId: "late", query: { org: "o3" }, fallback: null, fields });
    expect(hub.route("task", doc({ org: "o3" })).map(({ roomId }) => roomId)).toEqual(["r3", "late"]);
  });

  test("routes exactly as evaluating every room would, over random rooms and writes", () => {
    const random = seeded(348);
    const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)];
    const values: Record<string, readonly unknown[]> = {
      org: ["o1", "o2", "o3"],
      status: ["draft", "open", "closed", null],
      priority: [1, 2, "2", 3, 0],
      flagged: [true, false, 1, 0],
      "meta.kind": ["a", "b", 1],
    };
    const leaf = (): DocumentQuery => {
      const path = pick(Object.keys(values));
      const value = pick(values[path]);
      return pick<() => DocumentQuery>([
        () => ({ [path]: value }),
        () => ({ [path]: q.eq(value) }),
        () => ({ [path]: { eq: value, ne: pick(values[path]) } }),
        () => ({ [path]: q.oneOf(values[path].filter(() => random() < 0.5)) }),
        () => ({ [path]: { oneOf: [value, pick(values[path])] } }),
        () => ({ [path]: q.gte(value) }),
        () => ({ [path]: q.ne(value) }),
        () => ({ tags: pick([q.has("t1"), "t2", q.oneOf(["t1", "t3"])]) }),
        () => ({ id: pick(["a".repeat(24), "b".repeat(24)]) }),
        () => ({ createdAt: dayjs(pick([1000, 1500])) }),
        () => ({}),
      ])();
    };
    const queryOf = (depth: number): DocumentQuery => {
      if (depth === 0 || random() < 0.4) return leaf();
      return pick<() => DocumentQuery>([
        () => q.all(queryOf(depth - 1), queryOf(depth - 1)),
        () => q.any(queryOf(depth - 1), queryOf(depth - 1)),
        () => q.not(queryOf(depth - 1)),
        () => ({ ...leaf(), ...leaf() }),
      ])();
    };
    const randomDoc = () => {
      const patch: Record<string, unknown> = {
        id: pick(["a".repeat(24), "b".repeat(24)]),
        createdAt: dayjs(pick([1000, 1500])),
        tags: ["t1", "t2", "t3"].filter(() => random() < 0.5),
        meta: random() < 0.8 ? { kind: pick(values["meta.kind"]) } : undefined,
        removedAt: random() < 0.15 ? dayjs(3000) : undefined,
      };
      for (const path of ["org", "status", "priority", "flagged"]) if (random() < 0.9) patch[path] = pick(values[path]);
      return doc(patch);
    };

    const rooms = Array.from({ length: 80 }, (_, idx) => ({ roomId: `r${idx}`, query: queryOf(3) }));
    const hub = hubWith(rooms);
    for (const { roomId } of rooms.filter(() => random() < 0.25)) hub.leave(roomId);
    const held = rooms.filter(({ roomId }) => hub.roomIds().includes(roomId));
    const evaluator = new DocumentQueryEvaluator(fields);
    const expected = (next: Record<string, unknown>, previous?: Record<string, unknown>) =>
      held.flatMap(({ roomId, query }) => {
        const routed = q.all(q.empty("removedAt"), query);
        const inNext = evaluator.evaluate(routed, DocumentQueryEvaluator.rowViewOf(next));
        const inPrevious = previous ? evaluator.evaluate(routed, DocumentQueryEvaluator.rowViewOf(previous)) : false;
        if (!inNext && !inPrevious) return [];
        const op = inNext ? (inPrevious ? "update" : "enter") : "leave";
        return [{ roomId, op, invalidate: false, payload: "light" }];
      });
    let reached = 0;
    for (let write = 0; write < 1_500; write += 1) {
      const next = randomDoc();
      const previous = random() < 0.3 ? undefined : randomDoc();
      const routed = hub.route("task", next, previous);
      expect(routed).toEqual(expected(next, previous) as never);
      reached += routed.length;
    }
    expect(reached).toBeGreaterThan(1_000);
  });
});
