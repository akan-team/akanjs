import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  compareVersions,
  type Download,
  ensureInstalled,
  missingSdkPackages,
  parseJavaMajor,
  parseKotlinVersion,
  resolveBuildTools,
  resolveKotlin,
  rustToolchainFileVersion,
  sdkLicenseAccepted,
  TOOLCHAIN,
} from "../src/lib/toolchains.ts";

const REPO = join(import.meta.dir, "..", "..", "..");
let dirs: string[] = [];
const temp = (prefix = "akan-native-tc-") => {
  const d = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs = [];
});

const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

/** A fake archive: extract() writes <root>/bin/tool into the folder. */
function fakeTool(payload = "hello") {
  const bytes = new TextEncoder().encode(payload);
  const spec: Download = {
    url: "https://example.invalid/tool.zip",
    sha256: sha(bytes),
    size: bytes.length,
    format: "zip",
    root: "tool",
  };
  let downloads = 0;
  const fetch = async () => {
    downloads++;
    await Bun.sleep(30); // slow enough for a second installer to arrive meanwhile
    return new Response(bytes);
  };
  const extract = async (archive: string, dir: string) => {
    expect(readFileSync(archive, "utf8")).toBe(payload);
    mkdirSync(join(dir, "tool", "bin"), { recursive: true });
    writeFileSync(join(dir, "tool", "bin", "tool"), "#!/bin/sh\n");
  };
  return { spec, fetch, extract, downloads: () => downloads };
}

describe("version parsing", () => {
  test("kotlinc, java and dotted versions", () => {
    expect(parseKotlinVersion("info: kotlinc-jvm 2.4.20 (JRE 27)")).toBe("2.4.20");
    expect(parseKotlinVersion("error: no java")).toBeUndefined();
    expect(parseJavaMajor('openjdk version "21.0.11" 2026-04-21')).toBe(21);
    expect(parseJavaMajor('java version "1.8.0_402"')).toBe(8);
    expect(parseJavaMajor("command not found")).toBeUndefined();
    expect(compareVersions("37.0.0", "36.1.0")).toBeGreaterThan(0);
    expect(compareVersions("1.4.2", "1.4.10")).toBeLessThan(0);
    expect(compareVersions("26.5", "26.0")).toBeGreaterThan(0);
  });
});

describe("installing a pinned tool", () => {
  test("download → SHA-256 → extract → atomic rename; a second call reuses it", async () => {
    const env = { AKAN_NATIVE_HOME: temp() };
    const t = fakeTool();
    const dir = await ensureInstalled("tool", "1.0.0", t.spec, {
      fetch: t.fetch,
      extract: t.extract,
      env,
      quiet: true,
    });
    expect(dir).toBe(join(env.AKAN_NATIVE_HOME, "toolchains", "tool", "1.0.0"));
    expect(existsSync(join(dir, "bin", "tool"))).toBe(true);
    await ensureInstalled("tool", "1.0.0", t.spec, { fetch: t.fetch, extract: t.extract, env, quiet: true });
    expect(t.downloads()).toBe(1);
    // No temp folders or lock files left behind.
    expect(readdirSync(join(env.AKAN_NATIVE_HOME, "toolchains", "tool"))).toEqual(["1.0.0"]);
  });

  test("a single-file download (a jar) is installed as <folder>/<root>, without extracting", async () => {
    const env = { AKAN_NATIVE_HOME: temp() };
    const bytes = new TextEncoder().encode("PK fake jar");
    const spec: Download = {
      url: "https://example.invalid/bundletool.jar",
      sha256: sha(bytes),
      size: bytes.length,
      format: "file",
      root: "bundletool.jar",
    };
    const extract = async () => {
      throw new Error("a file download is not extracted");
    };
    const dir = await ensureInstalled("bundletool", "9.9.9", spec, {
      fetch: async () => new Response(bytes),
      extract,
      env,
      quiet: true,
    });
    expect(readFileSync(join(dir, "bundletool.jar"), "utf8")).toBe("PK fake jar");
    expect(readdirSync(join(env.AKAN_NATIVE_HOME, "toolchains", "bundletool"))).toEqual(["9.9.9"]);
  });

  test("checksum mismatch: nothing installed, nothing left behind", async () => {
    const env = { AKAN_NATIVE_HOME: temp() };
    const t = fakeTool();
    const bad = { ...t.spec, sha256: "0".repeat(64) };
    await expect(
      ensureInstalled("tool", "1.0.0", bad, { fetch: t.fetch, extract: t.extract, env, quiet: true }),
    ).rejects.toThrow("checksum mismatch");
    expect(readdirSync(join(env.AKAN_NATIVE_HOME, "toolchains", "tool"))).toEqual([]);
  });

  test("an HTTP error is reported and installs nothing", async () => {
    const env = { AKAN_NATIVE_HOME: temp() };
    const t = fakeTool();
    const fetch = async () => new Response("nope", { status: 404 });
    await expect(
      ensureInstalled("tool", "1.0.0", t.spec, { fetch, extract: t.extract, env, quiet: true }),
    ).rejects.toThrow("HTTP 404");
    expect(existsSync(join(env.AKAN_NATIVE_HOME, "toolchains", "tool", "1.0.0"))).toBe(false);
  });

  test("two builds installing at once download once and both get the same folder", async () => {
    const env = { AKAN_NATIVE_HOME: temp() };
    const t = fakeTool();
    const opts = { fetch: t.fetch, extract: t.extract, env, quiet: true };
    const [a, b, c] = await Promise.all([
      ensureInstalled("tool", "1.0.0", t.spec, opts),
      ensureInstalled("tool", "1.0.0", t.spec, opts),
      ensureInstalled("tool", "1.0.0", t.spec, opts),
    ]);
    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(t.downloads()).toBe(1);
  });

  test("a lock left by a dead process is taken over", async () => {
    const env = { AKAN_NATIVE_HOME: temp() };
    const t = fakeTool();
    const toolDir = join(env.AKAN_NATIVE_HOME, "toolchains", "tool");
    mkdirSync(toolDir, { recursive: true });
    writeFileSync(join(toolDir, "1.0.0.lock"), `999999 ${Date.now()}\n`); // no such pid
    const dir = await ensureInstalled("tool", "1.0.0", t.spec, {
      fetch: t.fetch,
      extract: t.extract,
      env,
      quiet: true,
      lockTimeoutMs: 2000,
    });
    expect(existsSync(dir)).toBe(true);
    expect(existsSync(join(toolDir, "1.0.0.lock"))).toBe(false);
  });

  test("a live lock that never finishes times out with a clear message", async () => {
    const env = { AKAN_NATIVE_HOME: temp() };
    const t = fakeTool();
    const toolDir = join(env.AKAN_NATIVE_HOME, "toolchains", "tool");
    mkdirSync(toolDir, { recursive: true });
    writeFileSync(join(toolDir, "1.0.0.lock"), `${process.pid} ${Date.now()}\n`); // this very process: alive
    await expect(
      ensureInstalled("tool", "1.0.0", t.spec, {
        fetch: t.fetch,
        extract: t.extract,
        env,
        quiet: true,
        lockTimeoutMs: 300,
      }),
    ).rejects.toThrow("another akan-native process is still installing");
    expect(t.downloads()).toBe(0);
  });
});

describe("resolving kotlinc", () => {
  function fakeKotlinHome(root: string, version: string) {
    mkdirSync(join(root, "bin"), { recursive: true });
    mkdirSync(join(root, "lib"), { recursive: true });
    writeFileSync(join(root, "bin", "kotlinc"), "#!/bin/sh\n");
    writeFileSync(join(root, "lib", "kotlin-stdlib.jar"), "jar");
    writeFileSync(join(root, "build.txt"), `${version}-release-123\n`);
    return root;
  }

  test("AKAN_NATIVE_KOTLIN_HOME wins; then the pinned install; no download when installed", async () => {
    const home = temp();
    const override = fakeKotlinHome(join(temp(), "k"), "2.3.0");
    const viaOverride = await resolveKotlin({ env: { AKAN_NATIVE_HOME: home, AKAN_NATIVE_KOTLIN_HOME: override } });
    expect(viaOverride).toMatchObject({
      source: "override",
      version: "2.3.0",
      stdlib: join(override, "lib", "kotlin-stdlib.jar"),
    });

    fakeKotlinHome(join(home, "toolchains", "kotlin", TOOLCHAIN.kotlin.version), TOOLCHAIN.kotlin.version);
    const fetch = async () => {
      throw new Error("must not download");
    };
    const pinned = await resolveKotlin({ env: { AKAN_NATIVE_HOME: home }, fetch });
    expect(pinned).toMatchObject({ source: "akan-native", version: TOOLCHAIN.kotlin.version });
    expect(pinned.warning).toBeUndefined();
  });

  test("not installed + auto-install off + no kotlinc on PATH: a clear error", async () => {
    const path = process.env.PATH;
    process.env.PATH = "/nonexistent";
    try {
      await expect(
        resolveKotlin({ env: { AKAN_NATIVE_HOME: temp(), AKAN_NATIVE_NO_AUTO_INSTALL: "1" } }),
      ).rejects.toThrow("akan-native toolchain install kotlin");
    } finally {
      process.env.PATH = path;
    }
  });

  test("a broken override is an error, not a silent fallback", async () => {
    await expect(
      resolveKotlin({ env: { AKAN_NATIVE_HOME: temp(), AKAN_NATIVE_KOTLIN_HOME: "/nonexistent/kotlin" } }),
    ).rejects.toThrow("AKAN_NATIVE_KOTLIN_HOME");
  });
});

describe("Android SDK pins", () => {
  function fakeSdk(buildTools: string[], platforms: number[] = [TOOLCHAIN.android.compileSdk]) {
    const sdk = temp("akan-native-sdk-");
    for (const v of buildTools) {
      const dir = join(sdk, "build-tools", v);
      mkdirSync(join(dir, "lib"), { recursive: true });
      for (const t of ["aapt2", "d8", "zipalign", "apksigner"]) writeFileSync(join(dir, t), "");
      writeFileSync(join(dir, "lib", "d8.jar"), "");
    }
    for (const p of platforms) {
      mkdirSync(join(sdk, "platforms", `android-${p}`), { recursive: true });
      writeFileSync(join(sdk, "platforms", `android-${p}`, "android.jar"), "");
    }
    return sdk;
  }

  test("pinned build-tools preferred; an older usable one with a warning; too old is not used", () => {
    const pinned = TOOLCHAIN.android.buildTools;
    const chosen = resolveBuildTools(fakeSdk(["35.0.0", pinned]))!;
    expect(chosen.version).toBe(pinned);
    expect(chosen.warning).toBeUndefined();
    const fallback = resolveBuildTools(fakeSdk(["35.0.0", "36.1.0"]))!;
    expect(fallback.version).toBe("36.1.0");
    expect(fallback.warning).toContain(`build-tools;${pinned}`);
    expect(resolveBuildTools(fakeSdk(["34.0.0"]))).toBeNull();
  });

  test("missing pinned packages and license detection", () => {
    const sdk = fakeSdk(["36.1.0"], []);
    expect(missingSdkPackages(sdk)).toEqual([
      `build-tools;${TOOLCHAIN.android.buildTools}`,
      `platforms;android-${TOOLCHAIN.android.compileSdk}`,
    ]);
    expect(sdkLicenseAccepted(sdk)).toBe(false);
    mkdirSync(join(sdk, "licenses"));
    writeFileSync(join(sdk, "licenses", "android-sdk-license"), "\n24333f8a63b6825ea9c5514f83c2829b004d1fee");
    expect(sdkLicenseAccepted(sdk)).toBe(true);
  });
});

describe("pins stay in sync", () => {
  test("rust-toolchain.toml and package.json engines match the manifest", () => {
    expect(rustToolchainFileVersion()).toBe(TOOLCHAIN.rust.version);
    // The package's own package.json (akanjs has no root packageManager; a vendored copy has no package.json).
    const pkg = JSON.parse(readFileSync(join(REPO, "package.json"), "utf8"));
    expect(pkg.engines.bun).toBe(`>=${TOOLCHAIN.bun.min}`);
    expect(compareVersions(TOOLCHAIN.rust.version, "1.85")).toBeGreaterThanOrEqual(0); // wry 0.57 / tao 0.37 MSRV
  });

  test("the kotlinc download is the official JetBrains release asset", () => {
    const d = TOOLCHAIN.kotlin.download;
    expect(d.url).toBe(
      `https://github.com/JetBrains/kotlin/releases/download/v${TOOLCHAIN.kotlin.version}/kotlin-compiler-${TOOLCHAIN.kotlin.version}.zip`,
    );
    expect(d.sha256).toMatch(/^[0-9a-f]{64}$/);
  });
});
