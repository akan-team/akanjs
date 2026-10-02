// Pinned toolchains (requirements CLI-10). One place says which version of every tool akan-native builds
// with, where it comes from, and what akan-native may install by itself:
// - kotlinc: installed by akan-native into ~/.akan/native/toolchains (Apache-2.0, a platform-independent zip),
//   automatically on first use unless AKAN_NATIVE_NO_AUTO_INSTALL=1. kotlin-stdlib comes from the same
//   distribution, so the compiler and the runtime it targets always match.
// - JDK: never downloaded automatically (about 200 MB). `akan-native toolchain install jdk` installs the
//   pinned Temurin build on request; otherwise JAVA_HOME, Android Studio's JBR or a system JDK.
// - Android SDK components: pinned versions, installed only through the user's own sdkmanager and
//   only after the user accepted the SDK licenses themselves (akan-native never accepts them).
// - Rust: pinned by native/desktop/rust-toolchain.toml (rustup installs it on demand).
// - Bun, Xcode: checked by `akan-native doctor`; neither can be installed from here.
//
// Know-how taken from: the Gradle wrapper (pinned distribution + SHA-256, one download per version
// guarded by a lock, atomic install; React Native pins Gradle this way in gradle-wrapper.properties)
// and dioxus-cli bundler/tools.rs (URL + hash constants, a "no downloads" switch, tools resolved
// before the build starts).

import { createHash, randomBytes } from "node:crypto";
import {
  closeSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { CliError, dim, log, ToolchainError } from "./log.ts";
import { PACKAGE_ROOT } from "./root.ts";

// ------------------------------------------------------------------ the manifest

export interface Download {
  url: string;
  sha256: string;
  /** Bytes, for progress and a sanity check. */
  size: number;
  /** "file": a single file (a jar), installed as <install folder>/<root>. */
  format: "zip" | "tar.gz" | "file";
  /** The archive's top folder, which becomes the install folder; for "file" the file's name in it. */
  root: string;
}

export const TOOLCHAIN = {
  kotlin: {
    version: "2.4.20",
    license: "Apache-2.0",
    download: {
      url: "https://github.com/JetBrains/kotlin/releases/download/v2.4.20/kotlin-compiler-2.4.20.zip",
      // Published by JetBrains next to the zip (kotlin-compiler-2.4.20.zip.sha256).
      sha256: "59e9ca74c7904ef2c122b12114937673ccce68de820a663f0ed66ccf8799e0b7",
      size: 89_729_132,
      format: "zip",
      root: "kotlinc",
    } satisfies Download,
  },
  jdk: {
    /** Oldest major that kotlinc, d8, R8 and apksigner accept (we compile with -jvm-target 17). */
    minMajor: 17,
    version: "21.0.12.1+1",
    license: "GPL-2.0-with-classpath-exception",
    /** Eclipse Temurin via the Adoptium API (checksums from api.adoptium.net). Only on request. */
    downloads: {
      "darwin-arm64": {
        url: "https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.12.1%2B1/OpenJDK21U-jdk_aarch64_mac_hotspot_21.0.12.1_1.tar.gz",
        sha256: "3623232f33a9c3baadf304480b2535f9a3cba8a58d42ecbb438ba267315d9998",
        size: 200_073_404,
        format: "tar.gz",
        root: "jdk-21.0.12.1+1",
      },
      "darwin-x64": {
        url: "https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.12.1%2B1/OpenJDK21U-jdk_x64_mac_hotspot_21.0.12.1_1.tar.gz",
        sha256: "44db0f08196daf19a47f90d13388b0c943b67663cb537f998fe29e836fa842ce",
        size: 194_316_575,
        format: "tar.gz",
        root: "jdk-21.0.12.1+1",
      },
    } as Record<string, Download>,
  },
  /** Android App Bundles (akanjs readiness O1-5): build-bundle, and build-apks for local installs. */
  bundletool: {
    version: "1.18.3",
    license: "Apache-2.0",
    download: {
      url: "https://github.com/google/bundletool/releases/download/1.18.3/bundletool-all-1.18.3.jar",
      // The digest GitHub publishes for the release asset.
      sha256: "a099cfa1543f55593bc2ed16a70a7c67fe54b1747bb7301f37fdfd6d91028e29",
      size: 32_520_401,
      format: "file",
      root: "bundletool.jar",
    } satisfies Download,
  },
  /**
   * The AppImage type 2 runtime (CLI-9), the ELF a Linux AppImage starts with: it mounts the squashfs appended to it
   * and runs its AppRun. A dated release, since `continuous` moves; the digests are the ones GitHub publishes.
   */
  appimageRuntime: {
    version: "20251108",
    license: "MIT",
    downloads: {
      x64: {
        url: "https://github.com/AppImage/type2-runtime/releases/download/20251108/runtime-x86_64",
        sha256: "2fca8b443c92510f1483a883f60061ad09b46b978b2631c807cd873a47ec260d",
        size: 944_632,
        format: "file",
        root: "runtime",
      },
      arm64: {
        url: "https://github.com/AppImage/type2-runtime/releases/download/20251108/runtime-aarch64",
        sha256: "00cbdfcf917cc6c0ff6d3347d59e0ca1f7f45a6df1a428a0d6d8a78664d87444",
        size: 936_456,
        format: "file",
        root: "runtime",
      },
    } as Record<string, Download>,
  },
  android: {
    buildTools: "37.0.0",
    /** Older build-tools still work (with a warning); below this they do not. */
    minBuildTools: "35.0.0",
    compileSdk: 36,
  },
  /** Must match native/desktop/rust-toolchain.toml (a test checks it). wry 0.57 / tao 0.37 need 1.85+. */
  rust: { version: "1.98.1" },
  /** The Bun akan-native is tested with, and the lowest it runs on (package.json engines.bun; a test checks it). */
  bun: { version: "1.4.2", min: "1.4.0" },
  xcode: { min: "26.0" },
  iosSdk: { min: "26.0" },
} as const;

export type InstallableTool = "kotlin" | "jdk" | "bundletool";

// ------------------------------------------------------------------ helpers

export function compareVersions(a: string, b: string): number {
  const pa = a
    .split(/[^0-9]+/)
    .filter(Boolean)
    .map(Number);
  const pb = b
    .split(/[^0-9]+/)
    .filter(Boolean)
    .map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** "info: kotlinc-jvm 2.4.20 (JRE 27)" → "2.4.20". */
export function parseKotlinVersion(output: string): string | undefined {
  return output.match(/kotlinc-jvm (\d+\.\d+\.\d+[\w.-]*)/)?.[1];
}

/** `java -version` output → major version ("1.8.0_x" → 8, "21.0.11" → 21). */
export function parseJavaMajor(output: string): number | undefined {
  const v = output.match(/version "([^"]+)"/)?.[1];
  if (!v) return undefined;
  const parts = v.split(".");
  const major = Number(parts[0] === "1" ? parts[1] : parts[0]);
  return Number.isFinite(major) ? major : undefined;
}

export function akanNativeHome(env: Record<string, string | undefined> = process.env): string {
  return env.AKAN_NATIVE_HOME || join(homedir(), ".akan", "native");
}

export function toolchainsDir(env: Record<string, string | undefined> = process.env): string {
  return join(akanNativeHome(env), "toolchains");
}

export function autoInstallAllowed(env: Record<string, string | undefined> = process.env): boolean {
  return !["1", "true", "yes"].includes((env.AKAN_NATIVE_NO_AUTO_INSTALL ?? "").toLowerCase());
}

export function hostKey(): string {
  return `${process.platform}-${process.arch}`;
}

function spawnText(cmd: string[], env?: Record<string, string | undefined>): { ok: boolean; out: string } {
  try {
    const p = Bun.spawnSync({ cmd, stdout: "pipe", stderr: "pipe", env: { ...process.env, ...env } });
    return { ok: p.exitCode === 0, out: `${p.stdout}${p.stderr}`.trim() };
  } catch {
    return { ok: false, out: "" };
  }
}

// ------------------------------------------------------------------ installing

export interface InstallOptions {
  /** Replaces the network in tests. */
  fetch?: (url: string) => Promise<Response>;
  /** Replaces unzip/tar in tests: extract `archive` into `dir`. */
  extract?: (archive: string, dir: string, format: Download["format"]) => Promise<void>;
  env?: Record<string, string | undefined>;
  /** How long to wait for another process that is installing the same version. */
  lockTimeoutMs?: number;
  quiet?: boolean;
}

export function installPath(tool: string, version: string, env?: Record<string, string | undefined>): string {
  return join(toolchainsDir(env), tool, version);
}

async function defaultExtract(archive: string, dir: string, format: Download["format"]): Promise<void> {
  const cmd = format === "zip" ? ["unzip", "-q", archive, "-d", dir] : ["tar", "-xzf", archive, "-C", dir];
  const p = Bun.spawn(cmd, { stdout: "ignore", stderr: "pipe" });
  const [code, err] = await Promise.all([p.exited, new Response(p.stderr).text()]);
  if (code !== 0) throw new CliError(`${cmd[0]} failed (exit ${code}): ${err.trim().split("\n").slice(-5).join("\n")}`);
}

/** Streams `url` into `file`, hashing on the way; throws (and deletes the file) on a checksum mismatch. */
async function download(spec: Download, file: string, opts: InstallOptions): Promise<void> {
  const res = await (opts.fetch ?? fetch)(spec.url);
  if (!res.ok || !res.body) throw new CliError(`download failed: HTTP ${res.status} for ${spec.url}`);
  const hash = createHash("sha256");
  const out = createWriteStream(file);
  let received = 0;
  let nextReport = 0.1;
  const started = performance.now();
  try {
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      hash.update(chunk);
      received += chunk.length;
      if (!out.write(chunk)) await new Promise<void>((r) => out.once("drain", () => r()));
      if (!opts.quiet && spec.size > 0 && received / spec.size >= nextReport) {
        log.info(dim(`  ${Math.round((received / spec.size) * 100)}% of ${(spec.size / 1e6).toFixed(0)} MB`));
        nextReport += 0.1;
      }
    }
  } finally {
    await new Promise<void>((r) => out.end(() => r()));
  }
  const actual = hash.digest("hex");
  if (actual !== spec.sha256) {
    rmSync(file, { force: true });
    throw new CliError(
      `checksum mismatch for ${spec.url}\n  expected ${spec.sha256}\n  got      ${actual}\nNothing was installed.`,
    );
  }
  if (!opts.quiet)
    log.info(
      dim(
        `  ${(received / 1e6).toFixed(1)} MB in ${((performance.now() - started) / 1000).toFixed(1)} s, SHA-256 verified`,
      ),
    );
}

/**
 * One installer per version at a time: a lock file created with O_EXCL holds the pid. A lock whose
 * process is gone, or that is older than `staleMs`, is taken over. The install itself ends with a
 * rename, so even two installers that both got through would leave one complete copy.
 */
async function withLock<T>(
  lock: string,
  opts: { timeoutMs: number; staleMs: number; ready: () => boolean },
  fn: () => Promise<T>,
): Promise<T | null> {
  const deadline = Date.now() + opts.timeoutMs;
  let announced = false;
  for (;;) {
    try {
      const fd = openSync(lock, "wx");
      writeSync(fd, `${process.pid} ${Date.now()}\n`);
      closeSync(fd);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    if (opts.ready()) return null; // the other process finished meanwhile
    let stale = true;
    try {
      const [pid, at] = readFileSync(lock, "utf8").trim().split(" ").map(Number);
      const alive = (() => {
        try {
          process.kill(pid!, 0);
          return true;
        } catch (e) {
          return (e as NodeJS.ErrnoException).code === "EPERM";
        }
      })();
      stale = !alive || Date.now() - (at ?? 0) > opts.staleMs;
    } catch {
      // unreadable: being written right now; try again shortly
      stale = false;
    }
    if (stale) {
      rmSync(lock, { force: true });
      continue;
    }
    if (Date.now() > deadline)
      throw new CliError(`another akan-native process is still installing (${lock}); remove that file if it is stale`);
    if (!announced) {
      log.info(dim("waiting for another akan-native process that is installing the same toolchain…"));
      announced = true;
    }
    await Bun.sleep(250);
  }
  try {
    return await fn();
  } finally {
    rmSync(lock, { force: true });
  }
}

/** Installs `spec` as `<toolchains>/<tool>/<version>` unless it is there already; returns that folder. */
export async function ensureInstalled(
  tool: string,
  version: string,
  spec: Download,
  opts: InstallOptions = {},
): Promise<string> {
  const target = installPath(tool, version, opts.env);
  if (existsSync(target)) return target;
  const dir = dirname(target);
  mkdirSync(dir, { recursive: true });
  await withLock(
    join(dir, `${version}.lock`),
    { timeoutMs: opts.lockTimeoutMs ?? 10 * 60_000, staleMs: 30 * 60_000, ready: () => existsSync(target) },
    async () => {
      if (existsSync(target)) return;
      const tmp = join(dir, `.tmp-${version}-${process.pid}-${randomBytes(4).toString("hex")}`);
      mkdirSync(tmp);
      try {
        if (!opts.quiet) log.step(`toolchain: downloading ${tool} ${version} ${dim(spec.url)}`);
        const archive = join(
          tmp,
          spec.format === "zip" ? "archive.zip" : spec.format === "file" ? "download" : "archive.tar.gz",
        );
        await download(spec, archive, opts);
        const out = join(tmp, "x");
        mkdirSync(out);
        let root: string;
        if (spec.format === "file") {
          renameSync(archive, join(out, spec.root));
          root = out;
        } else {
          await (opts.extract ?? defaultExtract)(archive, out, spec.format);
          root = join(out, spec.root);
          if (!existsSync(root)) throw new CliError(`${spec.url}: expected a top folder "${spec.root}" in the archive`);
        }
        try {
          renameSync(root, target);
        } catch (error) {
          const code = (error as NodeJS.ErrnoException).code;
          if (!(code === "ENOTEMPTY" || code === "EEXIST") || !existsSync(target)) throw error;
        }
        if (!opts.quiet) log.ok(`installed ${tool} ${version} → ${target}`);
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    },
  );
  if (!existsSync(target)) throw new CliError(`installing ${tool} ${version} did not produce ${target}`);
  return target;
}

export async function installTool(tool: InstallableTool, opts: InstallOptions = {}): Promise<string> {
  if (tool === "kotlin") return ensureInstalled("kotlin", TOOLCHAIN.kotlin.version, TOOLCHAIN.kotlin.download, opts);
  if (tool === "bundletool")
    return ensureInstalled("bundletool", TOOLCHAIN.bundletool.version, TOOLCHAIN.bundletool.download, opts);
  const spec = TOOLCHAIN.jdk.downloads[hostKey()];
  if (!spec)
    throw new ToolchainError(
      `no pinned JDK download for ${hostKey()}; install JDK ${TOOLCHAIN.jdk.minMajor}+ yourself and set JAVA_HOME`,
    );
  return ensureInstalled("jdk", TOOLCHAIN.jdk.version, spec, opts);
}

// ------------------------------------------------------------------ resolving

export type Source = "override" | "akan-native" | "system" | "android-studio";

export interface KotlinToolchain {
  home: string;
  kotlinc: string;
  stdlib: string;
  version: string;
  source: Source;
  /** Set when the build uses something other than the pinned version. */
  warning?: string;
}

function kotlinAt(home: string): { kotlinc: string; stdlib: string } | null {
  const kotlinc = join(home, "bin", "kotlinc");
  // Official distributions keep the stdlib in lib/, Homebrew in libexec/lib/.
  const stdlib = [join(home, "lib", "kotlin-stdlib.jar"), join(home, "libexec", "lib", "kotlin-stdlib.jar")].find((p) =>
    existsSync(p),
  );
  return existsSync(kotlinc) && stdlib ? { kotlinc, stdlib } : null;
}

/** Version from build.txt (official zips) or `kotlinc -version`, which starts a JVM. */
function kotlinVersionAt(home: string, kotlinc: string, javaEnv?: Record<string, string>): string | undefined {
  for (const file of [join(home, "build.txt"), join(home, "libexec", "build.txt")]) {
    if (existsSync(file)) {
      const v = readFileSync(file, "utf8")
        .trim()
        .match(/^(\d+\.\d+\.\d+[\w.-]*?)(?:-release-\d+)?$/)?.[1];
      if (v) return v;
    }
  }
  return parseKotlinVersion(spawnText([kotlinc, "-version"], javaEnv).out);
}

/** The installed pinned kotlinc, or null. Never downloads. */
export function pinnedKotlin(env?: Record<string, string | undefined>): KotlinToolchain | null {
  const home = installPath("kotlin", TOOLCHAIN.kotlin.version, env);
  const found = kotlinAt(home);
  return found ? { home, ...found, version: TOOLCHAIN.kotlin.version, source: "akan-native" } : null;
}

function systemKotlin(
  env: Record<string, string | undefined>,
  javaEnv?: Record<string, string>,
): KotlinToolchain | null {
  const bin = Bun.which("kotlinc", { PATH: env.PATH ?? process.env.PATH ?? "" });
  if (!bin) return null;
  const home = dirname(dirname(realpathSync(bin)));
  const found = kotlinAt(home);
  if (!found) return null;
  const version = kotlinVersionAt(home, found.kotlinc, javaEnv) ?? "unknown";
  return { home, ...found, version, source: "system" };
}

/**
 * kotlinc for a build, in this order:
 * 1. AKAN_NATIVE_KOTLIN_HOME (explicit override, used as is)
 * 2. the pinned version in ~/.akan/native/toolchains
 * 3. installing the pinned version now (unless AKAN_NATIVE_NO_AUTO_INSTALL=1)
 * 4. kotlinc on PATH, with a warning if its version differs. A different compiler still builds
 *    the shell (it only uses stable Kotlin), and refusing would break offline machines; the
 *    warning and `akan-native doctor` point back to the pinned one.
 */
export async function resolveKotlin(
  opts: InstallOptions & { javaEnv?: Record<string, string> } = {},
): Promise<KotlinToolchain> {
  const env = opts.env ?? process.env;
  const override = env.AKAN_NATIVE_KOTLIN_HOME;
  if (override) {
    const found = kotlinAt(override);
    if (!found) throw new CliError(`AKAN_NATIVE_KOTLIN_HOME=${override} has no bin/kotlinc and lib/kotlin-stdlib.jar`);
    const version = kotlinVersionAt(override, found.kotlinc, opts.javaEnv) ?? "unknown";
    return { home: override, ...found, version, source: "override" };
  }
  const pinned = pinnedKotlin(env);
  if (pinned) return pinned;
  let failure = "";
  if (autoInstallAllowed(env)) {
    try {
      log.step(
        `kotlinc ${TOOLCHAIN.kotlin.version} is pinned but not installed; installing it (AKAN_NATIVE_NO_AUTO_INSTALL=1 turns this off)`,
      );
      await installTool("kotlin", opts);
      const installed = pinnedKotlin(env);
      if (installed) return installed;
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
    }
  }
  const system = systemKotlin({ PATH: process.env.PATH, ...env }, opts.javaEnv);
  if (system) {
    if (system.version !== TOOLCHAIN.kotlin.version || failure) {
      system.warning =
        `using kotlinc ${system.version} from ${system.home} instead of the pinned ${TOOLCHAIN.kotlin.version}` +
        (failure ? ` (install failed: ${failure.split("\n")[0]})` : "") +
        "; run `akan-native toolchain install kotlin`";
    }
    return system;
  }
  throw new ToolchainError(
    `kotlinc not found. Run \`akan-native toolchain install kotlin\` (pinned ${TOOLCHAIN.kotlin.version})${failure ? `\n  last attempt: ${failure}` : ""}`,
  );
}

// ---- JDK

export interface Jdk {
  home: string;
  java: string;
  major: number;
  version: string;
  source: Source | "java_home";
}

function jdkAt(home: string, source: Jdk["source"]): Jdk | null {
  const java = join(home, "bin", "java");
  if (!existsSync(java)) return null;
  const out = spawnText([java, "-version"]).out;
  const major = parseJavaMajor(out);
  if (!major) return null;
  return { home, java, major, version: out.match(/version "([^"]+)"/)?.[1] ?? String(major), source };
}

export const ANDROID_STUDIO_JBR = "/Applications/Android Studio.app/Contents/jbr/Contents/Home";

/** Every JDK akan-native would consider, in order of preference (first suitable wins). */
export function jdkCandidates(
  env: Record<string, string | undefined> = process.env,
): { home: string; source: Jdk["source"] }[] {
  const list: { home: string; source: Jdk["source"] }[] = [];
  if (env.JAVA_HOME) list.push({ home: env.JAVA_HOME, source: "override" });
  list.push({ home: join(installPath("jdk", TOOLCHAIN.jdk.version, env), "Contents", "Home"), source: "akan-native" });
  list.push({ home: ANDROID_STUDIO_JBR, source: "android-studio" });
  if (process.platform === "darwin") {
    const r = spawnText(["/usr/libexec/java_home", "-v", `${TOOLCHAIN.jdk.minMajor}+`]);
    if (r.ok && r.out) list.push({ home: r.out.split("\n").pop()!, source: "java_home" });
  }
  const onPath = Bun.which("java", { PATH: env.PATH ?? process.env.PATH ?? "" });
  if (onPath) {
    try {
      list.push({ home: dirname(dirname(realpathSync(onPath))), source: "system" });
    } catch {}
  }
  return list;
}

/** JAVA_HOME, then an akan-native-installed JDK, then Android Studio's JBR, then the system's (Homebrew etc.). */
export function resolveJdk(env: Record<string, string | undefined> = process.env): Jdk | null {
  for (const c of jdkCandidates(env)) {
    const jdk = jdkAt(c.home, c.source);
    if (jdk && jdk.major >= TOOLCHAIN.jdk.minMajor) return jdk;
  }
  return null;
}

/** Environment for every Java-based tool (kotlinc, d8, R8, apksigner, keytool): one JDK for all. */
export function javaEnv(jdk: Jdk): Record<string, string> {
  return { JAVA_HOME: jdk.home, PATH: `${join(jdk.home, "bin")}:${process.env.PATH ?? ""}` };
}

// ---- Android SDK

export function androidSdkRoot(env: Record<string, string | undefined> = process.env): string | undefined {
  const candidates = [env.ANDROID_HOME, env.ANDROID_SDK_ROOT, join(homedir(), "Library", "Android", "sdk")];
  return candidates.find((p): p is string => !!p && existsSync(p));
}

export const BUILD_TOOLS = ["aapt2", "d8", "zipalign", "apksigner"] as const;

export function completeBuildTools(sdk: string): string[] {
  const dir = join(sdk, "build-tools");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((v) => BUILD_TOOLS.every((t) => existsSync(join(dir, v, t))) && existsSync(join(dir, v, "lib", "d8.jar")))
    .sort(compareVersions);
}

export interface BuildToolsChoice {
  version: string;
  dir: string;
  warning?: string;
}

/** The pinned build-tools if installed, else the newest installed ones at or above the minimum (with a warning). */
export function resolveBuildTools(sdk: string): BuildToolsChoice | null {
  const all = completeBuildTools(sdk);
  const pinned = TOOLCHAIN.android.buildTools;
  if (all.includes(pinned)) return { version: pinned, dir: join(sdk, "build-tools", pinned) };
  const usable = all.filter((v) => compareVersions(v, TOOLCHAIN.android.minBuildTools) >= 0).at(-1);
  if (!usable) return null;
  return {
    version: usable,
    dir: join(sdk, "build-tools", usable),
    warning: `using build-tools ${usable} instead of the pinned ${pinned}; run \`akan-native doctor android --fix\` or: sdkmanager "build-tools;${pinned}"`,
  };
}

/** sdkmanager from cmdline-tools (latest first) or PATH. */
export function sdkmanager(sdk: string): string | undefined {
  const dir = join(sdk, "cmdline-tools");
  if (existsSync(dir)) {
    const versions = readdirSync(dir).sort((a, b) =>
      a === "latest" ? -1 : b === "latest" ? 1 : compareVersions(b, a),
    );
    for (const v of versions) {
      const bin = join(dir, v, "bin", "sdkmanager");
      if (existsSync(bin)) return bin;
    }
  }
  return Bun.which("sdkmanager") ?? undefined;
}

/** True when the user has accepted the Android SDK license (sdkmanager --licenses or Android Studio). */
export function sdkLicenseAccepted(sdk: string): boolean {
  const file = join(sdk, "licenses", "android-sdk-license");
  try {
    return statSync(file).size > 0;
  } catch {
    return false;
  }
}

/** The sdkmanager package ids akan-native pins. */
export function pinnedSdkPackages(): string[] {
  return [`build-tools;${TOOLCHAIN.android.buildTools}`, `platforms;android-${TOOLCHAIN.android.compileSdk}`];
}

export function missingSdkPackages(sdk: string): string[] {
  const missing: string[] = [];
  if (!completeBuildTools(sdk).includes(TOOLCHAIN.android.buildTools))
    missing.push(`build-tools;${TOOLCHAIN.android.buildTools}`);
  if (!existsSync(join(sdk, "platforms", `android-${TOOLCHAIN.android.compileSdk}`, "android.jar")))
    missing.push(`platforms;android-${TOOLCHAIN.android.compileSdk}`);
  return missing;
}

// ---- Rust

export const RUST_TOOLCHAIN_FILE = join(PACKAGE_ROOT, "native", "desktop", "rust-toolchain.toml");

export function rustToolchainFileVersion(file = RUST_TOOLCHAIN_FILE): string | undefined {
  try {
    return readFileSync(file, "utf8").match(/^\s*channel\s*=\s*"([^"]+)"/m)?.[1];
  } catch {
    return undefined;
  }
}

/** The pinned bundletool jar, installed on first use like kotlinc (Apache-2.0, no license to accept). */
export async function resolveBundletool(opts: InstallOptions = {}): Promise<string> {
  return join(await installTool("bundletool", opts), TOOLCHAIN.bundletool.download.root);
}
