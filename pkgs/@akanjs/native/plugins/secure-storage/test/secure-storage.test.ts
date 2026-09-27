import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pluginDecls } from "../../../packages/cli/src/lib/native-plugins.ts";
import { isAkanNativeError } from "../../../packages/core/src/index.ts";
import { installMockHost, type MockHost } from "../../../packages/core/src/testing.ts";
import type { DesktopContext } from "../../../packages/desktop/src/plugin.ts";
import manifest from "../native-plugin.json";
import { createDesktopSecureStorage, decrypt, encrypt, quoteForSecurity } from "../src/desktop.ts";
import { secureStorage } from "../src/index.ts";

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
const METHODS = ["get", "set", "remove", "keys", "clear"];

describe("routing", () => {
  test("native hosts get the calls with their arguments", async () => {
    const store = new Map<string, string>();
    host = installMockHost({
      platform: "android",
      plugins: {
        "secure-storage": {
          methods: {
            get: ({ key }) => ({ value: store.get(key) ?? null }),
            set: ({ key, value }) => void store.set(key, value),
            remove: ({ key }) => void store.delete(key),
            keys: () => ({ keys: [...store.keys()].sort() }),
            clear: () => store.clear(),
          },
        },
      },
    });
    expect(secureStorage.implementation("get")).toBe("native");
    await secureStorage.set({ key: "token", value: "s3cr3t ✓" });
    expect(await secureStorage.get({ key: "token" })).toEqual({ value: "s3cr3t ✓" });
    expect(await secureStorage.keys()).toEqual({ keys: ["token"] });
    await secureStorage.remove({ key: "token" });
    expect(await secureStorage.get({ key: "token" })).toEqual({ value: null });
    await secureStorage.clear();
    expect(host.requests.map((r) => r.method)).toEqual(["set", "get", "keys", "remove", "get", "clear"]);
    expect(host.requests[0]!.args).toEqual({ key: "token", value: "s3cr3t ✓" });
  });

  test("the web has no secret store: every method rejects UNSUPPORTED", async () => {
    host = installMockHost({ platform: "web" });
    for (const method of METHODS) expect(secureStorage.isSupported(method as never)).toBe(false);
    expect(isAkanNativeError(await rejection(secureStorage.set({ key: "a", value: "b" })), "UNSUPPORTED")).toBe(true);
    expect(isAkanNativeError(await rejection(secureStorage.get({ key: "a" })), "UNSUPPORTED")).toBe(true);
  });

  test("manifest: native on macOS (desktop.ts), iOS and Android, nothing on the web", () => {
    const plugin = { spec: "secure-storage", dir: `${import.meta.dir}/..`, manifest: manifest as never };
    for (const platform of ["macos", "ios", "android"] as const) {
      expect(pluginDecls([plugin], platform)).toEqual({ "secure-storage": { methods: METHODS, events: [] } });
    }
    expect(manifest.web).toBeNull();
  });
});

describe("desktop encryption", () => {
  const key = randomBytes(32);

  test("round trip, fresh IV per value, bound to the key name", () => {
    const a = encrypt(key, "token", "한글 é 😀");
    const b = encrypt(key, "token", "한글 é 😀");
    expect(a).not.toBe(b);
    expect(decrypt(key, "token", a)).toBe("한글 é 😀");
    expect(decrypt(key, "other", a)).toBeNull(); // entries swapped in the file
    expect(decrypt(randomBytes(32), "token", a)).toBeNull(); // the key was replaced
    expect(decrypt(key, "token", `${a.slice(0, -4)}AAAA`)).toBeNull(); // damaged
    expect(decrypt(key, "token", "")).toBeNull();
    expect(decrypt(key, "token", encrypt(key, "token", ""))).toBe("");
  });

  test("words for security -i", () => {
    expect(quoteForSecurity("com.akanjs.sample.akan-native.secure-storage")).toBe(
      '"com.akanjs.sample.akan-native.secure-storage"',
    );
    expect(quoteForSecurity('My "App" \\ 1')).toBe('"My \\"App\\" \\\\ 1"');
    expect(quoteForSecurity("two\nlines")).toBe('"two lines"');
  });
});

describe("desktop", () => {
  // A unique Keychain service per run; afterAll deletes it.
  const service = `com.akanjs.test.${process.pid}.${Date.now()}.secure-storage`;
  const dir = mkdtempSync(join(tmpdir(), "akan-native-secure-storage-"));
  const file = join(dir, "secure-storage.json");
  const ctx = {
    app: { id: "com.akanjs.test", name: "AkanNative Test", version: "0.0.0" },
    appDataDir: dir,
  } as unknown as DesktopContext;
  const make = () => createDesktopSecureStorage({ service: () => service, file: () => file });
  const deleteKeychainItem = () =>
    Bun.spawnSync(["/usr/bin/security", "delete-generic-password", "-s", service], {
      stdout: "ignore",
      stderr: "ignore",
    });

  afterAll(() => {
    if (process.platform === "darwin") deleteKeychainItem();
    rmSync(dir, { recursive: true, force: true });
  });

  test("validates arguments before touching the Keychain", async () => {
    const plugin = make();
    const call = (fn: () => unknown) => rejection(Promise.resolve().then(fn));
    expect(isAkanNativeError(await call(() => plugin.methods.get!({ key: "" }, ctx)), "INVALID_ARGS")).toBe(true);
    expect(
      isAkanNativeError(await call(() => plugin.methods.set!({ key: "k", value: 1 as never }, ctx)), "INVALID_ARGS"),
    ).toBe(true);
    expect(isAkanNativeError(await call(() => plugin.methods.remove!(undefined as never, ctx)), "INVALID_ARGS")).toBe(
      true,
    );
  });

  test.skipIf(process.platform !== "darwin")("round trip through the login Keychain, key loss, clear", async () => {
    const plugin = make();
    const m = plugin.methods;
    expect(await m.get!({ key: "missing" }, ctx)).toEqual({ value: null });
    expect(await m.keys!(undefined, ctx)).toEqual({ keys: [] });

    const long = `${"x".repeat(100_000)} end`; // far beyond what security(1) can carry per line
    await Promise.all([
      m.set!({ key: "token", value: "한글 é 😀\nline 2" }, ctx),
      m.set!({ key: "big", value: long }, ctx),
    ]);
    await m.set!({ key: 'we"ird \\ key', value: "" }, ctx);
    expect(await m.get!({ key: "token" }, ctx)).toEqual({ value: "한글 é 😀\nline 2" });
    expect((await m.get!({ key: "big" }, ctx)).value).toBe(long);
    expect(await m.get!({ key: 'we"ird \\ key' }, ctx)).toEqual({ value: "" });
    expect(await m.keys!(undefined, ctx)).toEqual({ keys: ["big", "token", 'we"ird \\ key'] });
    expect(readFileSync(file, "utf8")).not.toContain("line 2"); // encrypted at rest

    // One Keychain item holds the data key, as 64 hex characters.
    const found = Bun.spawnSync(["/usr/bin/security", "find-generic-password", "-s", service, "-a", "data-key", "-w"]);
    expect(found.exitCode).toBe(0);
    expect(found.stdout.toString().trim()).toMatch(/^[0-9a-f]{64}$/);

    // A new session (no cached key) reads the same values.
    expect(await make().methods.get!({ key: "token" }, ctx)).toEqual({ value: "한글 é 😀\nline 2" });

    await m.remove!({ key: "big" }, ctx);
    expect(await m.get!({ key: "big" }, ctx)).toEqual({ value: null });

    // An entry written with another key (the file came from another Mac) reads as null and is dropped.
    const data = JSON.parse(readFileSync(file, "utf8"));
    data.entries.foreign = encrypt(randomBytes(32), "foreign", "not yours");
    writeFileSync(file, JSON.stringify(data));
    const fresh = make();
    expect(await fresh.methods.get!({ key: "foreign" }, ctx)).toEqual({ value: null });
    expect(await fresh.methods.keys!(undefined, ctx)).toEqual({ keys: ["token", 'we"ird \\ key'] });

    // The Keychain item is deleted: nothing can be read, and the next set() starts over.
    expect(deleteKeychainItem().exitCode).toBe(0);
    const afterLoss = make();
    expect(await afterLoss.methods.get!({ key: "token" }, ctx)).toEqual({ value: null });
    await afterLoss.methods.set!({ key: "new", value: "v2" }, ctx);
    expect(await afterLoss.methods.keys!(undefined, ctx)).toEqual({ keys: ["new"] });

    await afterLoss.methods.clear!(undefined, ctx);
    expect(await afterLoss.methods.keys!(undefined, ctx)).toEqual({ keys: [] });
    expect(await make().methods.get!({ key: "new" }, ctx)).toEqual({ value: null });
  });
});
