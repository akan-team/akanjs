// akan-native toolchain [list] | install <kotlin|jdk|bundletool|rust|android>: the pinned toolchains (CLI-10).
// `install jdk` is the only way akan-native downloads a JDK; builds never do it on their own.

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { CliError, dim, log } from "../lib/log.ts";
import {
  androidSdkRoot,
  installPath,
  installTool,
  missingSdkPackages,
  pinnedKotlin,
  pinnedSdkPackages,
  resolveBuildTools,
  resolveJdk,
  rustToolchainFileVersion,
  sdkLicenseAccepted,
  sdkmanager,
  TOOLCHAIN,
  toolchainsDir,
} from "../lib/toolchains.ts";

export const TOOLCHAIN_USAGE =
  "akan-native toolchain [list] | akan-native toolchain install <kotlin|jdk|bundletool|rust|android>";

const short = (path: string) => path.replace(homedir(), "~");

function list(): number {
  const rows: [string, string, string][] = [];
  const kotlin = pinnedKotlin();
  rows.push([
    "kotlinc",
    TOOLCHAIN.kotlin.version,
    kotlin ? `installed (${short(kotlin.home)})` : "not installed: installs on first Android build",
  ]);
  const jdk = resolveJdk();
  rows.push([
    "JDK",
    `${TOOLCHAIN.jdk.minMajor}+ (install: Temurin ${TOOLCHAIN.jdk.version})`,
    jdk ? `${jdk.version} (${jdk.source}: ${short(jdk.home)})` : "none found",
  ]);
  const sdk = androidSdkRoot();
  const bt = sdk ? resolveBuildTools(sdk) : null;
  rows.push([
    "build-tools",
    TOOLCHAIN.android.buildTools,
    bt ? `${bt.version}${bt.warning ? " (not the pinned one)" : ""}` : "not found",
  ]);
  rows.push([
    "Android platform",
    `android-${TOOLCHAIN.android.compileSdk}`,
    sdk && !missingSdkPackages(sdk).some((p) => p.startsWith("platforms;")) ? "installed" : "not installed",
  ]);
  rows.push([
    "bundletool",
    TOOLCHAIN.bundletool.version,
    existsSync(installPath("bundletool", TOOLCHAIN.bundletool.version))
      ? "installed (akan-native)"
      : "installed on the first App Bundle build",
  ]);
  rows.push([
    "Rust",
    rustToolchainFileVersion() ?? TOOLCHAIN.rust.version,
    "native/desktop/rust-toolchain.toml (rustup)",
  ]);
  rows.push(["Bun", TOOLCHAIN.bun.version, Bun.version]);
  rows.push(["Xcode", `${TOOLCHAIN.xcode.min}+`, "see akan-native doctor ios"]);
  console.info(`${"tool".padEnd(18)}${"pinned".padEnd(40)}found`);
  for (const [tool, pinned, found] of rows) console.info(`${tool.padEnd(18)}${pinned.padEnd(40)}${found}`);
  console.info(dim(`\ntoolchains folder: ${short(toolchainsDir())} (AKAN_NATIVE_HOME moves it)`));
  return 0;
}

async function install(tool: string | undefined): Promise<number> {
  switch (tool) {
    case "kotlin":
    case "kotlinc": {
      const home = await installTool("kotlin");
      log.ok(`kotlinc ${TOOLCHAIN.kotlin.version}: ${short(home)}`);
      return 0;
    }
    case "bundletool": {
      const home = await installTool("bundletool");
      log.ok(`bundletool ${TOOLCHAIN.bundletool.version}: ${short(home)}`);
      return 0;
    }
    case "jdk": {
      const existing = resolveJdk();
      if (existing)
        log.info(
          dim(
            `a suitable JDK is already available: ${existing.version} (${existing.source}); installing the pinned one anyway`,
          ),
        );
      const home = await installTool("jdk");
      log.ok(`JDK ${TOOLCHAIN.jdk.version}: ${short(join(home, "Contents", "Home"))} (used when JAVA_HOME is not set)`);
      return 0;
    }
    case "rust": {
      const version = rustToolchainFileVersion() ?? TOOLCHAIN.rust.version;
      const rustup = Bun.which("rustup", { PATH: `${process.env.PATH}:${join(homedir(), ".cargo", "bin")}` });
      if (!rustup) throw new CliError("rustup not found. Install Rust: curl https://sh.rustup.rs -sSf | sh");
      const p = Bun.spawn([rustup, "toolchain", "install", version, "--profile", "minimal"], {
        stdout: "inherit",
        stderr: "inherit",
      });
      return (await p.exited) === 0 ? 0 : 1;
    }
    case "android": {
      const sdk = androidSdkRoot();
      if (!sdk) throw new CliError("Android SDK not found (install Android Studio or set ANDROID_HOME)");
      const missing = missingSdkPackages(sdk);
      if (missing.length === 0) {
        log.ok(`pinned SDK packages are installed: ${pinnedSdkPackages().join(", ")}`);
        return 0;
      }
      const manager = sdkmanager(sdk);
      const cmd = `sdkmanager ${missing.map((p) => `"${p}"`).join(" ")}`;
      if (!manager)
        throw new CliError(
          `sdkmanager not found. Install "Android SDK Command-line Tools" in Android Studio > Settings > Android SDK > SDK Tools, then: ${cmd}`,
        );
      // Accepting the SDK licenses is the user's decision; akan-native only proceeds once they did.
      if (!sdkLicenseAccepted(sdk))
        throw new CliError(`Accept the Android SDK licenses yourself first: ${manager} --licenses\nthen run: ${cmd}`);
      const p = Bun.spawn([manager, `--sdk_root=${sdk}`, ...missing], {
        stdin: "ignore",
        stdout: "inherit",
        stderr: "inherit",
      });
      return (await p.exited) === 0 ? 0 : 1;
    }
    default:
      throw new CliError(`usage: ${TOOLCHAIN_USAGE}`, 2);
  }
}

export async function toolchain(args: string[]): Promise<number> {
  const [sub, tool] = args;
  if (!sub || sub === "list") return list();
  if (sub === "install") return install(tool);
  throw new CliError(`usage: ${TOOLCHAIN_USAGE}`, 2);
}
