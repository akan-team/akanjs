// Programmatic API (docs/api.md, akanjs readiness O2-1): what the CLI does, called in process by
// another tool (the akanjs devkit first). The config is an object, results and failures are values,
// and output goes to the caller's log sink; nothing prints, exits or depends on the working folder.

import { resolve } from "node:path";
import {
  checkPublishUpdate,
  compareBundles,
  packAppUpdate,
  packUpdate,
  publishUpdate,
  republishUpdate,
  updateKeygen,
} from "./api-updates.ts";
import { type DoctorCheck, doctorChecks, hostPlatforms, runFixes } from "./commands/doctor.ts";
import type { AkanNativeConfig } from "./config.ts";
import {
  AkanNativeError,
  type AkanNativeErrorCode,
  type Artifact,
  type BuildResult,
  buildIn,
  type TaskOptions,
  task,
  toAkanNativeError,
} from "./lib/api-task.ts";
import { requestedDistribution } from "./lib/distribution.ts";
import { type HmrContext, lanAddress, resolveDevEntry, startHmrServer } from "./lib/hmr.ts";
import type { Device, DeviceSelector, Launched } from "./lib/launch.ts";
import { CliError, type LogEvent, type LogSink, log } from "./lib/log.ts";
import {
  type MacosBuild,
  type MacosNotarization,
  type MacosSigning,
  macosDistributionFromEnv,
} from "./lib/macossigning.ts";
import type {
  AndroidSigning,
  BuildContext,
  BuildProfile,
  IosBuild,
  IosSigning,
  IosSigningResult,
  LinuxBuild,
  WindowsBuild,
} from "./lib/prepare.ts";
import { ConfigError, type Project, projectFromConfig } from "./lib/project.ts";
import type { DesktopArch } from "./lib/updates.ts";
import { type WindowsSigning, windowsSigningFromEnv } from "./lib/windowssigning.ts";
import { androidDevices, launchAndroid } from "./platforms/android.ts";
import { PLATFORM_TARGETS, type TargetPlatform } from "./platforms/index.ts";
import { iosDevices, physicalIosDevice } from "./platforms/ios.ts";

export {
  MAX_REVOKE_KEYS,
  MAX_UPDATE_MANIFEST,
  UPDATE_REPORT_BATCH,
  UPDATE_REPORT_DESKTOP_REASONS,
  UPDATE_REPORT_EVENTS,
  UPDATE_REPORT_LIMIT,
  UPDATE_REPORT_REASONS,
  type UpdateDecision,
  type UpdateDecisionInput,
  type UpdateReportBody,
  type UpdateReportDesktopReason,
  type UpdateReportEntry,
  type UpdateReportEvent,
  type UpdateReportOutcome,
  type UpdateReportReason,
  updateDecision,
  updateReportOutcome,
} from "../../core/src/kernel.ts";
/** How a desktop app's launcher keeps the server it carries running: desktop.server's restart and watchdog. */
export type { ServerPolicy } from "../../desktop/src/server.ts";
export type { AppUpdatePack, PublishCheckOptions, PublishResult, RepublishResult } from "./api-updates.ts";
/** A build's bundle.json, and the manifest and envelope of a release, as a signer or server reads them. */
export type { BundleInfo, NativeApi } from "./lib/compat.ts";
export type { ManifestRelease, UpdateEnvelope, UpdateFile, UpdateManifest } from "./lib/updates.ts";
/**
 * The update protocol as the apps run it, for a signer or a server that checks what it publishes or registers: the
 * envelope's verification, the keyId of a public key, and what a verified manifest means to a binary. And what signs
 * a pack: its template made a release's manifest (fillManifest), that manifest's exact bytes (manifestBytes), and
 * their envelope from a key file (sealManifest) or from a signature made elsewhere (updateEnvelope).
 */
export {
  fillManifest,
  keyIdOf,
  manifestBytes,
  openEnvelope,
  sealManifest,
  updateEnvelope,
  verifyManifest,
} from "./lib/updates.ts";
export type { AppSigner } from "./platforms/desktop-update.ts";
export type {
  AkanNativeConfig,
  AkanNativeErrorCode,
  AndroidSigning,
  Artifact,
  BuildResult,
  DesktopArch,
  Device,
  DeviceSelector,
  DoctorCheck,
  IosBuild,
  IosSigning,
  IosSigningResult,
  LinuxBuild,
  LogEvent,
  MacosBuild,
  MacosNotarization,
  MacosSigning,
  TargetPlatform,
  TaskOptions,
  WindowsBuild,
  WindowsSigning,
};
/**
 * The macOS signing and notarization the AKAN_NATIVE_MACOS_* variables name, for a caller that keeps them in its
 * environment (the API itself reads no variable): pass the result as `macos`.
 */
/** The Authenticode settings the AKAN_NATIVE_WINDOWS_* variables name: pass the result as `windows.signing`. */
export {
  AkanNativeError,
  checkPublishUpdate,
  compareBundles,
  macosDistributionFromEnv,
  packAppUpdate,
  packUpdate,
  publishUpdate,
  republishUpdate,
  requestedDistribution,
  updateKeygen,
  windowsSigningFromEnv,
};

/** semver of this API. A caller checks the major before it relies on anything here. */
export const API_VERSION = "0.14.0";

export interface RunningApp {
  build: BuildResult;
  /** Where the app runs (iOS and Android). */
  device?: Device;
  /** Resolves with the exit code once the app (or its log stream) ends. */
  exited: Promise<number>;
  stop(): Promise<void>;
}

/** Problems of a config, without building (an empty list: valid). */
export function validateConfig(config: AkanNativeConfig, options: { appDir: string; resolveFrom?: string }): string[] {
  try {
    projectFromConfig(config, resolve(options.appDir), { resolveFrom: options.resolveFrom });
    return [];
  } catch (error) {
    if (error instanceof ConfigError) return error.problems;
    if (error instanceof CliError) return [error.message];
    throw error;
  }
}

/** Builds the app. Default profile release (like `akan-native build`). `ios.device`: an iPhone build (signed; release adds an .ipa). */
export function build(
  options: TaskOptions & {
    profile?: BuildProfile;
    ios?: IosBuild;
    windows?: WindowsBuild;
    macos?: MacosBuild;
    linux?: LinuxBuild;
    /** Desktop: the CPU the app runs on, of the same OS; a macOS app is arm64 only. Default this computer's. */
    arch?: DesktopArch;
  },
): Promise<BuildResult> {
  return task(
    options,
    async (warnings) =>
      (
        await buildIn(options, options.profile ?? "release", options.mode ?? "production", warnings, {
          ...(options.ios ? { ios: options.ios } : {}),
          ...(options.windows ? { windows: options.windows } : {}),
          ...(options.macos ? { macos: options.macos } : {}),
          ...(options.linux ? { linux: options.linux } : {}),
          ...(options.arch ? { arch: options.arch } : {}),
        })
      ).result,
  );
}

/**
 * Store files: a release build signed for distribution. Android: the .aab (and, with formats, the
 * .apk) signed with `signing`. iOS: an iPhone .app and its .ipa, signed with the App Store profile
 * found for the app (or the ad hoc one when signing.distribution asks for it; docs/api.md §3).
 */
export function release(
  options: TaskOptions &
    (
      | { platform: "android"; signing: AndroidSigning; formats?: ("aab" | "apk")[] }
      | { platform: "ios"; signing?: IosSigning }
    ),
): Promise<BuildResult> {
  return task(options, async (warnings) => {
    if (options.platform === "ios") {
      // An iPhone build signed for distribution (App Store or ad hoc profile), plus its .ipa.
      return (
        await buildIn(options, "release", options.mode ?? "production", warnings, {
          ios: { device: true, signing: options.signing },
        })
      ).result;
    }
    const formats = options.formats ?? ["aab"];
    const android = { signing: options.signing, bundle: formats.includes("aab") };
    return (await buildIn(options, "release", options.mode ?? "production", warnings, { android })).result;
  });
}

/** Builds (default profile debug) and launches the app on a simulator, emulator, desktop or browser. */
export function run(
  options: TaskOptions & {
    profile?: BuildProfile;
    /**
     * iOS: a simulator's name or UDID, or a paired iPhone's name (an iPhone build). Android: a device's
     * serial or an AVD name. Or `{ id }`, `{ name }`, `{ kind }` from devices().
     */
    device?: DeviceSelector;
    headless?: boolean;
    /** Runtime env for dev builds (AKAN_NATIVE_PUBLIC_* overrides). */
    runtimeEnv?: Record<string, string>;
    /** The app's log lines. */
    onLine?: (line: string) => void;
    /** An iPhone build: narrows how the signing is found (e.g. only teamId). */
    ios?: { signing?: IosSigning };
  },
): Promise<RunningApp> {
  return task(options, async (warnings) => {
    const device = await selectDevice(options.platform, options.device);
    // A paired iPhone by name or id means an iPhone build (O1-2, O4-4); anything else is a simulator.
    const iphone = options.platform === "ios" && device ? await physicalIosDevice(device) : null;
    const ios = iphone
      ? { ios: { device: true, signing: options.ios?.signing, target: { udid: iphone.udid, name: iphone.name } } }
      : {};
    const { ctx, artifact, result } = await buildIn(
      options,
      options.profile ?? "debug",
      options.mode ?? "development",
      warnings,
      ios,
    );
    let launched: Launched;
    try {
      launched = await PLATFORM_TARGETS[options.platform].launch(ctx, artifact, {
        env: options.runtimeEnv ?? {},
        headless: options.headless ?? false,
        onLine: options.onLine ?? (() => {}),
        ...(device ? { device } : {}),
      } as never);
    } catch (error) {
      throw toAkanNativeError(error, "DEVICE_FAILED");
    }
    return {
      build: result,
      ...(launched.device ? { device: launched.device } : {}),
      exited: launched.exited,
      stop: async () => launched.stop(),
    };
  });
}

export interface DevSession {
  /** The dev gateway the app's pages come from. */
  gateway: string;
  build: BuildResult;
  /** Where the app runs (iOS and Android); after a rebuild, where it runs now. */
  readonly device?: Device;
  /** Builds again (a changed config or env), reinstalls and relaunches; the pages keep coming from the gateway. */
  rebuild(config?: AkanNativeConfig): Promise<BuildResult>;
  /** Starts the installed app again without building: a fresh process that loads its first page again. */
  reload(): Promise<void>;
  /** Resolves when the app's log stream or the gateway ends. */
  exited: Promise<number>;
  stop(): Promise<void>;
}

/**
 * Development on a simulator, emulator or device (akanjs readiness O4, docs/api.md): a debug build
 * whose pages come from the dev gateway, which proxies an external dev server (`upstream`) or runs
 * Bun's own for web.devEntry. The pages keep the app's origin; only the HMR socket (`hmrPath`) goes to
 * the gateway. `startPath` is the first page; `lan` lets a real iPhone reach the Mac, and is on by
 * default when `device` is a paired iPhone.
 */
export function dev(
  options: TaskOptions & {
    upstream?: string;
    hmrPath?: string;
    startPath?: string;
    lan?: boolean;
    /** The app's own WebSocket paths the gateway relays to `upstream` (W4), e.g. ["/ws"]. */
    wsPaths?: string[];
    /** Android: more device ports than the gateway's that reach the same port on this computer (adb reverse). */
    reversePorts?: number[];
    device?: DeviceSelector;
    headless?: boolean;
    runtimeEnv?: Record<string, string>;
    onLine?: (line: string) => void;
    ios?: { signing?: IosSigning };
  },
): Promise<DevSession> {
  return task(options, async (warnings) => {
    if (options.platform === "web")
      throw new AkanNativeError(
        "INTERNAL",
        "dev() is for the app platforms; the web platform opens the gateway itself",
      );
    const appDir = resolve(options.appDir);
    let project: Project;
    try {
      project = projectFromConfig(options.config, appDir, { resolveFrom: options.resolveFrom });
    } catch (error) {
      throw toAkanNativeError(error, "CONFIG_INVALID");
    }
    // O4-3: a paired iPhone reaches the gateway only over the LAN, so choosing one asks for it.
    const iphone =
      options.platform === "ios" && options.lan !== false
        ? await selectDevice("ios", options.device).then((chosen) => (chosen ? physicalIosDevice(chosen) : null))
        : null;
    const wantsLan = options.platform === "ios" && (options.lan ?? iphone !== null);
    const lan = wantsLan ? lanAddress() : undefined;
    if (wantsLan && !lan)
      throw new AkanNativeError(
        "DEVICE_FAILED",
        `${iphone ? `${iphone.name} loads a dev build's pages from this Mac over the LAN, and` : "lan:"} this Mac has no private IPv4 address on a network`,
      );
    const context: HmrContext = { project };
    const gateway = await startHmrServer({
      platform: options.platform,
      entry: options.upstream ? undefined : resolveDevEntry(project),
      upstream: options.upstream,
      hmrPath: options.hmrPath,
      wsPaths: options.wsPaths,
      port: 0,
      hostname: lan ? "0.0.0.0" : "127.0.0.1",
      publicHost: lan,
      context,
      onLine: (line) => log.tool("dev-server", line),
      onWarning: (text) => log.warn(text),
    }).catch((error) => {
      throw toAkanNativeError(error, "INTERNAL");
    });
    let config = options.config;
    let running: Launched | undefined;
    let built: { ctx: BuildContext; artifact: string } | undefined;
    let device: string | undefined;
    const start = async (): Promise<void> => {
      if (!built) return;
      running?.stop();
      await running?.exited.catch(() => 0);
      const launchOptions = {
        env: options.runtimeEnv ?? {},
        headless: options.headless ?? false,
        onLine: options.onLine ?? (() => {}),
        ...(device ? { device } : {}),
      };
      try {
        running =
          options.platform === "android"
            ? await launchAndroid(built.ctx, built.artifact, {
                ...launchOptions,
                reverse: [gateway.port, ...(options.reversePorts ?? [])],
              })
            : await PLATFORM_TARGETS[options.platform].launch(built.ctx, built.artifact, launchOptions as never);
      } catch (error) {
        throw toAkanNativeError(error, "DEVICE_FAILED");
      }
    };
    const launch = async (): Promise<BuildResult> => {
      device = await selectDevice(options.platform, options.device);
      const iphone = options.platform === "ios" && device ? await physicalIosDevice(device) : null;
      const { ctx, artifact, result } = await buildIn(
        { ...options, config },
        "debug",
        options.mode ?? "development",
        warnings,
        {
          devServer: gateway.url,
          startPath: options.startPath,
          ...(iphone
            ? { ios: { device: true, signing: options.ios?.signing, target: { udid: iphone.udid, name: iphone.name } } }
            : {}),
        },
      );
      context.project = ctx.project;
      built = { ctx, artifact };
      await start();
      return result;
    };
    let build: BuildResult;
    try {
      build = await launch();
    } catch (error) {
      gateway.stop();
      throw error;
    }
    const sink = options.log;
    return {
      gateway: gateway.url,
      build,
      get device() {
        return running?.device;
      },
      rebuild: (next?: AkanNativeConfig) =>
        task({ log: sink, signal: options.signal }, async () => {
          if (next) config = next;
          return launch();
        }),
      reload: () => task({ log: sink, signal: options.signal }, start),
      exited: Promise.race([gateway.exited, new Promise<number>((r) => void running?.exited.then(r, () => r(1)))]),
      stop: async () => {
        running?.stop();
        await Promise.race([running?.exited.catch(() => 0), Bun.sleep(3000)]);
        gateway.stop();
      },
    };
  });
}

/** Simulators, emulators and devices of a platform (docs/api.md devices), running and connected ones first. */
export function devices(options: {
  platform: "ios" | "android";
  log?: LogSink;
  signal?: AbortSignal;
}): Promise<Device[]> {
  return task(options, async () => {
    try {
      return options.platform === "ios" ? await iosDevices() : await androidDevices();
    } catch (error) {
      throw toAkanNativeError(error, "DEVICE_FAILED");
    }
  });
}

export interface DoctorReport {
  /** No check failed (warnings allowed). */
  ok: boolean;
  checks: DoctorCheck[];
}

/**
 * The toolchains the platforms need, pinned version against what is found (R4-4, akan doctor).
 * Default: what this machine can build. `fix` installs only what akan-native pins (kotlinc, bundletool,
 * the pinned Rust, SDK packages once their licenses are accepted), then checks again; it never
 * accepts a license and never downloads a JDK.
 */
export function doctor(
  options: { platforms?: TargetPlatform[]; fix?: boolean; log?: LogSink; signal?: AbortSignal } = {},
): Promise<DoctorReport> {
  return task(options, async () => {
    const targets = options.platforms ?? hostPlatforms();
    let checks = doctorChecks(targets);
    if (options.fix && checks.some((c) => c.fix)) {
      await runFixes(checks);
      checks = doctorChecks(targets);
    }
    const list = checks.map((c) => c.check);
    return { ok: list.every((c) => c.ok), checks: list };
  });
}

// ---------------------------------------------------------------- internals

const plainName = (s: string) => s.replace(/[\u2018\u2019]/g, "'").toLowerCase();

/**
 * The device text the platforms take (a name or an id passes as it is). `{ id }` and `{ name }` must
 * match one; `{ kind }` takes the first of the kind that runs, else one that can be started.
 */
async function selectDevice(
  platform: TargetPlatform,
  selector: DeviceSelector | undefined,
): Promise<string | undefined> {
  if (selector === undefined || typeof selector === "string") return selector;
  if (platform !== "ios" && platform !== "android")
    throw new AkanNativeError("DEVICE_FAILED", `a device is chosen on ios and android, not on ${platform}`);
  const all = platform === "ios" ? await iosDevices() : await androidDevices();
  const running = (d: Device) => d.state === "booted" || d.state === "connected";
  const found =
    "id" in selector
      ? all.find((d) => d.id === selector.id)
      : "name" in selector
        ? all.find((d) => plainName(d.name) === plainName(selector.name))
        : (all.find((d) => d.kind === selector.kind && running(d)) ??
          all.find((d) => d.kind === selector.kind && d.state === "shutdown"));
  const listed = all.map((d) => `${d.name} (${d.kind}, ${d.state})`).join(", ") || "none";
  if (!found)
    throw new AkanNativeError(
      "DEVICE_FAILED",
      `no ${platform} device matches ${JSON.stringify(selector)}; devices: ${listed}`,
    );
  const why: Partial<Record<Device["state"], string>> = {
    unpaired:
      "is not paired with this Mac: connect it, unlock it, trust this Mac, and open Xcode's Devices and Simulators window once",
    unavailable: "is out of reach: connect it with a cable or put it on the same network, and unlock it",
    unauthorized: "has not allowed USB debugging from this computer: confirm the prompt on the device",
    offline: "is offline for adb: reconnect it",
  };
  const problem = why[found.state];
  if (problem) throw new AkanNativeError("DEVICE_FAILED", `${found.name} ${problem}`);
  return found.id;
}
