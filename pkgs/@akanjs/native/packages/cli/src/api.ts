// Programmatic API (docs/api.md, akanjs readiness O2-1): what the CLI does, called in process by
// another tool (the akanjs devkit first). The config is an object, results and failures are values,
// and output goes to the caller's log sink; nothing prints, exits or depends on the working folder.

import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { type DoctorCheck, doctorChecks, hostPlatforms, runFixes } from "./commands/doctor.ts";
import type { AkanNativeConfig } from "./config.ts";
import { makeNativeBoot } from "./lib/boot.ts";
import { BUNDLE_FILE, compatProblems, readBundleInfo } from "./lib/compat.ts";
import { CancelledError, withSignal } from "./lib/exec.ts";
import { type HmrContext, lanAddress, resolveDevEntry, startHmrServer } from "./lib/hmr.ts";
import type { Device, DeviceSelector, Launched } from "./lib/launch.ts";
import { CliError, type LogEvent, type LogSink, log, ToolchainError, ToolError, withLogSink } from "./lib/log.ts";
import {
  type MacosBuild,
  type MacosNotarization,
  type MacosSigning,
  macosDistributionFromEnv,
} from "./lib/macossigning.ts";
import {
  type AndroidSigning,
  type BuildContext,
  type BuildOptions,
  type BuildProfile,
  type IosBuild,
  type IosSigning,
  type IosSigningResult,
  type LinuxBuild,
  prepare,
  SigningError,
  WebBuildError,
  WebInputError,
  type WindowsBuild,
} from "./lib/prepare.ts";
import { ConfigError, type Project, projectFromConfig } from "./lib/project.ts";
import { assertServerOfChannel, assertSigningKey, publishRelease } from "./lib/publish.ts";
import {
  assertChannel,
  type DesktopArch,
  generateUpdateKey,
  type UpdateManifest,
  updateKeyPath,
  webManifest,
  writeWebBundle,
} from "./lib/updates.ts";
import { type WindowsSigning, windowsSigningFromEnv } from "./lib/windowssigning.ts";
import { androidDevices, launchAndroid } from "./platforms/android.ts";
import { PLATFORM_TARGETS, type TargetPlatform } from "./platforms/index.ts";
import { iosDevices, physicalIosDevice } from "./platforms/ios.ts";

export type {
  AkanNativeConfig,
  AndroidSigning,
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
  WindowsBuild,
  WindowsSigning,
};
/**
 * The macOS signing and notarization the AKAN_NATIVE_MACOS_* variables name, for a caller that keeps them in its
 * environment (the API itself reads no variable): pass the result as `macos`.
 */
/** The Authenticode settings the AKAN_NATIVE_WINDOWS_* variables name: pass the result as `windows.signing`. */
export { macosDistributionFromEnv, windowsSigningFromEnv };

/** semver of this API. A caller checks the major before it relies on anything here. */
export const API_VERSION = "0.10.0";

export type AkanNativeErrorCode =
  | "CONFIG_INVALID"
  | "TOOLCHAIN_MISSING"
  | "WEB_INPUT_INVALID"
  | "WEB_BUILD_FAILED"
  | "NATIVE_BUILD_FAILED"
  | "SIGNING_FAILED"
  | "DEVICE_FAILED"
  | "CANCELLED"
  | "INTERNAL";

export class AkanNativeError extends Error {
  constructor(
    readonly code: AkanNativeErrorCode,
    message: string,
    readonly details: { problems?: string[]; hint?: string; logTail?: string[]; cause?: unknown } = {},
  ) {
    super(message);
    this.name = "AkanNativeError";
  }
  get problems(): string[] | undefined {
    return this.details.problems;
  }
  get hint(): string | undefined {
    return this.details.hint;
  }
  get logTail(): string[] | undefined {
    return this.details.logTail;
  }
}

export interface TaskOptions {
  /** Base of the config's relative paths (web.dir, icon, relative plugin folders). */
  appDir: string;
  /** What akan-native.config.ts would export. No file is read. */
  config: AkanNativeConfig;
  platform: TargetPlatform;
  /** Default <appDir>/.akan/native/build/<platform>. */
  outDir?: string;
  /** Picks .env.<mode>. Default "production" for build, "development" for run. */
  mode?: string;
  /** false: no .env files from appDir. Default true. */
  envFiles?: boolean;
  /** PUBLIC_ values above .env files and config.env. */
  env?: Record<string, string>;
  /** Skip config.web.build and use web.dir as it is. */
  skipWebBuild?: boolean;
  /** Where plugin package names resolve from. Default appDir. */
  resolveFrom?: string;
  /** Receives the log. Without it nothing is logged. */
  log?: LogSink;
  /** Kills the running tools and rejects with CANCELLED. */
  signal?: AbortSignal;
}

export interface Artifact {
  kind: "app" | "apk" | "aab" | "ipa" | "folder" | "web" | "installer";
  path: string;
  signing: "none" | "adhoc" | "debug" | "development" | "distribution";
  device?: "simulator" | "device";
}

export interface BuildResult {
  platform: TargetPlatform;
  profile: BuildProfile;
  outDir: string;
  artifacts: Artifact[];
  warnings: string[];
  durationMs: number;
  /** iPhone builds: the identity and provisioning profile found (docs/api.md §3 "Finding the signing"). */
  signing?: IosSigningResult;
  /**
   * Android builds that contain pinned libraries (push's FCM module, iap): the license notices file
   * (akan-native-licenses.json, also served in the app at /akan-native-licenses.json).
   */
  licenses?: string;
}

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

/**
 * An unsigned web bundle update (UP-2), for a signer that keeps the key off the build machine. Writes
 * `<out>/files/<sha256>`, `<out>/manifest.template.json` (the manifest with `channel`, `sequence` and `bundle` left
 * empty for the signer) and `<out>/bundle.json` (the native API the bundle needs, UP-3). Prepares the web bundle as a
 * release build does, without building the native app.
 */
export function packUpdate(
  options: TaskOptions & { platform: "ios" | "android"; out: string },
): Promise<{ manifest: UpdateManifest; out: string }> {
  return task(options, async () => {
    const appDir = resolve(options.appDir);
    let project: Project;
    try {
      project = projectFromConfig(options.config, appDir, { resolveFrom: options.resolveFrom });
    } catch (error) {
      throw toAkanNativeError(error, "CONFIG_INVALID");
    }
    //? Not the build folder: its bundle.json is the store build's, which `compareBundles` checks an update against.
    const out = resolve(options.out);
    mkdirSync(out, { recursive: true });
    const ctx = await prepare(project, options.platform, {
      mode: options.mode ?? "production",
      profile: "release",
      skipWebBuild: options.skipWebBuild ?? false,
      outDir: out,
      envFiles: options.envFiles,
      env: options.env,
      api: true,
    }).catch((error) => {
      throw toAkanNativeError(error, "CONFIG_INVALID");
    });
    makeNativeBoot(ctx, options.platform);
    const info = readBundleInfo(join(out, BUNDLE_FILE));
    const manifest = webManifest({
      app: project.config.app,
      platform: options.platform,
      channel: "",
      nativeApi: info.nativeApi.hash,
      sequence: 0,
      bundle: "",
      files: writeWebBundle(out, ctx.webDir, ctx.html, ctx.env),
    });
    writeFileSync(join(out, "manifest.template.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    return { manifest, out };
  });
}

export interface PublishResult {
  build: BuildResult;
  /** `<out>/<os>-<arch>` (desktop) or `<out>/<platform>` (a phone's web bundle): what to upload under updates.url. */
  dir: string;
  bundle: string;
  channel: string;
  files: number;
  /** Bytes of the files the manifest names. */
  size: number;
}

export interface PublishCheckOptions extends Pick<TaskOptions, "appDir" | "config"> {
  platform: Exclude<TargetPlatform, "web">;
  channel?: string;
  out?: string;
  /** Whether the release will carry a server; the config's `desktop.server` by default. */
  server?: boolean;
}

/**
 * What publishUpdate() refuses before it builds, without building (CONFIG_INVALID): no updates settings, a channel no
 * app could be configured for, no signing key on this machine or another app's, and a desktop release whose server
 * presence is not the channel's previous release's. For a caller with a long build of its own before publishUpdate.
 */
export function checkPublishUpdate(options: PublishCheckOptions): { channel: string; out: string } {
  if (!options.config.updates)
    throw new AkanNativeError("CONFIG_INVALID", "the config has no updates: { url, publicKey } to publish for");
  const channel = options.channel ?? options.config.updates.channel ?? "production";
  const out = resolve(options.out ?? resolve(options.appDir, ".akan", "native", "updates"));
  try {
    if (options.channel !== undefined) assertChannel(options.channel);
    assertSigningKey(options.config);
    const server = options.server ?? !!options.config.desktop?.server;
    assertServerOfChannel({ desktop: server ? { server } : {} }, options.platform, out, channel);
  } catch (error) {
    throw toAkanNativeError(error, "CONFIG_INVALID");
  }
  return { channel, out };
}

/**
 * A signed release for the updates plugin (UP-1, UP-2): a release build, then `<channel>.json`, its signature and
 * its files under `out` (default <appDir>/.akan/native/updates), signed with the key updateKeygen() made.
 */
export function publishUpdate(
  options: TaskOptions & {
    platform: Exclude<TargetPlatform, "web">;
    channel?: string;
    out?: string;
    /** The signature a macOS release carries: the installed app's own, or the updater refuses it. No dmg is made. */
    macos?: Pick<MacosBuild, "signing" | "notarize">;
    /** Authenticode for a Windows release's files. No setup program is made. */
    windows?: Pick<WindowsBuild, "signing">;
  },
): Promise<PublishResult> {
  return task(options, async (warnings) => {
    const { channel, out } = checkPublishUpdate(options);
    const { ctx, artifact, result } = await buildIn(options, "release", options.mode ?? "production", warnings, {
      ...(options.macos ? { macos: { ...options.macos, dmg: false } } : {}),
      ...(options.windows?.signing ? { windows: { signing: options.windows.signing } } : {}),
    });
    const { dir, manifest } = await publishRelease(ctx, options.platform, artifact, out, channel).catch((error) => {
      throw toAkanNativeError(error, "CONFIG_INVALID");
    });
    return {
      build: result,
      dir,
      bundle: manifest.bundle,
      channel,
      files: manifest.files.length,
      size: manifest.files.reduce((n, f) => n + f.size, 0),
    };
  });
}

/**
 * Whether a web bundle can run in the binary a store release shipped (UP-3): `shipped` is that build's bundle.json,
 * `bundle` the one `packUpdate` wrote. Anything in `problems` means a new binary.
 */
export function compareBundles(shipped: string, bundle: string): { compatible: boolean; problems: string[] } {
  const [before, now] = [readBundleInfo(resolve(shipped)), readBundleInfo(resolve(bundle))];
  const problems =
    before.app.id !== now.app.id
      ? [`${shipped} is for ${before.app.id}, the bundle for ${now.app.id}`]
      : compatProblems(before.nativeApi.inputs, now.nativeApi.inputs);
  return { compatible: problems.length === 0, problems };
}

/**
 * The app's update signing key: made once (AKAN_NATIVE_UPDATE_KEY, else ~/.akan/native/keys/<app id>.update.key),
 * then read. `publicKey` goes into the config's `updates.publicKey`; the key file never leaves the machine.
 */
export function updateKeygen(options: { config: AkanNativeConfig }): {
  publicKey: string;
  keyPath: string;
  created: boolean;
} {
  const keyPath = updateKeyPath(options.config.app.id);
  return { ...generateUpdateKey(keyPath), keyPath };
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

/** Builds with one outDir at a time: a second call for the same folder waits for the first. */
const outDirLocks = new Map<string, Promise<unknown>>();

async function buildIn(
  options: TaskOptions,
  profile: BuildProfile,
  mode: string,
  warnings: string[],
  extra: Pick<
    BuildOptions,
    "android" | "ios" | "windows" | "macos" | "linux" | "arch" | "devServer" | "startPath"
  > = {},
): Promise<{ ctx: BuildContext; artifact: string; result: BuildResult }> {
  const started = performance.now();
  const appDir = resolve(options.appDir);
  let project: Project;
  try {
    project = projectFromConfig(options.config, appDir, { resolveFrom: options.resolveFrom });
  } catch (error) {
    throw toAkanNativeError(error, "CONFIG_INVALID");
  }
  const outDir = resolve(options.outDir ?? resolve(appDir, ".akan", "native", "build", options.platform));
  const previous = outDirLocks.get(outDir) ?? Promise.resolve();
  const mine = previous
    .catch(() => {})
    .then(async () => {
      const ctx = await prepare(project, options.platform, {
        mode,
        profile,
        skipWebBuild: options.skipWebBuild ?? false,
        outDir,
        envFiles: options.envFiles,
        env: options.env,
        api: true,
        ...extra,
      }).catch((error) => {
        throw toAkanNativeError(error, "CONFIG_INVALID");
      });
      const artifact = await PLATFORM_TARGETS[options.platform].build(ctx).catch((error) => {
        throw toAkanNativeError(error, "NATIVE_BUILD_FAILED");
      });
      return { ctx, artifact };
    });
  outDirLocks.set(outDir, mine);
  try {
    const { ctx, artifact } = await mine;
    const artifacts = [
      describe(options.platform, artifact, ctx),
      ...ctx.artifacts.map((a): Artifact => ({ kind: a.kind, path: a.path, signing: ctx.signedAs ?? "none" })),
    ];
    const result: BuildResult = {
      platform: options.platform,
      profile,
      outDir: ctx.outDir,
      artifacts,
      warnings,
      durationMs: Math.round(performance.now() - started),
      ...(ctx.iosSigning ? { signing: ctx.iosSigning } : {}),
      ...(ctx.licenses ? { licenses: ctx.licenses } : {}),
    };
    return { ctx, artifact, result };
  } finally {
    if (outDirLocks.get(outDir) === mine) outDirLocks.delete(outDir);
  }
}

function describe(platform: TargetPlatform, path: string, ctx: BuildContext): Artifact {
  switch (platform) {
    case "web":
      return { kind: "web", path, signing: "none" };
    case "macos":
      return { kind: "app", path, signing: ctx.signedAs ?? "adhoc" };
    case "windows":
    case "linux":
      return { kind: "folder", path, signing: ctx.signedAs ?? "none" };
    case "ios":
      return ctx.ios?.device
        ? { kind: "app", path, signing: ctx.signedAs ?? "development", device: "device" }
        : { kind: "app", path, signing: "adhoc", device: "simulator" };
    case "android":
      return { kind: "apk", path, signing: ctx.signedAs ?? "debug" };
  }
}

/** Runs an API call with its own log sink (warnings collected) and abort signal; failures become AkanNativeError. */
async function task<T>(
  options: { log?: LogSink; signal?: AbortSignal },
  fn: (warnings: string[]) => Promise<T>,
): Promise<T> {
  const warnings: string[] = [];
  const sink: LogSink = (event) => {
    if (event.level === "warn") warnings.push(event.message);
    options.log?.(event);
  };
  if (options.signal?.aborted) throw new AkanNativeError("CANCELLED", "cancelled before it started");
  try {
    return await withLogSink(sink, () => withSignal(options.signal, () => fn(warnings)));
  } catch (error) {
    throw toAkanNativeError(error, "INTERNAL");
  }
}

/** An error as an AkanNativeError: its own kind decides the code, else the phase it happened in. */
function toAkanNativeError(error: unknown, phase: AkanNativeErrorCode): AkanNativeError {
  if (error instanceof AkanNativeError) return error;
  if (error instanceof CancelledError || (error as Error)?.name === "AbortError")
    return new AkanNativeError("CANCELLED", "cancelled", { cause: error });
  if (error instanceof ConfigError)
    return new AkanNativeError("CONFIG_INVALID", error.message, { problems: error.problems, cause: error });
  if (error instanceof ToolchainError)
    return new AkanNativeError("TOOLCHAIN_MISSING", error.message, { hint: "akan-native doctor", cause: error });
  if (error instanceof WebBuildError) return new AkanNativeError("WEB_BUILD_FAILED", error.message, { cause: error });
  if (error instanceof WebInputError) return new AkanNativeError("WEB_INPUT_INVALID", error.message, { cause: error });
  if (error instanceof SigningError)
    return new AkanNativeError("SIGNING_FAILED", error.message, {
      ...(error.problems.length ? { problems: error.problems } : {}),
      cause: error,
    });
  if (error instanceof ToolError)
    return new AkanNativeError(phase === "CONFIG_INVALID" ? "NATIVE_BUILD_FAILED" : phase, error.message, {
      logTail: error.tail,
      cause: error,
    });
  if (error instanceof CliError) return new AkanNativeError(phase, error.message, { cause: error });
  return new AkanNativeError("INTERNAL", (error as Error)?.message ?? String(error), { cause: error });
}
