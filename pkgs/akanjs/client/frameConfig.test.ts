import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  breakpointQuery,
  getExplicitPageConfigKeys,
  insetAt,
  insetBreakpoints,
  insetsByBreakpoint,
  mergePageConfigs,
  resolvePageState,
  validatePageConfig,
} from "./frameConfig";

describe("frameConfig", () => {
  test("applies platform profiles and route roles as auto defaults", () => {
    expect(
      resolvePageState({
        path: "/explore/detail",
        platform: "ios",
        deviceSafeArea: { top: 11, bottom: 22 },
      }),
    ).toMatchObject({
      transition: "stack",
      gesture: true,
      topSafeArea: 11,
      bottomSafeArea: 22,
    });
    expect(
      resolvePageState({
        path: "/explore/detail",
        platform: "android",
        deviceSafeArea: { top: 11, bottom: 22 },
      }),
    ).toMatchObject({
      transition: "scaleOut",
      gesture: false,
      topSafeArea: 0,
      bottomSafeArea: 0,
    });
    expect(
      resolvePageState({
        path: "/[lang]/explore",
        platform: "ios",
        deviceSafeArea: { top: 11, bottom: 22 },
      }),
    ).toMatchObject({ transition: "none", gesture: false, cache: true });
    expect(
      resolvePageState({
        path: "/[lang]/minimal/explore",
        basePath: "minimal",
        platform: "ios",
        deviceSafeArea: { top: 11, bottom: 22 },
      }),
    ).toMatchObject({ transition: "none", gesture: false, cache: true });
  });

  test("treats pageConfig as an explicit override over auto values", () => {
    const configChain = [{ topInset: 0, transition: "none" as const }, { bottomInset: 72 }];

    expect(mergePageConfigs(configChain)).toMatchObject({
      topInset: 0,
      bottomInset: 72,
      transition: "none",
    });
    expect(getExplicitPageConfigKeys(configChain)).toMatchObject({
      topInset: true,
      bottomInset: true,
      transition: true,
    });
    expect(
      resolvePageState({
        path: "/[lang]/explore/detail",
        platform: "ios",
        deviceSafeArea: { top: 11, bottom: 22 },
        configChain: [{ transition: "none" }],
      }),
    ).toMatchObject({ transition: "none", gesture: false });
    expect(
      resolvePageState({
        path: "/[lang]/explore/detail",
        platform: "ios",
        deviceSafeArea: { top: 11, bottom: 22 },
        configChain,
      }),
    ).toMatchObject({ transition: "none", gesture: false, topInset: 0, bottomInset: 72 });
  });

  test("resolves boolean inset config values", () => {
    expect(
      resolvePageState({
        path: "/[lang]/explore/detail",
        platform: "ios",
        deviceSafeArea: { top: 11, bottom: 22 },
        configChain: [{ topInset: true, bottomInset: true }],
      }),
    ).toMatchObject({ topInset: 48, bottomInset: 48 });
    expect(
      resolvePageState({
        path: "/[lang]/explore/detail",
        platform: "ios",
        deviceSafeArea: { top: 11, bottom: 22 },
        configChain: [{ topInset: false, bottomInset: false }],
      }),
    ).toMatchObject({ topInset: 0, bottomInset: 0 });
  });

  test("keeps Android double-padding fallback unless edge-to-edge insets are reliable", () => {
    expect(
      resolvePageState({
        path: "/detail",
        platform: "android",
        deviceSafeArea: { top: 24, bottom: 48 },
        cssSafeArea: { top: 0, bottom: 0 },
      }),
    ).toMatchObject({ topSafeArea: 0, bottomSafeArea: 0 });
    expect(
      resolvePageState({
        path: "/detail",
        platform: "android",
        deviceSafeArea: { top: 24, bottom: 48 },
        cssSafeArea: { top: 12, bottom: 16 },
      }),
    ).toMatchObject({ topSafeArea: 12, bottomSafeArea: 16 });
    expect(
      resolvePageState({
        path: "/detail",
        platform: "android",
        deviceSafeArea: { top: 24, bottom: 48 },
        cssSafeArea: { top: 0, bottom: 0 },
        configChain: [{ safeArea: { android: "edge-to-edge" } }],
      }),
    ).toMatchObject({ topSafeArea: 24, bottomSafeArea: 48 });
  });

  test("rejects unsupported pageConfig keys and transition typos", () => {
    expect(() => validatePageConfig("bad.tsx", { transtion: "stack" } as never)).toThrow(
      'unsupported pageConfig option "transtion"',
    );
    expect(() => validatePageConfig("bad.tsx", { transition: "slide" as never })).toThrow(
      'unsupported pageConfig.transition "slide"',
    );
    expect(() => validatePageConfig("bad.tsx", { topInset: -1 })).toThrow(
      "pageConfig.topInset in bad.tsx must be a boolean, a non-negative px number",
    );
  });

  test("resolves the ssr render mode, defaulting to stream", () => {
    expect(
      resolvePageState({
        path: "/detail",
        platform: "web",
        deviceSafeArea: { top: 0, bottom: 0 },
      }).ssr,
    ).toBe("stream");
    expect(
      resolvePageState({
        path: "/detail",
        platform: "web",
        deviceSafeArea: { top: 0, bottom: 0 },
        configChain: [{ ssr: "block" }],
      }).ssr,
    ).toBe("block");
  });

  test("defaults both safe-area colors to the theme background", () => {
    const state = resolvePageState({ path: "/detail", platform: "web", deviceSafeArea: { top: 0, bottom: 0 } });

    expect(state.topSafeAreaColor).toBe("var(--color-background, Canvas)");
    expect(state.bottomSafeAreaColor).toBe("var(--color-background, Canvas)");
  });

  test("rejects unsupported pageConfig.ssr values", () => {
    expect(() => validatePageConfig("bad.tsx", { ssr: "wait" as never })).toThrow('unsupported pageConfig.ssr "wait"');
    expect(() => validatePageConfig("ok.tsx", { ssr: "block" })).not.toThrow();
  });

  test("accepts pageConfig.devOnly but never merges it into page state", () => {
    expect(() => validatePageConfig("ok.tsx", { devOnly: true })).not.toThrow();
    expect(() => validatePageConfig("bad.tsx", { devOnly: "yes" as never })).toThrow(
      "pageConfig.devOnly in bad.tsx must be a boolean.",
    );
    expect(mergePageConfigs([{ devOnly: true }, { cache: true }])).toEqual({ cache: true });
  });
});

describe("responsive insets and the web safe area", () => {
  const web = { path: "/office/inbox", platform: "web", deviceSafeArea: { top: 0, bottom: 0 } } as const;

  test("a per-breakpoint inset resolves at the width it is given and keeps its spec for CSS", () => {
    const configChain = [{ topInset: { base: 48, md: 0 }, bottomInset: 64 }];

    expect(resolvePageState({ ...web, configChain })).toMatchObject({
      topInset: 48,
      bottomInset: 64,
      responsiveInset: { top: { base: 48, md: 0 }, bottom: { base: 64 } },
    });
    expect(resolvePageState({ ...web, configChain, width: 1024 }).topInset).toBe(0);
    expect(insetsByBreakpoint({ base: 48, md: 0, xl: 12 })).toEqual({
      base: 48,
      sm: 48,
      md: 0,
      lg: 0,
      xl: 12,
      "2xl": 12,
    });
    expect(insetAt({ base: 48, md: 0 }, 767)).toBe(48);
    expect(insetAt({ base: 48, md: 0 }, 768)).toBe(0);
  });

  test("a responsive inset is validated like a plain one", () => {
    expect(() => validatePageConfig("./a.tsx", { topInset: { base: 48, md: 0 } })).not.toThrow();
    expect(() => validatePageConfig("./a.tsx", { topInset: { md: 0 } as never })).toThrow();
    expect(() => validatePageConfig("./a.tsx", { topInset: { base: 48, tablet: 0 } as never })).toThrow();
    expect(() => validatePageConfig("./a.tsx", { topInset: { base: -1 } })).toThrow();
  });

  test("on the web a declared safe area is left to env(), and a page that declares none has none", () => {
    expect(resolvePageState({ ...web, configChain: [{ safeArea: true }] }).safeAreaEnv).toEqual({
      top: true,
      bottom: true,
    });
    expect(resolvePageState({ ...web, configChain: [{ safeArea: "bottom" }] }).safeAreaEnv).toEqual({
      top: false,
      bottom: true,
    });
    expect(resolvePageState({ ...web, configChain: [] }).safeAreaEnv).toBeUndefined();
    expect(
      resolvePageState({ ...web, platform: "ios", configChain: [{ safeArea: true }] }).safeAreaEnv,
    ).toBeUndefined();
  });
});

describe("breakpoints", () => {
  test("queries the width a Tailwind variant matches from, or the widths below it", () => {
    expect(breakpointQuery("md")).toBe("(width >= 48rem)");
    expect(breakpointQuery("sm", { below: true })).toBe("(width < 40rem)");
  });

  test("ui/styles.css switches a responsive frame's insets at exactly these widths, in this order", () => {
    const css = readFileSync(new URL("../ui/styles.css", import.meta.url), "utf8");
    const switches = [
      ...css.matchAll(
        /@media \(width >= (\d+)rem\) \{\s*\[data-akan-frame-responsive\] \{\s*--akan-top-inset: var\(--akan-top-inset-([\w-]+)\);/g,
      ),
    ];

    expect(switches.map(([, rem, name]) => [name, Number(rem)])).toEqual(
      insetBreakpoints.map(([name, rem]) => [name, rem]),
    );
  });
});
