import { describe, expect, test } from "bun:test";
import { defaultPageState, toManifestJson } from "akanjs/client";
import { createManifestDataUrl, getFrameCssVars, isResponsiveFrame } from "./Common";

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

describe("getFrameCssVars", () => {
  test("an SSR document leaves breakpoints and the web safe area to CSS", () => {
    const pageState = {
      ...defaultPageState,
      topInset: 48,
      responsiveInset: { top: { base: 48, md: 0 }, bottom: { base: 0 } },
      safeAreaEnv: { top: true, bottom: false },
    };
    const vars = getFrameCssVars(pageState, { cssResolved: true });

    expect(isResponsiveFrame(pageState, { cssResolved: true })).toBe(true);
    expect(vars["--akan-top-inset"]).toBeUndefined();
    expect(vars["--akan-top-inset-base"]).toBe("48px");
    expect(vars["--akan-top-inset-md"]).toBe("0px");
    expect(vars["--akan-top-inset-visibility-base"]).toBe("visible");
    expect(vars["--akan-top-inset-visibility-md"]).toBe("hidden");
    expect(vars["--akan-top-safe-area"]).toBe("env(safe-area-inset-top, 0px)");
    expect(vars["--akan-page-padding-top"]).toBe("calc(var(--akan-top-safe-area) + var(--akan-top-inset))");
  });

  test("a CSR frame gets the numbers its script lays pages out with", () => {
    const pageState = {
      ...defaultPageState,
      topSafeArea: 47,
      topInset: 48,
      responsiveInset: { top: { base: 48, md: 0 }, bottom: { base: 0 } },
      safeAreaEnv: { top: true, bottom: true },
    };
    const vars = getFrameCssVars(pageState, { cssResolved: false });

    expect(isResponsiveFrame(pageState, { cssResolved: false })).toBe(false);
    expect(vars["--akan-top-inset"]).toBe("48px");
    expect(vars["--akan-top-inset-visibility"]).toBe("visible");
    expect(vars["--akan-bottom-inset-visibility"]).toBe("hidden");
    expect(vars["--akan-top-inset-md"]).toBeUndefined();
    expect(vars["--akan-top-safe-area"]).toBe("47px");
  });
});
