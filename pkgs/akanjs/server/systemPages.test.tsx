import { describe, expect, test } from "bun:test";
import { DEFAULT_AKAN_I18N } from "akanjs/common";
import {
  createSystemPageFallbackText,
  createSystemPageHeaders,
  createSystemPageResponse,
  getSystemPageHomeHref,
} from "./systemPages";

describe("system pages", () => {
  test("renders a pretty not-found page with no-store headers", async () => {
    const response = await createSystemPageResponse({
      kind: "not-found",
      pathname: "/ko/akanjs/missing",
      homeHref: "/ko/akanjs",
      lang: "ko",
      stylesheetHref: "/_akan/styles/akanjs.css",
    });
    const html = await response.text();

    expect(response.status).toBe(404);
    expect(response.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(html).toContain("Page not found");
    expect(html).toContain("This page is off the flight path.");
    expect(html).toContain("/ko/akanjs/missing");
    expect(html).toContain('href="/ko/akanjs"');
    expect(html).toContain('href="/_akan/styles/akanjs.css"');
    expect(html).toContain('name="robots"');
    expect(html).toContain("noindex");
  });

  test("keeps server error details dev-only", async () => {
    const error = new Error("database password leaked in stack");
    const productionResponse = await createSystemPageResponse({
      kind: "error",
      pathname: "/en/broken",
      homeHref: "/en",
      showDetails: false,
      error,
    });
    const devResponse = await createSystemPageResponse({
      kind: "error",
      pathname: "/en/broken",
      homeHref: "/en",
      showDetails: true,
      error,
    });

    expect(productionResponse.status).toBe(500);
    expect(await productionResponse.text()).not.toContain("database password leaked in stack");
    expect(await devResponse.text()).toContain("database password leaked in stack");
  });

  test("returns HEAD metadata without a body", async () => {
    const response = await createSystemPageResponse({
      kind: "not-found",
      method: "HEAD",
      pathname: "/en/missing",
      homeHref: "/en",
    });

    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.text()).toBe("");
  });

  test("builds locale and base-path aware home links", () => {
    expect(
      getSystemPageHomeHref({
        pathname: "/ko/akanjs/docs/missing",
        i18n: DEFAULT_AKAN_I18N,
        basePaths: ["akanjs", "soft"],
      }),
    ).toBe("/ko/akanjs");
    expect(
      getSystemPageHomeHref({
        pathname: "/unknown/missing",
        i18n: DEFAULT_AKAN_I18N,
        basePaths: ["akanjs", "soft"],
        headerBasePath: "soft",
      }),
    ).toBe("/en/soft");
  });

  test("provides final fallback text and no-store headers", () => {
    const headers = createSystemPageHeaders();

    expect(createSystemPageFallbackText("error")).toBe("500 Server error");
    expect(headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    expect(headers.get("Cache-Control")).toBe("no-store");
  });

  test("keeps RSC worker system-page helpers free of react-dom/server", async () => {
    const result = await Bun.build({
      entrypoints: [new URL("./rscWorker.tsx", import.meta.url).pathname],
      target: "bun",
      conditions: ["react-server"],
      write: false,
    });

    expect(result.success).toBe(true);
    const output = (await Promise.all(result.outputs.map((artifact) => artifact.text()))).join("\n");
    expect(output).not.toContain("react-dom/server");
  });
});
