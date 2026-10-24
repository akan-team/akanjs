import { describe, expect, test } from "bun:test";
import { dayjs } from "akanjs/base";

import { EditSeed } from "./editSeed";

const keyOf = (edit: Record<string, unknown>) => EditSeed.keyOf(edit, "itemObj", "itemViewAt");
const editOf = (updatedAt: unknown, viewAt = new Date()) => ({
  refName: "item",
  itemObj: { id: "a", title: "saved", updatedAt },
  itemViewAt: viewAt,
});

describe("EditSeed", () => {
  test("gives a new seed one key whatever its key order, and a new key when a value moves", () => {
    expect(keyOf({ title: "saved", count: 1 })).toBe(keyOf({ count: 1, title: "saved" }));
    expect(keyOf({ title: "saved" })).not.toBe(keyOf({ title: "moved" }));
    expect(keyOf({ title: "saved", note: undefined })).toBe(keyOf({ title: "saved" }));
  });

  test("tells two new seeds apart by a date alone", () => {
    expect(keyOf({ at: new Date("2026-10-24T00:00:00.000Z") })).toBe(keyOf({ at: dayjs("2026-10-24T00:00:00.000Z") }));
    expect(keyOf({ at: new Date("2026-10-24T00:00:00.000Z") })).not.toBe(
      keyOf({ at: new Date("2026-10-25T00:00:00.000Z") }),
    );
  });

  test("keys an edit payload on the record's version, not on when it was fetched", () => {
    const iso = "2026-10-24T00:00:00.000Z";
    const key = keyOf(editOf(new Date(iso), new Date("2026-10-24T01:00:00.000Z")));
    expect(keyOf(editOf(new Date(iso), new Date("2026-10-24T02:00:00.000Z")))).toBe(key);
    expect(keyOf(editOf(iso))).toBe(key);
    expect(keyOf(editOf(dayjs(iso)))).toBe(key);
    expect(keyOf(editOf(new Date("2026-10-24T00:00:01.000Z")))).not.toBe(key);
  });

  test("falls back to the fetch time for a record that carries no version", () => {
    const viewAt = new Date("2026-10-24T01:00:00.000Z");
    expect(keyOf(editOf(undefined, viewAt))).toBe(keyOf(editOf(null, new Date(viewAt))));
    expect(keyOf(editOf(undefined, viewAt))).not.toBe(keyOf(editOf(undefined, new Date("2026-10-24T02:00:00.000Z"))));
  });
});
