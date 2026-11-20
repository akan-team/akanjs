import { describe, expect, test } from "bun:test";
import { immerable as immerOwn, produce } from "immer";
import { immerable } from "./immerable";

describe("immerable", () => {
  test("is the symbol immer itself reads", () => {
    expect(immerable as symbol).toBe(immerOwn);
  });

  test("lets immer draft a class instance marked with it", () => {
    class Marked {
      [immerable] = true;
      count = 1;
    }
    const before = new Marked();
    const after = produce(before, (draft) => {
      draft.count = 2;
    });
    expect([before.count, after.count, after instanceof Marked]).toEqual([1, 2, true]);
  });
});
