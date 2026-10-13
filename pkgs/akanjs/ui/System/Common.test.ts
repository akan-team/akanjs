import { describe, expect, test } from "bun:test";
import { toManifestJson } from "akanjs/client";
import { createManifestDataUrl } from "./Common";

describe("manifest helpers", () => {
  test("converts author-facing camelCase keys to manifest snake_case", () => {
    expect(
      toManifestJson({
        name: "Akan App",
        shortName: "Akan",
        startUrl: "/",
        themeColor: "#ffffff",
        backgroundColor: "#000000",
        displayOverride: ["standalone"],
        icons: [{ src: "/icon.png", sizes: "192x192", type: "image/png" }],
      }),
    ).toEqual({
      name: "Akan App",
      short_name: "Akan",
      start_url: "/",
      theme_color: "#ffffff",
      background_color: "#000000",
      display_override: ["standalone"],
      icons: [{ src: "/icon.png", sizes: "192x192", type: "image/png" }],
    });
  });

  test("encodes manifest JSON as a base64 data URL", () => {
    const href = createManifestDataUrl({ name: "Akan App", shortName: "Akan" });
    expect(href.startsWith("data:application/manifest+json;base64,")).toBe(true);

    const encoded = href.slice("data:application/manifest+json;base64,".length);
    expect(JSON.parse(Buffer.from(encoded, "base64").toString("utf8"))).toEqual({
      name: "Akan App",
      short_name: "Akan",
    });
  });
});
