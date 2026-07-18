import { describe, expect, test } from "bun:test";
import type { AkanMobileTargetConfig } from "../akanConfig";
import type { App } from "../commandDecorators";
import { getMobileTargetChoices, resolveMobilePath, resolveMobileTargets, targetHtmlFilename } from "./mobileTarget";

const target = {
  name: "akanjs",
  basePath: "akanjs",
  appName: "Akanjs",
  appId: "com.akanjs.app",
  version: "1.0.0",
  buildNum: 1,
} as AkanMobileTargetConfig;

describe("mobile target helpers", () => {
  test("maps deep links into target base paths without duplicating prefixes", () => {
    expect(resolveMobilePath(target, "/order/123")).toBe("/akanjs/order/123");
    expect(resolveMobilePath(target, "/akanjs/order/123")).toBe("/akanjs/order/123");
    expect(resolveMobilePath({ ...target, basePath: undefined }, "/order/123")).toBe("/order/123");
  });

  test("selects the self-contained html file for a target", () => {
    expect(targetHtmlFilename(target)).toBe("akanjs.html");
    expect(targetHtmlFilename({ ...target, basePath: undefined })).toBe("index.html");
  });

  test("uses the configured mobile target as the only choice when one target is configured", async () => {
    const app = {
      getConfig: async () => ({
        basePaths: new Set(["akanjs", "soft", "office"]),
        mobile: { targets: { akanjs: target } },
      }),
    } as unknown as App;

    await expect(getMobileTargetChoices(app)).resolves.toEqual(["akanjs"]);
    await expect(resolveMobileTargets(app, undefined)).resolves.toEqual([{ name: "akanjs", config: target }]);
  });

  test("resolves a route base path onto the default mobile target config", async () => {
    const app = {
      getConfig: async () => ({
        basePaths: new Set(["akanjs", "soft", "office"]),
        mobile: { targets: { akanjs: target } },
      }),
    } as unknown as App;

    await expect(resolveMobileTargets(app, "soft")).resolves.toEqual([
      {
        name: "soft",
        config: { ...target, name: "soft", basePath: "soft" },
      },
    ]);
  });
});
