import { afterAll, describe, expect, test } from "bun:test";
import { generateKeyPairSync, sign } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type AkanNativeConfig,
  AkanNativeError,
  API_VERSION,
  build,
  checkPublishUpdate,
  compareBundles,
  doctor,
  type LogEvent,
  packUpdate,
  publishUpdate,
  updateKeygen,
  validateConfig,
} from "../src/api.ts";
import { ENV_TYPES_FILE } from "../src/lib/env.ts";
import { prepare, WebInputError } from "../src/lib/prepare.ts";
import { projectFromConfig } from "../src/lib/project.ts";
import { verifyManifest } from "../src/lib/updates.ts";

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

  test("updateKeygen makes the update key once and reads it after; publishUpdate needs updates first", async () => {
    const previous = process.env.AKAN_NATIVE_UPDATE_KEY;
    process.env.AKAN_NATIVE_UPDATE_KEY = join(root, "keys", "apitest.update.key");
    try {
      const made = updateKeygen({ config: config() });
      expect(made).toMatchObject({ created: true, keyPath: process.env.AKAN_NATIVE_UPDATE_KEY });
      expect(Buffer.from(made.publicKey, "base64")).toHaveLength(32);
      expect(updateKeygen({ config: config() })).toEqual({ ...made, created: false });
    } finally {
      if (previous === undefined) delete process.env.AKAN_NATIVE_UPDATE_KEY;
      else process.env.AKAN_NATIVE_UPDATE_KEY = previous;
    }
    const refused = await failure(publishUpdate({ appDir: app("publish"), config: config(), platform: "android" }));
    expect(refused.code).toBe("CONFIG_INVALID");
    const updates = { url: "https://updates.example.com", publicKey: Buffer.alloc(32, 1).toString("base64") };
    const outside = await failure(
      publishUpdate({ appDir: app("publish2"), config: config({ updates }), platform: "android", channel: "../x" }),
    );
    expect(outside.code).toBe("CONFIG_INVALID");
    expect(outside.message).toContain('channel "../x"');
    process.env.AKAN_NATIVE_UPDATE_KEY = join(root, "keys", "missing.update.key");
    try {
      const unsigned = await failure(
        publishUpdate({ appDir: app("publish3"), config: config({ updates }), platform: "android" }),
      );
      expect(unsigned.code).toBe("CONFIG_INVALID");
      expect(unsigned.message).toContain("no update signing key");
    } finally {
      if (previous === undefined) delete process.env.AKAN_NATIVE_UPDATE_KEY;
      else process.env.AKAN_NATIVE_UPDATE_KEY = previous;
    }
  });

  test("checkPublishUpdate refuses without building what publishUpdate would, a server change of the channel too", () => {
    const previous = process.env.AKAN_NATIVE_UPDATE_KEY;
    process.env.AKAN_NATIVE_UPDATE_KEY = join(root, "keys", "check.update.key");
    try {
      const { publicKey } = updateKeygen({ config: config() });
      const updates = { url: "https://updates.example.com", publicKey };
      const out = join(root, "check-out");
      const releases = join(out, `linux-${process.arch}`);
      mkdirSync(releases, { recursive: true });
      writeFileSync(join(releases, "production.json"), JSON.stringify({ bundle: "1.0.0-1", server: true }));
      const check = (options: { server?: boolean; channel?: string } = {}) =>
        checkPublishUpdate({ appDir: app("check"), config: config({ updates }), platform: "linux", out, ...options });
      expect(check({ server: true })).toEqual({ channel: "production", out });
      expect(() => check()).toThrow("carries a server and this build does not");
      expect(check({ channel: "pilot" })).toEqual({ channel: "pilot", out });
      expect(() => checkPublishUpdate({ appDir: app("check"), config: config(), platform: "linux" })).toThrow(
        "the config has no updates",
      );
    } finally {
      if (previous === undefined) delete process.env.AKAN_NATIVE_UPDATE_KEY;
      else process.env.AKAN_NATIVE_UPDATE_KEY = previous;
    }
  });

  test("desktop.recovery, desktop.window, desktop.screenCapture and android.autoplay are checked", () => {
    const kiosk = config({
      desktop: { recovery: "reload", window: { fullscreen: true, skipTaskbar: true }, screenCapture: "auto" },
      android: { autoplay: true },
    });
    expect(validateConfig(kiosk, { appDir: app("kiosk") })).toEqual([]);
    const problems = validateConfig(
      config({
        desktop: {
          recovery: "always" as never,
          window: { fullscreen: "yes" as never },
          screenCapture: "silent" as never,
        },
        android: { autoplay: 1 as never },
      }),
      { appDir: app("kiosk2") },
    );
    expect(problems).toEqual([
      'desktop.recovery must be "errorPage" or "reload" (got "always")',
      "desktop.window.fullscreen must be a boolean",
      'desktop.screenCapture must be "picker" or "auto" (got "silent")',
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

  test("packUpdate writes an unsigned manifest template, its files and bundle.json, and a signer completes it", async () => {
    const dir = app("pack", "<!doctype html><html><head></head><body>v2</body></html>");
    writeFileSync(join(dir, "web", "app.js"), "console.info('v2')");
    const publicKey = Buffer.alloc(32, 7).toString("base64");
    const out = join(dir, "pack-out");
    const { manifest } = await packUpdate({
      appDir: dir,
      config: config({ updates: { url: "https://updates.example.com/app", publicKey } }),
      platform: "android",
      out,
      log: () => {},
    });
    const template = JSON.parse(readFileSync(join(out, "manifest.template.json"), "utf8"));
    expect(template).toEqual(manifest);
    expect(template).toMatchObject({ schema: 1, kind: "web", app: "com.akanjs.apitest", platform: "android" });
    expect([template.channel, template.sequence, template.bundle]).toEqual(["", 0, ""]);
    expect(template.nativeApi).toBe(JSON.parse(readFileSync(join(out, "bundle.json"), "utf8")).nativeApi.hash);
    const paths = template.files.map((file: { path: string }) => file.path);
    expect(paths).toEqual(expect.arrayContaining(["index.html", "app.js", "env.runtime.json"]));
    for (const file of template.files as { sha256: string; size: number }[])
      expect(readFileSync(join(out, "files", file.sha256)).length).toBe(file.size);

    //? The contract a signer follows: fill the three fields, sign exactly the bytes it uploads.
    const { privateKey, publicKey: spki } = generateKeyPairSync("ed25519");
    const raw = spki.export({ format: "der", type: "spki" }).subarray(12).toString("base64");
    const bytes = new TextEncoder().encode(
      `${JSON.stringify({ ...template, channel: "main", sequence: 1_790_700_000, bundle: "1790700000-a1b2c3d4" }, null, 2)}\n`,
    );
    expect(verifyManifest(bytes, sign(null, bytes, privateKey).toString("base64"), raw)).toBe(true);
    expect(compareBundles(join(out, "bundle.json"), join(out, "bundle.json"))).toEqual({
      compatible: true,
      problems: [],
    });
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
