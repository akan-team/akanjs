import { describe, expect, test } from "bun:test";
import { createDefaultSitemapUrls, createSitemapXml, getSitemapBasePath, getWebManifestBasePath } from "./sitemap";

const seedEntries = (...patterns: string[]) => patterns.map((pattern) => ({ routeId: pattern, pattern, seeds: [] }));

describe("sitemap fallback helpers", () => {
  const i18n = { defaultLocale: "en", locales: ["en", "ko"] };

  test("creates escaped XML with unique sorted URLs", () => {
    const xml = createSitemapXml(["https://example.com/b?x=1&y=2", "https://example.com/a", "https://example.com/a"]);

    expect(xml).toContain("<loc>https://example.com/a</loc>");
    expect(xml).toContain("<loc>https://example.com/b?x=1&amp;y=2</loc>");
    expect(xml.match(/<url>/g)).toHaveLength(2);
  });

  test("expands only static locale routes", () => {
    const urls = createDefaultSitemapUrls({
      origin: "https://example.com",
      entries: seedEntries("/:lang", "/:lang/about", "/:lang/post/:postId", "/robots.txt"),
      i18n,
    });

    expect(urls).toEqual([
      "https://example.com/en",
      "https://example.com/ko",
      "https://example.com/en/about",
      "https://example.com/ko/about",
    ]);
  });

  test("uses base path only for filtering subroute sitemap entries", () => {
    const urls = createDefaultSitemapUrls({
      origin: "https://example.com/",
      basePath: "akanjs",
      entries: seedEntries("/:lang/akanjs", "/:lang/akanjs/about", "/:lang/thin/about", "/:lang/akanjs/post/:postId"),
      i18n,
    });

    expect(urls).toEqual([
      "https://example.com/en",
      "https://example.com/ko",
      "https://example.com/en/about",
      "https://example.com/ko/about",
    ]);
  });

  test("recognizes root and subroute sitemap paths", () => {
    expect(getSitemapBasePath("/sitemap.xml", [])).toBeNull();
    expect(getSitemapBasePath("/sitemap.xml", ["akanjs"])).toBeUndefined();
    expect(getSitemapBasePath("/sitemap.xml", ["akanjs"], "akanjs")).toBe("akanjs");
    expect(getSitemapBasePath("/akanjs/sitemap.xml", ["akanjs"], "akanjs")).toBeUndefined();
  });
});

describe("getWebManifestBasePath", () => {
  test("answers the app root, a visible basePath prefix, or the request's basePath, and nothing else", () => {
    expect(getWebManifestBasePath("/manifest.webmanifest", [])).toBeNull();
    expect(getWebManifestBasePath("/office/manifest.webmanifest", ["office", "admin"])).toBe("office");
    expect(getWebManifestBasePath("/manifest.webmanifest", ["office", "admin"], "admin")).toBe("admin");
    expect(getWebManifestBasePath("/unknown/manifest.webmanifest", ["office"])).toBeUndefined();
    expect(getWebManifestBasePath("/en/office/manifest.webmanifest", ["office"])).toBeUndefined();
    expect(getWebManifestBasePath("/sitemap.xml", ["office"])).toBeUndefined();
  });
});
