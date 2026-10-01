import { describe, expect, test } from "bun:test";
import type { AkanNativeTarget } from "../akanConfig";
import type { App } from "../commandDecorators";
import {
  appIdsOf,
  getMobileTargetChoices,
  resolveAppId,
  resolveMobilePath,
  resolveMobileTargets,
  targetHtmlFilename,
} from "./mobileTarget";

const target = {
  name: "akanjs",
  basePath: "akanjs",
  appName: "Akanjs",
  appId: "com.akanjs.app",
  version: "1.0.0",
  buildNum: 1,
} as AkanNativeTarget;

describe("native target helpers", () => {
  test("maps deep links into target base paths without duplicating prefixes", () => {
    expect(resolveMobilePath(target, "/order/123")).toBe("/akanjs/order/123");
    expect(resolveMobilePath(target, "/akanjs/order/123")).toBe("/akanjs/order/123");
    expect(resolveMobilePath({ ...target, basePath: undefined }, "/order/123")).toBe("/order/123");
  });

  test("an app id per platform falls back to default, and a platform with neither is refused", () => {
    const appId = { default: "com.yeollege", ios: "com.puffinplanet.yeollege" };
    expect(resolveAppId(appId, "ios")).toBe("com.puffinplanet.yeollege");
    expect(resolveAppId(appId, "android")).toBe("com.yeollege");
    expect(resolveAppId("com.one.app", "macos")).toBe("com.one.app");
    expect(() => resolveAppId({ ios: "com.puffinplanet.yeollege" }, "android")).toThrow(
      "native.appId names no id for android",
    );
    expect(appIdsOf(appId)).toEqual(["com.yeollege", "com.puffinplanet.yeollege"]);
  });

  test("selects the self-contained html file for a target", () => {
    expect(targetHtmlFilename(target)).toBe("akanjs.html");
    expect(targetHtmlFilename({ ...target, basePath: undefined })).toBe("index.html");
  });

  test("uses the configured native target as the only choice when one target is configured", async () => {
    const app = {
      getConfig: async () => ({
        basePaths: new Set(["akanjs", "soft", "office"]),
        native: { targets: { akanjs: target } },
      }),
    } as unknown as App;

    await expect(getMobileTargetChoices(app)).resolves.toEqual(["akanjs"]);
    await expect(resolveMobileTargets(app, undefined)).resolves.toEqual([{ name: "akanjs", config: target }]);
  });

  test("a target naming no basePath is a template in an app with basePaths, never a page of its own", async () => {
    const template = { ...target, name: "default", basePath: undefined };
    const appWith = (basePaths: string[]) =>
      ({
        name: "angelo",
        getConfig: async () => ({ basePaths: new Set(basePaths), native: { targets: { default: template } } }),
      }) as unknown as App;

    const two = appWith(["soft", "office"]);
    await expect(getMobileTargetChoices(two)).resolves.toEqual(["soft", "office"]);
    await expect(resolveMobileTargets(two, undefined)).rejects.toThrow(
      "Multiple native targets found for angelo. Pass --target <soft|office|all>.",
    );
    await expect(resolveMobileTargets(two, "office")).resolves.toEqual([
      { name: "office", config: { ...template, name: "office", basePath: "office" } },
    ]);
    await expect(resolveMobileTargets(two, "all")).resolves.toEqual([
      { name: "soft", config: { ...template, name: "soft", basePath: "soft" } },
      { name: "office", config: { ...template, name: "office", basePath: "office" } },
    ]);

    const one = appWith(["soft"]);
    const soft = [{ name: "soft", config: { ...template, name: "soft", basePath: "soft" } }];
    await expect(resolveMobileTargets(one, undefined)).resolves.toEqual(soft);
    await expect(resolveMobileTargets(one, "all")).resolves.toEqual(soft);

    await expect(resolveMobileTargets(appWith([]), undefined)).resolves.toEqual([
      { name: "default", config: template },
    ]);
  });

  test("resolves a route base path onto the default native target config", async () => {
    const app = {
      getConfig: async () => ({
        basePaths: new Set(["akanjs", "soft", "office"]),
        native: { targets: { akanjs: target } },
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
