// akan-native doctor [platform…] [--fix]: every toolchain akan-native needs, pinned version vs what was found
// (requirements CLI-1, CLI-10). --fix installs what akan-native may install by itself: kotlinc into
// ~/.akan/native, the pinned Rust through rustup, and pinned Android SDK packages through the user's
// sdkmanager once the user has accepted the SDK licenses. It never downloads a JDK and never
// accepts a license.

import { existsSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { execOrThrow } from "../lib/exec.ts";
import { log } from "../lib/log.ts";
import {
  androidSdkRoot,
  compareVersions,
  installTool,
  missingSdkPackages,
  parseKotlinVersion,
  pinnedKotlin,
  resolveBuildTools,
  resolveJdk,
  rustToolchainFileVersion,
  sdkLicenseAccepted,
  sdkmanager,
  TOOLCHAIN,
} from "../lib/toolchains.ts";

export type Platform = "web" | "macos" | "windows" | "linux" | "ios" | "android";
export const PLATFORMS: readonly Platform[] = ["web", "macos", "windows", "linux", "ios", "android"];

/** Without arguments: what this machine can build (desktop apps and iOS only on their own OS). */
export function hostPlatforms(): Platform[] {
  if (process.platform === "darwin") return ["web", "macos", "ios", "android"];
  if (process.platform === "win32") return ["web", "windows"];
  if (process.platform === "linux") return ["web", "linux"];
  return ["web"];
}

interface Fix {
  /** What --fix does, shown in the plan. */
  describe: string;
  run: () => Promise<void>;
}

type Check = {
  name: string;
  ok: boolean;
  detail: string;
  hint?: string;
  /** Works, but not with the pinned version (or an optional piece is missing). Not a failure. */
  warn?: boolean;
  fix?: Fix;
};
type Group = { title: string; platforms: readonly Platform[]; checks: () => Check[] };

// rustup installs into ~/.cargo/bin, which may not be on PATH in the current shell yet.
const PATH = [process.env.PATH ?? "", join(homedir(), ".cargo", "bin")].join(delimiter);

function run(cmd: string[]): { ok: boolean; out: string } {
  try {
    const p = Bun.spawnSync({ cmd, stdout: "pipe", stderr: "pipe", env: { ...process.env, PATH } });
    return { ok: p.exitCode === 0, out: `${p.stdout}${p.stderr}`.trim() };
  } catch {
    return { ok: false, out: "" };
  }
}

async function runOrThrow(cmd: string[]): Promise<void> {
  // Streamed to the terminal, or to the log sink inside an API call (lib/exec.ts).
  await execOrThrow(cmd, { inherit: true, env: { PATH } });
}

function which(bin: string): string | null {
  return Bun.which(bin, { PATH });
}

function firstLine(s: string): string {
  return s.split("\n")[0] ?? "";
}

function pass(name: string, detail: string): Check {
  return { name, ok: true, detail };
}

function fail(name: string, detail: string, hint: string, fix?: Fix): Check {
  return { name, ok: false, detail, hint, fix };
}

function warn(name: string, detail: string, hint: string, fix?: Fix): Check {
  return { name, ok: true, warn: true, detail, hint, fix };
}

function tool(name: string, bin: string, args: string[], hint: string): Check {
  const path = which(bin);
  if (!path) return fail(name, "not found", hint);
  const r = run([path, ...args]);
  return r.ok ? pass(name, firstLine(r.out) || path) : fail(name, firstLine(r.out) || "failed to run", hint);
}

// For tools without a reliable version flag, being on PATH is enough.
function present(name: string, bin: string, hint: string): Check {
  const path = which(bin);
  return path ? pass(name, path) : fail(name, "not found", hint);
}

const short = (path: string) => path.replace(homedir(), "~");

// ── common ────────────────────────────────────────────────────────────────

function checkBun(): Check[] {
  const { version, min } = TOOLCHAIN.bun;
  if (compareVersions(Bun.version, min) < 0)
    return [fail("Bun", `${Bun.version} (pinned ${version})`, `Bun ${min}+ is required: bun upgrade`)];
  if (Bun.version !== version)
    return [
      warn(
        "Bun",
        `${Bun.version} (pinned ${version})`,
        `akan-native is tested with Bun ${version}: bun upgrade --version ${version}`,
      ),
    ];
  return [pass("Bun", `${version} (pinned)`)];
}

// ── macOS desktop ─────────────────────────────────────────────────────────

function checkRust(): Check {
  const pinned = rustToolchainFileVersion() ?? TOOLCHAIN.rust.version;
  const rustup = which("rustup");
  if (!rustup)
    return fail("Rust", `pinned ${pinned}, rustup not found`, "Install Rust: curl https://sh.rustup.rs -sSf | sh");
  const installed = run([rustup, "toolchain", "list"])
    .out.split("\n")
    .some((l) => l.startsWith(`${pinned}-`));
  const install: Fix = {
    describe: `rustup toolchain install ${pinned} --profile minimal`,
    run: () => runOrThrow([rustup, "toolchain", "install", pinned, "--profile", "minimal"]),
  };
  if (!installed) {
    return fail(
      "Rust",
      `pinned ${pinned} not installed (native/desktop/rust-toolchain.toml)`,
      `rustup toolchain install ${pinned} --profile minimal (or the first build installs it)`,
      install,
    );
  }
  const rustc = run([rustup, "run", pinned, "rustc", "--version"]);
  return pass("Rust", `${firstLine(rustc.out)} (pinned by rust-toolchain.toml)`);
}

/** cargo of the pinned toolchain (the CLI runs cargo in native/desktop, where rust-toolchain.toml picks it). */
function checkCargo(): Check {
  const pinned = rustToolchainFileVersion() ?? TOOLCHAIN.rust.version;
  const rustup = which("rustup");
  if (!rustup) return tool("cargo", "cargo", ["--version"], "Install Rust: https://rustup.rs");
  const r = run([rustup, "run", pinned, "cargo", "--version"]);
  return r.ok
    ? pass("cargo", firstLine(r.out))
    : fail("cargo", firstLine(r.out) || "not found", `rustup toolchain install ${pinned} --profile minimal`);
}

function checkDesktop(): Check[] {
  return [
    checkRust(),
    checkCargo(),
    tool("clang (Xcode CLT)", "clang", ["--version"], "Install Xcode command line tools: xcode-select --install"),
    present("codesign", "codesign", "codesign ships with macOS; check Xcode command line tools"),
  ];
}

// ── Windows desktop ───────────────────────────────────────────────────────

/** The C++ build tools rustc links with, for this PC's architecture (vswhere ships with the VS installer). */
function checkMsvc(): Check {
  const hint =
    'Install Visual Studio 2022 Build Tools with "Desktop development with C++" (scripts/vm/windows-setup.ps1 does it)';
  const vswhere = join(
    process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)",
    "Microsoft Visual Studio",
    "Installer",
    "vswhere.exe",
  );
  if (!existsSync(vswhere)) return fail("MSVC build tools", "no Visual Studio installer found", hint);
  const component =
    process.arch === "arm64"
      ? "Microsoft.VisualStudio.Component.VC.Tools.ARM64"
      : "Microsoft.VisualStudio.Component.VC.Tools.x86.x64";
  const r = run([vswhere, "-products", "*", "-latest", "-requires", component, "-property", "displayName"]);
  return r.ok && r.out
    ? pass("MSVC build tools", firstLine(r.out))
    : fail("MSVC build tools", `${component} not installed`, hint);
}

/** The Evergreen WebView2 Runtime (in Windows 11; per machine or per user). */
function checkWebView2(): Check {
  const client = "Microsoft\\EdgeUpdate\\Clients\\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}";
  for (const key of [
    `HKLM\\SOFTWARE\\WOW6432Node\\${client}`,
    `HKLM\\SOFTWARE\\${client}`,
    `HKCU\\Software\\${client}`,
  ]) {
    const version = /\spv\s+REG_SZ\s+(\S+)/.exec(run(["reg.exe", "query", key, "/v", "pv"]).out)?.[1];
    if (version && version !== "0.0.0.0") return pass("WebView2 Runtime", version);
  }
  return fail(
    "WebView2 Runtime",
    "not found",
    "Install the Evergreen WebView2 Runtime: https://developer.microsoft.com/microsoft-edge/webview2/",
  );
}

function checkWindows(): Check[] {
  return [checkRust(), checkCargo(), checkMsvc(), checkWebView2()];
}

// ── Linux desktop ─────────────────────────────────────────────────────────

/** A pkg-config module at a minimum version (the -dev package of the system library). */
function pkgModule(name: string, module: string, min: string, pkg: string): Check {
  const r = run(["pkg-config", "--modversion", module]);
  const hint = `Install it: sudo apt install ${pkg} (Debian/Ubuntu)`;
  if (!r.ok) return fail(name, `${module} not found`, hint);
  return compareVersions(r.out, min) >= 0
    ? pass(name, `${r.out} (${min}+)`)
    : fail(name, `${r.out}`, `${name} ${min}+ is required; ${hint}`);
}

function checkLinux(): Check[] {
  return [
    checkRust(),
    checkCargo(),
    tool("C compiler", "cc", ["--version"], "Install build tools: sudo apt install build-essential"),
    tool("pkg-config", "pkg-config", ["--version"], "Install it: sudo apt install pkg-config"),
    // 2.40: request bodies reach the custom scheme handler (wry linux-body, the IPC posts).
    pkgModule("WebKitGTK", "webkit2gtk-4.1", "2.40", "libwebkit2gtk-4.1-dev"),
    pkgModule("GTK", "gtk+-3.0", "3.24", "libgtk-3-dev"),
    pkgModule("libsoup", "libsoup-3.0", "3.0", "libsoup-3.0-dev"),
  ];
}

// ── iOS ───────────────────────────────────────────────────────────────────

function checkIos(): Check[] {
  const xcodeHint = "Install Xcode from the App Store, then: sudo xcode-select -s /Applications/Xcode.app";
  const checks: Check[] = [];
  const xcode = run(["xcodebuild", "-version"]);
  const xcodeVersion = xcode.out.match(/Xcode (\d+(?:\.\d+)*)/)?.[1];
  checks.push(
    !xcodeVersion
      ? fail("Xcode", firstLine(xcode.out) || "not found", xcodeHint)
      : compareVersions(xcodeVersion, TOOLCHAIN.xcode.min) >= 0
        ? pass("Xcode", `${xcodeVersion} (${TOOLCHAIN.xcode.min}+)`)
        : fail("Xcode", `${xcodeVersion}`, `Xcode ${TOOLCHAIN.xcode.min}+ is required; update it from the App Store`),
  );

  const swiftc = run(["xcrun", "--find", "swiftc"]);
  checks.push(swiftc.ok ? pass("swiftc", swiftc.out) : fail("swiftc", "not found", xcodeHint));

  // Compiles the app icon and launch screen asset catalog (CLI-8, SH-6).
  const actool = run(["xcrun", "--find", "actool"]);
  checks.push(actool.ok ? pass("actool", actool.out) : fail("actool", "not found", xcodeHint));

  const sdk = run(["xcrun", "--sdk", "iphonesimulator", "--show-sdk-version"]);
  checks.push(
    sdk.ok && compareVersions(sdk.out, TOOLCHAIN.iosSdk.min) >= 0
      ? pass("iOS simulator SDK", sdk.out)
      : fail("iOS simulator SDK", sdk.out || "not found", `iOS ${TOOLCHAIN.iosSdk.min}+ SDK is required; update Xcode`),
  );

  const runtimes = run(["xcrun", "simctl", "list", "runtimes", "--json"]);
  let best: string | undefined;
  if (runtimes.ok) {
    try {
      const list = JSON.parse(runtimes.out).runtimes as { name?: string; version: string; isAvailable: boolean }[];
      best = list
        .filter((r) => r.isAvailable && r.name?.startsWith("iOS"))
        .map((r) => r.version)
        .sort(compareVersions)
        .at(-1);
    } catch {}
  }
  checks.push(
    best && compareVersions(best, TOOLCHAIN.iosSdk.min) >= 0
      ? pass("iOS simulator runtime", best)
      : fail(
          "iOS simulator runtime",
          best ?? "none",
          `Install an iOS ${TOOLCHAIN.iosSdk.min}+ simulator runtime: Xcode > Settings > Components`,
        ),
  );
  return checks;
}

// ── Android ───────────────────────────────────────────────────────────────

/** Installs the pinned SDK packages with the user's sdkmanager, if the user already accepted the licenses. */
function sdkFix(sdk: string, packages: string[]): Fix | undefined {
  const manager = sdkmanager(sdk);
  if (!manager || !sdkLicenseAccepted(sdk) || packages.length === 0) return undefined;
  return {
    describe: `sdkmanager ${packages.map((p) => `"${p}"`).join(" ")}`,
    // stdin is closed: if a package needs a license the user has not accepted, sdkmanager stops
    // instead of akan-native answering for the user.
    run: () => runOrThrow([manager, `--sdk_root=${sdk}`, ...packages]),
  };
}

function sdkHint(sdk: string, packages: string[]): string {
  const manager = sdkmanager(sdk);
  const install = `sdkmanager ${packages.map((p) => `"${p}"`).join(" ")}`;
  if (!manager)
    return `Install them in Android Studio > Settings > Android SDK (${packages.join(", ")}), or install "Android SDK Command-line Tools" there and run: ${install}`;
  if (!sdkLicenseAccepted(sdk))
    return `Accept the Android SDK licenses yourself first: ${manager} --licenses, then: ${install}`;
  return install;
}

function checkAndroid(): Check[] {
  const sdk = androidSdkRoot();
  if (!sdk)
    return [
      fail("Android SDK", "not found", "Install Android Studio or the command line tools, then set ANDROID_HOME"),
    ];

  const checks: Check[] = [pass("Android SDK", short(sdk))];
  const missing = missingSdkPackages(sdk);

  const pinnedBt = TOOLCHAIN.android.buildTools;
  const bt = resolveBuildTools(sdk);
  const btPackages = missing.filter((p) => p.startsWith("build-tools;"));
  if (!bt)
    checks.push(
      fail("build-tools", `pinned ${pinnedBt} not installed`, sdkHint(sdk, btPackages), sdkFix(sdk, btPackages)),
    );
  else if (bt.warning)
    checks.push(
      warn(
        "build-tools",
        `${bt.version} (pinned ${pinnedBt} not installed)`,
        sdkHint(sdk, btPackages),
        sdkFix(sdk, btPackages),
      ),
    );
  else checks.push(pass("build-tools", `${bt.version} (pinned)`));

  if (bt) {
    const r8 = join(bt.dir, "lib", "d8.jar");
    checks.push(
      existsSync(r8)
        ? pass("R8", `build-tools/${bt.version}/lib/d8.jar (release builds)`)
        : fail("R8", "lib/d8.jar missing", "reinstall build-tools with sdkmanager"),
    );
  }

  const platform = `android-${TOOLCHAIN.android.compileSdk}`;
  const platformPackages = missing.filter((p) => p.startsWith("platforms;"));
  checks.push(
    platformPackages.length === 0
      ? pass("platform", `${platform} (pinned)`)
      : fail("platform", `${platform} not installed`, sdkHint(sdk, platformPackages), sdkFix(sdk, platformPackages)),
  );

  const manager = sdkmanager(sdk);
  checks.push(
    manager
      ? pass("sdkmanager", short(manager))
      : warn(
          "sdkmanager",
          "not installed (only needed to install SDK packages)",
          'Android Studio > Settings > Android SDK > SDK Tools > "Android SDK Command-line Tools"',
        ),
  );
  checks.push(
    sdkLicenseAccepted(sdk)
      ? pass("SDK licenses", "accepted")
      : warn(
          "SDK licenses",
          "not accepted",
          `Read and accept them yourself: ${manager ?? "sdkmanager"} --licenses (akan-native never accepts licenses for you)`,
        ),
  );

  const jdk = resolveJdk();
  const jdkHint = `Install Android Studio (it bundles a JDK), or run \`akan-native toolchain install jdk\` (Temurin ${TOOLCHAIN.jdk.version}, ~200 MB), or set JAVA_HOME to a JDK ${TOOLCHAIN.jdk.minMajor}+`;
  checks.push(
    jdk
      ? pass("JDK", `${jdk.version} (${jdk.source}: ${short(jdk.home)})`)
      : fail("JDK", `none ${TOOLCHAIN.jdk.minMajor}+ found`, jdkHint),
  );
  if (jdk) {
    const keytool = join(jdk.home, "bin", "keytool");
    checks.push(
      existsSync(keytool) ? pass("keytool", short(keytool)) : fail("keytool", "missing in that JDK", jdkHint),
    );
  }

  const want = TOOLCHAIN.kotlin.version;
  const installKotlin: Fix = {
    describe: `install kotlinc ${want} into ~/.akan/native/toolchains (${(TOOLCHAIN.kotlin.download.size / 1e6).toFixed(0)} MB, SHA-256 pinned)`,
    run: async () => void (await installTool("kotlin")),
  };
  const pinned = pinnedKotlin();
  if (pinned) {
    checks.push(pass("kotlinc", `${want} (akanNative: ${short(pinned.home)})`));
    checks.push(pass("kotlin-stdlib", short(pinned.stdlib)));
  } else {
    const system = which("kotlinc");
    let version = "";
    if (system) {
      const home = dirname(dirname(realpathSync(system)));
      version = parseKotlinVersion(run([system, "-version"]).out) ?? "";
      if (!version) version = firstLine(run(["cat", join(home, "libexec", "build.txt")]).out);
    }
    const note = `pinned ${want} not installed; builds install it on first use (AKAN_NATIVE_NO_AUTO_INSTALL=1 turns that off)`;
    checks.push(
      system
        ? warn(
            "kotlinc",
            `${version || "?"} on PATH (${short(system)}); ${note}`,
            "akan-native toolchain install kotlin",
            installKotlin,
          )
        : warn("kotlinc", note, "akan-native toolchain install kotlin", installKotlin),
    );
  }

  const adb = join(sdk, "platform-tools", "adb");
  checks.push(
    existsSync(adb)
      ? pass("adb", short(adb))
      : fail("adb", "not found", sdkHint(sdk, ["platform-tools"]), sdkFix(sdk, ["platform-tools"])),
  );

  const emulator = join(sdk, "emulator", "emulator");
  if (!existsSync(emulator)) {
    checks.push(fail("emulator", "not found", sdkHint(sdk, ["emulator"]), sdkFix(sdk, ["emulator"])));
  } else {
    const avds = run([emulator, "-list-avds"])
      .out.split("\n")
      .filter((l) => l && !l.startsWith("INFO"));
    checks.push(
      avds.length > 0
        ? pass("emulator AVD", avds.join(", "))
        : fail("emulator AVD", "no AVD found", "Create one in Android Studio > Device Manager"),
    );
  }
  return checks;
}

const GROUPS: Group[] = [
  { title: "Common", platforms: PLATFORMS, checks: checkBun },
  { title: "macOS desktop", platforms: ["macos"], checks: checkDesktop },
  { title: "Windows desktop", platforms: ["windows"], checks: checkWindows },
  { title: "Linux desktop", platforms: ["linux"], checks: checkLinux },
  { title: "iOS", platforms: ["ios"], checks: checkIos },
  { title: "Android", platforms: ["android"], checks: checkAndroid },
];

/** One check's result, as the API reports it (docs/api.md doctor). */
export interface DoctorCheck {
  /** "Common", "iOS", "Android", "macOS desktop", … */
  group: string;
  /** What is checked, e.g. "kotlinc", "Xcode", "SDK licenses". */
  name: string;
  ok: boolean;
  /** Works, but not with the pinned version or without an optional piece. Not a failure. */
  warn: boolean;
  /** What was found (a version, a path) or what is wrong. */
  detail: string;
  /** What to do about it. */
  hint?: string;
  /** doctor({ fix: true }) can fix it (only toolchains akan-native pins; never a license or a JDK). */
  fixable: boolean;
}

/** The checks for these platforms, with what --fix would run. */
export function doctorChecks(targets: Platform[]): { check: DoctorCheck; fix?: Fix }[] {
  return GROUPS.filter((group) => group.platforms.some((p) => targets.includes(p))).flatMap((group) =>
    group.checks().map((c) => ({
      check: {
        group: group.title,
        name: c.name,
        ok: c.ok,
        warn: !!c.warn,
        detail: c.detail,
        ...(c.hint ? { hint: c.hint } : {}),
        fixable: !!c.fix,
      },
      ...(c.fix ? { fix: c.fix } : {}),
    })),
  );
}

/** Runs every fix of these checks; a failing one is logged and the others still run. */
export async function runFixes(checks: { check: DoctorCheck; fix?: Fix }[]): Promise<void> {
  for (const { check, fix } of checks) {
    if (!fix) continue;
    log.step(`fix ${check.name}: ${fix.describe}`);
    try {
      await fix.run();
    } catch (error) {
      log.error(`fix ${check.name} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

function report(targets: Platform[]): { failed: number; fixes: { check: string; fix: Fix }[] } {
  let failed = 0;
  const fixes: { check: string; fix: Fix }[] = [];
  for (const group of GROUPS) {
    if (!group.platforms.some((p) => targets.includes(p))) continue;
    console.info(group.title);
    for (const c of group.checks()) {
      console.info(`  ${c.ok ? (c.warn ? "!" : "✓") : "✗"} ${c.name.padEnd(22)} ${c.detail}`);
      if (!c.ok || c.warn) {
        if (!c.ok) failed++;
        if (c.hint) console.info(`      → ${c.hint}`);
        if (c.fix) fixes.push({ check: c.name, fix: c.fix });
      }
    }
    console.info();
  }
  return { failed, fixes };
}

export async function doctor(args: string[]): Promise<number> {
  const fix = args.includes("--fix");
  const rest = args.filter((a) => a !== "--fix");
  const unknown = rest.filter((a) => !PLATFORMS.includes(a as Platform));
  if (unknown.length > 0) {
    console.error(`Unknown argument: ${unknown.join(", ")} (expected: ${PLATFORMS.join(", ")}, --fix)`);
    return 2;
  }
  const targets = (rest.length > 0 ? rest : hostPlatforms()) as Platform[];

  console.info(`akan-native doctor${fix ? " --fix" : ""}\n`);
  let { failed, fixes } = report(targets);
  if (fixes.length > 0 && !fix) {
    console.info("`akan-native doctor --fix` would:");
    for (const f of fixes) console.info(`  - ${f.fix.describe}`);
    console.info();
  }
  if (fix && fixes.length > 0) {
    for (const f of fixes) {
      console.info(`fix ${f.check}: ${f.fix.describe}`);
      try {
        await f.fix.run();
      } catch (error) {
        console.error(`  failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    console.info("\nAfter --fix:\n");
    ({ failed } = report(targets));
  }
  console.info(failed === 0 ? `All checks passed for: ${targets.join(", ")}` : `${failed} check(s) failed.`);
  return failed === 0 ? 0 : 1;
}
