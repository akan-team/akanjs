// akan-native build <platform> / akan-native run <platform>  (CLI-2, CLI-3)

import { relative } from "node:path";
import { checkFlags, type ParsedArgs, parseArgs, stringFlag } from "../lib/args.ts";
import { bold, CliError, dim, log } from "../lib/log.ts";
import { macosDistributionFromEnv } from "../lib/macossigning.ts";
import { type BuildContext, type BuildProfile, prepare } from "../lib/prepare.ts";
import { findAppDir, loadProject } from "../lib/project.ts";
import type { DesktopArch } from "../lib/updates.ts";
import { windowsSigningFromEnv } from "../lib/windowssigning.ts";
import { PLATFORM_TARGETS, TARGETS, type TargetPlatform } from "../platforms/index.ts";
import { physicalIosDevice } from "../platforms/ios.ts";

export const BOOLEAN_FLAGS = ["skip-web-build", "open", "release", "debug", "headless", "aab", "installer"];

/** Flags of every build: the app, the env mode (.env.<mode>), the profile, the web build. */
export const BUILD_FLAGS = [
  "app",
  "mode",
  "release",
  "debug",
  "skip-web-build",
  "aab",
  "installer",
  "device",
  "build",
  "arch",
];
/** Flags of launching a build (web server, simulators, emulators). */
export const LAUNCH_FLAGS = ["port", "host", "open", "headless", "device", "avd"];

export const BUILD_USAGE = `akan-native build <${TARGETS.join("|")}> [--app <dir>] [--mode <mode>] [--debug] [--skip-web-build] [--aab] [--installer] [--device] [--build <n>] [--arch <arm64|x64>]`;
export const RUN_USAGE = `akan-native run <${TARGETS.join("|")}> [--app <dir>] [--mode <mode>] [--release] [--skip-web-build] [--port <n>] [--open] [--headless] [--device <name>] [--avd <name>] [--start <path>]`;

export interface BuildDefaults {
  /** .env.<mode>, unless --mode */
  mode: string;
  /** Unless --release or --debug (commands that allow them). */
  profile: BuildProfile;
}

export async function buildFromArgs(
  args: ParsedArgs,
  defaults: BuildDefaults,
  platformOverride?: TargetPlatform,
  extra: { devServer?: string; startPath?: string } = {},
): Promise<{ ctx: BuildContext; artifact: string; platform: TargetPlatform }> {
  const platform = platformOverride ?? (args.positional[0] as TargetPlatform | undefined);
  if (!platform || !TARGETS.includes(platform)) throw new CliError(`expected a platform: ${TARGETS.join(", ")}`, 2);
  if (args.flags.release === true && args.flags.debug === true)
    throw new CliError("--release and --debug exclude each other", 2);
  const profile: BuildProfile =
    args.flags.release === true ? "release" : args.flags.debug === true ? "debug" : defaults.profile;

  const started = performance.now();
  const appDir = findAppDir(stringFlag(args, "app") ?? process.cwd());
  const project = await loadProject(appDir);
  // One build's number (CI): --build wins over AKAN_NATIVE_BUILD; prepare checks it for the target.
  const buildNumber = stringFlag(args, "build") ?? process.env.AKAN_NATIVE_BUILD;
  if (buildNumber !== undefined) {
    if (!/^[1-9][0-9]*$/.test(buildNumber))
      throw new CliError(
        `--build / AKAN_NATIVE_BUILD must be a positive integer (got ${JSON.stringify(buildNumber)})`,
        2,
      );
    project.config.app.build = Number(buildNumber);
  }
  log.step(
    `${bold(project.config.app.name)} ${dim(`(${project.config.app.id} ${project.config.app.version})`)} → ${platform}`,
  );
  if (project.plugins.length) log.info(dim(`plugins: ${project.plugins.map((p) => p.manifest.id).join(", ")}`));

  if (args.flags.aab === true && platform !== "android") throw new CliError("--aab is for android", 2);
  if (args.flags.installer === true && platform !== "windows" && platform !== "macos" && platform !== "linux")
    throw new CliError("--installer is for windows (a setup program), macos (a dmg) and linux (an AppImage)", 2);
  // O1-2: an iPhone build for `build --device`, or for `run`/`dev --device <a paired iPhone>`.
  const device = args.flags.device;
  const iphone = platform === "ios" && typeof device === "string" ? await physicalIosDevice(device) : null;
  const iosDevice = platform === "ios" && (device === true || iphone !== null);
  const ctx = await prepare(project, platform, {
    mode: stringFlag(args, "mode") ?? defaults.mode,
    profile,
    skipWebBuild: args.flags["skip-web-build"] === true,
    devServer: extra.devServer,
    startPath: extra.startPath,
    // O1-5: the release key comes from AKAN_NATIVE_ANDROID_KEYSTORE… (android.ts signingKey).
    ...(args.flags.aab === true ? { android: { bundle: true } } : {}),
    ...(platform === "windows"
      ? {
          windows: {
            ...(args.flags.installer === true ? { installer: true } : {}),
            // CLI-9: Authenticode from AKAN_NATIVE_WINDOWS_* (lib/windowssigning.ts); release builds only.
            ...(profile === "release" ? { signing: windowsSigningFromEnv() } : {}),
          },
        }
      : {}),
    // CLI-9: Developer ID signing and notarization from AKAN_NATIVE_MACOS_* (lib/macossigning.ts); release builds only.
    ...(platform === "macos"
      ? {
          macos: {
            ...(profile === "release" ? macosDistributionFromEnv() : {}),
            ...(args.flags.installer === true ? { dmg: true } : {}),
          },
        }
      : {}),
    ...(platform === "linux" && args.flags.installer === true ? { linux: { appImage: true } } : {}),
    ...(stringFlag(args, "arch") ? { arch: stringFlag(args, "arch") as DesktopArch } : {}),
    // The identity and profile are found (lib/iossigning.ts chooseSigning), narrowed by AKAN_NATIVE_IOS_TEAM,
    // AKAN_NATIVE_IOS_IDENTITY, AKAN_NATIVE_IOS_PROFILE and AKAN_NATIVE_IOS_DISTRIBUTION=ad-hoc.
    ...(iosDevice
      ? { ios: { device: true, ...(iphone ? { target: { udid: iphone.udid, name: iphone.name } } : {}) } }
      : {}),
  });
  const artifact = await PLATFORM_TARGETS[platform].build(ctx);
  const others = ctx.artifacts.map((a) => ` + ${relative(process.cwd(), a.path) || a.path}`).join("");
  log.ok(
    `built ${relative(process.cwd(), artifact) || artifact}${others} ${dim(`in ${Math.round(performance.now() - started)} ms`)}`,
  );
  return { ctx, artifact, platform };
}

/** `akan-native build`: a release build unless --debug. */
export async function build(argv: string[]): Promise<number> {
  const args = parseArgs(argv, BOOLEAN_FLAGS);
  checkFlags(args, BUILD_FLAGS, BUILD_USAGE);
  await buildFromArgs(args, { mode: "production", profile: "release" });
  return 0;
}

/** `akan-native run`: a debug build unless --release. */
export async function run(argv: string[]): Promise<number> {
  const args = parseArgs(argv, BOOLEAN_FLAGS);
  checkFlags(args, [...BUILD_FLAGS, ...LAUNCH_FLAGS, "start"], RUN_USAGE);
  const { ctx, artifact, platform } = await buildFromArgs(args, { mode: "development", profile: "debug" }, undefined, {
    startPath: stringFlag(args, "start"),
  });
  return PLATFORM_TARGETS[platform].run(ctx, artifact, args);
}
