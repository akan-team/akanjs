import { afterEach, describe, expect, test } from "bun:test";
import { pluginDecls } from "../../../packages/cli/src/lib/native-plugins.ts";
import { isAkanNativeError } from "../../../packages/core/src/index.ts";
import { installMockHost, type MockHost } from "../../../packages/core/src/testing.ts";
import manifest from "../native-plugin.json";
import { splashScreen } from "../src/index.ts";

let host: MockHost | null = null;

afterEach(() => {
  host?.uninstall();
  host = null;
});

const rejection = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: unknown) => e,
  );

describe("splash-screen", () => {
  test("mobile hosts implement hide natively; macOS uses the web no-op", () => {
    const plugin = { spec: "splash-screen", dir: `${import.meta.dir}/..`, manifest: manifest as never };
    for (const platform of ["ios", "android"] as const) {
      expect(pluginDecls([plugin], platform)).toEqual({ "splash-screen": { methods: ["hide"], events: [] } });
    }
    expect(pluginDecls([plugin], "macos")).toEqual({ "splash-screen": "web" });
  });

  test("native hosts get the fade duration", async () => {
    const seen: unknown[] = [];
    host = installMockHost({
      platform: "ios",
      plugins: { "splash-screen": { methods: { hide: (args) => void seen.push(args) } } },
    });
    await splashScreen.hide({ fadeOutDuration: 0 });
    await splashScreen.hide();
    expect(seen).toEqual([{ fadeOutDuration: 0 }, undefined]);
  });

  test("web and desktop resolve; bad durations are INVALID_ARGS", async () => {
    host = installMockHost({ platform: "web" });
    expect(splashScreen.isSupported("hide")).toBe(true);
    await splashScreen.hide();
    await splashScreen.hide({ fadeOutDuration: 300 });
    for (const bad of [-1, Number.NaN, 20_000, "200"]) {
      expect(
        isAkanNativeError(await rejection(splashScreen.hide({ fadeOutDuration: bad as number })), "INVALID_ARGS"),
      ).toBe(true);
    }
  });
});
