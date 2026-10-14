import { afterEach, describe, expect, test } from "bun:test";
import { isSheetNow, modalSurfaceOf } from "./modalSurface";

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

describe("modalSurfaceOf", () => {
  test("a side sheet draws its drag handle only below md, where a drag dismisses it", () => {
    expect(modalSurfaceOf("sheet", "right").handle.join(" ")).toContain("md:hidden");
    expect(modalSurfaceOf("sheet", "center").handle.join(" ")).not.toContain("md:hidden");
  });

  test("a full-screen sheet clears the frame's safe area too, which an old Android WebView leaves out of env()", () => {
    const { panel, close } = modalSurfaceOf("sheet", "center");
    expect(panel.join(" ")).toContain("pt-[max(var(--akan-top-safe-area,0px),env(safe-area-inset-top,0px))]");
    expect(panel.join(" ")).toContain("pb-[max(var(--akan-bottom-safe-area,0px),env(safe-area-inset-bottom,0px))]");
    expect(close).toContain("var(--akan-top-safe-area,0px)");
  });
});
