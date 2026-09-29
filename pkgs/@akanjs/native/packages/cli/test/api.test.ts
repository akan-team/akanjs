import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type AkanNativeConfig,
  AkanNativeError,
  API_VERSION,
  build,
  doctor,
  type LogEvent,
  validateConfig,
} from "../src/api.ts";
import { ENV_TYPES_FILE } from "../src/lib/env.ts";
import { prepare, WebInputError } from "../src/lib/prepare.ts";
import { projectFromConfig } from "../src/lib/project.ts";

// docs/api.md: an in-memory config, structured results and errors, the log only in the caller's sink.

const root = mkdtempSync(join(tmpdir(), "akan-native-api-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

function app(name: string, html = "<!doctype html><html><head></head><body>hi</body></html>"): string {
  const dir = join(root, name);
  mkdirSync(join(dir, "web"), { recursive: true });
  writeFileSync(join(dir, "web", "index.html"), html);
  return dir;
}
const config = (extra: Partial<AkanNativeConfig> = {}): AkanNativeConfig => ({
  app: { id: "com.akanjs.apitest", name: "Api Test", version: "1.0.0" },
  web: { dir: "web" },
  ...extra,
});

async function failure(promise: Promise<unknown>): Promise<AkanNativeError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof AkanNativeError) return error;
    throw error;
  }
  throw new Error("expected an AkanNativeError");
}

describe("programmatic API", () => {
  test("a semver version", () => {
    expect(API_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  test("validateConfig lists every problem without building", () => {
    const problems = validateConfig(
      { app: { id: "nope", name: "", version: "x" }, web: {} } as unknown as AkanNativeConfig,
      { appDir: root },
    );
    expect(problems).toEqual(
      expect.arrayContaining([
        expect.stringContaining("app.id"),
        expect.stringContaining("app.name"),
        expect.stringContaining("app.version"),
        expect.stringContaining("web.dir"),
      ]),
    );
    expect(validateConfig(config(), { appDir: app("valid") })).toEqual([]);
  });

  test("validateConfig reports keys the config should not have, with the key it probably meant", () => {
    const wrong = {
      ...config(),
      deeplinks: { schemes: ["x"] },
      native: { android: { activty: ["<intent-filter/>"] } },
      deepLinks: { domains: [{ hosts: "a.example.com" }] },
      icon: "./icon.png",
      splash: { backgroundColor: { light: "#ffffff", drak: "#000000" } },
      somethingElse: 1,
    } as unknown as AkanNativeConfig;
    const problems = validateConfig(wrong, { appDir: app("unknown-keys") });
    expect(problems).toEqual(
      expect.arrayContaining([
        "unknown key deeplinks (did you mean deepLinks?)",
        "unknown key native.android.activty (did you mean native.android.activity?)",
        "unknown key deepLinks.domains[0].hosts (did you mean deepLinks.domains[0].host?)",
        "unknown key splash.backgroundColor.drak (did you mean splash.backgroundColor.dark?)",
        "unknown key somethingElse",
      ]),
    );
    expect(problems.some((p) => p.includes("icon"))).toBe(true); // the file is missing, but a string icon is no unknown key
    expect(problems.filter((p) => p.startsWith("unknown key"))).toHaveLength(5);
    // Values the app fills are not checked for keys.
    const maps = config({
      usageDescriptions: { NSCameraUsageDescription: "x" },
      env: { defaults: { PUBLIC_A: "1" }, platforms: { ios: { PUBLIC_B: "2" } } },
      native: { ios: { infoPlist: { Anything: true } } },
    });
    expect(validateConfig(maps, { appDir: app("maps") })).toEqual([]);
  });

  test("keyboard.resize and ios.hideFormAccessoryBar are checked", () => {
    expect(
      validateConfig(config({ keyboard: { resize: "none" }, ios: { hideFormAccessoryBar: true } }), {
        appDir: app("kb"),
      }),
    ).toEqual([]);
    const problems = validateConfig(
      config({ keyboard: { resize: "pan" as never }, ios: { hideFormAccessoryBar: "yes" as never } }),
      { appDir: app("kb2") },
    );
    expect(problems).toEqual([
      'keyboard.resize must be "resize" or "none" (got "pan")',
      "ios.hideFormAccessoryBar must be a boolean",
    ]);
  });

  test("desktop.recovery, desktop.window and android.autoplay are checked", () => {
    const kiosk = config({
      desktop: { recovery: "reload", window: { fullscreen: true, skipTaskbar: true } },
      android: { autoplay: true },
    });
    expect(validateConfig(kiosk, { appDir: app("kiosk") })).toEqual([]);
    const problems = validateConfig(
      config({
        desktop: { recovery: "always" as never, window: { fullscreen: "yes" as never } },
        android: { autoplay: 1 as never },
      }),
      { appDir: app("kiosk2") },
    );
    expect(problems).toEqual([
      'desktop.recovery must be "errorPage" or "reload" (got "always")',
      "desktop.window.fullscreen must be a boolean",
      "android.autoplay must be a boolean",
    ]);
  });

  test("push.android: channel, small icon and color are checked, then become Firebase's manifest meta-data", async () => {
    const dir = app("push");
    writeFileSync(join(dir, "bell.png"), "png");
    const settings = {
      channel: { id: "orders", name: "Orders", importance: "high" as const, description: "Order updates" },
      smallIcon: "bell.png",
      color: "#1a73e8",
    };
    expect(validateConfig(config({ push: { android: settings } }), { appDir: dir })).toEqual([]);
    const bad = validateConfig(
      config({
        push: {
          android: {
            channel: { id: "a b", name: "", importance: "urgent" as never },
            smallIcon: "none.png",
            color: "blue",
          },
        },
      }),
      { appDir: dir },
    );
    expect(bad).toHaveLength(5);
    const { pushResources } = await import("../src/platforms/android.ts");
    const res = join(root, "push-res");
    const xml = pushResources(res, { push: { android: settings } }, dir);
    expect(xml).toEqual([
      '<meta-data android:name="com.google.firebase.messaging.default_notification_channel_id" android:value="orders" />',
      '<meta-data android:name="com.akanjs.push.channel_name" android:value="Orders" />',
      '<meta-data android:name="com.akanjs.push.channel_importance" android:value="high" />',
      '<meta-data android:name="com.akanjs.push.channel_description" android:value="Order updates" />',
      '<meta-data android:name="com.google.firebase.messaging.default_notification_icon" android:resource="@drawable/akan_native_push_icon" />',
      '<meta-data android:name="com.google.firebase.messaging.default_notification_color" android:resource="@color/akan_native_push_color" />',
    ]);
    expect(existsSync(join(res, "drawable-xxxhdpi", "akan_native_push_icon.png"))).toBe(true);
    expect(pushResources(res, { push: undefined }, dir)).toEqual([]);
  });

  test("the API writes no env type file into the app folder", async () => {
    const dir = app("envtypes");
    await build({
      appDir: dir,
      config: config({ env: { defaults: { PUBLIC_X: "1" } } }),
      platform: "web",
      outDir: join(root, "out-envtypes"),
      envFiles: false,
    });
    expect(existsSync(join(dir, ENV_TYPES_FILE))).toBe(false);
  });

  test("a dev build whose pages come from a dev server needs no index.html in web.dir", async () => {
    const dir = join(root, "devserver");
    mkdirSync(join(dir, "web"), { recursive: true });
    const project = projectFromConfig(config(), dir);
    const outDir = join(root, "out-devserver");
    const ctx = await prepare(project, "android", {
      mode: "development",
      profile: "debug",
      skipWebBuild: true,
      devServer: "http://127.0.0.1:5555",
      outDir,
      api: true,
    });
    expect(ctx.webDir).toBe(`${outDir}.dev-web`);
    expect(ctx.html).toContain("loads its pages from the dev server");
    expect(ctx.html).toContain("/__akan_native/init.js");
    await expect(
      prepare(project, "android", { mode: "development", profile: "debug", skipWebBuild: true, outDir, api: true }),
    ).rejects.toBeInstanceOf(WebInputError);
    await expect(
      prepare(project, "android", {
        mode: "production",
        profile: "release",
        skipWebBuild: true,
        devServer: "http://127.0.0.1:5555",
        outDir,
        api: true,
      }),
    ).rejects.toBeInstanceOf(WebInputError);
  });

  test("doctor: the CLI's checks as data", async () => {
    const report = await doctor({ platforms: ["web"] });
    expect(report.ok).toBe(true);
    expect(report.checks).toContainEqual(
      expect.objectContaining({ group: "Common", name: "Bun", ok: true, warn: false, fixable: false }),
    );
    expect(report.checks.every((c) => typeof c.detail === "string")).toBe(true);
  });

  test("build: in-memory config, chosen outDir, structured result, log only in the sink", async () => {
    const dir = app("web");
    const events: LogEvent[] = [];
    const printed: unknown[] = [];
    const original = console.info;
    console.info = (...args: unknown[]) => printed.push(args);
    try {
      const result = await build({
        appDir: dir,
        config: config(),
        platform: "web",
        outDir: join(root, "out-web"),
        envFiles: false,
        env: { PUBLIC_FROM_API: "1" },
        log: (e) => events.push(e),
      });
      expect(result.platform).toBe("web");
      expect(result.profile).toBe("release");
      expect(result.outDir).toBe(join(root, "out-web"));
      expect(result.artifacts).toEqual([{ kind: "web", path: expect.any(String), signing: "none" }]);
      expect(existsSync(join(root, "out-web", "index.html"))).toBe(true);
    } finally {
      console.info = original;
    }
    expect(printed).toEqual([]);
    expect(events.some((e) => e.level === "info" && e.message.includes("env: 1 keys"))).toBe(true);
    expect(events.every((e) => !e.message.includes("\x1b["))).toBe(true); // no terminal colors in events
  });

  test("the web build's output arrives as tool lines; a failing one is WEB_BUILD_FAILED", async () => {
    const events: LogEvent[] = [];
    const ok = await build({
      appDir: app("webbuild"),
      config: config({ web: { dir: "web", build: "echo built-by-app" } }),
      platform: "web",
      outDir: join(root, "out-wb"),
      log: (e) => events.push(e),
    });
    expect(ok.artifacts).toHaveLength(1);
    expect(events).toContainEqual(
      expect.objectContaining({ level: "tool", tool: "web-build", message: "built-by-app" }),
    );
    const error = await failure(
      build({
        appDir: app("webfail"),
        config: config({ web: { dir: "web", build: "exit 3" } }),
        platform: "web",
        outDir: join(root, "out-wf"),
      }),
    );
    expect(error.code).toBe("WEB_BUILD_FAILED");
  });

  test("error codes: CONFIG_INVALID with the list, WEB_INPUT_INVALID without index.html", async () => {
    const invalid = await failure(
      build({ appDir: root, config: { app: { id: "x" } } as unknown as AkanNativeConfig, platform: "web" }),
    );
    expect(invalid.code).toBe("CONFIG_INVALID");
    expect(invalid.problems?.length).toBeGreaterThan(1);
    const dir = join(root, "empty");
    mkdirSync(join(dir, "web"), { recursive: true });
    const missing = await failure(
      build({ appDir: dir, config: config(), platform: "web", outDir: join(root, "out-empty") }),
    );
    expect(missing.code).toBe("WEB_INPUT_INVALID");
  });

  test("an aborted signal kills the running tool and rejects with CANCELLED", async () => {
    const controller = new AbortController();
    const started = performance.now();
    const pending = build({
      appDir: app("slow"),
      config: config({ web: { dir: "web", build: "sleep 10" } }),
      platform: "web",
      outDir: join(root, "out-slow"),
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(), 150);
    const error = await failure(pending);
    expect(error.code).toBe("CANCELLED");
    expect(performance.now() - started).toBeLessThan(3000);
  });

  test("concurrent calls keep their own logs", async () => {
    const a: LogEvent[] = [];
    const b: LogEvent[] = [];
    await Promise.all([
      build({
        appDir: app("ca"),
        config: config({ web: { dir: "web", build: "echo from-a" } }),
        platform: "web",
        outDir: join(root, "out-ca"),
        log: (e) => a.push(e),
      }),
      build({
        appDir: app("cb"),
        config: config({ web: { dir: "web", build: "echo from-b" } }),
        platform: "web",
        outDir: join(root, "out-cb"),
        log: (e) => b.push(e),
      }),
    ]);
    const tools = (events: LogEvent[]) => events.filter((e) => e.level === "tool").map((e) => e.message);
    expect(tools(a)).toEqual(["from-a"]);
    expect(tools(b)).toEqual(["from-b"]);
  });
});
