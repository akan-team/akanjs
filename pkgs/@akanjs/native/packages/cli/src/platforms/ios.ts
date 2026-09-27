// akan-native build ios: a simulator .app built with swiftc, no Xcode project (docs/research/ios.md §2.1):
//   swiftc (shell + plugin sources + generated registry) → flat .app (exe, Info.plist, app/,
//   boot.json, env.runtime.json, shell.json) → ad-hoc signature (harmless on the simulator)

import { createHash } from "node:crypto";
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { ParsedArgs } from "../lib/args.ts";
import { makeNativeBoot } from "../lib/boot.ts";
import { type ExecResult, exec, execOrThrow } from "../lib/exec.ts";
import { writeIosAssets } from "../lib/icons.ts";
import {
  chooseSigning,
  localProfiles,
  type ProfileKind,
  type ProvisioningProfile,
  readProfile,
  signingIdentities,
} from "../lib/iossigning.ts";
import {
  type Device,
  envFromProcess,
  follow,
  type Launched,
  type LaunchOptions,
  pipeLines,
  printLine,
} from "../lib/launch.ts";
import { CliError, dim, log, ToolchainError } from "../lib/log.ts";
import { iosNameProblems } from "../lib/names.ts";
import {
  iosEntitlements,
  iosInfoPlist,
  iosPlugins,
  type NativePlugin,
  swiftRegistry,
  writePluginBindings,
} from "../lib/native-plugins.ts";
import { permissionPlist } from "../lib/permissions.ts";
import { type PlistValue, toPlist } from "../lib/plist.ts";
import { type BuildContext, SigningError } from "../lib/prepare.ts";
import { privacyApiProblems, privacyManifest } from "../lib/privacy.ts";
import type { IosManifest } from "../lib/project.ts";
import { PACKAGE_ROOT } from "../lib/root.ts";
import { updatesResource } from "../lib/updates.ts";
import { swiftVectorData } from "../lib/vectors.ts";

const SHELL_SRC = join(PACKAGE_ROOT, "native", "ios", "Sources");
export const IOS_MIN = "16.0";

/** Info.plist keys only akan-native sets: the app's native.ios.infoPlist may not change them (O5-1). */
const IOS_OWNED_KEYS = [
  "CFBundleExecutable",
  "CFBundleIdentifier",
  "CFBundleName",
  "CFBundlePackageType",
  "CFBundleShortVersionString",
  "CFBundleVersion",
  "CFBundleSupportedPlatforms",
  "CFBundleInfoDictionaryVersion",
  "DTPlatformName",
  "MinimumOSVersion",
  "LSRequiresIPhoneOS",
  "UIApplicationSceneManifest",
];

/**
 * swiftc conditions for the shell's optional parts: AKAN_NATIVE_DEV (the self-test's $host methods and
 * shared vectors) and AKAN_NATIVE_UPDATES (web bundle updates, AkanNativeUpdates.swift). Code outside a condition
 * reaches these parts only under it (architecture review stage 6; Capacitor #8436, #8580: an
 * optional part that is still referenced breaks the builds without it).
 */
export function shellFeatureFlags(features: { dev: boolean; updates: boolean }): string[] {
  return [
    ...(features.dev ? ["-D", "AKAN_NATIVE_DEV"] : []),
    ...(features.updates ? ["-D", "AKAN_NATIVE_UPDATES"] : []),
  ];
}

/** Module and executable name: app.fileName without punctuation, starting with a letter (a Swift identifier). */
export function moduleName(fileName: string): string {
  const name = fileName.replace(/[^A-Za-z0-9]+/g, "");
  return /^[A-Za-z]/.test(name) ? name : `App${name}`;
}

function sha(parts: (string | Uint8Array)[]): string {
  const hash = createHash("sha256");
  for (const part of parts) hash.update(part);
  return hash.digest("hex");
}

export async function buildIos(ctx: BuildContext): Promise<string> {
  if (process.platform !== "darwin") throw new CliError("iOS apps can only be built on macOS");
  const { project, outDir } = ctx;
  const { config } = project;
  const release = !ctx.dev;
  const plugins = iosPlugins(project.plugins);
  const module = moduleName(config.app.fileName);
  // O1-2: an iPhone build is its own target (iphoneos SDK, signed), next to the simulator's.
  const device = ctx.ios?.device === true;
  const platformName = device ? "iphoneos" : "iphonesimulator";
  const targetDir = device ? join(outDir, "device") : outDir;

  const gen = join(targetDir, "gen");
  const obj = join(targetDir, "obj");
  mkdirSync(gen, { recursive: true });
  mkdirSync(obj, { recursive: true });
  writeFileSync(join(gen, "AkanNativeGeneratedPlugins.swift"), swiftRegistry(plugins));
  // Debug builds carry the shared vectors for the self-test ($host.vectors); release builds none.
  writeFileSync(join(gen, "AkanNativeVectorData.swift"), swiftVectorData(ctx.dev));
  const bindings = writePluginBindings(plugins, "ios", join(gen, "spec"), project.appDir);
  // The Keychain refuses apps without an application-identifier entitlement (errSecMissingEntitlement).
  // Xcode embeds entitlements into the simulator binary with the linker; `codesign --entitlements`
  // makes the app fail to launch there (POSIX 162), so do what Xcode does.
  const entitlements = join(gen, "Entitlements.plist");
  writeFileSync(
    entitlements,
    toPlist(iosEntitlements(config.app.id, plugins, config.deepLinks.domains, config.native?.ios?.entitlements)),
  );

  // 1. compile, skipped when no source changed
  const shellSources = [...new Bun.Glob("*.swift").scanSync({ cwd: SHELL_SRC, absolute: true })].sort();
  const generated = [
    join(gen, "AkanNativeGeneratedPlugins.swift"),
    join(gen, "AkanNativeVectorData.swift"),
    ...bindings,
  ];
  const sources = [...shellSources, ...plugins.flatMap((p) => p.sources), ...generated];
  // One Swift module: a clash of types or file names is an error here, not a confusing one from swiftc.
  const clashes = iosNameProblems({
    module,
    shellSources,
    plugins: plugins.map((p) => ({
      id: p.plugin.manifest.id,
      className: p.native.class,
      sources: p.sources,
      frameworks: p.native.frameworks ?? [],
    })),
    generated,
  });
  if (clashes.length) throw new CliError(`names clash in the iOS app:\n  - ${clashes.join("\n  - ")}`);
  const sdk = (await execOrThrow(["xcrun", "--sdk", platformName, "--show-sdk-path"], { echo: false })).stdout.trim();
  const flags = [
    "-target",
    device ? `arm64-apple-ios${IOS_MIN}` : `arm64-apple-ios${IOS_MIN}-simulator`,
    "-sdk",
    sdk,
    "-swift-version",
    "6",
    "-parse-as-library",
    "-module-name",
    module,
    ...(release ? ["-Osize", "-whole-module-optimization"] : ["-Onone", "-g"]),
    // Optional parts of the shell, compiled only when used (architecture review stage 6).
    ...shellFeatureFlags({
      dev: ctx.dev,
      updates: config.updates !== null || plugins.some((p) => p.plugin.manifest.id === "updates"),
    }),
    // The simulator reads entitlements from this section; a device from the code signature (below).
    ...(device
      ? []
      : ["-Xlinker", "-sectcreate", "-Xlinker", "__TEXT", "-Xlinker", "__entitlements", "-Xlinker", entitlements]),
  ];
  const exe = join(obj, module);
  const fingerprint = sha([...flags, readFileSync(entitlements), ...sources.flatMap((s) => [s, readFileSync(s)])]);
  const stamp = join(obj, "swift.sha256");
  if (!existsSync(exe) || !existsSync(stamp) || readFileSync(stamp, "utf8") !== fingerprint) {
    log.step(`swiftc: ${sources.length} files`);
    await execOrThrow(["xcrun", "-sdk", platformName, "swiftc", ...flags, ...sources, "-o", exe], { echo: false });
    writeFileSync(stamp, fingerprint);
  } else {
    log.info(dim("swift: unchanged, reusing the executable"));
  }

  // 2. asset catalog: app icon and launch screen (CLI-8, SH-6)
  const assets = await compileAssets(ctx, gen, obj, platformName);

  // 3. assemble a flat iOS bundle
  const appPath = join(targetDir, `${module}.app`);
  rmSync(appPath, { recursive: true, force: true });
  mkdirSync(appPath, { recursive: true });
  copyFileSync(exe, join(appPath, module));
  for (const name of readdirSync(assets.dir))
    if (name !== "partial.plist") copyFileSync(join(assets.dir, name), join(appPath, name));
  cpSync(ctx.webDir, join(appPath, "app"), { recursive: true });
  writeFileSync(join(appPath, "app", "index.html"), ctx.html);
  const boot = makeNativeBoot(ctx, "ios");
  writeFileSync(join(appPath, "boot.json"), JSON.stringify(boot));
  if (config.updates)
    writeFileSync(
      join(appPath, "updates.json"),
      updatesResource(config.updates, config.app, "ios", boot.nativeApi, ctx.dev),
    );
  writeFileSync(join(appPath, "env.runtime.json"), JSON.stringify(ctx.env, null, 2));
  writeFileSync(
    join(appPath, "shell.json"),
    JSON.stringify({
      backgroundColor: config.shell.backgroundColor,
      backgroundColorDark: config.shell.backgroundColorDark,
      devtools: ctx.dev,
      splash: { autoHide: config.splash.autoHide, timeout: config.splash.timeout },
      // L0: schemes the app adds to what links and the opener may hand to the OS.
      externalSchemes: config.security?.shell?.externalSchemes ?? [],
      keyboardResize: config.keyboard?.resize ?? "resize",
      hideFormAccessoryBar: config.ios?.hideFormAccessoryBar ?? false,
      // akan-native dev --hmr: pages come from the dev gateway (lib/hmr.ts). Never in release builds.
      ...(ctx.dev && ctx.devServer ? { devServer: ctx.devServer } : {}),
      ...(ctx.dev && ctx.startPath ? { startPath: ctx.startPath } : {}),
    }),
  );

  // Required: CFBundleExecutable, CFBundleIdentifier (install fails without them) and
  // UILaunchScreen (without it the app runs letterboxed at 320×480). The rest is recommended.
  // The launch screen names assets in Assets.car; the shell covers the WebView with the same
  // picture until the first page load (AkanNativeViewController splash).
  const base: Record<string, PlistValue> = {
    CFBundleDevelopmentRegion: "en",
    CFBundleExecutable: module,
    CFBundleIdentifier: config.app.id,
    CFBundleName: module,
    CFBundleDisplayName: config.app.name,
    CFBundleInfoDictionaryVersion: "6.0",
    CFBundlePackageType: "APPL",
    CFBundleShortVersionString: config.app.version,
    CFBundleVersion: String(config.app.build),
    CFBundleSupportedPlatforms: [device ? "iPhoneOS" : "iPhoneSimulator"],
    DTPlatformName: platformName,
    // The SDK and Xcode that built it: App Store Connect reads these (what Xcode writes).
    ...(device ? { UIRequiredDeviceCapabilities: ["arm64"], ...(await buildEnvironmentKeys()) } : {}),
    MinimumOSVersion: IOS_MIN,
    LSRequiresIPhoneOS: true,
    UIDeviceFamily: [1, 2],
    UILaunchScreen: {
      UIColorName: "AkanNativeSplashBackground",
      ...(assets.splashImage ? { UIImageName: "AkanNativeSplash" } : {}),
    },
    // The scene delegate is set in code (AkanNativeAppDelegate.configurationForConnecting).
    UIApplicationSceneManifest: { UIApplicationSupportsMultipleScenes: false },
    UISupportedInterfaceOrientations: [
      "UIInterfaceOrientationPortrait",
      "UIInterfaceOrientationLandscapeLeft",
      "UIInterfaceOrientationLandscapeRight",
    ],
    "UISupportedInterfaceOrientations~ipad": [
      "UIInterfaceOrientationPortrait",
      "UIInterfaceOrientationPortraitUpsideDown",
      "UIInterfaceOrientationLandscapeLeft",
      "UIInterfaceOrientationLandscapeRight",
    ],
    UIViewControllerBasedStatusBarAppearance: true,
    ...(config.deepLinks.schemes.length
      ? { CFBundleURLTypes: [{ CFBundleURLName: config.app.id, CFBundleURLSchemes: config.deepLinks.schemes }] }
      : {}),
    ...assets.infoPlist, // CFBundleIcons from actool
    // O4-3: a dev build for an iPhone fetches pages from the Mac over the LAN (plain http, and the
    // local network permission). Never in release builds, and not for the loopback gateway.
    ...(ctx.dev && ctx.devServer && !/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(ctx.devServer)
      ? {
          NSAppTransportSecurity: { NSAllowsLocalNetworking: true },
          NSLocalNetworkUsageDescription:
            "Development builds load the app from the development server on this network.",
        }
      : {}),
  };
  writeFileSync(
    join(appPath, "Info.plist"),
    toPlist(
      iosInfoPlist(plugins, config.usageDescriptions, permissionPlist(config.permissions, "ios"), {
        base,
        app: config.native?.ios?.infoPlist,
        owned: IOS_OWNED_KEYS,
      }),
    ),
  );
  // O5-3: the app's files for the bundle (sounds, fonts, …) at their logical places.
  for (const r of config.native?.resources ?? []) {
    if (!r.to.startsWith("ios/")) continue;
    const target = join(appPath, r.to.slice("ios/".length));
    mkdirSync(dirname(target), { recursive: true });
    cpSync(resolve(project.appDir, r.from), target, { recursive: true });
  }
  // O1-4: the App Store refuses a binary whose Required Reason APIs have no declared reason.
  const privacySources = plugins.map(({ plugin, native }) => ({
    who: `plugin ${plugin.manifest.id}`,
    apis: native.privacyApis,
  }));
  const privacyProblems = privacySources.flatMap(privacyApiProblems);
  if (privacyProblems.length) throw new CliError(privacyProblems.join("\n"));
  writeFileSync(join(appPath, "PrivacyInfo.xcprivacy"), toPlist(privacyManifest(privacySources, config.privacy)));
  if (!device) {
    await execOrThrow(["codesign", "--force", "--sign", "-", "--timestamp=none", appPath], { echo: false });
    return appPath;
  }
  await signForDevice(ctx, appPath, plugins, gen);
  // O1-3: release builds for the App Store come as an .ipa too (Payload/<App>.app, zipped by ditto as Xcode does).
  if (release) {
    const payload = join(obj, "ipa", "Payload");
    rmSync(join(obj, "ipa"), { recursive: true, force: true });
    mkdirSync(payload, { recursive: true });
    cpSync(appPath, join(payload, `${module}.app`), { recursive: true, verbatimSymlinks: true });
    const ipa = join(targetDir, `${module}.ipa`);
    rmSync(ipa, { force: true });
    await execOrThrow(["ditto", "-c", "-k", "--sequesterRsrc", "--keepParent", payload, ipa], { echo: false });
    log.info(dim(`ipa ${(statSync(ipa).size / 1024).toFixed(0)} KiB: ${ipa}`));
    ctx.artifacts.push({ kind: "ipa", path: ipa });
  }
  return appPath;
}

/**
 * Signs an iPhone build (O1-2): the identity and profile of the build's kind (development for debug,
 * App Store or ad hoc for release), the entitlements the app asks for checked against the profile,
 * the profile embedded, then codesign as Xcode runs it.
 */
async function signForDevice(
  ctx: BuildContext,
  appPath: string,
  plugins: NativePlugin<IosManifest>[],
  gen: string,
): Promise<void> {
  const { config } = ctx.project;
  const release = !ctx.dev;
  const signing = ctx.ios?.signing;
  // The API passes what it wants; only the dev CLI reads AKAN_NATIVE_IOS_* variables.
  const env: Record<string, string | undefined> = ctx.api ? {} : process.env;
  const distribution =
    signing?.distribution ?? (env.AKAN_NATIVE_IOS_DISTRIBUTION === "ad-hoc" ? "ad-hoc" : "app-store");
  const kinds: ProfileKind[] = release ? [distribution] : ["development"];
  const profilePath = signing?.provisioningProfile ?? env.AKAN_NATIVE_IOS_PROFILE;
  if (profilePath && !existsSync(profilePath)) throw new SigningError(`provisioning profile ${profilePath} not found`);
  const entitlementsFor = (profile: ProvisioningProfile): Record<string, PlistValue> => {
    const requested: Record<string, PlistValue> = {
      ...iosEntitlements(
        config.app.id,
        plugins,
        config.deepLinks.domains,
        config.native?.ios?.entitlements,
        profile.teamId,
      ),
      "com.apple.developer.team-identifier": profile.teamId,
      "get-task-allow": profile.kind === "development",
      ...(profile.entitlements["beta-reports-active"] === true ? { "beta-reports-active": true } : {}),
    };
    // aps-environment (push plugin): what the profile carries, development or production.
    const aps = profile.entitlements["aps-environment"];
    if (requested["aps-environment"] !== undefined && typeof aps === "string") requested["aps-environment"] = aps;
    return requested;
  };
  const { identity, profile } = chooseSigning(
    await signingIdentities(),
    profilePath ? [await readProfile(profilePath)] : await localProfiles(),
    {
      bundleId: config.app.id,
      kinds,
      identityKind: release ? "distribution" : "development",
      teamId: signing?.teamId ?? env.AKAN_NATIVE_IOS_TEAM,
      identity: signing?.identity ?? env.AKAN_NATIVE_IOS_IDENTITY,
      ...(ctx.ios?.target?.udid ? { device: ctx.ios.target } : {}),
      entitlementsFor,
    },
  );
  const requested = entitlementsFor(profile);
  const entitlements = join(gen, "Entitlements.device.plist");
  writeFileSync(entitlements, toPlist(requested));
  copyFileSync(profile.path, join(appPath, "embedded.mobileprovision"));
  try {
    await execOrThrow(
      [
        "codesign",
        "--force",
        "--sign",
        identity.sha1,
        "--entitlements",
        entitlements,
        "--generate-entitlement-der",
        ...(release ? [] : ["--timestamp=none"]),
        appPath,
      ],
      { echo: false },
    );
  } catch (error) {
    throw new SigningError(
      `codesign with "${identity.name}" failed (allow codesign to use the key if the keychain asks): ${(error as Error).message.split("\n").slice(1).join(" ").trim()}`,
    );
  }
  ctx.signedAs = release ? "distribution" : "development";
  const expires = profile.expires.toISOString().slice(0, 10);
  ctx.iosSigning = {
    identity: identity.name,
    identitySha1: identity.sha1,
    profile: profile.name,
    profileUuid: profile.uuid,
    teamId: profile.teamId,
    kind: profile.kind,
    expires,
  };
  log.info(
    dim(
      `signed with ${identity.name}, profile "${profile.name}" (${profile.kind}, ${profile.uuid}, team ${profile.teamId}, until ${expires})`,
    ),
  );
}

/** DTXcode, DTSDKName and friends: the build environment App Store Connect checks. */
async function buildEnvironmentKeys(): Promise<Record<string, string>> {
  const run = async (cmd: string[]) => (await exec(cmd, { echo: false })).stdout.trim();
  const [xcode, sdkVersion, sdkBuild, osBuild] = await Promise.all([
    run(["xcodebuild", "-version"]),
    run(["xcrun", "--sdk", "iphoneos", "--show-sdk-version"]),
    run(["xcrun", "--sdk", "iphoneos", "--show-sdk-build-version"]),
    run(["sw_vers", "-buildVersion"]),
  ]);
  const version = /Xcode (\d+)\.(\d+)(?:\.(\d+))?/.exec(xcode);
  const build = /Build version (\S+)/.exec(xcode)?.[1] ?? "";
  const dtXcode = version ? `${version[1]!.padStart(2, "0")}${version[2]}${version[3] ?? "0"}` : "";
  return {
    DTPlatformVersion: sdkVersion,
    DTSDKName: `iphoneos${sdkVersion}`,
    DTSDKBuild: sdkBuild,
    DTPlatformBuild: sdkBuild,
    DTXcode: dtXcode,
    DTXcodeBuild: build,
    DTCompiler: "com.apple.compilers.llvm.clang.1_0",
    BuildMachineOSBuild: osBuild,
  };
}

/** Files of a folder tree with their content, for fingerprints. */
function treeParts(dir: string, prefix = ""): (string | Uint8Array)[] {
  return readdirSync(dir)
    .sort()
    .flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory()
        ? treeParts(path, `${prefix}${name}/`)
        : [`${prefix}${name}`, readFileSync(path)];
    });
}

/**
 * Assets.xcassets → Assets.car (+ the AppIcon PNGs actool puts next to it for older lookups) with
 * `xcrun actool`, the Xcode tool, skipped when nothing changed (it takes seconds). One 1024 universal
 * icon is enough: actool derives every size (verified with Xcode 26).
 */
async function compileAssets(
  ctx: BuildContext,
  gen: string,
  obj: string,
  platformName: string,
): Promise<{ dir: string; splashImage: boolean; infoPlist: Record<string, PlistValue> }> {
  const catalog = join(gen, "Assets.xcassets");
  rmSync(catalog, { recursive: true, force: true });
  const { appIcon, splashImage } = writeIosAssets(catalog, ctx.project.config);
  const out = join(obj, "assets");
  const partial = join(out, "partial.plist");
  const args = [
    "xcrun",
    "actool",
    catalog,
    "--compile",
    out,
    "--platform",
    platformName,
    "--minimum-deployment-target",
    IOS_MIN,
    "--target-device",
    "iphone",
    "--target-device",
    "ipad",
    ...(appIcon ? ["--app-icon", "AppIcon"] : []),
    "--output-partial-info-plist",
    partial,
    "--development-region",
    "en",
    "--enable-on-demand-resources",
    "NO",
    "--output-format",
    "human-readable-text",
    "--errors",
    "--warnings",
  ];
  const fingerprint = sha([...args, ...treeParts(catalog)]);
  const stamp = join(obj, "assets.sha256");
  if (!existsSync(partial) || !existsSync(stamp) || readFileSync(stamp, "utf8") !== fingerprint) {
    log.step(`actool: ${appIcon ? "app icon, " : ""}launch screen`);
    rmSync(out, { recursive: true, force: true });
    mkdirSync(out, { recursive: true });
    const result = await execOrThrow(args, { echo: false });
    if (/error:|warning:/.test(result.stdout)) log.warn(result.stdout.trim());
    writeFileSync(stamp, fingerprint);
  } else {
    log.info(dim("assets: unchanged, reusing Assets.car"));
  }
  const json = (await execOrThrow(["plutil", "-convert", "json", "-o", "-", partial], { echo: false })).stdout;
  return { dir: out, splashImage, infoPlist: JSON.parse(json) as Record<string, PlistValue> };
}

// ------------------------------------------------------------------ run

interface SimDevice {
  udid: string;
  name: string;
  state: string;
  runtime: string;
}

async function simulators(): Promise<SimDevice[]> {
  const out = JSON.parse(
    (await execOrThrow(["xcrun", "simctl", "list", "devices", "available", "-j"], { echo: false })).stdout,
  ) as {
    devices: Record<string, { udid: string; name: string; state: string }[]>;
  };
  return Object.entries(out.devices).flatMap(([runtime, devices]) => devices.map((d) => ({ ...d, runtime })));
}

/** "com.apple.CoreSimulator.SimRuntime.iOS-26-5" → "26.5". */
const runtimeVersion = (runtime: string) => /iOS-(\d+(?:-\d+)*)$/.exec(runtime)?.[1]?.replaceAll("-", ".") ?? runtime;

const simulatorDevice = (d: SimDevice): Device => ({
  platform: "ios",
  id: d.udid,
  name: d.name,
  kind: "simulator",
  os: runtimeVersion(d.runtime),
  state: d.state === "Booted" ? "booted" : "shutdown",
});

const plainName = (s: string) => s.replace(/[\u2018\u2019]/g, "'").toLowerCase();

/**
 * `wanted` (a simulator's name or UDID), else a booted iPhone, else the newest iOS runtime's iPhone,
 * else a new device (docs/research/ios.md §4.8). A name that matches no simulator is an error, not a
 * quiet fallback: it is often an iPhone that is not paired, or a typo.
 */
async function ensureSimulator(wanted: string | undefined, headless: boolean): Promise<SimDevice> {
  const all = (await simulators()).filter((d) => d.runtime.includes("iOS"));
  const named = wanted ? all.find((d) => d.udid === wanted || plainName(d.name) === plainName(wanted)) : undefined;
  if (wanted && !named) {
    const phone = (await allPhysicalIosDevices()).find(
      (d) => d.id === wanted || d.udid === wanted || plainName(d.name) === plainName(wanted),
    );
    if (phone && !phone.paired)
      throw new CliError(
        `${phone.name} is not paired with this Mac: connect it, unlock it, trust this Mac, and open Xcode's Devices and Simulators window once`,
      );
    throw new CliError(
      `no simulator or paired iPhone called ${JSON.stringify(wanted)} (simulators: ${[...new Set(all.map((d) => d.name))].join(", ") || "none"})`,
    );
  }
  let device =
    named ??
    all.find((d) => d.state === "Booted" && d.name.startsWith("iPhone")) ??
    all.filter((d) => d.name.startsWith("iPhone")).sort((a, b) => b.runtime.localeCompare(a.runtime))[0];
  if (!device) {
    const runtimes = JSON.parse(
      (await execOrThrow(["xcrun", "simctl", "list", "runtimes", "-j"], { echo: false })).stdout,
    ) as {
      runtimes: {
        identifier: string;
        version: string;
        isAvailable: boolean;
        platform?: string;
        supportedDeviceTypes?: { identifier: string; name: string }[];
      }[];
    };
    const runtime = runtimes.runtimes
      .filter((r) => r.isAvailable && r.identifier.includes("iOS"))
      .sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }))[0];
    if (!runtime) throw new ToolchainError("no iOS simulator runtime installed (Xcode → Settings → Components)");
    const type = (runtime.supportedDeviceTypes ?? [])
      .filter((t) => t.name.startsWith("iPhone") && !t.name.includes("SE"))
      .at(-1);
    if (!type) throw new CliError(`no iPhone device type for ${runtime.identifier}`);
    log.step(`creating simulator ${type.name} (${runtime.version})`);
    const udid = (
      await execOrThrow(["xcrun", "simctl", "create", type.name, type.identifier, runtime.identifier], { echo: false })
    ).stdout.trim();
    device = { udid, name: type.name, state: "Shutdown", runtime: runtime.identifier };
  }
  if (device.state !== "Booted") {
    log.step(`booting ${device.name}`);
    await exec(["xcrun", "simctl", "boot", device.udid], { echo: false });
  }
  await execOrThrow(["xcrun", "simctl", "bootstatus", device.udid, "-b"], { echo: false });
  if (!headless) await exec(["open", "-a", "Simulator"], { echo: false });
  return { ...device, state: "Booted" };
}

export interface PhysicalIosDevice {
  /** devicectl's identifier. */
  id: string;
  name: string;
  udid: string;
  os: string;
  /** connected, disconnected (devicectl connects on demand), unavailable (not reachable). */
  tunnel: string;
}

/** Paired iPhones and iPads (`xcrun devicectl list devices`). */
export async function physicalIosDevices(): Promise<PhysicalIosDevice[]> {
  return (await allPhysicalIosDevices()).filter((d) => d.paired);
}

/** Every iPhone and iPad devicectl knows, paired or not. */
async function allPhysicalIosDevices(): Promise<(PhysicalIosDevice & { paired: boolean })[]> {
  const dir = mkdtempSync(join(tmpdir(), "akan-native-devices-"));
  try {
    const out = join(dir, "devices.json");
    const result = await exec(["xcrun", "devicectl", "list", "devices", "--json-output", out], { echo: false });
    if (result.code !== 0 || !existsSync(out)) return [];
    const devices = (JSON.parse(readFileSync(out, "utf8")).result?.devices ?? []) as {
      identifier: string;
      deviceProperties?: { name?: string; osVersionNumber?: string };
      hardwareProperties?: { udid?: string; platform?: string; reality?: string };
      connectionProperties?: { tunnelState?: string; pairingState?: string };
    }[];
    return devices
      .filter((d) => d.hardwareProperties?.reality === "physical" && d.hardwareProperties?.platform === "iOS")
      .map((d) => ({
        id: d.identifier,
        name: d.deviceProperties?.name ?? "",
        udid: d.hardwareProperties?.udid ?? "",
        os: d.deviceProperties?.osVersionNumber ?? "",
        tunnel: d.connectionProperties?.tunnelState ?? "",
        paired: d.connectionProperties?.pairingState === "paired",
      }));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** The paired device `wanted` names (its name, with ' or ’, its UDID or devicectl id), else null (a simulator then). */
export async function physicalIosDevice(wanted: string): Promise<PhysicalIosDevice | null> {
  return (
    (await physicalIosDevices()).find(
      (d) => d.id === wanted || d.udid === wanted || plainName(d.name) === plainName(wanted),
    ) ?? null
  );
}

const phoneDevice = (d: PhysicalIosDevice & { paired?: boolean }): Device => ({
  platform: "ios",
  id: d.id,
  name: d.name,
  kind: "device",
  os: d.os,
  state: d.paired === false ? "unpaired" : d.tunnel === "unavailable" ? "unavailable" : "connected",
});

/** iOS simulators and iPhones (docs/api.md devices), booted and connected ones first. */
export async function iosDevices(): Promise<Device[]> {
  const sims = (await simulators()).filter((d) => d.runtime.includes("iOS")).map(simulatorDevice);
  const phones = (await allPhysicalIosDevices()).map(phoneDevice);
  const rank = (d: Device) => (d.state === "booted" || d.state === "connected" ? 0 : 1);
  return [...phones, ...sims].sort((a, b) => rank(a) - rank(b));
}

/** Installs and starts a device build with devicectl (O4-4); its console output is the log stream. */
async function launchOnDevice(
  ctx: BuildContext,
  appPath: string,
  device: PhysicalIosDevice,
  opts: LaunchOptions,
): Promise<Launched> {
  if (device.tunnel === "unavailable")
    throw new CliError(
      `${device.name} is not reachable: connect it with a cable or put it on the same network, and unlock it`,
    );
  const appId = ctx.project.config.app.id;
  log.step(`install on ${device.name} (iOS ${device.os})`);
  await execOrThrow(["xcrun", "devicectl", "device", "install", "app", "--device", device.id, appPath], {
    echo: false,
  });
  const env = Object.keys(opts.env).length ? ["--environment-variables", JSON.stringify(opts.env)] : [];
  const proc = Bun.spawn(
    [
      "xcrun",
      "devicectl",
      "device",
      "process",
      "launch",
      "--device",
      device.id,
      "--terminate-existing",
      "--console",
      ...env,
      appId,
    ],
    {
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const onLine = opts.onLine ?? printLine;
  const logs = Promise.all([pipeLines(proc.stdout, onLine), pipeLines(proc.stderr, onLine)]);
  return {
    exited: proc.exited.then(async (code) => {
      await logs;
      return code;
    }),
    stop: () => proc.kill("SIGTERM"),
    device: phoneDevice(device),
  };
}

export async function launchIos(
  ctx: BuildContext,
  appPath: string,
  opts: LaunchOptions & { device?: string },
): Promise<Launched> {
  if (ctx.ios?.device) {
    const physical = opts.device ? await physicalIosDevice(opts.device) : (await physicalIosDevices())[0];
    if (!physical)
      throw new CliError(
        opts.device
          ? `no paired iPhone called ${opts.device} (xcrun devicectl list devices)`
          : "no paired iPhone (pair it in Xcode's Devices window first)",
      );
    return launchOnDevice(ctx, appPath, physical, opts);
  }
  const sim = await ensureSimulator(opts.device, opts.headless);
  const udid = sim.udid;
  const appId = ctx.project.config.app.id;
  log.step(`install on ${udid}`);
  await execOrThrow(["xcrun", "simctl", "install", udid, appPath], { echo: false });
  // simctl passes SIMCTL_CHILD_* to the app without the prefix; dev builds read AKAN_NATIVE_PUBLIC_*.
  const childEnv: Record<string, string> = {};
  for (const [key, value] of Object.entries(opts.env)) childEnv[`SIMCTL_CHILD_${key}`] = value;
  // --console-pty: the app's stdout/stderr (native and forwarded page console, WV-3). Ending it ends the app.
  const proc = Bun.spawn(["xcrun", "simctl", "launch", "--console-pty", "--terminate-running-process", udid, appId], {
    env: { ...process.env, ...childEnv },
    stdin: "ignore",
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
      proc.kill("SIGTERM");
      void exec(["xcrun", "simctl", "terminate", udid, appId], { echo: false });
    },
    device: simulatorDevice(sim),
  };
}

export async function runIos(ctx: BuildContext, appPath: string, args: ParsedArgs): Promise<number> {
  const app = await launchIos(ctx, appPath, {
    env: envFromProcess(),
    headless: args.flags.headless === true,
    device: typeof args.flags.device === "string" ? args.flags.device : undefined,
  });
  log.ok(`launched ${ctx.project.config.app.id}, logs below. Ctrl+C to stop.`);
  return follow(app);
}

/**
 * `akan-native plugin compile ios`: typechecks the shell, these plugins and their generated bindings with
 * a registry of just them, in a fresh temporary folder (so several checks can run at once).
 */
export async function typecheckIosPlugins(plugins: NativePlugin<IosManifest>[], appDir: string): Promise<ExecResult> {
  const dir = mkdtempSync(join(tmpdir(), "akan-native-compile-ios-"));
  try {
    writeFileSync(join(dir, "AkanNativeGeneratedPlugins.swift"), swiftRegistry(plugins));
    writeFileSync(join(dir, "AkanNativeVectorData.swift"), swiftVectorData(false));
    const bindings = writePluginBindings(plugins, "ios", join(dir, "spec"), appDir);
    const sdk = (
      await execOrThrow(["xcrun", "--sdk", "iphonesimulator", "--show-sdk-path"], { echo: false })
    ).stdout.trim();
    return await exec(
      [
        "xcrun",
        "-sdk",
        "iphonesimulator",
        "swiftc",
        "-typecheck",
        "-target",
        `arm64-apple-ios${IOS_MIN}-simulator`,
        "-sdk",
        sdk,
        "-swift-version",
        "6",
        "-parse-as-library",
        "-module-name",
        "AkanNativeCheck",
        ...shellFeatureFlags({ dev: true, updates: true }),
        ...[...new Bun.Glob("*.swift").scanSync({ cwd: SHELL_SRC, absolute: true })].sort(),
        ...plugins.flatMap((p) => p.sources),
        join(dir, "AkanNativeGeneratedPlugins.swift"),
        join(dir, "AkanNativeVectorData.swift"),
        ...bindings,
      ],
      { echo: false },
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
