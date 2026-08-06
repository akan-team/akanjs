import { describe, expect, test } from "bun:test";

import {
  assertUniqueRoutePatterns,
  compareRouteSpecificity,
  isRouteSourceFile,
  matchRoutePattern,
  parseRouteModuleKey,
  validatePageSourceFile,
  validateSubRoutePageKey,
} from "./routeConvention";

describe("route convention", () => {
  test("parses leaf, index, layout, route groups, and dynamic segments", () => {
    expect(parseRouteModuleKey("./akanjs.tsx")).toMatchObject({
      kind: "page",
      routeSegments: ["[lang]", "akanjs"],
      sourceRouteSegments: ["akanjs"],
      pattern: "/:lang/akanjs",
    });
    expect(parseRouteModuleKey("./(user)/cluster/[clusterId]/_index.tsx")).toMatchObject({
      kind: "page",
      routeSegments: ["[lang]", "(user)", "cluster", "[clusterId]"],
      sourceRouteSegments: ["(user)", "cluster", "[clusterId]"],
      pattern: "/:lang/cluster/:clusterId",
    });
    expect(parseRouteModuleKey("./akanjs/_layout.tsx")).toMatchObject({
      kind: "layout",
      routeSegments: ["[lang]", "akanjs"],
      sourceRouteSegments: ["akanjs"],
      pattern: "/:lang/akanjs",
    });
    expect(parseRouteModuleKey("./_layout.tsx")).toMatchObject({
      kind: "layout",
      routeSegments: ["[lang]"],
      sourceRouteSegments: [],
      pattern: "/:lang",
    });
    expect(parseRouteModuleKey("./akan/__root_layout.tsx")).toMatchObject({
      kind: "layout",
      routeSegments: ["[lang]", "akan"],
      sourceRouteSegments: ["akan"],
      pattern: "/:lang/akan",
      isInternalRootLayout: true,
    });
  });

  test("parses _overrides.tsx as an override module attached to its directory node", () => {
    expect(parseRouteModuleKey("./_overrides.tsx")).toMatchObject({
      kind: "overrides",
      routeSegments: ["[lang]"],
      sourceRouteSegments: [],
      pattern: "/:lang",
    });
    expect(parseRouteModuleKey("./(admin)/dashboard/_overrides.tsx")).toMatchObject({
      kind: "overrides",
      routeSegments: ["[lang]", "(admin)", "dashboard"],
      sourceRouteSegments: ["(admin)", "dashboard"],
      pattern: "/:lang/dashboard",
    });
    expect(isRouteSourceFile("(admin)/dashboard/_overrides.tsx")).toBe(true);
    expect(validatePageSourceFile("(admin)/dashboard/_overrides.tsx")).toBe(true);
  });

  test("rejects unsupported reserved and catch-all route files", () => {
    expect(() => parseRouteModuleKey("./_helper.ts")).toThrow("unsupported reserved route file");
    expect(() => parseRouteModuleKey("./[lang]/foo.tsx")).toThrow("Akan.js injects `[lang]` automatically");
    expect(() => parseRouteModuleKey("./[...slug].tsx")).toThrow("catch-all routes are not supported");
    expect(() => parseRouteModuleKey("./[[...slug]].tsx")).toThrow("catch-all routes are not supported");
  });

  test("detects leaf pages as route source files", () => {
    expect(isRouteSourceFile("docs/intro/quickstart.tsx")).toBe(true);
    expect(isRouteSourceFile("(docs)/docs/intro/[slug].tsx")).toBe(true);
    expect(isRouteSourceFile("docs/intro/_index.tsx")).toBe(true);
    expect(isRouteSourceFile("docs/intro/_layout.tsx")).toBe(true);
    expect(isRouteSourceFile("docs/intro/_helper.tsx")).toBe(false);
    expect(isRouteSourceFile("docs/[...slug].tsx")).toBe(false);
  });

  test("validates page source file conventions", () => {
    for (const file of [
      "docs/intro/_index.tsx",
      "docs/intro/_layout.tsx",
      "docs/intro/foo.tsx",
      "docs/intro/[id].tsx",
      "robots.txt.tsx",
    ]) {
      expect(validatePageSourceFile(file)).toBe(true);
    }
    expect(validatePageSourceFile("docs/intro/style.css")).toBe(false);
    expect(() => validatePageSourceFile("docs/intro/logic.ts")).toThrow("must use .tsx");
    expect(() => validatePageSourceFile("docs/intro/Component.tsx")).toThrow("uppercase letter");
    expect(() => validatePageSourceFile("docs/intro/_Component.tsx")).toThrow("reserved route files");
    expect(() => validatePageSourceFile("docs/intro/_helper.tsx")).toThrow("reserved route files");
  });

  test("keeps robots outside implicit locale", () => {
    expect(parseRouteModuleKey("./robots.txt.tsx")).toMatchObject({
      kind: "page",
      routeSegments: ["robots.txt"],
      pattern: "/robots.txt",
      isSpecialRoute: true,
    });
  });

  test("removed special route leaves use implicit locale", () => {
    expect(parseRouteModuleKey("./opengraph-image.tsx")).toMatchObject({
      routeSegments: ["[lang]", "opengraph-image"],
      pattern: "/:lang/opengraph-image",
      isSpecialRoute: false,
    });
    expect(parseRouteModuleKey("./manifest.json.tsx")).toMatchObject({
      routeSegments: ["[lang]", "manifest.json"],
      pattern: "/:lang/manifest.json",
      isSpecialRoute: false,
    });
  });

  test("detects route conflicts", () => {
    expect(() =>
      assertUniqueRoutePatterns([
        { key: "./foo.tsx", pattern: "/foo" },
        { key: "./foo/_index.tsx", pattern: "/foo" },
      ]),
    ).toThrow("route conflict");
  });

  test("validates subRoute page keys when basePaths are configured", () => {
    expect(() => validateSubRoutePageKey("./_layout.tsx", [])).not.toThrow();
    expect(() => validateSubRoutePageKey("./foo.tsx", [])).not.toThrow();
    expect(() => validateSubRoutePageKey("./akanjs/_index.tsx", ["akanjs", "soft"])).not.toThrow();
    expect(() => validateSubRoutePageKey("./soft/(tab)/_layout.tsx", ["akanjs", "soft"])).not.toThrow();

    for (const key of ["./_layout.tsx", "./_index.tsx", "./foo.tsx", "./robots.txt.tsx", "./admin/_index.tsx"]) {
      expect(() => validateSubRoutePageKey(key, ["akanjs", "soft"], { appName: "akan" })).toThrow(
        'app "akan" uses subRoutes (akanjs, soft)',
      );
    }
  });

  test("matches and sorts route patterns by specificity", () => {
    expect(matchRoutePattern("/:lang/cluster/:clusterId", "/ko/cluster/abc")).toEqual({
      lang: "ko",
      clusterId: "abc",
    });
    expect(["/:lang/:id", "/:lang/new"].sort(compareRouteSpecificity)).toEqual(["/:lang/new", "/:lang/:id"]);
  });
});
