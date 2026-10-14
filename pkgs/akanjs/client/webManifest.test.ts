import { describe, expect, test } from "bun:test";
import { getWebManifestBasePath, webManifestHref } from "./webManifest";

describe("getWebManifestBasePath", () => {
  test("answers the app root, a visible basePath prefix, or the request's basePath, and nothing else", () => {
    expect(getWebManifestBasePath("/manifest.webmanifest", [])).toBeNull();
    expect(getWebManifestBasePath("/office/manifest.webmanifest", ["office", "admin"])).toBe("office");
    expect(getWebManifestBasePath("/manifest.webmanifest", ["office", "admin"], "admin")).toBe("admin");
    expect(getWebManifestBasePath("/unknown/manifest.webmanifest", ["office"])).toBeUndefined();
    expect(getWebManifestBasePath("/en/office/manifest.webmanifest", ["office"])).toBeUndefined();
    expect(getWebManifestBasePath("/sitemap.xml", ["office"])).toBeUndefined();
  });

  test("reads back the basePath webManifestHref links", () => {
    for (const basePath of [null, "office"])
      expect(getWebManifestBasePath(webManifestHref(basePath), ["office", "admin"])).toBe(basePath);
  });
});
