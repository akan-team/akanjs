import { describe, expect, test } from "bun:test";
import { RecencyList } from "./recencyList";

const keysOf = (list: RecencyList<number>) => {
  const keys: string[] = [];
  const copy = new RecencyList<number>();
  for (let front = list.oldest(); front; front = list.oldest()) {
    keys.push(front.key);
    copy.touch(front.key, front.value);
    list.delete(front.key);
  }
  for (let front = copy.oldest(); front; front = copy.oldest()) {
    list.touch(front.key, front.value);
    copy.delete(front.key);
  }
  return keys;
};

describe("RecencyList", () => {
  test("keeps entries oldest first, a touch moving one to the newest end with its new value", () => {
    const list = new RecencyList<number>();
    for (const [idx, key] of ["a", "b", "c"].entries()) list.touch(key, idx);
    list.touch("a", 9);
    expect(keysOf(list)).toEqual(["b", "c", "a"]);
    list.touch("a", 10);
    expect(keysOf(list)).toEqual(["b", "c", "a"]);
    expect(list.oldest()).toMatchObject({ key: "b", value: 1 });
    expect(list.size).toBe(3);
  });

  test("unlinks a deleted entry from either end or the middle", () => {
    const list = new RecencyList<number>();
    for (const [idx, key] of ["a", "b", "c", "d"].entries()) list.touch(key, idx);
    list.delete("b");
    list.delete("a");
    list.delete("d");
    list.delete("missing");
    expect(keysOf(list)).toEqual(["c"]);
    list.delete("c");
    expect(list.oldest()).toBeNull();
    expect(list.has("c")).toBe(false);
    list.touch("e", 5);
    expect(keysOf(list)).toEqual(["e"]);
  });
});
