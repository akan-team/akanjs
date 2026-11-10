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

  test("writes new tags when the colors change, one per scheme or one for the named theme, and keeps them otherwise", () => {
    document.head.innerHTML = '<meta name="viewport" content="width=device-width, initial-scale=1">';
    const viewport = { fitCover: true, themeColor: { light: "#fff", dark: "#000" } };

    ViewportMeta.applyContent(viewport);
    ViewportMeta.applyThemeColor(viewport);
    expect(document.head.querySelectorAll('meta[name="viewport"]')).toHaveLength(1);
    expect(document.head.querySelector<HTMLMetaElement>('meta[name="viewport"]')?.content).toContain(
      "viewport-fit=cover",
    );
    expect(themeColorTags()).toEqual([
      ["#fff", "(prefers-color-scheme: light)"],
      ["#000", "(prefers-color-scheme: dark)"],
    ]);

    ViewportMeta.applyThemeColor(viewport, "dark");
    const dark = document.head.querySelector('meta[name="theme-color"]');
    expect(themeColorTags()).toEqual([["#000", null]]);

    ViewportMeta.applyThemeColor(viewport, "dark");
    expect(document.head.querySelector('meta[name="theme-color"]')).toBe(dark);

    ViewportMeta.applyThemeColor(viewport, "system");
    expect(themeColorTags()).toEqual([
      ["#fff", "(prefers-color-scheme: light)"],
      ["#000", "(prefers-color-scheme: dark)"],
    ]);
    expect([...document.head.querySelectorAll('meta[name="theme-color"]')]).not.toContain(dark);
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
      ["#fff", "not all"],
      ["#000", "not all"],
      ["#000", null],
    ]);

    await act(async () => {
      root.render([meta("named", "#123")]);
    });
    ViewportMeta.applyThemeColor({ themeColor: "#123" });
    expect(themeColorTags().filter(([, media]) => media !== "not all")).toEqual([["#123", null]]);

    await act(async () => {
      root.unmount();
    });
    container.remove();
    expect(themeColorTags()).toEqual([["#123", null]]);
  });
});

describe("--akan-theme-color", () => {
  const root = document.documentElement;
  const reset = () => {
    document.head.innerHTML = "";
    root.removeAttribute("style");
    root.removeAttribute("data-theme");
  };

  test("outranks the layout's themeColor for the theme data-theme names, and hands back to it when unset", () => {
    reset();
    const style = document.createElement("style");
    style.textContent = '[data-theme="dark"] { --akan-theme-color: #0c1e3e; }';
    document.head.appendChild(style);
    const viewport = { themeColor: { light: "#fff", dark: "#000" } };

    root.setAttribute("data-theme", "dark");
    expect(ViewportMeta.applyThemeColor(viewport, "dark")).toBe("#0c1e3e");
    expect(themeColorTags()).toEqual([["#0c1e3e", null]]);

    root.style.setProperty("--akan-theme-color", "#336699");
    expect(ViewportMeta.applyThemeColor(viewport, "dark")).toBe("#336699");
    expect(themeColorTags()).toEqual([["#336699", null]]);

    root.style.removeProperty("--akan-theme-color");
    root.setAttribute("data-theme", "light");
    expect(ViewportMeta.applyThemeColor(viewport, "light")).toBe("#fff");
    expect(themeColorTags()).toEqual([["#fff", null]]);
  });

  test("leaves no tag of its own behind once the variable goes and the layout names no color", () => {
    reset();
    root.style.setProperty("--akan-theme-color", "#336699");
    expect(ViewportMeta.applyThemeColor(undefined)).toBe("#336699");
    root.style.removeProperty("--akan-theme-color");
    expect(ViewportMeta.applyThemeColor(undefined)).toBeNull();
    expect(themeColorTags()).toEqual([]);
  });

  test("names the color the OS scheme picks when only the scheme decides", () => {
    reset();
    const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    expect(ViewportMeta.applyThemeColor({ themeColor: { light: "#fff", dark: "#000" } }, "system")).toBe(
      dark ? "#000" : "#fff",
    );
  });

  test("applies again once a frame after the root's style or data-theme changes, until stopped", async () => {
    reset();
    let applied = 0;
    const stop = ViewportMeta.watchThemeColor(() => applied++);
    root.style.setProperty("--akan-theme-color", "#336699");
    root.setAttribute("data-theme", "dark");
    await nextFrame();
    expect(applied).toBe(1);

    root.setAttribute("data-other", "x");
    await nextFrame();
    expect(applied).toBe(1);

    stop();
    root.style.setProperty("--akan-theme-color", "#000000");
    await nextFrame();
    expect(applied).toBe(1);
  });
});

const nextFrame = () => new Promise((resolve) => setTimeout(resolve, 50));

const themeColorTags = () =>
  [...document.head.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')].map((meta) => [
    meta.content,
    meta.getAttribute("media"),
  ]);
