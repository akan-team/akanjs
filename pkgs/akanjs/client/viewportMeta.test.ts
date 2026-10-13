import "../test/registerDom";
import { describe, expect, test } from "bun:test";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
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

  test("reads a theme the visitor names only off the map's own keys", () => {
    const viewport = { themeColor: { light: "#fff", dark: "#000" } };
    const schemes = ViewportMeta.themeColors(viewport, "system");

    expect(ViewportMeta.themeColors(viewport, "__proto__")).toEqual(schemes);
    expect(ViewportMeta.themeColors(viewport, "constructor")).toEqual(schemes);
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
    expect(themeColorTags()).toEqual([
      ["#000", null],
      ["#000", "not all"],
    ]);

    ViewportMeta.applyThemeColor(viewport, "system");
    expect(themeColorTags()).toEqual([
      ["#fff", "(prefers-color-scheme: light)"],
      ["#000", "(prefers-color-scheme: dark)"],
    ]);
  });

  test("never detaches a theme-color React rendered, so React can still remove it on the next page", async () => {
    document.head.innerHTML = "";
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const meta = (key: string, content: string, media?: string) =>
      createElement("meta", { key, name: "theme-color", content, media });
    await act(async () => {
      root.render([
        meta("light", "#fff", "(prefers-color-scheme: light)"),
        meta("dark", "#000", "(prefers-color-scheme: dark)"),
      ]);
    });

    ViewportMeta.applyThemeColor({ themeColor: { light: "#fff", dark: "#000" } }, "dark");
    expect(themeColorTags()).toEqual([
      ["#000", null],
      ["#000", "not all"],
    ]);

    await act(async () => {
      root.render([meta("named", "#123")]);
    });
    expect(themeColorTags()).toEqual([["#123", null]]);

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});

const themeColorTags = () =>
  [...document.head.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')].map((meta) => [
    meta.content,
    meta.getAttribute("media"),
  ]);
