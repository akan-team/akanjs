import { describe, expect, test } from "bun:test";
import { type Dayjs, dayjs, Int } from "akanjs/base";
import { ConstantRegistry, via } from "akanjs/constant";
import { TaggedJson } from "./TaggedJson";

const TaggedJsonTestItem = via((f) => ({
  title: f(String),
  counts: f(Map, { of: Int }),
  openedAt: f(Date),
}));
ConstantRegistry.buildScalar("taggedJsonTestItem", TaggedJsonTestItem, { TaggedJsonTestItem });
const TaggedJsonTestHolder = via((f) => ({
  label: f(String),
  item: f(TaggedJsonTestItem),
  items: f([TaggedJsonTestItem]),
}));
ConstantRegistry.buildScalar("taggedJsonTestHolder", TaggedJsonTestHolder, { TaggedJsonTestHolder });

const roundTrip = (value: unknown, ref: unknown = Object, arrDepth = 0) =>
  TaggedJson.parse(TaggedJson.stringify(value), { ref, arrDepth });

describe("TaggedJson", () => {
  test("reads back Maps, bytes, dates and dayjs values wherever they sit", () => {
    const openedAt = dayjs("2026-10-14T00:00:00.000Z");
    const read = roundTrip({
      map: new Map([["a", [new Uint8Array([1, 2])]]]),
      bytes: Buffer.from([0, 255]),
      date: new Date("2026-10-14T00:00:00.000Z"),
      list: [openedAt, dayjs("not a date")],
    }) as Record<string, unknown>;

    expect(read.map).toEqual(new Map([["a", [new Uint8Array([1, 2])]]]));
    expect(read.bytes).toEqual(new Uint8Array([0, 255]));
    expect(read.date).toEqual(new Date("2026-10-14T00:00:00.000Z"));
    const [revived, invalid] = read.list as Dayjs[];
    expect(dayjs.isDayjs(revived) && revived.isSame(openedAt)).toBe(true);
    expect(dayjs.isDayjs(invalid) && !invalid.isValid()).toBe(true);
  });

  test("rebuilds a model instance as the declared model and leaves a plain value plain", () => {
    const item = new TaggedJsonTestItem().set({
      title: "item",
      counts: new Map([["views", 2]]),
      openedAt: dayjs("2026-10-14T00:00:00.000Z"),
    });
    const read = roundTrip({ label: "plain", item, items: [item, { title: "raw" }] }, TaggedJsonTestHolder) as {
      item: InstanceType<typeof TaggedJsonTestItem>;
      items: unknown[];
    };

    expect(Object.getPrototypeOf(read)).toBe(Object.prototype);
    expect(read.item).toBeInstanceOf(TaggedJsonTestItem);
    expect(read.item.counts.get("views")).toBe(2);
    expect(read.item.openedAt.isSame(dayjs("2026-10-14T00:00:00.000Z"))).toBe(true);
    expect(read.items[0]).toBeInstanceOf(TaggedJsonTestItem);
    expect(read.items[1]).toEqual({ title: "raw" });
    expect(roundTrip([[item]], TaggedJsonTestItem, 2)).toEqual([[item]]);
  });
});
