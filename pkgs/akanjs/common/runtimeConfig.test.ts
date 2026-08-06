import { describe, expect, test } from "bun:test";

import {
  DEFAULT_AKAN_I18N,
  getAkanHmrPhase,
  getBasePathFromPathname,
  isAkanHmrApplying,
  parseAkanI18nEnv,
  parseBasePaths,
  parseSubRouteHosts,
  randomPick,
  randomPicks,
  resolveAkanI18nConfig,
  resolveSubRouteHosts,
} from ".";

describe("runtime config helpers", () => {
  test("normalizes i18n config and validates default locale membership", () => {
    expect(DEFAULT_AKAN_I18N).toEqual({ defaultLocale: "en", locales: ["en", "ko"] });
    expect(resolveAkanI18nConfig({ defaultLocale: "ko", locales: [" en ", "ko", "ko"] })).toEqual({
      defaultLocale: "ko",
      locales: ["en", "ko"],
    });
    expect(() => resolveAkanI18nConfig({ defaultLocale: "ja", locales: ["en", "ko"] })).toThrow(
      '[i18n] defaultLocale "ja" must be included in locales: en,ko',
    );
    expect(() => resolveAkanI18nConfig({ locales: [" "] })).toThrow("[i18n] locales must include at least one locale");
  });

  test("parses i18n environment values", () => {
    expect(
      parseAkanI18nEnv({
        AKAN_PUBLIC_DEFAULT_LOCALE: "ko",
        AKAN_PUBLIC_LOCALES: "en,ko,ja",
      }),
    ).toEqual({ defaultLocale: "ko", locales: ["en", "ko", "ja"] });
  });

  test("parses and detects configured base paths", () => {
    expect(parseBasePaths("akanjs, soft,akanjs,,")).toEqual(["akanjs", "soft"]);
    expect(parseBasePaths(new Set(["akan", "akan", "admin"]))).toEqual(["akan", "admin"]);

    const options = {
      basePaths: ["akanjs", "soft"],
      i18n: { defaultLocale: "en", locales: ["en", "ko"] },
    };

    expect(getBasePathFromPathname("/ko/akanjs/home", options)).toBe("akanjs");
    expect(getBasePathFromPathname("/soft/home", options)).toBe("soft");
    expect(getBasePathFromPathname("/ko/unknown/home", options)).toBeNull();
    expect(getBasePathFromPathname("/unknown/home", { ...options, headerBasePath: "akanjs" })).toBe("akanjs");
    expect(getBasePathFromPathname("/unknown/home", { ...options, headerBasePath: "unknown" })).toBeNull();
  });

  test("parses sub route hosts from an env value", () => {
    expect(parseSubRouteHosts("soft=a.com,b.com;office=c.com")).toEqual({
      soft: ["a.com", "b.com"],
      office: ["c.com"],
    });
    expect(parseSubRouteHosts(" soft = A.COM:443 , a.com ")).toEqual({ soft: ["a.com"] });
    expect(parseSubRouteHosts("/soft/=a.com")).toEqual({ soft: ["a.com"] });
    expect(parseSubRouteHosts("soft=a.com;soft=b.com")).toEqual({ soft: ["a.com", "b.com"] });
  });

  test("survives malformed sub route host values without throwing", () => {
    expect(parseSubRouteHosts("=;;=x")).toEqual({});
    expect(parseSubRouteHosts("soft")).toEqual({});
    expect(parseSubRouteHosts("soft=")).toEqual({});
    expect(parseSubRouteHosts("soft=,,")).toEqual({});
    expect(parseSubRouteHosts("soft=a b.com,ok.com")).toEqual({ soft: ["ok.com"] });
    expect(parseSubRouteHosts("")).toEqual({});
    expect(parseSubRouteHosts(undefined)).toEqual({});
    expect(parseSubRouteHosts(null)).toEqual({});
  });

  test("merges env sub route hosts on top of the built artifact mapping", () => {
    const subRoutes = { soft: ["soft.akanjs.com"] };
    const basePaths = ["soft", "office"];

    expect(
      resolveSubRouteHosts({
        subRoutes,
        basePaths,
        env: "soft=soft-abc.try.akanjs.com;office=office-abc.try.akanjs.com",
      }),
    ).toEqual({
      subRoutes: {
        soft: ["soft.akanjs.com", "soft-abc.try.akanjs.com"],
        office: ["office-abc.try.akanjs.com"],
      },
      ignoredBasePaths: [],
    });

    expect(resolveSubRouteHosts({ subRoutes, basePaths, env: "soft=SOFT.AKANJS.COM:443" }).subRoutes).toEqual({
      soft: ["soft.akanjs.com"],
    });
  });

  test("drops env sub route hosts for basePaths the build does not serve", () => {
    const resolved = resolveSubRouteHosts({
      subRoutes: { soft: ["soft.akanjs.com"] },
      basePaths: ["soft"],
      env: "nope=x.com;soft=soft-abc.try.akanjs.com",
    });

    expect(resolved.ignoredBasePaths).toEqual(["nope"]);
    expect(resolved.subRoutes).toEqual({ soft: ["soft.akanjs.com", "soft-abc.try.akanjs.com"] });
  });

  test("returns the artifact mapping untouched when no env value is set", () => {
    const subRoutes = { soft: ["soft.akanjs.com"] };

    for (const env of [undefined, null, "", "   ", "=;;=x"]) {
      const resolved = resolveSubRouteHosts({ subRoutes, basePaths: ["soft"], env });
      expect(resolved.subRoutes).toBe(subRoutes);
      expect(resolved.ignoredBasePaths).toEqual([]);
    }
  });

  test("reads Akan HMR phase from globalThis", () => {
    const previousPhase = globalThis.__AKAN_HMR_PHASE__;

    try {
      globalThis.__AKAN_HMR_PHASE__ = undefined;
      expect(getAkanHmrPhase()).toBeNull();
      expect(isAkanHmrApplying()).toBe(false);

      globalThis.__AKAN_HMR_PHASE__ = "refresh-import";
      expect(getAkanHmrPhase()).toBe("refresh-import");
      expect(isAkanHmrApplying()).toBe(true);

      globalThis.__AKAN_HMR_PHASE__ = "react-refresh";
      expect(getAkanHmrPhase()).toBe("react-refresh");
    } finally {
      globalThis.__AKAN_HMR_PHASE__ = previousPhase;
    }
  });

  test("random helpers pick values from the input collection", () => {
    const previousRandom = Math.random;
    Math.random = () => 0.5;

    try {
      expect(randomPick(["a", "b", "c"])).toBe("b");
      expect(randomPicks(["a", "b", "c"], 2, true)).toEqual(["b", "b"]);
      expect(randomPicks(["a", "b"], 3, false)).toEqual(["a", "b"]);
    } finally {
      Math.random = previousRandom;
    }
  });
});
