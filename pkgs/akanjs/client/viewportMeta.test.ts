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
      createElement("meta", { key, name: "theme-color", content, media, "data-akan-viewport": "" });
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

describe("a theme-color a page's head writes", () => {
  const reset = () => {
    document.head.innerHTML = "";
    document.documentElement.removeAttribute("style");
  };
  const page = (content: string, media?: string) => {
    const meta = document.createElement("meta");
    meta.name = "theme-color";
    meta.content = content;
    if (media) meta.setAttribute("media", media);
    document.head.appendChild(meta);
    return meta;
  };

  test("is the one in effect over the root's viewport, and the viewport's returns once the page's is gone", () => {
    reset();
    const viewport = { themeColor: { light: "#fff", dark: "#000" } };
    const own = page("#123456");

    expect(ViewportMeta.applyThemeColor(viewport, "dark")).toBe("#123456");
    expect(themeColorTags()).toEqual([["#123456", null]]);

    own.remove();
    expect(ViewportMeta.applyThemeColor(viewport, "dark")).toBe("#000");
    expect(themeColorTags()).toEqual([["#000", null]]);

    page("#654321");
    expect(ViewportMeta.applyThemeColor(viewport, "dark")).toBe("#654321");
    expect(themeColorTags()).toEqual([["#654321", null]]);
  });

  test("outranks the viewport's tags the server rendered, which are left for React to remove", () => {
    reset();
    for (const [content, media] of [
      ["#fff", "(prefers-color-scheme: light)"],
      ["#000", "(prefers-color-scheme: dark)"],
    ] as const) {
      const meta = page(content, media);
      meta.setAttribute("data-akan-viewport", "");
    }
    page("#123456");

    expect(ViewportMeta.applyThemeColor({ themeColor: { light: "#fff", dark: "#000" } }, "system")).toBe("#123456");
    expect(themeColorTags().filter(([, media]) => media !== "not all")).toEqual([["#123456", null]]);
  });

  test("settles after one apply beside the viewport's tags, so the head's own watcher is not woken again", async () => {
    reset();
    page("#000", "(prefers-color-scheme: dark)").setAttribute("data-akan-viewport", "");
    page("#123456");
    let applied = 0;
    const stop = ViewportMeta.watchThemeColor(() => {
      applied++;
      ViewportMeta.applyThemeColor({ themeColor: { dark: "#000" } }, "system");
    });
    page("#654321").remove();
    for (let frame = 0; frame < 4; frame++) await nextFrame();
    stop();
    expect(applied).toBe(2);
  });

  test("steps aside for --akan-theme-color, and is back in effect when the variable goes", () => {
    reset();
    const own = page("#123456", "(prefers-color-scheme: light)");
    document.documentElement.style.setProperty("--akan-theme-color", "#336699");

    expect(ViewportMeta.applyThemeColor(undefined)).toBe("#336699");
    expect(own.getAttribute("media")).toBe("not all");
    expect(themeColorTags().filter(([, media]) => media !== "not all")).toEqual([["#336699", null]]);

    document.documentElement.style.removeProperty("--akan-theme-color");
    ViewportMeta.applyThemeColor(undefined);
    expect(own.getAttribute("media")).toBe("(prefers-color-scheme: light)");
    expect(themeColorTags()).toEqual([["#123456", "(prefers-color-scheme: light)"]]);
  });

  test("is applied again when the head's tags change, so a navigation settles on the page's color", async () => {
    reset();
    let applied = 0;
    const stop = ViewportMeta.watchThemeColor(() => applied++);
    const own = page("#123456");
    await nextFrame();
    expect(applied).toBe(1);

    own.setAttribute("content", "#654321");
    await nextFrame();
    expect(applied).toBe(2);
    stop();
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

  test("names no color when no tag's media matches, since the browser then applies none", () => {
    reset();
    const unmatched = window.matchMedia("(prefers-color-scheme: dark)").matches ? "light" : "dark";
    expect(ViewportMeta.applyThemeColor({ themeColor: { [unmatched]: "#000000" } }, "system")).toBeNull();
    expect(themeColorTags()).toEqual([["#000000", `(prefers-color-scheme: ${unmatched})`]]);
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
