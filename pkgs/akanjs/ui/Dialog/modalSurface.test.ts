import { afterEach, describe, expect, test } from "bun:test";
import { isSheetNow } from "./modalSurface";

const original = globalThis.window;
const atWidth = (wide: boolean) => {
  globalThis.window = { matchMedia: () => ({ matches: wide }) } as unknown as Window & typeof globalThis;
};

afterEach(() => {
  globalThis.window = original;
});

describe("isSheetNow", () => {
  test("a drag dismisses only what is drawn as a sheet at this width", () => {
    atWidth(false);
    expect(isSheetNow("dialog", "center")).toBe(false);
    expect(isSheetNow("auto", "center")).toBe(true);
    expect(isSheetNow("auto", "right")).toBe(true);
    atWidth(true);
    expect(isSheetNow("auto", "center")).toBe(false);
    expect(isSheetNow("sheet", "right")).toBe(false);
    expect(isSheetNow("sheet", "center")).toBe(true);
  });
});
