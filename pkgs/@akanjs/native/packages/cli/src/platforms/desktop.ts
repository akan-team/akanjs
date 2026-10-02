// What the desktop targets (macOS, Windows, Linux) share (docs/architecture.md §3.3, §8): the Rust
// cdylib with TAO and WRY, one Bun executable with the main thread entry and the plugin host
// Worker, and the resources every desktop app reads at startup.
//
//   resources/app/              index.html (+ init script tag) and static files
//   resources/boot.json         platform, plugins, app info
//   resources/env.runtime.json  replaceable runtime env (ENV-4)
//   resources/shell.json        window and shell settings for main.ts and the plugin host
//   resources/server/           desktop.server.dir, when the app carries a server (packages/desktop/src/server.ts)
//   resources/server.json       its entry and env
//   resources/bin/              desktop.bin: executables put first on the app's PATH (packages/desktop/src/host.ts)
//   resources/server.bunfig.toml  empty: the server's Bun reads it instead of a bunfig.toml in its data folder
//
// Where each OS puts the executable, the library and the resources: macos.ts, windows.ts, linux.ts
// (and packages/desktop/src/ffi.ts resolvePaths, which must agree).

import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";
import { addonReport } from "../lib/addons.ts";
import type { ParsedArgs } from "../lib/args.ts";
import { makeNativeBoot } from "../lib/boot.ts";
import { exec, execOrThrow } from "../lib/exec.ts";
import { envFromProcess, follow, type Launched, type LaunchOptions, pipeLines, printLine } from "../lib/launch.ts";
import { CliError, dim, log } from "../lib/log.ts";
import { desktopModuleProblems, pluginFile } from "../lib/native-plugins.ts";
import type { BuildContext } from "../lib/prepare.ts";
import { PACKAGE_ROOT } from "../lib/root.ts";
import { akanNativeHome } from "../lib/toolchains.ts";
import { type DesktopArch, hostArch, updatesResource } from "../lib/updates.ts";

export const NATIVE_DIR = join(PACKAGE_ROOT, "native", "desktop");
const DESKTOP_PKG = join(PACKAGE_ROOT, "packages", "desktop", "src");

export type DesktopOs = "macos" | "windows" | "linux";

const LABEL: Record<DesktopOs, string> = { macos: "macOS", windows: "Windows", linux: "Linux" };
/** The cdylib cargo builds, per OS. */
export const NATIVE_LIB: Record<DesktopOs, string> = {
  macos: "libakan_native_desktop.dylib",
  windows: "akan_native_desktop.dll",
  linux: "libakan_native_desktop.so",
};

export function hostDesktopOs(platform = process.platform): DesktopOs | null {
  return platform === "darwin" ? "macos" : platform === "win32" ? "windows" : platform === "linux" ? "linux" : null;
}

/** Desktop apps are built on their own OS: the webview SDKs and native toolchains live there. */
export function requireHost(os: DesktopOs): void {
  if (hostDesktopOs() === os) return;
  const hint =
    os === "linux"
      ? "; from a Mac, run the build in the Linux container: bun scripts/vm/linux.ts bun run akan-native build linux"
      : os === "windows"
        ? "; from a Mac, use a Windows VM (docs/testing-windows-linux.md)"
        : "";
  throw new CliError(`${LABEL[os]} apps can only be built on ${LABEL[os]}${hint}`);
}

/** The resources folder inside a built desktop app (what the build returned). */
export function resourcesOf(os: DesktopOs, artifact: string): string {
  return os === "macos" ? join(artifact, "Contents", "Resources") : join(artifact, "resources");
}

function cargoEnv(): Record<string, string> {
  return { PATH: `${join(homedir(), ".cargo", "bin")}${delimiter}${process.env.PATH ?? ""}` };
}

/** RUSTFLAGS per OS. Changing them rebuilds everything, so they stay fixed per OS. */
const RUSTFLAGS: Record<DesktopOs, string> = {
  // @rpath install name: no build-machine path ends up in the binary. We dlopen by absolute path anyway.
  macos: "-C link-arg=-Wl,-install_name,@rpath/libakan_native_desktop.dylib",
  // The C runtime linked in: the DLL then needs no Visual C++ Redistributable on the user's PC
  // (Tauri does the same for its executables, tauri-build static_vcruntime).
  windows: "-C target-feature=+crt-static",
  linux: "",
};

const ARCH: Record<string, string> = { arm64: "aarch64", x64: "x86_64" };
const TRIPLE_OS: Record<DesktopOs, string> = {
  macos: "apple-darwin",
  windows: "pc-windows-msvc",
  linux: "unknown-linux-gnu",
};

/**
 * The target the library must be built for: the app's CPU, which can differ from rustc's host (an x64 app built on
 * an ARM64 Mac, or x64 Bun on an ARM64 PC under emulation). Null when it is rustc's host, so the usual
 * target/<profile> folder is used.
 */
async function libraryTarget(os: DesktopOs, arch: DesktopArch): Promise<string | null> {
  const wanted = `${ARCH[arch] ?? arch}-${TRIPLE_OS[os]}`;
  const verbose = await exec(["rustc", "-vV"], { cwd: NATIVE_DIR, env: cargoEnv(), echo: false });
  const host = /^host: (\S+)/m.exec(verbose.stdout)?.[1];
  return host && host !== wanted ? wanted : null;
}

/**
 * Cargo's output folder: CARGO_TARGET_DIR, else a cache under the akan-native home keyed by the
 * source folder. Never inside native/desktop (gigabytes that a vendored or copied package would
 * carry along, and a read-only install could not hold).
 */
export function cargoTargetDir(): string {
  if (process.env.CARGO_TARGET_DIR) return process.env.CARGO_TARGET_DIR;
  const key = createHash("sha256").update(NATIVE_DIR).digest("hex").slice(0, 12);
  return join(akanNativeHome(), "cache", "desktop-target", key);
}

/** Builds (incrementally) the Rust cdylib and returns its path. */
export async function buildNativeLibrary(os: DesktopOs, release: boolean, arch = hostArch()): Promise<string> {
  log.step(`native: cargo build (TAO + WRY)${arch === hostArch() ? "" : ` for ${arch}`}`);
  const target = await libraryTarget(os, arch);
  // --locked: the crates are the ones Cargo.lock pins (checked in); a build never resolves new versions.
  const args = ["cargo", "build", "--locked", "--manifest-path", join(NATIVE_DIR, "Cargo.toml"), "--quiet"];
  if (release) args.push("--release");
  if (target) {
    log.info(dim(`for ${target}; if its standard library is missing: rustup target add ${target}`));
    args.push("--target", target);
  }
  await execOrThrow(args, {
    // rustup picks the toolchain from native/desktop/rust-toolchain.toml by working directory (CLI-10).
    cwd: NATIVE_DIR,
    env: { ...cargoEnv(), RUSTFLAGS: RUSTFLAGS[os], CARGO_TARGET_DIR: cargoTargetDir() },
    inherit: true,
  });
  const lib = join(cargoTargetDir(), ...(target ? [target] : []), release ? "release" : "debug", NATIVE_LIB[os]);
  if (!existsSync(lib)) throw new CliError(`cargo finished but ${lib} is missing`);
  return lib;
}

/** Writes the generated entry points that `bun build --compile` bundles into one executable. */
function writeEntries(ctx: BuildContext, genDir: string): { main: string; host: string } {
  mkdirSync(genDir, { recursive: true });
  const modules = ctx.project.plugins.flatMap((plugin) => {
    const desktop = plugin.manifest.desktop;
    if (!desktop || desktop === "web") return [];
    return [pluginFile(plugin, typeof desktop === "string" ? desktop : desktop.module, "desktop module")];
  });
  const host = join(genDir, "host-entry.ts");
  writeFileSync(
    host,
    `// Generated by akan-native build. Do not edit.
import { startHost } from ${JSON.stringify(join(DESKTOP_PKG, "host.ts"))};
${modules.map((m, i) => `import plugin${i} from ${JSON.stringify(m)};`).join("\n")}

startHost([${modules.map((_, i) => `plugin${i}`).join(", ")}]);
`,
  );
  const main = join(genDir, "main-entry.ts");
  writeFileSync(
    main,
    `// Generated by akan-native build. Do not edit.
import { startMain } from ${JSON.stringify(join(DESKTOP_PKG, "main.ts"))};

// The Worker entry must be passed to \`bun build --compile\` as a second entry point,
// and referenced relative to this file so the compiled executable finds it.
startMain(new URL("./host-entry.ts", import.meta.url).href);
`,
  );
  return { main, host };
}

/**
 * The app never reads a .env or bunfig.toml from the folder it is started in: Bun's standalone
 * executables do by default, which would let a file next to the app set its environment and
 * runtime options.
 */
export const COMPILE_FLAGS = ["--no-compile-autoload-dotenv", "--no-compile-autoload-bunfig"];

/** The CPU a desktop build makes code for. */
export function targetArch(ctx: Pick<BuildContext, "arch">): DesktopArch {
  return ctx.arch ?? hostArch();
}

const BUN_OS: Record<DesktopOs, string> = { macos: "darwin", windows: "windows", linux: "linux" };

/**
 * bun build --compile of the main thread entry and the plugin host Worker into `outfile`, for the build's CPU: another
 * CPU's Bun is a cross-compilation target Bun downloads once.
 */
export async function compileExecutable(ctx: BuildContext, outfile: string, extra: string[] = []): Promise<void> {
  const arch = targetArch(ctx);
  const problems = (await Promise.all(ctx.project.plugins.map(desktopModuleProblems))).flat();
  if (problems.length)
    throw new CliError(`desktop plugin modules do not match their manifests:\n  - ${problems.join("\n  - ")}`);
  log.step("bundle: bun build --compile");
  const entries = writeEntries(ctx, join(ctx.outDir, "gen"));
  await execOrThrow(
    [
      process.execPath,
      "build",
      "--compile",
      ...COMPILE_FLAGS,
      entries.main,
      entries.host,
      "--outfile",
      outfile,
      ...(ctx.dev ? [] : ["--minify"]),
      ...(arch === hostArch() ? [] : [`--target=bun-${BUN_OS[ctx.platform as DesktopOs]}-${arch}`]),
      ...extra,
    ],
    {
      cwd: ctx.outDir,
    },
  );
}

/** The resources folder every desktop app reads (see the top of this file). */
export function writeDesktopResources(
  ctx: BuildContext,
  resources: string,
  os: DesktopOs,
  shellExtra: Record<string, unknown> = {},
): void {
  const { config } = ctx.project;
  // Windows and Linux open a deep link by starting the app again; single-instance hands it to
  // the running app (D6). Without it, every link opens a second copy of the app.
  if (
    os !== "macos" &&
    config.deepLinks.schemes.length &&
    !ctx.project.plugins.some((p) => p.manifest.id === "single-instance")
  ) {
    log.warn(
      `deepLinks.schemes on ${LABEL[os]} need the single-instance plugin: without it every link starts another copy of the app`,
    );
  }
  mkdirSync(resources, { recursive: true });
  cpSync(ctx.webDir, join(resources, "app"), { recursive: true });
  writeFileSync(join(resources, "app", "index.html"), ctx.html);
  const boot = makeNativeBoot(ctx, os);
  writeFileSync(join(resources, "boot.json"), JSON.stringify(boot));
  if (config.updates)
    writeFileSync(
      join(resources, "updates.json"),
      updatesResource(config.updates, config.app, os, boot.nativeApi, ctx.dev),
    );
  writeFileSync(join(resources, "env.runtime.json"), JSON.stringify(ctx.env, null, 2));
  const server = config.desktop.server;
  if (server) {
    if (!ctx.project.plugins.some((p) => p.manifest.id === "single-instance"))
      log.warn(
        "desktop.server without the single-instance plugin: every launch starts another server on the same data",
      );
    const addons = addonReport(server.dir, os, targetArch(ctx));
    for (const warning of addons.warnings) log.warn(warning);
    if (addons.problems.length)
      throw new CliError(
        `the server's native addons would not load on a user's computer:\n  - ${addons.problems.join("\n  - ")}`,
      );
    cpSync(server.dir, join(resources, "server"), { recursive: true, verbatimSymlinks: true });
    writeFileSync(join(resources, "server.json"), JSON.stringify({ entry: server.entry, env: server.env }));
    writeFileSync(join(resources, "server.bunfig.toml"), "");
  }
  if (config.desktop.bin)
    cpSync(config.desktop.bin, join(resources, "bin"), { recursive: true, verbatimSymlinks: true });
  writeFileSync(
    join(resources, "shell.json"),
    JSON.stringify({
      title: config.app.name,
      backgroundColor: config.shell.backgroundColor,
      backgroundColorDark: config.shell.backgroundColorDark,
      devtools: ctx.dev,
      quitOnLastWindowClosed: config.desktop.quitOnLastWindowClosed,
      recovery: config.desktop.recovery,
      screenCapture: config.desktop.screenCapture,
      fullscreen: config.desktop.window.fullscreen,
      skipTaskbar: config.desktop.window.skipTaskbar,
      // Windows and Linux register them at startup (packages/desktop/src/deeplinks.ts); macOS has Info.plist.
      deepLinks: config.deepLinks.schemes,
      // L0: schemes the app adds to what links and the opener may hand to the OS.
      externalSchemes: config.security?.shell?.externalSchemes ?? [],
      // akan-native dev --hmr: pages come from the dev gateway (lib/hmr.ts). Never in release builds.
      ...(ctx.dev && ctx.devServer ? { devServer: ctx.devServer } : {}),
      ...(ctx.dev && ctx.devServer && ctx.startPath ? { startPath: ctx.startPath } : {}),
      ...shellExtra,
    }),
  );
}

/**
 * Starts a desktop executable directly, so native logs and the page console reach the CLI (WV-3).
 * stop() asks the app to quit through its lifecycle (the onQuit hooks run): SIGTERM on macOS and
 * Linux; on Windows, which has no such signal, a "quit" line on the app's stdin (lib.rs
 * stdin_quit), then TerminateProcess if it is still running after 6 s.
 */
export function launchExecutable(exe: string, opts: LaunchOptions): Launched {
  const windows = process.platform === "win32";
  const proc = Bun.spawn([exe], {
    env: {
      ...process.env,
      ...opts.env,
      ...(opts.headless ? { AKAN_NATIVE_ACTIVATION: "prohibited" } : {}),
      ...(windows ? { AKAN_NATIVE_QUIT_ON_STDIN: "1" } : {}),
    },
    stdin: windows ? "pipe" : "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const onLine = opts.onLine ?? printLine;
  const logs = Promise.all([pipeLines(proc.stdout, onLine), pipeLines(proc.stderr, onLine)]);
  return {
    exited: proc.exited.then(async (code) => {
      await logs;
      return code;
    }),
    stop: () => {
      if (!windows) return proc.kill("SIGTERM");
      try {
        const stdin = proc.stdin as import("bun").FileSink;
        stdin.write("quit\n");
        stdin.flush();
      } catch {}
      setTimeout(() => proc.kill(), 6000).unref();
    },
  };
}

export async function runExecutable(exe: string, artifact: string, args: ParsedArgs): Promise<number> {
  log.ok(`launching ${artifact}`);
  return follow(launchExecutable(exe, { env: envFromProcess(), headless: args.flags.headless === true }));
}

/** Folder size for the build summary. */
export async function folderSize(path: string): Promise<string | null> {
  if (process.platform === "win32") return null;
  const size = await exec(["du", "-sh", path], { echo: false });
  return size.code === 0 ? size.stdout.split("\t")[0]! : null;
}
