import { describe, expect, test } from "bun:test";
import type { RouteClientCache, RouteSeedIndex } from "./artifact";
import type { BaseBuildArtifact, DictAsset, RenderState } from "./types";
import { WebRouteContext } from "./webRouteContext";

const assetOf = (lang: string, files: number): DictAsset => ({
  url: `/_akan/dict/${lang}-page.js`,
  relPath: `dict/${lang}-page.js`,
  routeParts: {
    table: { url: `/_akan/dict/${lang}-groups.js`, relPath: `dict/${lang}-groups.js` },
    files: Array.from({ length: files }, (_, idx) => ({
      url: `/_akan/dict/${lang}-${idx}.js`,
      relPath: `dict/${lang}-${idx}.js`,
    })),
  },
});

const contextOf = (artifact: Partial<BaseBuildArtifact>, groupsOf: Record<string, string[]> = {}) =>
  new WebRouteContext({
    artifact: { dictAssets: { en: assetOf("en", 3), ko: assetOf("ko", 3) }, ...artifact } as BaseBuildArtifact,
    prodMode: true,
    renderState: {} as RenderState,
    subRoutes: {},
    seedIndex: {} as RouteSeedIndex,
    routeCache: { dictionaryGroupsOf: (routeId: string) => groupsOf[routeId] } as unknown as RouteClientCache,
    hub: () => null,
  });

const headers = new Headers();

describe("WebRouteContext.dictionaryUrlsOf", () => {
  test("names the files the build packed for the route, in the request's language", () => {
    const context = contextOf({ dictRoutes: { "/:lang/memo": [0, 2] } });

    expect(context.dictionaryUrlsOf(headers, "/ko/memo", "/:lang/memo")).toEqual([
      "/_akan/dict/ko-0.js",
      "/_akan/dict/ko-2.js",
    ]);
    expect(context.dictionaryUrlsOf(headers, "/en/memo", "/:lang/memo")).toEqual([
      "/_akan/dict/en-0.js",
      "/_akan/dict/en-2.js",
    ]);
  });

  test("names the page file for a route the build could not read, and for a request with no route", () => {
    const context = contextOf({ dictRoutes: { "/:lang/memo": [0] } });

    expect(context.dictionaryUrlsOf(headers, "/en/admin", "/:lang/admin")).toEqual(["/_akan/dict/en-page.js"]);
    expect(context.dictionaryUrlsOf(headers, "/en/memo")).toEqual(["/_akan/dict/en-page.js"]);
  });

  test("names the page file when the route names a file the locale does not have", () => {
    const context = contextOf({ dictRoutes: { "/:lang/memo": [0, 7] } });

    expect(context.dictionaryUrlsOf(headers, "/en/memo", "/:lang/memo")).toEqual(["/_akan/dict/en-page.js"]);
  });

  test("names the whole page file, and still the API descriptions, where a locale's route files would cost more", () => {
    const sized = (lang: string, whole: number, sizes: number[]): DictAsset => {
      const asset = assetOf(lang, sizes.length);
      const files = asset.routeParts?.files.map((file, idx) => ({ ...file, bytes: sizes[idx] })) ?? [];
      const api = files.at(-1);
      return {
        ...asset,
        bytes: whole,
        ...(api ? { parts: { api } } : {}),
        ...(asset.routeParts ? { routeParts: { ...asset.routeParts, files } } : {}),
      };
    };
    const context = contextOf({
      dictAssets: { en: sized("en", 1000, [600, 300, 900, 500]), ko: sized("ko", 1000, [700, 400, 900, 500]) },
      dictRoutes: { "/:lang/memo": [0, 1, 3], "/:lang/user": [0, 2] },
    });

    expect(context.dictionaryUrlsOf(headers, "/en/memo", "/:lang/memo")).toEqual([
      "/_akan/dict/en-0.js",
      "/_akan/dict/en-1.js",
      "/_akan/dict/en-3.js",
    ]);
    expect(context.dictionaryUrlsOf(headers, "/ko/memo", "/:lang/memo")).toEqual([
      "/_akan/dict/ko-page.js",
      "/_akan/dict/ko-3.js",
    ]);
    expect(context.dictionaryUrlsOf(headers, "/en/user", "/:lang/user")).toEqual(["/_akan/dict/en-page.js"]);
  });

  test("development names the file of each group the route's build read, a group no dictionary holds having none", () => {
    const context = contextOf(
      { dictGroups: { base: 0, memo: 1, user: 2 } },
      {
        "/:lang/memo": ["memo", "base", "summary", "memo"],
      },
    );

    expect(context.dictionaryUrlsOf(headers, "/en/memo", "/:lang/memo")).toEqual([
      "/_akan/dict/en-0.js",
      "/_akan/dict/en-1.js",
    ]);
    expect(context.dictionaryUrlsOf(headers, "/en/user", "/:lang/user")).toEqual(["/_akan/dict/en-page.js"]);
  });
});
