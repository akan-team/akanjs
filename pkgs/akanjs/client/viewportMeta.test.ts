import "../test/registerDom";
import { describe, expect, test } from "bun:test";
import { ViewportMeta } from "./viewportMeta";

describe("ViewportMeta", () => {
  test("adds cover and the keyboard mode only when asked, and covers a native shell by default", () => {
    expect(ViewportMeta.content(undefined)).toBe("width=device-width, initial-scale=1");
    expect(ViewportMeta.content({ fitCover: true, interactiveWidget: "resizes-content" })).toBe(
      "width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content",
    );
    expect(ViewportMeta.content(undefined, { native: true })).toContain("viewport-fit=cover");
    expect(ViewportMeta.content({ fitCover: false }, { native: true })).not.toContain("viewport-fit");
  });

  test("names the theme's color when the theme is known, else lets the OS scheme pick", () => {
    const viewport = { themeColor: { light: "#fff", dark: "#000", sepia: "#f4ecd8" } };

    expect(ViewportMeta.themeColors({ themeColor: "#123" })).toEqual([{ content: "#123" }]);
    expect(ViewportMeta.themeColors(viewport, "sepia")).toEqual([{ content: "#f4ecd8" }]);
    expect(ViewportMeta.themeColors(viewport, "system")).toEqual([
      { content: "#fff", media: "(prefers-color-scheme: light)" },
      { content: "#000", media: "(prefers-color-scheme: dark)" },
    ]);
    expect(ViewportMeta.themeColors({ themeColor: { brand: "#f00" } })).toEqual([{ content: "#f00" }]);
    expect(ViewportMeta.themeColors(undefined)).toEqual([]);
  });

  test("rewrites the document's tags in place, one theme-color per scheme or one for the named theme", () => {
    document.head.innerHTML = '<meta name="viewport" content="width=device-width, initial-scale=1">';
    const viewport = { fitCover: true, themeColor: { light: "#fff", dark: "#000" } };

    ViewportMeta.applyContent(viewport);
    ViewportMeta.applyThemeColor(viewport);
    expect(document.head.querySelectorAll('meta[name="viewport"]')).toHaveLength(1);
    expect(document.head.querySelector<HTMLMetaElement>('meta[name="viewport"]')?.content).toContain(
      "viewport-fit=cover",
    );
    expect(document.head.querySelectorAll('meta[name="theme-color"]')).toHaveLength(2);

    ViewportMeta.applyThemeColor(viewport, "dark");
    const colors = [...document.head.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')];
    expect(colors.map((meta) => [meta.content, meta.getAttribute("media")])).toEqual([["#000", null]]);
  });
});
