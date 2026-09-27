import type { ParsedArgs } from "../lib/args.ts";
import type { Launched, LaunchOptions } from "../lib/launch.ts";
import type { BuildContext } from "../lib/prepare.ts";
import { buildAndroid, launchAndroid, runAndroid } from "./android.ts";
import { buildIos, launchIos, runIos } from "./ios.ts";
import { buildLinux, launchLinux, runLinux } from "./linux.ts";
import { buildMacos, launchMacos, runMacos } from "./macos.ts";
import type { TargetPlatform } from "./targets.ts";
import { buildWeb } from "./web.ts";
import { launchWeb, runWeb } from "./web-run.ts";
import { buildWindows, launchWindows, runWindows } from "./windows.ts";

export { hostTargets, TARGETS, type TargetPlatform } from "./targets.ts";

export interface PlatformTarget {
  /** Builds into ctx.outDir and returns the main artifact path. */
  build(ctx: BuildContext): Promise<string>;
  /** Launches a built artifact and follows its logs. Resolves when the app (or server) exits. */
  run(ctx: BuildContext, artifact: string, args: ParsedArgs): Promise<number>;
  /** Launches a built artifact with env overrides and a log line callback (akan-native test). */
  launch(ctx: BuildContext, artifact: string, opts: LaunchOptions): Promise<Launched>;
}

export const PLATFORM_TARGETS: Record<TargetPlatform, PlatformTarget> = {
  web: { build: buildWeb, run: runWeb, launch: launchWeb },
  macos: { build: buildMacos, run: runMacos, launch: launchMacos },
  windows: { build: buildWindows, run: runWindows, launch: launchWindows },
  linux: { build: buildLinux, run: runLinux, launch: launchLinux },
  ios: { build: buildIos, run: runIos, launch: launchIos },
  android: { build: buildAndroid, run: runAndroid, launch: launchAndroid },
};
