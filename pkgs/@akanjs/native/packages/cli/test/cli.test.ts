import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { INIT_PREFIX, renderInitScript } from "../src/lib/boot.ts";
import { envTypes, loadEnv, parseDotenv, validateEnvConfig, writeEnvTypes } from "../src/lib/env.ts";
import { findExternalScripts, injectInitScript } from "../src/lib/html.ts";
import { routeRequest } from "../src/lib/routes.ts";

describe("parseDotenv", () => {
  test("handles comments, export, quotes and inline comments", () => {
    const parsed = parseDotenv(
      [
        "# comment",
        "PUBLIC_A=1",
        "export PUBLIC_B = two words # trailing",
        `PUBLIC_C="line\\nbreak \\"q\\""`,
        "PUBLIC_D='literal \\n # not a comment'",
        'PUBLIC_E="multi',
        'line"',
        "PUBLIC_F=a#b",
        "not a line",
      ].join("\n"),
    );
    expect(parsed).toEqual({
      PUBLIC_A: "1",
      PUBLIC_B: "two words",
      PUBLIC_C: 'line\nbreak "q"',
      PUBLIC_D: "literal \\n # not a comment",
      PUBLIC_E: "multi\nline",
      PUBLIC_F: "a#b",
    });
  });
});

describe("loadEnv", () => {
  test("defaults < .env < .env.<mode>, PUBLIC_ only", () => {
    const dir = mkdtempSync(join(tmpdir(), "akan-native-env-"));
    writeFileSync(join(dir, ".env"), "PUBLIC_A=env\nPUBLIC_B=env\nSECRET=x\n");
    writeFileSync(join(dir, ".env.production"), "PUBLIC_B=prod\n");
    const result = loadEnv(dir, "production", "web", {
      defaults: { PUBLIC_A: "default", PUBLIC_Z: "default", OTHER: "y" },
      platforms: {},
    });
    expect(result.env).toEqual({ PUBLIC_A: "env", PUBLIC_B: "prod", PUBLIC_Z: "default" });
    expect(result.files).toEqual([".env", ".env.production"]);
    expect(result.dropped).toEqual(["OTHER", "SECRET"]);
  });

  test("platform layers win over the shared ones (ENV-6)", () => {
    const dir = mkdtempSync(join(tmpdir(), "akan-native-env-"));
    writeFileSync(join(dir, ".env"), "PUBLIC_A=env\nPUBLIC_B=env\nPUBLIC_C=env\n");
    writeFileSync(join(dir, ".env.development"), "PUBLIC_A=dev\nPUBLIC_B=dev\nPUBLIC_C=dev\n");
    writeFileSync(join(dir, ".env.android"), "PUBLIC_B=android\n");
    writeFileSync(join(dir, ".env.development.android"), "PUBLIC_C=dev-android\n");
    writeFileSync(join(dir, ".env.production.ios"), "PUBLIC_C=prod-ios\n");
    const config = {
      defaults: { PUBLIC_D: "default" },
      platforms: { android: { PUBLIC_A: "config-android", PUBLIC_B: "config-android", PUBLIC_D: "config-android" } },
    };
    const android = loadEnv(dir, "development", "android", config);
    expect(android.env).toEqual({
      PUBLIC_A: "config-android",
      PUBLIC_B: "android",
      PUBLIC_C: "dev-android",
      PUBLIC_D: "config-android",
    });
    expect(android.files).toEqual([
      ".env",
      ".env.development",
      "akan-native.config (android)",
      ".env.android",
      ".env.development.android",
    ]);
    expect(android.sources.PUBLIC_C).toEqual([".env", ".env.development", ".env.development.android"]);
    // Other platforms and modes never see them.
    expect(loadEnv(dir, "development", "ios", config).env).toEqual({
      PUBLIC_A: "dev",
      PUBLIC_B: "dev",
      PUBLIC_C: "dev",
      PUBLIC_D: "default",
    });
    expect(() => loadEnv(dir, "android", "web", config)).toThrow("platform name");
  });

  test("validates env in akan-native.config.ts", () => {
    const problems: string[] = [];
    expect(validateEnvConfig({ defaults: { PUBLIC_N: 3 }, platforms: { ios: { PUBLIC_X: "x" } } }, problems)).toEqual({
      defaults: { PUBLIC_N: "3" },
      platforms: { ios: { PUBLIC_X: "x" } },
    });
    expect(problems).toEqual([]);
    validateEnvConfig({ platforms: { tvos: {}, android: { PUBLIC_O: { a: 1 } } }, extra: 1 }, problems);
    expect(problems).toEqual([
      "env.extra is not supported (use defaults, platforms)",
      "env.platforms.tvos: unknown platform (use web, macos, windows, linux, ios, android)",
      "env.platforms.android.PUBLIC_O must be a string",
    ]);
  });
});

describe("env types (ENV-7)", () => {
  test("keys every mode and target gets are required, the rest optional; no values", () => {
    const dir = mkdtempSync(join(tmpdir(), "akan-native-env-"));
    writeFileSync(join(dir, ".env"), "PUBLIC_API=https://secret-looking.example\nSECRET=x\n");
    writeFileSync(join(dir, ".env.staging"), "PUBLIC_STAGE=1\n");
    writeFileSync(join(dir, ".env.development.android"), "PUBLIC_HOST=10.0.2.2\n");
    const text = envTypes(dir, { defaults: { PUBLIC_NAME: "n" }, platforms: { ios: { PUBLIC_STORE: "apple" } } });
    expect(text).toContain('declare module "@akanjs/native/core" {\n  interface AkanNativeEnv {');
    expect(text).toContain("    /** .env */\n    readonly PUBLIC_API: string;");
    expect(text).toContain("    /** akan-native.config */\n    readonly PUBLIC_NAME: string;");
    expect(text).toContain(
      "    /** .env.development.android (not in every mode and platform) */\n    readonly PUBLIC_HOST?: string;",
    );
    expect(text).toContain("readonly PUBLIC_STAGE?: string;");
    expect(text).toContain(
      "    /** akan-native.config (ios) (not in every mode and platform) */\n    readonly PUBLIC_STORE?: string;",
    );
    expect(text).not.toContain("SECRET");
    expect(text).not.toContain("secret-looking");
    // Written only for TypeScript projects, and only when it changes.
    expect(writeEnvTypes(dir, { defaults: {}, platforms: {} })).toBe(false);
    writeFileSync(join(dir, "tsconfig.json"), "{}");
    expect(writeEnvTypes(dir, { defaults: {}, platforms: {} })).toBe(true);
    expect(writeEnvTypes(dir, { defaults: {}, platforms: {} })).toBe(false);
    expect(readFileSync(join(dir, "akan-native-env.d.ts"), "utf8")).toContain("readonly PUBLIC_API: string;");
  });
});

describe("injectInitScript", () => {
  test("becomes the first element of <head>", () => {
    expect(injectInitScript('<!doctype html><html><head lang="x"><title>t</title></head></html>')).toBe(
      '<!doctype html><html><head lang="x"><script src="/__akan_native/init.js"></script><title>t</title></head></html>',
    );
  });
  test("creates a head when missing and honours the base path", () => {
    expect(injectInitScript("<html><body></body></html>", "/app")).toBe(
      '<html><head><script src="/app/__akan_native/init.js"></script></head><body></body></html>',
    );
  });
  test("is idempotent, but ignores mentions in inlined text", () => {
    const once = injectInitScript("<head></head>");
    expect(injectInitScript(once)).toBe(once);
    expect(injectInitScript('<head></head><script>"see /__akan_native/init.js"</script>')).toContain(
      '<head><script src="/__akan_native/init.js">',
    );
  });
  test("finds external scripts", () => {
    expect(
      findExternalScripts(
        '<script src="/__akan_native/init.js"></script><script type=module src=./a.js></script><script>1</script>',
      ),
    ).toEqual(["./a.js"]);
  });
});

describe("routeRequest", () => {
  const files = new Set(["index.html", "logo.svg", "img/a b.png"]);
  const route = (p: string) => routeRequest(p, (rel) => files.has(rel));
  test.each([
    ["/", { kind: "asset", path: "index.html" }],
    ["/logo.svg", { kind: "asset", path: "logo.svg" }],
    ["/img/a%20b.png", { kind: "asset", path: "img/a b.png" }],
    ["/hooks", { kind: "asset", path: "index.html" }],
    ["/about/deep/link", { kind: "asset", path: "index.html" }],
    ["/missing.png", { kind: "not-found" }],
    ["/__akan_native/init.js", { kind: "init" }],
    ["/__akan_native/ipc", { kind: "ipc" }],
    ["/__akan_native/file/abc_1.jpg", { kind: "file", id: "abc_1.jpg" }],
    ["/__akan_native/file/../x", { kind: "not-found" }],
    ["/__akan_native/other", { kind: "not-found" }],
    ["/../etc/passwd", { kind: "not-found" }],
    ["/%2e%2e/etc/passwd", { kind: "not-found" }],
    ["/%E0%A4%A", { kind: "not-found" }],
  ])("%s", (path, expected) => {
    expect(route(path)).toEqual(expected as never);
  });

  // Windows: app_dir.join("C:/…") drops the app folder. A ":" path is never looked up, even when
  // `exists` would say yes; without an extension it is still an SPA route.
  test.each([
    ["/C:/Users/u/.ssh/id_rsa", { kind: "asset", path: "index.html" }],
    ["/%43%3A/Users/u/key.pem", { kind: "not-found" }],
    ["/C:key.pem", { kind: "not-found" }],
    ["/notes.txt:secret", { kind: "not-found" }],
    ["/at/12:30", { kind: "asset", path: "index.html" }],
  ])("never looks up %s", (path, expected) => {
    expect(routeRequest(path, () => true)).toEqual(expected as never);
  });
});

describe("init script", () => {
  test("hosts can build it by concatenation and it evaluates to the boot object", () => {
    const script = renderInitScript('{"v":1,"platform":"ios"}', '{"PUBLIC_X":"1"}');
    expect(script.startsWith(INIT_PREFIX)).toBe(true);
    const window: Record<string, any> = { __AKAN_NATIVE__: { early: true } };
    new Function("window", script)(window);
    expect(window.__AKAN_NATIVE__).toEqual({ early: true, v: 1, platform: "ios", env: { PUBLIC_X: "1" } });
  });
});

describe("toPlist", () => {
  test("writes a valid plist that plutil accepts", async () => {
    const { toPlist } = await import("../src/lib/plist.ts");
    const text = toPlist({
      CFBundleName: "A & <B>",
      LSRequiresIPhoneOS: true,
      UIDeviceFamily: [1, 2],
      Nested: { Empty: {}, List: [], Skip: undefined },
    });
    const dir = mkdtempSync(join(tmpdir(), "akan-native-plist-"));
    writeFileSync(join(dir, "Info.plist"), text);
    const lint = Bun.spawnSync(["plutil", "-convert", "json", "-o", "-", join(dir, "Info.plist")]);
    expect(lint.exitCode).toBe(0);
    expect(JSON.parse(lint.stdout.toString())).toEqual({
      CFBundleName: "A & <B>",
      LSRequiresIPhoneOS: true,
      UIDeviceFamily: [1, 2],
      Nested: { Empty: {}, List: [] },
    });
  });
});

describe("native plugin inputs", async () => {
  const { resolvePlugins } = await import("../src/lib/project.ts");
  const np = await import("../src/lib/native-plugins.ts");
  const sample = join(import.meta.dir, "../../../examples/sample");
  const plugins = resolvePlugins(sample, ["app-state", "preferences", "keyboard", "camera"]);

  test("boot declarations per platform", () => {
    expect(np.pluginDecls(plugins, "macos")).toEqual({
      "app-state": "web",
      preferences: { methods: ["get", "set", "remove", "keys", "clear"], events: [] },
      camera: { methods: ["checkPermission", "requestPermission"], events: [], web: true },
    });
    expect(Object.keys(np.pluginDecls(plugins, "ios"))).toEqual(["app-state", "preferences", "keyboard", "camera"]);
  });

  test("registries list native classes", () => {
    const swift = np.swiftRegistry(np.iosPlugins(plugins));
    expect(swift).toContain('("preferences", PreferencesPlugin.self),');
    const kotlin = np.kotlinRegistry(np.androidPlugins(plugins), 29, 36);
    expect(kotlin).toContain('"app-state" to { ctx -> com.akanjs.plugins.appstate.AppStatePlugin(ctx) },');
    expect(np.iosPlugins(plugins)[0]!.sources[0]).toEndWith("plugins/app-state/ios/AppStatePlugin.swift");
  });

  test("a plugin above the app's minSdk is created only from its level, UNSUPPORTED below", () => {
    const sqlite = {
      spec: "s",
      dir: `${import.meta.dir}/../../../plugins/sqlite`,
      manifest: {
        id: "sqlite",
        apiVersion: 1 as const,
        methods: ["open"],
        events: [],
        android: { sources: ["android/*.kt"], class: "com.akanjs.plugins.sqlite.SqlitePlugin", minSdk: 35 },
      },
    };
    const kotlin = np.kotlinRegistry(np.androidPlugins([sqlite]), 29, 36);
    expect(kotlin).toContain(
      '"sqlite" to { ctx -> if (android.os.Build.VERSION.SDK_INT >= 35) com.akanjs.plugins.sqlite.SqlitePlugin(ctx) else com.akanjs.runtime.AkanNativeUnsupportedPlugin("sqlite needs Android API 35 or later") },',
    );
    // at or below the app's level: created as usual
    expect(np.kotlinRegistry(np.androidPlugins([sqlite]), 35, 36)).toContain(
      '"sqlite" to { ctx -> com.akanjs.plugins.sqlite.SqlitePlugin(ctx) },',
    );
    const tooNew = { ...sqlite, manifest: { ...sqlite.manifest, android: { ...sqlite.manifest.android, minSdk: 40 } } };
    expect(() => np.kotlinRegistry(np.androidPlugins([tooNew]), 29, 36)).toThrow(
      /minSdk must be an API level up to 36/,
    );
  });
});

describe("desktop manifest subsets", async () => {
  const np = await import("../src/lib/native-plugins.ts");
  test("an object desktop entry declares only its methods", () => {
    const decls = np.pluginDecls(
      [
        {
          spec: "x",
          dir: "/tmp",
          manifest: {
            id: "x",
            apiVersion: 1,
            methods: ["open", "close"],
            events: ["finished"],
            desktop: { module: "./d.ts", methods: ["open"] },
          },
        },
      ],
      "macos",
    );
    expect(decls).toEqual({ x: { methods: ["open"], events: ["finished"] } });
  });

  test("web: true lets the unlisted methods fall back to the web implementation (only with a web entry)", () => {
    const manifest = {
      id: "x",
      apiVersion: 1 as const,
      methods: ["a", "b"],
      events: [],
      desktop: { module: "./d.ts", methods: ["a"], web: true },
    };
    expect(np.pluginDecls([{ spec: "x", dir: "/tmp", manifest: { ...manifest, web: "./w.ts" } }], "macos")).toEqual({
      x: { methods: ["a"], events: [], web: true },
    });
    expect(np.pluginDecls([{ spec: "x", dir: "/tmp", manifest }], "macos")).toEqual({
      x: { methods: ["a"], events: [] },
    });
  });
});

describe("desktop executables", () => {
  // Bun's standalone executables read .env and bunfig.toml from the folder they start in unless
  // told not to: a .env next to the app could point it at another native library.
  test("ignore a .env and a bunfig.toml in their working folder", async () => {
    const { COMPILE_FLAGS } = await import("../src/platforms/desktop.ts");
    const dir = mkdtempSync(join(tmpdir(), "akan-native-compile-"));
    writeFileSync(
      join(dir, "entry.ts"),
      "console.log(JSON.stringify({ secret: process.env.AKAN_NATIVE_SELFTEST_DOTENV ?? null }));\n",
    );
    const exe = join(dir, process.platform === "win32" ? "app.exe" : "app");
    const built = Bun.spawnSync(
      [process.execPath, "build", "--compile", ...COMPILE_FLAGS, join(dir, "entry.ts"), "--outfile", exe],
      { stdout: "pipe", stderr: "pipe" },
    );
    expect(built.exitCode, built.stderr.toString()).toBe(0);
    const cwd = join(dir, "cwd");
    mkdirSync(cwd);
    writeFileSync(join(cwd, ".env"), "AKAN_NATIVE_SELFTEST_DOTENV=from-dotenv\n");
    writeFileSync(join(cwd, "bunfig.toml"), 'preload = ["./missing-preload.ts"]\n');
    const run = Bun.spawnSync([exe], { cwd, stdout: "pipe", stderr: "pipe", env: { PATH: process.env.PATH ?? "" } });
    expect(run.stderr.toString()).toBe("");
    expect(JSON.parse(run.stdout.toString())).toEqual({ secret: null });
  }, 60_000);
});

describe("desktop plugin modules", () => {
  // The host answers NOT_FOUND for a declared method or event the module lacks: caught at build time.
  test("are checked against their manifest", async () => {
    const { desktopModuleProblems } = await import("../src/lib/native-plugins.ts");
    const dir = mkdtempSync(join(tmpdir(), "akan-native-desktop-module-"));
    writeFileSync(
      join(dir, "desktop.ts"),
      'export default { id: "demo", methods: { ping() {}, extra() {} }, events: { tick: () => () => {} } };\n',
    );
    const manifest = {
      id: "demo",
      apiVersion: 1,
      methods: ["ping", "pong"],
      events: ["tick", "tock"],
      desktop: "./desktop.ts",
    } as never;
    const problems = await desktopModuleProblems({ spec: "demo", dir, manifest });
    expect(problems.map((p) => p.replace(/^demo \(desktop.ts\): /, ""))).toEqual([
      expect.stringContaining("no method pong"),
      expect.stringContaining("method extra is not among"),
      expect.stringContaining("no source for event tock"),
    ]);
    // A desktop subset narrows what the page is told.
    const subset = {
      ...(manifest as object),
      methods: ["ping", "pong", "extra"],
      desktop: { module: "./desktop.ts", methods: ["ping", "extra"], events: ["tick"] },
    } as never;
    expect(await desktopModuleProblems({ spec: "demo", dir, manifest: subset })).toEqual([]);
  });

  test("of the first-party plugins match", async () => {
    const { desktopModuleProblems } = await import("../src/lib/native-plugins.ts");
    const { loadProject } = await import("../src/lib/project.ts");
    const project = await loadProject(join(import.meta.dir, "../../../examples/sample"));
    expect((await Promise.all(project.plugins.map(desktopModuleProblems))).flat()).toEqual([]);
  });
});

describe("command flags", () => {
  test("unknown flags are errors, not ignored", async () => {
    const { checkFlags, parseArgs } = await import("../src/lib/args.ts");
    const args = parseArgs(["macos", "--relase", "--mode", "staging"], ["relase"]);
    expect(() => checkFlags(args, ["mode", "release"], "akan-native build")).toThrow("unknown flag --relase");
    expect(() =>
      checkFlags(parseArgs(["macos", "--release"], ["release"]), ["mode", "release"], "akan-native build"),
    ).not.toThrow();
  });
});

// N7: a manifest cannot name files outside its plugin's folder (a relative "..", an absolute path,
// or a symbolic link out of it).
describe("plugin files stay in the plugin", async () => {
  const { pluginFile } = await import("../src/lib/native-plugins.ts");
  const { symlinkSync } = await import("node:fs");
  const root = mkdtempSync(join(tmpdir(), "akan-native-pf-"));
  const dir = join(root, "p");
  mkdirSync(join(dir, "ios"), { recursive: true });
  writeFileSync(join(dir, "ios", "A.swift"), "");
  writeFileSync(join(root, "Outside.swift"), "");
  symlinkSync(join(root, "Outside.swift"), join(dir, "ios", "Link.swift"));
  const plugin = { spec: "p", dir, manifest: { id: "p" } } as never;
  test.each([
    ["ios/A.swift", null],
    ["../Outside.swift", "must be a path inside"],
    [join(root, "Outside.swift"), "must be a path inside"],
    ["ios/Link.swift", "leads outside"],
    ["ios/Missing.swift", "not found"],
  ])("%s", (path, error) => {
    if (error === null) expect(pluginFile(plugin, path, "source")).toBe(join(dir, "ios", "A.swift"));
    else expect(() => pluginFile(plugin, path, "source")).toThrow(error);
  });
});
