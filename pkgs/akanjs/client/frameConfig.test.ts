import { describe, expect, test } from "bun:test";
import { getExplicitPageConfigKeys, mergePageConfigs, resolvePageState, validatePageConfig } from "./frameConfig";

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
      "pageConfig.topInset in bad.tsx must be a boolean or non-negative px number.",
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
