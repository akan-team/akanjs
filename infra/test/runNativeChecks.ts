import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { androidSdkRoot, resolveJdk, TOOLCHAIN } from "../../pkgs/@akanjs/native/packages/cli/src/lib/toolchains";

type Outcome = "pass" | "fail" | "skip";

/**
 * Runs the native trust paths no `bun test` reaches (external view origin allowlist, OTA envelope and key ring), as CI
 * does, after checking the host for each toolchain.
 *
 *   bun run testNative desktop    desktop crate `cargo test`
 *   bun run testNative windows    `cargo check --target x86_64-pc-windows-msvc --all-targets`, from any host
 *   bun run testNative vectors    the Kotlin kernels against the shared vectors, and the Swift ones on macOS
 *
 * The exit code keeps a host that cannot run a check apart from a regression:
 *   0  every check the host could run passed; a skipped one says so on its own line
 *   1  a check failed
 *   3  the host lacks the toolchain for every check asked for: nothing ran
 */
class NativeChecks {
  static readonly #root = path.resolve(import.meta.dir, "../..");
  static readonly #native = path.join(NativeChecks.#root, "pkgs/@akanjs/native");
  static readonly #desktop = path.join(NativeChecks.#native, "native/desktop");
  static readonly #windowsTarget = "x86_64-pc-windows-msvc";
  // wry's Linux webview and the shell's own GTK parts link against these; webkit2gtk 2.0 is the 4.1 API.
  static readonly #linuxLibraries = ["gtk+-3.0", "webkit2gtk-4.1"];

  async run(check: string | undefined) {
    const outcomes = await this.#outcomesOf(check);
    if (outcomes.includes("fail")) return 1;
    return outcomes.every((outcome) => outcome === "skip") ? 3 : 0;
  }

  async #outcomesOf(check: string | undefined): Promise<Outcome[]> {
    if (check === "desktop") return [await this.#desktopTests()];
    if (check === "windows") return [await this.#windowsCheck()];
    if (check === "vectors") return [await this.#kotlinVectors(), await this.#swiftVectors()];
    throw new Error(`usage: bun run testNative desktop|windows|vectors, not "${check ?? ""}"`);
  }

  async #desktopTests() {
    const cargo = NativeChecks.#rustTool("cargo");
    if (!cargo) return NativeChecks.#skip("desktop cargo test", "no cargo (rustup) on this host");
    if (process.platform === "linux") {
      const missing = NativeChecks.#linuxLibraries.filter((library) => !NativeChecks.#hasPkgConfig(library));
      if (missing.length)
        return NativeChecks.#skip(
          "desktop cargo test",
          `pkg-config finds no ${missing.join(", ")} (libgtk-3-dev, libwebkit2gtk-4.1-dev)`,
        );
    }
    return await NativeChecks.#spawn("desktop cargo test", [cargo, "test"], NativeChecks.#desktop, cargo);
  }

  async #windowsCheck() {
    const name = `desktop cargo check (${NativeChecks.#windowsTarget})`;
    const cargo = NativeChecks.#rustTool("cargo");
    const rustup = NativeChecks.#rustTool("rustup");
    if (!cargo || !rustup) return NativeChecks.#skip(name, "no cargo and rustup on this host");
    const installed = Bun.spawnSync([rustup, "target", "list", "--installed"], {
      cwd: NativeChecks.#desktop,
      env: NativeChecks.#envWith(rustup),
    });
    if (!installed.stdout.toString().split("\n").includes(NativeChecks.#windowsTarget))
      return NativeChecks.#skip(
        name,
        `the pinned toolchain lacks the target; run \`rustup target add ${NativeChecks.#windowsTarget}\` in pkgs/@akanjs/native/native/desktop`,
      );
    return await NativeChecks.#spawn(
      name,
      [cargo, "check", "--target", NativeChecks.#windowsTarget, "--all-targets"],
      NativeChecks.#desktop,
      cargo,
    );
  }

  async #kotlinVectors() {
    const sdk = androidSdkRoot();
    const androidJar = sdk && path.join(sdk, "platforms", `android-${TOOLCHAIN.android.compileSdk}`, "android.jar");
    if (!resolveJdk() || !androidJar || !existsSync(androidJar))
      return NativeChecks.#skip(
        "kotlin vectors",
        `needs a JDK ${TOOLCHAIN.jdk.minMajor}+ and the Android SDK platform android-${TOOLCHAIN.android.compileSdk} (ANDROID_HOME)`,
      );
    return await NativeChecks.#spawn(
      "kotlin vectors",
      [process.execPath, "scripts/native-vectors.ts", "kotlin"],
      NativeChecks.#native,
    );
  }

  async #swiftVectors() {
    if (process.platform !== "darwin" || !Bun.which("xcrun"))
      return NativeChecks.#skip("swift vectors", "needs macOS with Xcode's command line tools");
    return await NativeChecks.#spawn(
      "swift vectors",
      [process.execPath, "scripts/native-vectors.ts", "swift"],
      NativeChecks.#native,
    );
  }

  // A non-login ssh shell often lacks ~/.cargo/bin on PATH, where rustup installs its proxies.
  static #rustTool(tool: "cargo" | "rustup") {
    const installed = path.join(process.env.CARGO_HOME ?? path.join(homedir(), ".cargo"), "bin", tool);
    return Bun.which(tool) ?? (existsSync(installed) ? installed : null);
  }

  static #envWith(tool: string) {
    return { ...process.env, PATH: `${path.dirname(tool)}${path.delimiter}${process.env.PATH ?? ""}` };
  }

  static #hasPkgConfig(library: string) {
    return !!Bun.which("pkg-config") && Bun.spawnSync(["pkg-config", "--exists", library]).exitCode === 0;
  }

  static #skip(name: string, reason: string): Outcome {
    console.info(`[native] SKIPPED ${name}: ${reason}`);
    return "skip";
  }

  static async #spawn(name: string, command: string[], cwd: string, tool = command[0] ?? ""): Promise<Outcome> {
    console.info(`[native] ${name}`);
    const proc = Bun.spawn(command, { cwd, env: NativeChecks.#envWith(tool), stdio: ["ignore", "inherit", "inherit"] });
    const outcome = (await proc.exited) === 0 ? "pass" : "fail";
    console.info(`[native] ${outcome === "pass" ? "passed" : "FAILED"} ${name}`);
    return outcome;
  }
}

process.exit(await new NativeChecks().run(process.argv[2]));
