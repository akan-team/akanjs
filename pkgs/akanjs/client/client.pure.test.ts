import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";
import { createFont, Inter, Nanum_Gothic_Coding, Noto_Sans_KR, Roboto } from "./createFont";
import { clearRscNavigationCache, isRscNavigationFromCache, navigateRsc } from "./rscNavigation";
import { Translator } from "./translator";
import {
  clsx,
  getFontFaces,
  getFontFallbackName,
  getFontStyles,
  getFontVariableName,
  getOptimizedFontSrc,
  isFontOptimizationEnabled,
  isFontPreloadEnabled,
  loadFonts,
  type ReactFont,
} from "./types";

beforeAll(() => {
  mock.module("akanjs/common", () => ({
    pathGet: (path: string, obj: Record<string, unknown>, separator = ".", fallback?: unknown) =>
      path.split(separator).reduce<unknown>((acc, key) => {
        if (!acc || typeof acc !== "object") return fallback;
        return (acc as Record<string, unknown>)[key] ?? fallback;
      }, obj),
    Logger: { log: () => undefined, verbose: () => undefined, error: () => undefined },
    parseAkanI18nEnv: () => ({ locales: ["en", "ko"], defaultLocale: "en" }),
    parseBasePaths: (value?: string) => (value ? value.split(",").filter(Boolean) : []),
    getBasePathFromPathname: () => null,
  }));
});

afterEach(() => {
  globalThis.__AKAN_RSC_CLEAR_CACHE__ = undefined;
  globalThis.__AKAN_RSC_IS_FROM_CACHE__ = undefined;
  globalThis.__AKAN_RSC_NAVIGATE__ = undefined;
});

describe("client pure exports and utilities", () => {
  test("exports class composition and font helpers through the package surface", () => {
    expect(clsx("base", null, ["nested"], { active: true })).toBe("base nested active");
    expect(typeof loadFonts).toBe("function");
    expect(typeof getFontFaces).toBe("function");
    expect(typeof Translator).toBe("function");
  });

  test("loads fonts with defaults and computes deterministic font metadata", () => {
    const font: ReactFont = {
      name: "Test Font",
      paths: [
        { src: "/fonts/test-400.woff2", weight: 400 },
        {
          src: "/fonts/test-700-italic.woff2",
          weight: 700,
          style: "italic",
          declarations: [{ prop: "x", value: "y" }],
        },
      ],
      styles: ["normal"],
      display: "swap",
    };
    const [loaded] = loadFonts([font]);

    expect(loaded?.subsets).toEqual(["latin"]);
    expect(getFontVariableName(font)).toBe("--font-Test Font");
    expect(getFontFallbackName(font)).toBe("Test Font fallback");
    expect(getFontStyles(font)).toEqual(["normal"]);
    expect(isFontOptimizationEnabled(font)).toBe(true);
    expect(isFontPreloadEnabled(font)).toBe(true);
    expect(isFontOptimizationEnabled({ ...font, optimize: false })).toBe(false);
    expect(isFontPreloadEnabled({ ...font, preload: false })).toBe(false);
    expect(getOptimizedFontSrc(font, font.paths[0])).toMatch(/^\/_akan\/fonts\/test-font-400-normal-[a-z0-9]+\.woff2$/);
    expect(getOptimizedFontSrc(font, font.paths[0])).toBe(getOptimizedFontSrc({ ...font }, { ...font.paths[0] }));
    expect(getFontFaces(font)).toEqual([
      {
        font,
        path: font.paths[0],
        src: "/fonts/test-400.woff2",
        weight: 400,
        style: "normal",
        optimizedSrc: getOptimizedFontSrc(font, font.paths[0]),
      },
    ]);
  });

  test("createFont aliases are CSR-safe null shims", () => {
    expect(createFont({ src: "ignored" })).toBeNull();
    expect(Nanum_Gothic_Coding({})).toBeNull();
    expect(Noto_Sans_KR({})).toBeNull();
    expect(Inter({})).toBeNull();
    expect(Roboto({})).toBeNull();
  });

  test("rsc navigation globals are optional and receive arguments", async () => {
    const calls: unknown[] = [];

    expect(clearRscNavigationCache()).toBeUndefined();
    expect(navigateRsc("/missing")).toBeUndefined();

    globalThis.__AKAN_RSC_CLEAR_CACHE__ = () => calls.push("clear");
    globalThis.__AKAN_RSC_NAVIGATE__ = async (href, options) => {
      calls.push({ href, options });
    };

    clearRscNavigationCache();
    await navigateRsc("/next", { replace: true, scrollToTop: false });

    expect(calls).toEqual(["clear", { href: "/next", options: { replace: true, scrollToTop: false } }]);
  });

  test("reports a replayed page tree only when the rsc client says so", () => {
    expect(isRscNavigationFromCache()).toBe(false);

    globalThis.__AKAN_RSC_IS_FROM_CACHE__ = () => true;
    expect(isRscNavigationFromCache()).toBe(true);

    globalThis.__AKAN_RSC_IS_FROM_CACHE__ = () => false;
    expect(isRscNavigationFromCache()).toBe(false);
  });
});

describe("Translator", () => {
  test("merges dictionaries, translates nested paths, replaces params, and falls back to keys", async () => {
    const translator = new Translator({
      en: {
        user: {
          greeting: { t: "Hello {name}" },
        },
      },
    });
    new Translator({
      en: {
        user: {
          nested: { title: { t: "Nested title" } },
        },
      },
      ko: {
        user: {
          greeting: { t: "안녕 {name}" },
        },
      },
    });

    expect(translator.hasDictionary("en")).toBe(true);
    expect(translator.translate("en", "user.greeting", { name: "Ada" })).toBe("Hello Ada");
    expect(translator.translate("en", "user.nested.title")).toBe("Nested title");
    expect(translator.translate("ko", "user.greeting", { name: "민" })).toBe("안녕 민");
    expect(translator.translate("ja", "user.greeting")).toBe("user.greeting");
    expect(translator.translate("en", "user.missing")).toBe("user.missing");
    expect(await translator.getDictionary("en")).toMatchObject({
      user: {
        greeting: { t: "Hello {name}" },
        nested: { title: { t: "Nested title" } },
      },
    });
    await expect(translator.getDictionary("ja")).rejects.toThrow("Dictionary for language ja not found");
  });

  test("replaces a locale dictionary snapshot without keeping stale keys", async () => {
    const translator = new Translator({
      en: {
        user: {
          greeting: { t: "Before" },
          removed: { t: "Remove me" },
        },
      },
    });

    Translator.replace("en", {
      user: {
        greeting: { t: "After" },
      },
    });

    expect(translator.translate("en", "user.greeting")).toBe("After");
    expect(translator.translate("en", "user.removed")).toBe("user.removed");
    expect(await translator.getDictionary("en")).toEqual({
      user: {
        greeting: { t: "After" },
      },
    });
  });

  test("replaces a full SSR dictionary snapshot after an earlier merge seed", async () => {
    const translator = new Translator({});
    Translator.seed("en", {
      fixture: {
        hello: { t: "Initial Dictionary" },
        removeMe: { t: "Remove Me" },
      },
    });

    Translator.replace("en", {
      fixture: {
        hello: { t: "Updated Dictionary" },
      },
    });

    expect(translator.translate("en", "fixture.hello")).toBe("Updated Dictionary");
    expect(translator.translate("en", "fixture.removeMe")).toBe("fixture.removeMe");
  });

  test("skips repeated replace calls for the same dictionary snapshot", async () => {
    const translator = new Translator({});
    const snapshot = {
      user: {
        greeting: { t: "Hello" },
      },
    };

    Translator.replace("en", snapshot);
    const firstDictionary = await translator.getDictionary("en");
    Translator.replace("en", snapshot);

    expect(await translator.getDictionary("en")).toBe(firstDictionary);
  });
});
