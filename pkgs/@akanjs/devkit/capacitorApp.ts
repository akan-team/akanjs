import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { CapacitorConfig } from "@capacitor/cli";
import { select } from "@inquirer/prompts";
import { MobileProject } from "@trapezedev/project";
import type { AndroidProject } from "@trapezedev/project/dist/android/project";
import type { IosProject } from "@trapezedev/project/dist/ios/project";
import type { AkanPlugin } from "akanjs";
import { capitalize, isRecord } from "akanjs/common";
import type { AkanMobileTargetConfig } from "./akanConfig";
import { type AppExecutor, CommandExecutionError } from "./executors";
import { FileEditor } from "./fileEditor";
import { resolveMobilePath, targetHtmlFilename } from "./mobile";

interface RunConfig {
  operation: "local" | "release";
  env: "local" | "debug" | "develop" | "main";
  regenerate?: boolean;
}

interface RunIosConfig extends RunConfig {
  noAllowProvisioningUpdates?: boolean;
  iosDeviceId?: string;
}

interface PrepareConfig extends RunConfig {
  iosRunTargetKind?: IosRunTargetKind;
}

type MobileCommandEnv = Record<string, string | undefined>;

export type IosRunTargetKind = "device" | "simulator";
export interface IosRunTarget {
  id: string;
  name: string;
  kind: IosRunTargetKind;
  state?: string;
  /** Display runtime for simulators, e.g. "iOS 18.2". Undefined for physical devices. */
  runtime?: string;
  devicectlId?: string;
  xcodebuildId?: string;
}

export interface IosNativeRunCommand {
  xcodebuildArgs: string[];
  appPath: string;
  configuration: "Debug" | "Release";
  derivedDataPath: string;
}

export type IosRunFailureKind =
  | "apple-account"
  | "bundle-identifier"
  | "compiler-toolchain"
  | "team-permission"
  | "license-agreement"
  | "certificate"
  | "provisioning-profile"
  | "device-registration"
  | "device-state"
  | "devicectl-unavailable"
  | "simulator-runtime"
  | "unknown";

// iOS 18+ SDKs split SwiftUI into a SwiftUICore dylib older runtimes lack, so such a build dyld-crashes below iOS 18.
export const SWIFTUICORE_MIN_IOS_MAJOR = 18;

export interface IosRunFailureClassification {
  kind: IosRunFailureKind;
  title: string;
  detail: string;
}

const iosNativeBlockedEnvKeys = new Set(
  "AR AS CC CFLAGS CONDA_BUILD_SYSROOT CONDA_PREFIX CPP CPPFLAGS CPATH CXX CXXFLAGS LD LDFLAGS LIBRARY_PATH"
    .split(" ")
    .concat("MACOSX_DEPLOYMENT_TARGET NM OBJC OBJCXX PREFIX RANLIB SDKROOT STRIP".split(" ")),
);

export const rootCapacitorConfigFilenames = [
  "capacitor.config.ts",
  "capacitor.config.js",
  "capacitor.config.json",
] as const;

export const rootCapacitorConfigPaths = (appRoot: string) =>
  rootCapacitorConfigFilenames.map((file) => path.join(appRoot, file));

export async function clearRootCapacitorConfigs(appRoot: string) {
  await Promise.all(rootCapacitorConfigPaths(appRoot).map((file) => rm(file, { force: true })));
}

export async function writeRootCapacitorConfig(appRoot: string, content: string) {
  await clearRootCapacitorConfigs(appRoot);
  await Bun.write(path.join(appRoot, "capacitor.config.json"), content);
}

interface MaterializeCapacitorConfigOptions {
  operation: RunConfig["operation"];
  localServerUrl?: string;
  localIp?: string;
}
type MobilePlatform = "ios" | "android";

type SpawnMobileOptions = Parameters<AppExecutor["spawn"]>[2] & {
  platform?: MobilePlatform;
  iosRunTargetKind?: IosRunTargetKind;
};

export interface LocalDevHostResolution {
  host: string;
  source: "override" | "detected" | "loopback" | "platform";
  candidates: { name: string; address: string }[];
}

// Almost never a LAN NIC a device can reach: bridges, tunnels, AirDrop/awdl, VM and container adapters.
const virtualInterfacePrefixes = "bridge utun llw awdl ap vmnet vnic tap tun docker veth vboxnet gif stf".split(" ");
const physicalInterfacePrefixes = ["en", "eth", "wlan", "wlp", "enp", "eno", "wlo"];

const isPrivateLanIpv4 = (address: string): boolean => {
  if (address.startsWith("10.") || address.startsWith("192.168.")) return true;
  const secondOctet = Number(address.match(/^172\.(\d+)\./)?.[1]);
  return Number.isFinite(secondOctet) && secondOctet >= 16 && secondOctet <= 31;
};

// Link-local (169.254) is never routable.
const scoreDevHostCandidate = (name: string, address: string): number => {
  const lowerName = name.toLowerCase();
  let score = 0;
  if (address.startsWith("169.254.")) score -= 1000;
  if (virtualInterfacePrefixes.some((prefix) => lowerName.startsWith(prefix))) score -= 100;
  else if (physicalInterfacePrefixes.some((prefix) => lowerName.startsWith(prefix))) score += 100;
  if (isPrivateLanIpv4(address)) score += 10;
  return score;
};

// Ranked, not first-found: an inactive Thunderbolt bridge is often enumerated before the real LAN NIC.
export const selectLocalDevHost = (
  interfaces: NodeJS.Dict<os.NetworkInterfaceInfo[]>,
  { override }: { override?: string } = {},
): LocalDevHostResolution => {
  const candidates: { name: string; address: string }[] = [];
  for (const [name, aliases] of Object.entries(interfaces)) {
    for (const alias of aliases ?? []) {
      if (alias.family !== "IPv4" || alias.internal) continue;
      candidates.push({ name, address: alias.address });
    }
  }
  const trimmedOverride = override?.trim();
  if (trimmedOverride) return { host: trimmedOverride, source: "override", candidates };
  const [best] = [...candidates].sort(
    (a, b) =>
      scoreDevHostCandidate(b.name, b.address) - scoreDevHostCandidate(a.name, a.address) ||
      a.name.localeCompare(b.name) ||
      a.address.localeCompare(b.address),
  );
  return best
    ? { host: best.address, source: "detected", candidates }
    : { host: "127.0.0.1", source: "loopback", candidates };
};

const asString = (value: unknown) => (typeof value === "string" ? value : undefined);

const firstString = (...values: unknown[]) => values.find((value): value is string => typeof value === "string");

const scoreIosDeviceTarget = (target: IosRunTarget) => {
  const state = target.state?.toLowerCase() ?? "";
  return (state.includes("available") ? 4 : 0) + (state.includes("wired") ? 2 : 0) + (state.includes("paired") ? 1 : 0);
};

const dedupeIosRunTargets = (targets: IosRunTarget[]) => {
  const byKey = new Map<string, IosRunTarget>();
  const runnableTargets = targets.filter((target) => !target.state?.toLowerCase().includes("unavailable"));
  for (const target of runnableTargets) {
    const key = target.xcodebuildId ?? target.id;
    const current = byKey.get(key);
    if (!current || scoreIosDeviceTarget(target) > scoreIosDeviceTarget(current)) byKey.set(key, target);
  }
  return [...byKey.values()];
};

// simctl spells a runtime as a JSON key ("com.apple.CoreSimulator.SimRuntime.iOS-18-2") or as "iOS 18.2".
const formatSimctlRuntime = (key?: string): string | undefined => {
  if (!key) return undefined;
  if (/^(iOS|watchOS|tvOS|visionOS)\s+[\d.]+$/i.test(key)) return key;
  const match = key.match(/(iOS|watchOS|tvOS|visionOS)-(\d+)(?:-(\d+))?/i);
  if (!match) return undefined;
  return `${match[1]} ${match[2]}${match[3] ? `.${match[3]}` : ""}`;
};

export const parseIosRuntimeMajor = (runtime?: string): number | undefined => {
  const major = runtime?.match(/\d+/)?.[0];
  return major === undefined ? undefined : Number.parseInt(major, 10);
};

const iosRunTargetRank = (target: IosRunTarget): number => {
  const state = target.state?.toLowerCase() ?? "";
  const ready = state.includes("booted") || state.includes("connected") || state.includes("available") ? 1000 : 0;
  const device = target.kind === "device" ? 500 : 0;
  return ready + device + (parseIosRuntimeMajor(target.runtime) ?? 0);
};

export const sortIosRunTargets = (targets: IosRunTarget[]): IosRunTarget[] =>
  [...targets].sort((a, b) => iosRunTargetRank(b) - iosRunTargetRank(a) || a.name.localeCompare(b.name));

function walkRecords(value: unknown, visit: (record: Record<string, unknown>) => void) {
  if (Array.isArray(value)) {
    for (const item of value) walkRecords(item, visit);
    return;
  }
  if (!isRecord(value)) return;
  visit(value);
  for (const item of Object.values(value)) walkRecords(item, visit);
}

export function parseDevicectlDevices(output: string): IosRunTarget[] {
  try {
    const json = JSON.parse(output) as unknown;
    const targets = new Map<string, IosRunTarget>();
    walkRecords(json, (record) => {
      const deviceProperties = isRecord(record.deviceProperties) ? record.deviceProperties : {};
      const hardwareProperties = isRecord(record.hardwareProperties) ? record.hardwareProperties : {};
      const connectionProperties = isRecord(record.connectionProperties) ? record.connectionProperties : {};
      const devicectlId = firstString(record.identifier, record.deviceIdentifier);
      const potentialHostnames = Array.isArray(connectionProperties.potentialHostnames)
        ? connectionProperties.potentialHostnames.filter((value): value is string => typeof value === "string")
        : [];
      const hostnameUdid = potentialHostnames
        .map((hostname) => hostname.match(/([0-9A-Fa-f]{8}-[0-9A-Fa-f]{16})\.coredevice\.local/)?.[1])
        .find((value): value is string => Boolean(value));
      const udid = firstString(hardwareProperties.udid, hostnameUdid, record.udid, record.UDID);
      const id = udid ?? devicectlId;
      const name = firstString(deviceProperties.name, record.name, record.deviceName, record.displayName);
      if (!id || !name) return;
      const state = [
        firstString(record.state, record.connectionState, record.availability, connectionProperties.tunnelState),
        firstString(connectionProperties.transportType),
        firstString(connectionProperties.pairingState),
      ]
        .filter(Boolean)
        .join(" ");
      targets.set(id, { id, name, kind: "device", state, devicectlId, xcodebuildId: udid ?? id });
    });
    return dedupeIosRunTargets([...targets.values()]);
  } catch {
    const targets: IosRunTarget[] = [];
    for (const line of output.split(/\r?\n/)) {
      const id = line.match(/[0-9A-Fa-f]{8}-[0-9A-Fa-f]{16}|[0-9A-Fa-f-]{25,}/)?.[0];
      if (!id) continue;
      const name = line.replace(id, "").replace(/[()]/g, " ").trim().replace(/\s+/g, " ") || id;
      targets.push({ id, name, kind: "device" });
    }
    return dedupeIosRunTargets(targets);
  }
}

export function parseSimctlDevices(output: string): IosRunTarget[] {
  try {
    const json = JSON.parse(output) as { devices?: Record<string, unknown[]> };
    const devices = json.devices ?? {};
    return Object.entries(devices).flatMap(([runtimeKey, list]) => {
      const runtime = formatSimctlRuntime(runtimeKey);
      return (Array.isArray(list) ? list : []).filter(isRecord).flatMap((device) => {
        const id = firstString(device.udid, device.UDID, device.identifier);
        const name = firstString(device.name, device.displayName);
        const isAvailable = device.isAvailable !== false && device.availabilityError === undefined;
        if (!id || !name || !isAvailable) return [];
        return [
          {
            id,
            name,
            kind: "simulator" as const,
            state: asString(device.state),
            runtime: runtime ?? formatSimctlRuntime(asString(device.runtimeIdentifier)),
          },
        ];
      });
    });
  } catch {
    const targets: IosRunTarget[] = [];
    let runtime: string | undefined;
    for (const line of output.split(/\r?\n/)) {
      const header = line.match(/^--\s*(.+?)\s*--\s*$/);
      if (header) {
        runtime = formatSimctlRuntime(header[1]);
        continue;
      }
      const match = line.match(/^\s*(.+?)\s+\(([0-9A-Fa-f-]{20,})\)\s+\(([^)]+)\)/);
      if (!match) continue;
      targets.push({ id: match[2], name: match[1].trim(), kind: "simulator", state: match[3], runtime });
    }
    return targets;
  }
}

export function buildIosNativeRunCommand({
  appRoot,
  device,
  scheme = "App",
  configuration = "Debug",
}: {
  appRoot: string;
  device: IosRunTarget;
  scheme?: string;
  configuration?: "Debug" | "Release";
}): IosNativeRunCommand {
  const derivedDataPath = path.join(appRoot, "ios/DerivedData", device.id);
  const productPlatform = device.kind === "device" ? "iphoneos" : "iphonesimulator";
  const destination =
    device.kind === "device" ? `id=${device.xcodebuildId ?? device.id}` : `platform=iOS Simulator,id=${device.id}`;
  return {
    configuration,
    derivedDataPath,
    appPath: path.join(derivedDataPath, "Build/Products", `${configuration}-${productPlatform}`, "App.app"),
    xcodebuildArgs: [
      "-project",
      "App.xcodeproj",
      "-scheme",
      scheme,
      "-configuration",
      configuration,
      "-destination",
      destination,
      "-derivedDataPath",
      derivedDataPath,
      "build",
    ],
  };
}

export function classifyIosRunFailure(log: string): IosRunFailureClassification {
  const lower = log.toLowerCase();
  if (
    lower.includes("swiftuicore") &&
    (lower.includes("library not loaded") || lower.includes("library missing") || lower.includes("dyld"))
  ) {
    return {
      kind: "simulator-runtime",
      title: "App crashed loading SwiftUICore — the iOS runtime is too old.",
      detail: `The build links SwiftUICore, which only exists on iOS ${SWIFTUICORE_MIN_IOS_MAJOR}+. Rerun on an iOS ${SWIFTUICORE_MIN_IOS_MAJOR} or newer simulator/device (pass --device to pick one non-interactively).`,
    };
  }
  if (lower.includes("unknown argument: '-index-store-path'") || lower.includes("compiler was not recognized")) {
    return {
      kind: "compiler-toolchain",
      title: "iOS build is using a non-Xcode compiler from the shell environment.",
      detail:
        "Akan removes common Conda/compiler environment variables for native iOS runs. If this persists, run outside the activated toolchain environment.",
    };
  }
  if (lower.includes("developer mode") && lower.includes("disabled")) {
    return {
      kind: "device-state",
      title: "iOS device Developer Mode is disabled.",
      detail: "Enable Developer Mode on the iPhone, then reconnect and run the command again.",
    };
  }
  if (lower.includes("untrusted") || lower.includes("not paired") || lower.includes("locked")) {
    return {
      kind: "device-state",
      title: "iOS device is not ready for installation.",
      detail: "Unlock the iPhone, trust this computer, and make sure the device is paired before retrying.",
    };
  }
  if (
    lower.includes('unable to find utility "devicectl"') ||
    (lower.includes("devicectl") && lower.includes("not found"))
  ) {
    return {
      kind: "devicectl-unavailable",
      title: "Xcode devicectl is not available.",
      detail: "Install a recent Xcode version and verify xcode-select points to that Xcode installation.",
    };
  }
  if (
    lower.includes("there are no accounts registered with xcode") ||
    lower.includes("unable to log in with account")
  ) {
    return {
      kind: "apple-account",
      title: "Xcode Apple ID is not available.",
      detail: "Sign in to an Apple ID in Xcode Settings > Accounts, then retry the Akan iOS command.",
    };
  }
  if (
    lower.includes("failed registering bundle identifier") ||
    lower.includes("cannot be registered to your development team")
  ) {
    return {
      kind: "bundle-identifier",
      title: "iOS bundle identifier is not available for this Apple Developer Team.",
      detail:
        "Change mobile appId to a globally unique bundle identifier that your team can register, then rerun the iOS command.",
    };
  }
  if (lower.includes("does not have permission") || (lower.includes("your account") && lower.includes("permission"))) {
    return {
      kind: "team-permission",
      title: "Apple Developer Team permission is missing.",
      detail: "Check that the signed-in Apple ID has permission for the selected DEVELOPMENT_TEAM.",
    };
  }
  if (lower.includes("license agreement") || lower.includes("program license agreement")) {
    return {
      kind: "license-agreement",
      title: "Apple Developer Program license agreement is not accepted.",
      detail: "Accept the latest Apple Developer Program license agreement, then retry.",
    };
  }
  if (lower.includes("no signing certificate") || lower.includes("doesn't include signing certificate")) {
    return {
      kind: "certificate",
      title: "iOS development signing certificate is missing.",
      detail: "Create or download an Apple Development certificate for the selected team.",
    };
  }
  if (lower.includes("device") && lower.includes("not") && lower.includes("registered")) {
    return {
      kind: "device-registration",
      title: "iPhone is not registered in the provisioning profile.",
      detail: "Allow provisioning updates with a team that can register this device, or register the device manually.",
    };
  }
  if (lower.includes("no profiles for") || lower.includes("requires a provisioning profile")) {
    return {
      kind: "provisioning-profile",
      title: "Matching iOS provisioning profile was not found.",
      detail:
        "Akan can request Xcode provisioning updates for physical devices, but the Apple account and team must be valid.",
    };
  }
  return {
    kind: "unknown",
    title: "iOS native run failed.",
    detail:
      "Review the xcodebuild/devicectl output above. You can retry with --no-allow-provisioning-updates to use the conservative path.",
  };
}

export function formatIosRunFailureMessage(input: {
  classification: IosRunFailureClassification;
  appId: string;
  targetName: string;
  teamId?: string;
}) {
  return [
    input.classification.title,
    input.classification.detail,
    `Mobile target: ${input.targetName}`,
    `Bundle ID: ${input.appId}`,
    input.teamId ? `Development Team: ${input.teamId}` : null,
    "Capacitor is still used for native project generation and sync; Akan only runs the native build/install step directly.",
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

export function sanitizeIosNativeRunEnv(env: MobileCommandEnv): MobileCommandEnv {
  return Object.fromEntries(Object.entries(env).filter(([key]) => !iosNativeBlockedEnvKeys.has(key)));
}

// Placeholder bundle IDs are already claimed on Apple's portal, so device signing fails with "cannot be registered
// to your development team".
export const PLACEHOLDER_APP_IDS = [
  "com.myapp.app",
  "com.myorg.myapp",
  "com.example.app",
  "com.example.myapp",
] as const;
const placeholderAppIdSegment = /^(example|examples|myorg|myapp|mycompany|myorganization|changeme|todo|sample|test)$/;

export const isPlaceholderAppId = (appId: string | null | undefined): boolean => {
  const normalized = appId?.trim().toLowerCase() ?? "";
  if (!normalized) return true;
  if ((PLACEHOLDER_APP_IDS as readonly string[]).includes(normalized)) return true;
  return normalized.split(".").some((segment) => placeholderAppIdSegment.test(segment));
};

const androidReleaseSigningKeys = [
  "MYAPP_RELEASE_STORE_FILE",
  "MYAPP_RELEASE_STORE_PASSWORD",
  "MYAPP_RELEASE_KEY_ALIAS",
  "MYAPP_RELEASE_KEY_PASSWORD",
] as const;

export function getMissingAndroidReleaseSigningKeys({
  env = process.env,
  gradleProperties = "",
}: {
  env?: NodeJS.ProcessEnv;
  gradleProperties?: string;
} = {}) {
  return androidReleaseSigningKeys.filter((key) => {
    const gradleEnvKey = `ORG_GRADLE_PROJECT_${key}`;
    return (
      env[key] === undefined &&
      env[gradleEnvKey] === undefined &&
      !new RegExp(`^\\s*${key}\\s*=`, "m").test(gradleProperties)
    );
  });
}

export function formatAndroidReleaseSigningError(missingKeys: readonly string[]) {
  return [
    "Android release signing configuration is incomplete.",
    `Missing: ${missingKeys.join(", ")}`,
    "Set these values in android/gradle.properties or ORG_GRADLE_PROJECT_* environment variables before building a release artifact.",
  ].join("\n");
}

export function getAdbDeviceStateIssues(output: string) {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim().split(/\s+/))
    .filter(([id, state]) => id && state && id !== "List")
    .flatMap(([id, state]) => {
      if (state === "unauthorized")
        return [`Android device ${id} is unauthorized. Confirm USB debugging authorization on the device.`];
      if (state === "offline") return [`Android device ${id} is offline. Reconnect the device or restart adb.`];
      return [];
    });
}

export function getAndroidLocalServerHost(adbDevicesOutput: string | undefined, fallbackHost: string) {
  const onlineDeviceIds =
    adbDevicesOutput
      ?.split(/\r?\n/)
      .map((line) => line.trim().split(/\s+/))
      .filter(([id, state]) => id && state === "device")
      .map(([id]) => id) ?? [];
  return onlineDeviceIds.length === 1 && onlineDeviceIds[0]?.startsWith("emulator-") ? "10.0.2.2" : fallbackHost;
}

export const ANDROID_MIN_SDK_VERSION = 26;
export function raiseGradleMinSdkVersion(content: string, floor: number = ANDROID_MIN_SDK_VERSION): string | null {
  const match = content.match(/minSdkVersion\s*=\s*(\d+)/);
  if (!match?.[1]) return null;
  const current = Number.parseInt(match[1], 10);
  if (Number.isNaN(current) || current >= floor) return null;
  return content.replace(/(minSdkVersion\s*=\s*)\d+/, `$1${floor}`);
}

//* Apple's Info.plist keys do not follow the description names (photo → NSPhotoLibrary…), so each one is spelled out.
const iosUsageDescriptionKeys = {
  cameraUsageDescription: ["NSCameraUsageDescription"],
  photoAddUsageDescription: ["NSPhotoLibraryAddUsageDescription"],
  photoUsageDescription: ["NSPhotoLibraryUsageDescription"],
  contactsUsageDescription: ["NSContactsUsageDescription"],
  //? iOS 11+ reads the AlwaysAndWhenInUse key; the Always key only serves iOS 10 and below.
  locationAlwaysUsageDescription: ["NSLocationAlwaysAndWhenInUseUsageDescription", "NSLocationAlwaysUsageDescription"],
  locationWhenInUseUsageDescription: ["NSLocationWhenInUseUsageDescription"],
  microphoneUsageDescription: ["NSMicrophoneUsageDescription"],
  speechRecognitionUsageDescription: ["NSSpeechRecognitionUsageDescription"],
} as const;

export const toIosInfoPlistUsageDescriptions = (descriptions: { [key: string]: string }) =>
  Object.fromEntries(
    Object.entries(descriptions).flatMap(([key, value]) => {
      const plistKeys: readonly string[] = Object.hasOwn(iosUsageDescriptionKeys, key)
        ? iosUsageDescriptionKeys[key as keyof typeof iosUsageDescriptionKeys]
        : [`NS${capitalize(key)}`];
      return plistKeys.map((plistKey) => [plistKey, value]);
    }),
  );

const mergeAllowNavigation = (configured: unknown, localIp: string | undefined) => {
  const values = Array.isArray(configured)
    ? configured.filter((value): value is string => typeof value === "string")
    : [];
  if (localIp) values.push(localIp);
  values.push("localhost");
  return [...new Set(values)];
};

export function assertJsonSerializable(value: unknown, label = "capacitor.config", seen = new WeakSet<object>()) {
  if (value === null) return;
  const valueType = typeof value;
  if (valueType === "function" || valueType === "symbol" || valueType === "bigint" || valueType === "undefined") {
    throw new Error(`${label} must be JSON serializable. Found ${valueType}.`);
  }
  if (valueType === "number" && !Number.isFinite(value)) {
    throw new Error(`${label} must be JSON serializable. Found non-finite number.`);
  }
  if (valueType !== "object") return;
  const objectValue = value as object;
  if (seen.has(objectValue)) throw new Error(`${label} must be JSON serializable. Found circular reference.`);
  seen.add(objectValue);
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) assertJsonSerializable(item, `${label}[${index}]`, seen);
    return;
  }
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    assertJsonSerializable(item, `${label}.${key}`, seen);
  }
}

export function materializeCapacitorConfig(
  target: AkanMobileTargetConfig,
  { operation, localServerUrl, localIp }: MaterializeCapacitorConfigOptions,
): CapacitorConfig {
  const { name, appId, appName } = target;
  const usesPushNotifications = target.permissions?.includes("push") ?? false;
  const config: CapacitorConfig = {
    appId,
    appName,
    webDir: path.posix.join(".akan", "mobile", name, "www"),
    plugins: {
      CapacitorCookies: { enabled: true },
      ...(usesPushNotifications ? { PushNotifications: { presentationOptions: ["badge", "sound", "alert"] } } : {}),
      Keyboard: { resize: "none" },
    },
    android: { path: "android" },
    ios: { path: "ios" },
  };
  if (operation === "local") {
    if (!localServerUrl) throw new Error(`Local server URL is required for mobile target '${name}'.`);
    config.server = {
      androidScheme: "http",
      url: localServerUrl,
      cleartext: true,
      allowNavigation: mergeAllowNavigation(undefined, localIp),
    };
  }
  assertJsonSerializable(config);
  return config;
}

export class CapacitorApp {
  project: MobileProject & { ios: IosProject; android: AndroidProject };
  iosTargetName = "App";
  readonly targetRoot: string;
  readonly targetRootPath: string;
  readonly targetWebRoot: string;
  readonly targetAssetRoot: string;
  readonly iosRootPath = "ios";
  readonly iosProjectPath = "ios/App";
  readonly androidRootPath = "android";
  readonly androidAssetsPath = "android/app/src/main/assets";
  #iosEntitlements: Record<string, string | string[]> = {};
  constructor(
    private readonly app: AppExecutor,
    readonly target: AkanMobileTargetConfig,
  ) {
    this.targetRootPath = path.posix.join(".akan", "mobile", this.target.name);
    this.targetRoot = path.join(this.app.cwdPath, this.targetRootPath);
    this.targetWebRoot = path.join(this.targetRoot, "www");
    this.targetAssetRoot = path.join(this.targetRoot, "assets");
    this.project = new MobileProject(this.app.cwdPath, {
      android: { path: this.androidRootPath },
      ios: { path: this.iosProjectPath },
    }) as MobileProject & { ios: IosProject; android: AndroidProject };
  }
  async init({
    platform,
    operation = "release",
    env = "debug",
    regenerate = false,
  }: { platform?: "ios" | "android" } & Partial<PrepareConfig> = {}) {
    await mkdir(this.targetRoot, { recursive: true });
    if (regenerate) {
      if (!platform || platform === "ios")
        await rm(path.join(this.app.cwdPath, this.iosRootPath), { recursive: true, force: true });
      if (!platform || platform === "android")
        await rm(path.join(this.app.cwdPath, this.androidRootPath), { recursive: true, force: true });
    }
    const project = this.project as MobileProject;
    await this.project.load();
    if ((!platform || platform === "android") && !project.android) {
      await this.#spawnMobile("npx", ["cap", "add", "android"], { operation, env });
      await this.project.load();
    }
    if ((!platform || platform === "ios") && !project.ios) {
      await this.#spawnMobile("npx", ["cap", "add", "ios"], { operation, env });
      await this.project.load();
    }
    return this;
  }
  async save() {
    await this.project.commit();
  }
  async #prepareIos({ operation, env, regenerate = false, iosRunTargetKind }: PrepareConfig) {
    await this.init({ platform: "ios", operation, env, regenerate });
    await this.#prepareTargetAssets();
    await this.#prepareExternalFiles("ios");
    await this.#applyIosMetadata();
    await this.#applyPermissions({ operation, env });
    await this.#applyDeepLinks("ios", { operation, env });
    await this.#flushIosEntitlements();
    await this.project.commit();
    await this.#setCodeSignEntitlementsInIosIfExists("App/App.entitlements");
    await this.#generateAssets({ operation, env });
    this.app.verbose(`syncing iOS`);
    await this.#spawnMobile("npx", ["cap", "sync", "ios"], { operation, env }, { iosRunTargetKind });
    this.app.verbose(`sync completed.`);
  }
  async buildIos({ env = "debug", regenerate = false }: { env?: RunConfig["env"]; regenerate?: boolean } = {}) {
    await this.prepareWww();
    await this.#prepareIos({ operation: "release", env, regenerate });
    await this.#spawnMobile("npx", ["cap", "build", "ios"], { operation: "release", env }, { stdio: "inherit" });
    this.app.verbose(`build completed iOS.`);
  }
  async syncIos() {
    await this.#spawnMobile("npx", ["cap", "sync", "ios"], { operation: "local", env: "local" });
  }
  async openIos() {
    await this.#spawnMobile("npx", ["cap", "open", "ios"], { operation: "local", env: "local" });
  }
  async runIos({ operation, env, regenerate = false, noAllowProvisioningUpdates = false, iosDeviceId }: RunIosConfig) {
    if (operation === "release") await this.prepareWww();
    const runTarget = await this.#selectIosRunTarget(iosDeviceId);
    await this.#prepareIos({ operation, env, regenerate, iosRunTargetKind: runTarget.kind });
    if (runTarget.kind === "simulator") {
      await this.#spawnMobile(
        "npx",
        ["cap", "run", "ios", "--target", runTarget.id, "--no-sync"],
        { operation, env },
        { stdio: "inherit", platform: "ios", iosRunTargetKind: runTarget.kind },
      );
      return;
    }
    await this.#runIosPhysicalDevice({ operation, env, runTarget, noAllowProvisioningUpdates });
  }

  async #selectIosRunTarget(deviceId?: string) {
    const targets = sortIosRunTargets([
      ...(await this.#loadPhysicalIosDevices()),
      ...(await this.#loadIosSimulators()),
    ]);
    if (deviceId) {
      const needle = deviceId.toLowerCase();
      const found =
        targets.find((target) => target.id === deviceId) ??
        targets.find((target) => target.name.toLowerCase() === needle) ??
        targets.find(
          (target) =>
            target.name.toLowerCase().includes(needle) ||
            target.id.toLowerCase().includes(needle) ||
            (target.runtime?.toLowerCase().includes(needle) ?? false),
        );
      if (!found) {
        const available = targets.map((t) => `${t.name}${t.runtime ? ` (${t.runtime})` : ""}`).join(", ") || "none";
        throw new Error(`iOS run target '${deviceId}' was not found. Available: ${available}`);
      }
      this.#warnIfLegacySimulatorRuntime(found);
      return found;
    }
    if (targets.length === 0) {
      throw new Error("No iOS run targets found. Open Simulator or connect an iPhone, then retry.");
    }
    const selected = await select<IosRunTarget>({
      message: "Select iOS run target",
      choices: targets.map((target) => ({
        name: `[${target.kind}] ${target.name}${target.runtime ? ` — ${target.runtime}` : ""}${target.state ? ` (${target.state})` : ""}`,
        value: target,
      })),
    });
    this.#warnIfLegacySimulatorRuntime(selected);
    return selected;
  }

  #warnIfLegacySimulatorRuntime(target: IosRunTarget) {
    if (target.kind !== "simulator") return;
    const major = parseIosRuntimeMajor(target.runtime);
    if (major === undefined || major >= SWIFTUICORE_MIN_IOS_MAJOR) return;
    this.app.logger.warn(
      `Selected simulator runs ${target.runtime ?? "an older iOS"}. Recent SDK builds link SwiftUICore and require iOS ${SWIFTUICORE_MIN_IOS_MAJOR}+; if the app crashes at launch with a "Library not loaded: SwiftUICore" dyld error, pick an iOS ${SWIFTUICORE_MIN_IOS_MAJOR}+ simulator instead.`,
    );
  }

  async #loadPhysicalIosDevices() {
    try {
      return parseDevicectlDevices(await this.#spawn("xcrun", ["devicectl", "list", "devices", "--json-output", "-"]));
    } catch (jsonError) {
      try {
        return parseDevicectlDevices(await this.#spawn("xcrun", ["devicectl", "list", "devices"]));
      } catch (textError) {
        const classification = classifyIosRunFailure(
          `${jsonError instanceof Error ? jsonError.message : ""}\n${textError instanceof Error ? textError.message : ""}`,
        );
        if (classification.kind === "devicectl-unavailable") this.app.logger.warn(classification.detail);
        return [];
      }
    }
  }

  async #loadIosSimulators() {
    try {
      return parseSimctlDevices(await this.#spawn("xcrun", ["simctl", "list", "devices", "available", "--json"]));
    } catch {
      try {
        return parseSimctlDevices(await this.#spawn("xcrun", ["simctl", "list", "devices", "available"]));
      } catch {
        return [];
      }
    }
  }

  async #runIosPhysicalDevice({
    operation,
    env,
    runTarget,
    noAllowProvisioningUpdates,
  }: Pick<RunConfig, "operation" | "env"> & {
    runTarget: IosRunTarget;
    noAllowProvisioningUpdates: boolean;
  }) {
    const mobileEnv = sanitizeIosNativeRunEnv(await this.#commandEnv(operation, env));
    const configContent = await this.#writeCapacitorConfig(
      { operation, platform: "ios", iosRunTargetKind: runTarget.kind },
      mobileEnv,
    );
    await writeRootCapacitorConfig(this.app.cwdPath, configContent);
    const command = buildIosNativeRunCommand({
      appRoot: this.app.cwdPath,
      device: runTarget,
      scheme: "App",
      configuration: operation === "release" ? "Release" : "Debug",
    });
    const xcodebuildArgs = noAllowProvisioningUpdates
      ? command.xcodebuildArgs
      : [...command.xcodebuildArgs.slice(0, -1), "-allowProvisioningUpdates", ...command.xcodebuildArgs.slice(-1)];
    try {
      await this.#spawn("xcodebuild", xcodebuildArgs, {
        cwd: path.join(this.app.cwdPath, this.iosProjectPath),
        env: mobileEnv,
      });
      const devicectlId = runTarget.devicectlId ?? runTarget.id;
      const devicectl = (verb: string[], subject: string) =>
        this.#spawn("xcrun", ["devicectl", "device", ...verb, "--device", devicectlId, subject], { env: mobileEnv });
      await devicectl(["install", "app"], command.appPath);
      await devicectl(["process", "launch"], this.target.appId);
    } catch (error) {
      throw new Error(
        formatIosRunFailureMessage({
          classification: classifyIosRunFailure(this.#errorOutput(error)),
          appId: this.target.appId,
          targetName: this.target.name,
          teamId: await this.#getIosDevelopmentTeam(),
        }),
      );
    } finally {
      await clearRootCapacitorConfigs(this.app.cwdPath);
    }
  }

  async #getIosDevelopmentTeam() {
    const pbxprojPath = path.join(this.app.cwdPath, this.iosProjectPath, "App.xcodeproj/project.pbxproj");
    if (!(await Bun.file(pbxprojPath).exists())) return undefined;
    return (await Bun.file(pbxprojPath).text()).match(/DEVELOPMENT_TEAM = ([^;]+);/)?.[1]?.trim();
  }

  #errorOutput(error: unknown) {
    if (error instanceof CommandExecutionError) return `${error.stdout}\n${error.stderr}\n${error.message}`;
    return error instanceof Error ? error.message : String(error);
  }

  async #prepareAndroid({ operation, env, regenerate = false }: PrepareConfig) {
    await this.init({ platform: "android", operation, env, regenerate });
    await this.#prepareTargetAssets();
    await this.#prepareExternalFiles("android");
    await this.#applyAndroidMetadata();
    await this.#applyAndroidMinSdkVersion();
    await this.#applyPermissions({ operation, env });
    await this.#applyDeepLinks("android", { operation, env });
    await this.#disableNativeKeyboardResizeInAndroid();
    await this.project.commit();
    await this.#generateAssets({ operation, env });
    await mkdir(path.join(this.app.cwdPath, this.androidAssetsPath), { recursive: true });
    await this.#ensureAndroidDebugKeystore();
    await this.#spawnMobile("npx", ["cap", "sync", "android"], { operation, env });
    await this.#setDeepLinksInAndroid(this.target.deepLinks?.schemes ?? [], this.target.deepLinks?.domains ?? []);
  }

  async #updateAndroidBuildTypes() {
    const appGradle = await FileEditor.create(path.join(this.app.cwdPath, this.androidRootPath, "app/build.gradle"));
    const buildTypesBlock = `
      debug {
        applicationIdSuffix ".debug"
        versionNameSuffix "-DEBUG"
        debuggable true
        minifyEnabled false
      }
    `;
    const singinConfigBlock = `
     signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
        release {
            if (project.hasProperty('MYAPP_RELEASE_STORE_FILE')) {
                storeFile file(MYAPP_RELEASE_STORE_FILE)
                storePassword MYAPP_RELEASE_STORE_PASSWORD
                keyAlias MYAPP_RELEASE_KEY_ALIAS
                keyPassword MYAPP_RELEASE_KEY_PASSWORD
            }
        }
    }
        `;
    if (appGradle.find("signingConfigs {") === -1) {
      appGradle.insertBefore("buildTypes {", singinConfigBlock);
    }
    if (appGradle.find(`applicationIdSuffix ".debug"`) === -1) {
      appGradle.insertAfter("buildTypes {", buildTypesBlock);
    }
    await appGradle.save();
  }
  async buildAndroid(
    assembleType: "apk" | "aab",
    { env = "debug", regenerate = false }: { env?: RunConfig["env"]; regenerate?: boolean } = {},
  ) {
    await this.prepareWww();
    await this.#prepareAndroid({ operation: "release", env, regenerate });
    await this.#assertAndroidReleaseSigningConfig();
    await this.#updateAndroidBuildTypes();
    const gradleCommand = process.platform === "win32" ? "gradlew.bat" : "./gradlew";
    await this.app.spawn(gradleCommand, [assembleType === "apk" ? "assembleRelease" : "bundleRelease"], {
      stdio: "inherit",
      cwd: path.join(this.app.cwdPath, this.androidRootPath),
      env: await this.#commandEnv("release", env),
    });
  }
  async openAndroid() {
    await this.#spawnMobile("npx", ["cap", "open", "android"], { operation: "local", env: "local" });
  }
  async #disableNativeKeyboardResizeInAndroid() {
    const manifestPath = path.join(this.app.cwdPath, this.androidRootPath, "app/src/main/AndroidManifest.xml");
    let manifest = await readFile(manifestPath, "utf8");
    let changed = false;
    manifest = manifest.replace(/<activity\b[^>]*android:name="\.MainActivity"[^>]*>/, (activityTag) => {
      if (activityTag.includes("android:windowSoftInputMode=")) {
        const nextTag = activityTag.replace(
          /android:windowSoftInputMode="[^"]*"/,
          'android:windowSoftInputMode="adjustNothing"',
        );
        changed ||= nextTag !== activityTag;
        return nextTag;
      }
      changed = true;
      return activityTag.replace(/>$/, '\n            android:windowSoftInputMode="adjustNothing">');
    });
    if (changed) await writeFile(manifestPath, manifest);
  }
  async #ensureAndroidDebugKeystore() {
    const keystorePath = path.join(this.app.cwdPath, this.androidRootPath, "app/debug.keystore");
    if (await Bun.file(keystorePath).exists()) return;

    const options =
      "-storepass android -alias androiddebugkey -keypass android -keyalg RSA -keysize 2048 -validity 10000";
    await this.#spawn("keytool", [
      "-genkeypair",
      "-v",
      "-keystore",
      keystorePath,
      ...options.split(" "),
      "-dname",
      "CN=Android Debug,O=Android,C=US",
    ]);
  }
  async syncAndroid(options: { regenerate?: boolean } = {}) {
    await this.prepareWww();
    await this.#prepareAndroid({ operation: "release", env: "debug", ...options });
    this.app.log(`Sync Android Completed.`);
  }
  async runAndroid({ operation, env, regenerate = false }: RunConfig) {
    if (operation === "release") await this.prepareWww();
    await this.#prepareAndroid({ operation, env, regenerate });
    await this.#assertAndroidAdbReady();
    this.app.logger.info(`Running Android in ${operation} mode on ${env} env`);
    await this.#spawnMobile("npx", ["cap", "run", "android"], { operation, env }, { stdio: "inherit" });
  }

  async #assertAndroidReleaseSigningConfig() {
    const gradlePropertiesPath = path.join(this.app.cwdPath, this.androidRootPath, "gradle.properties");
    const gradleProperties = (await Bun.file(gradlePropertiesPath).exists())
      ? await Bun.file(gradlePropertiesPath).text()
      : "";
    const missingKeys = getMissingAndroidReleaseSigningKeys({ gradleProperties });
    if (missingKeys.length > 0) throw new Error(formatAndroidReleaseSigningError(missingKeys));
  }

  async #assertAndroidAdbReady() {
    try {
      const issues = getAdbDeviceStateIssues(await this.#spawn("adb", ["devices"]));
      if (issues.length > 0) throw new Error(issues.join("\n"));
    } catch (error) {
      if (error instanceof CommandExecutionError) return;
      throw error;
    }
  }

  async releaseIos() {
    await this.prepareWww();
    await this.#prepareIos({ operation: "release", env: "main" });
  }
  async releaseAndroid() {
    await this.prepareWww();
    await this.#prepareAndroid({ operation: "release", env: "main" });
  }
  async prepareWww() {
    const htmlSource = path.join(this.app.dist.cwdPath, "csr", targetHtmlFilename(this.target));
    if (!(await Bun.file(htmlSource).exists()))
      throw new Error(`CSR html for mobile target '${this.target.name}' not found: ${htmlSource}`);
    await rm(this.targetWebRoot, { recursive: true, force: true });
    await mkdir(this.targetWebRoot, { recursive: true });
    await Bun.write(
      path.join(this.targetWebRoot, "index.html"),
      this.#injectMobileTargetMeta(await Bun.file(htmlSource).text()),
    );
  }
  #injectMobileTargetMeta(html: string) {
    const basePath = this.target.basePath?.replace(/^\/+|\/+$/g, "") ?? "";
    const script = `<script>window.__AKAN_MOBILE_TARGET__=${JSON.stringify({
      name: this.target.name,
      basePath,
      indexPath: this.target.indexPath,
    })};</script>`;
    if (html.includes("window.__AKAN_MOBILE_TARGET__")) return html;
    return html.replace(/<\/head\s*>/i, `${script}\n</head>`);
  }
  async #writeCapacitorConfig(
    {
      operation,
      platform,
      iosRunTargetKind,
    }: Pick<RunConfig, "operation"> & { platform?: MobilePlatform; iosRunTargetKind?: IosRunTargetKind },
    commandEnv: MobileCommandEnv,
  ) {
    await mkdir(this.targetRoot, { recursive: true });
    let localIp: string | undefined;
    if (operation === "local") {
      const override = commandEnv.AKAN_PUBLIC_CLIENT_HOST ?? process.env.AKAN_PUBLIC_CLIENT_HOST;
      const resolution = await this.#resolveLocalDevHost({ override, platform, iosRunTargetKind });
      localIp = resolution.host;
      this.#logDevHostResolution(resolution, commandEnv);
    }
    const config = materializeCapacitorConfig(this.target, {
      operation,
      localIp,
      localServerUrl: localIp ? this.#localCsrUrl(localIp, commandEnv) : undefined,
    });
    const content = `${JSON.stringify(config, null, 2)}\n`;
    await Bun.write(path.join(this.targetRoot, "capacitor.config.json"), content);
    return content;
  }
  // Emulators and simulators reach the host through a loopback alias (10.0.2.2 / localhost); only devices need the LAN.
  async #resolveLocalDevHost({
    override,
    platform,
    iosRunTargetKind,
  }: {
    override?: string;
    platform?: MobilePlatform;
    iosRunTargetKind?: IosRunTargetKind;
  }): Promise<LocalDevHostResolution> {
    const resolution = selectLocalDevHost(os.networkInterfaces(), { override });
    if (resolution.source === "override") return resolution;
    if (platform === "ios" && iosRunTargetKind === "simulator")
      return { ...resolution, host: "localhost", source: "platform" };
    if (platform === "android") {
      try {
        const host = getAndroidLocalServerHost(await this.#spawn("adb", ["devices"]), resolution.host);
        return host === resolution.host ? resolution : { ...resolution, host, source: "platform" };
      } catch {
        return resolution;
      }
    }
    return resolution;
  }
  #logDevHostResolution(resolution: LocalDevHostResolution, commandEnv: MobileCommandEnv) {
    this.app.log(`Mobile live-reload server: ${this.#localCsrUrl(resolution.host, commandEnv)}`);
    if (resolution.source === "override" || resolution.source === "platform") return;
    const suspicious = resolution.host === "127.0.0.1" || resolution.host.startsWith("169.254.");
    const alternatives = resolution.candidates.filter((candidate) => candidate.address !== resolution.host);
    if (!suspicious && alternatives.length === 0) return;
    const alternativeText = alternatives.length
      ? ` Other interfaces: ${alternatives.map((candidate) => `${candidate.address} (${candidate.name})`).join(", ")}.`
      : "";
    this.app.logger.warn(
      `A physical device must reach ${resolution.host} on your LAN.${suspicious ? " That address looks non-routable." : ""}${alternativeText} If the device shows a blank screen, pin the right one with AKAN_PUBLIC_CLIENT_HOST=<ip>.`,
    );
  }
  async #prepareTargetAssets() {
    if (!this.target.assets) return;
    await mkdir(this.targetAssetRoot, { recursive: true });
    for (const [name, source] of [
      ["icon", this.target.assets.icon],
      ["splash", this.target.assets.splash],
    ] as const)
      if (source)
        await cp(path.join(this.app.cwdPath, source), path.join(this.targetAssetRoot, `${name}.png`), { force: true });
  }
  //* The files' logical places, translated into the committed Capacitor projects until they are removed.
  async #prepareExternalFiles(platform: "ios" | "android") {
    const placed: [string, string][] = Object.entries(this.target.files ?? {}).flatMap(
      ([to, from]): [string, string][] => {
        if (platform === "ios" && to.startsWith("ios/"))
          return [[path.join(this.iosRootPath, "App", "App", to.slice("ios/".length)), from]];
        if (platform === "android" && to.startsWith("android/"))
          return [[path.join(this.androidRootPath, "app", "src", "main", to.slice("android/".length)), from]];
        return [];
      },
    );
    const googleServices = this.target.native?.android?.googleServices;
    if (platform === "android" && googleServices)
      placed.push([path.join(this.androidRootPath, "app", "google-services.json"), googleServices]);
    await Promise.all(
      placed.map(async ([to, from]) => {
        const targetPath = path.join(this.app.cwdPath, to);
        await mkdir(path.dirname(targetPath), { recursive: true });
        await cp(path.join(this.app.cwdPath, from), targetPath, { force: true });
      }),
    );
  }
  async #generateAssets({ operation, env }: Pick<RunConfig, "operation" | "env">) {
    if (!this.target.assets) return;
    await this.#spawnMobile(
      "npx",
      [
        "@capacitor/assets",
        "generate",
        "--assetPath",
        path.posix.join(this.targetRootPath, "assets"),
        "--iosProject",
        this.iosProjectPath,
        "--androidProject",
        this.androidRootPath,
      ],
      { operation, env },
    );
  }
  async #applyIosMetadata() {
    this.project.ios.setBundleId("App", "Debug", this.target.appId);
    this.project.ios.setBundleId("App", "Release", this.target.appId);
    await this.project.ios.setVersion("App", "Debug", this.target.version);
    await this.project.ios.setVersion("App", "Release", this.target.version);
    await this.project.ios.setBuild("App", "Debug", this.target.buildNum);
    await this.project.ios.setBuild("App", "Release", this.target.buildNum);
  }
  async #applyAndroidMetadata() {
    await this.project.android.setVersionName(this.target.version);
    await this.project.android.setPackageName(this.target.appId);
    await this.project.android.setVersionCode(this.target.buildNum);
    await this.project.android.setAppName(this.target.appName);
  }
  async #applyAndroidMinSdkVersion() {
    const variablesGradlePath = path.join(this.app.cwdPath, this.androidRootPath, "variables.gradle");
    if (!(await Bun.file(variablesGradlePath).exists())) return;
    const updated = raiseGradleMinSdkVersion(await Bun.file(variablesGradlePath).text());
    if (!updated) return;
    await writeFile(variablesGradlePath, updated);
    this.app.verbose(`Raised Android minSdkVersion to ${ANDROID_MIN_SDK_VERSION} in variables.gradle`);
  }
  async #applyPermissions({ operation }: Pick<RunConfig, "operation" | "env">) {
    const plugins = await this.app.collectPlugins();
    for (const permission of this.target.permissions ?? []) {
      if (permission === "camera") await this.addCamera();
      else if (permission === "contacts") await this.addContact();
      else if (permission === "location") await this.addLocation();
      else if (permission === "push") {
        await this.#updateIosInfoPlist({ UIBackgroundModes: ["remote-notification"] });
        this.#addIosEntitlements({ "aps-environment": operation === "release" ? "production" : "development" });
        this.#setPermissionsInAndroid(["POST_NOTIFICATIONS"]);
      }
      for (const native of plugins.flatMap((plugin: AkanPlugin) =>
        plugin.native?.permission === permission ? [plugin.native] : [],
      )) {
        if (native.usageDescriptions) await this.#setPermissionInIos(native.usageDescriptions);
        if (native.infoPlist) await this.#updateIosInfoPlist(native.infoPlist);
        if (native.entitlements) this.#addIosEntitlements(native.entitlements as Record<string, string | string[]>);
        if (native.androidPermissions) this.#setPermissionsInAndroid(native.androidPermissions);
        if (native.androidFeatures) this.#setFeaturesInAndroid(native.androidFeatures);
      }
    }
  }
  async #applyDeepLinks(platform: "ios" | "android", { operation, env }: Pick<RunConfig, "operation" | "env">) {
    const deepLinks = this.target.deepLinks;
    if (!deepLinks) return;
    const schemes = deepLinks.schemes ?? [];
    const domains = deepLinks.domains ?? [];
    if (domains.length > 0) this.#assertDeepLinkVerificationConfig(platform, { operation, env });
    if (platform === "ios") {
      if (schemes.length > 0) {
        await this.#setPermissionInIos({
          appTransportSecurity: "",
        });
        await this.#setUrlSchemesInIos(schemes);
      }
      if (domains.length > 0)
        this.#addIosEntitlements({
          "com.apple.developer.associated-domains": domains.map((domain) => `applinks:${domain}`),
        });
      return;
    }
    if (platform === "android") {
      for (const scheme of schemes) {
        this.project.android
          .getAndroidManifest()
          .injectFragment(
            "activity",
            `<intent-filter><action android:name="android.intent.action.VIEW" /><category android:name="android.intent.category.DEFAULT" /><category android:name="android.intent.category.BROWSABLE" /><data android:scheme="${scheme}" /></intent-filter>`,
          );
      }
      for (const domain of domains) {
        const pathPrefix = resolveMobilePath(this.target, "/");
        this.project.android
          .getAndroidManifest()
          .injectFragment(
            "activity",
            `<intent-filter android:autoVerify="true"><action android:name="android.intent.action.VIEW" /><category android:name="android.intent.category.DEFAULT" /><category android:name="android.intent.category.BROWSABLE" /><data android:scheme="https" android:host="${domain}" android:pathPrefix="${pathPrefix}" /></intent-filter>`,
          );
      }
      await this.#setDeepLinksInAndroid(schemes, domains);
    }
  }
  #assertDeepLinkVerificationConfig(
    platform: "ios" | "android",
    { operation, env }: Pick<RunConfig, "operation" | "env">,
  ) {
    const deepLinks = this.target.deepLinks;
    if (!deepLinks?.domains?.length) return;
    if (platform === "ios" && !deepLinks.ios?.teamId) {
      throw new Error(
        `Mobile target '${this.target.name}' uses deepLinks.domains but is missing deepLinks.ios.teamId in apps/${this.app.name}/akan.config.ts`,
      );
    }
    if (platform === "android" && !deepLinks.android?.sha256CertFingerprints?.length) {
      const message = `Mobile target '${this.target.name}' uses deepLinks.domains but is missing deepLinks.android.sha256CertFingerprints in apps/${this.app.name}/akan.config.ts`;
      if (operation === "release" || env === "main") throw new Error(message);
      this.app.logger.warn(message);
    }
  }
  async #commandEnv(operation: "local" | "release", env: "local" | "debug" | "develop" | "main") {
    const devPort = operation === "local" ? (await this.app.getDevPort()).toString() : undefined;
    return this.app.getCommandEnv({
      APP_OPERATION_MODE: operation,
      AKAN_PUBLIC_OPERATION_MODE: env === "local" ? "local" : "cloud",
      AKAN_PUBLIC_ENV: env,
      AKAN_MOBILE_TARGET: this.target.name,
      ...(devPort ? { PORT: devPort, AKAN_PUBLIC_CLIENT_PORT: devPort, AKAN_PUBLIC_SERVER_PORT: devPort } : {}),
    });
  }
  #localCsrUrl(ip: string, commandEnv: MobileCommandEnv) {
    const basePath = this.target.basePath?.replace(/^\/+|\/+$/g, "");
    const locale = commandEnv.AKAN_PUBLIC_DEFAULT_LOCALE ?? "en";
    const pathname = basePath ? `${locale}/${basePath}` : `${locale}/`;
    const port = commandEnv.AKAN_PUBLIC_CLIENT_PORT ?? commandEnv.PORT ?? "8282";
    const params = new URLSearchParams({ csr: "true", akanMobileTarget: this.target.name });
    if (basePath) params.set("akanMobileBasePath", basePath);
    if (this.target.indexPath) params.set("akanMobileIndexPath", this.target.indexPath);
    return `http://${ip}:${port}/${pathname}?${params}`;
  }
  async #spawn(command: string, args: string[] = [], options: Parameters<AppExecutor["spawn"]>[2] = {}) {
    return await this.app.spawn(command, args, { cwd: this.app.cwdPath, ...options });
  }
  async #spawnMobile(
    command: string,
    args: string[] = [],
    { operation, env }: Pick<RunConfig, "operation" | "env">,
    options: SpawnMobileOptions = {},
  ) {
    const { iosRunTargetKind, platform, ...spawnOptions } = options;
    const mobileEnv = { ...(await this.#commandEnv(operation, env)), ...options.env };
    const configContent = await this.#writeCapacitorConfig(
      { operation, platform: platform ?? this.#inferMobilePlatform(args), iosRunTargetKind },
      mobileEnv,
    );
    await writeRootCapacitorConfig(this.app.cwdPath, configContent);
    try {
      return await this.#spawn(command, args, { ...spawnOptions, env: mobileEnv });
    } finally {
      await clearRootCapacitorConfigs(this.app.cwdPath);
    }
  }
  #inferMobilePlatform(args: string[]): MobilePlatform | undefined {
    if (args.includes("android")) return "android";
    if (args.includes("ios")) return "ios";
    return undefined;
  }
  async addCamera() {
    await this.#setPermissionInIos({
      cameraUsageDescription: "$(PRODUCT_NAME) requires access to the camera to take photos.",
      photoAddUsageDescription: "$(PRODUCT_NAME) requires access to the photo library to take photos.",
      photoUsageDescription: "$(PRODUCT_NAME) requires access to the photo library to take photos.",
    });
    this.#setPermissionsInAndroid(["READ_MEDIA_IMAGES", "READ_EXTERNAL_STORAGE", "WRITE_EXTERNAL_STORAGE"]);
  }
  async addContact() {
    await this.#setPermissionInIos({
      contactsUsageDescription: "$(PRODUCT_NAME) requires access to the contacts to add new contacts.",
    });
    this.#setPermissionsInAndroid(["READ_CONTACTS", "WRITE_CONTACTS"]);
  }
  async addLocation() {
    await this.#setPermissionInIos({
      locationAlwaysUsageDescription: "$(PRODUCT_NAME) requires access to the location to get the user's location.",
      locationWhenInUseUsageDescription: "$(PRODUCT_NAME) requires access to the location to get the user's location.",
    });
    this.#setPermissionsInAndroid(["ACCESS_COARSE_LOCATION", "ACCESS_FINE_LOCATION"]);
    this.#setFeaturesInAndroid(["android.hardware.location.gps"]);
  }
  #addIosEntitlements(entitlements: Record<string, string | string[]>) {
    Object.assign(this.#iosEntitlements, entitlements);
  }
  async #updateIosInfoPlist(values: Record<string, unknown>) {
    await Promise.all(
      (["Debug", "Release"] as const).map((build) =>
        this.project.ios.updateInfoPlist(this.iosTargetName, build, values),
      ),
    );
  }
  async #setPermissionInIos(permissions: { [key: string]: string }) {
    await this.#updateIosInfoPlist(toIosInfoPlistUsageDescriptions(permissions));
  }
  async #setUrlSchemesInIos(schemes: string[]) {
    await this.#updateIosInfoPlist({
      CFBundleURLTypes: schemes.map((scheme) => ({ CFBundleURLName: this.target.appId, CFBundleURLSchemes: [scheme] })),
    });
  }
  #serializeIosEntitlements(entitlements: Record<string, string | string[]>) {
    const lines: string[] = [];
    for (const [key, value] of Object.entries(entitlements)) {
      lines.push(`  <key>${key}</key>`);
      if (Array.isArray(value)) {
        lines.push("  <array>", ...value.map((item) => `    <string>${item}</string>`), "  </array>");
      } else {
        lines.push(`  <string>${value}</string>`);
      }
    }
    return lines;
  }
  async #flushIosEntitlements() {
    if (Object.keys(this.#iosEntitlements).length === 0) return;
    const entitlementsRelPath = "App/App.entitlements";
    const entitlementsPath = path.join(this.app.cwdPath, this.iosProjectPath, entitlementsRelPath);
    const body = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
      '<plist version="1.0">',
      "<dict>",
      ...this.#serializeIosEntitlements(this.#iosEntitlements),
      "</dict>",
      "</plist>",
      "",
    ].join("\n");
    const currentBody = (await Bun.file(entitlementsPath).exists())
      ? await Bun.file(entitlementsPath).text()
      : undefined;
    if (currentBody !== body) await writeFile(entitlementsPath, body);
    await this.#setCodeSignEntitlementsInIos(entitlementsRelPath);
  }
  async #setCodeSignEntitlementsInIos(entitlementsRelPath: string) {
    const pbxprojPath = path.join(this.app.cwdPath, this.iosProjectPath, "App.xcodeproj/project.pbxproj");
    const lines = (await readFile(pbxprojPath, "utf8")).split("\n");
    let changed = false;
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index] ?? "";
      if (!line.includes(`PRODUCT_BUNDLE_IDENTIFIER = ${this.target.appId};`)) continue;
      let start = index;
      while (start >= 0 && !lines[start]?.includes("buildSettings = {")) start--;
      let end = index;
      while (end < lines.length && !/^\s*\};\s*$/.test(lines[end] ?? "")) end++;
      const settings = lines.slice(start, end + 1);
      const configName = lines.slice(end + 1, end + 8).find((setting) => setting.includes("name = ")) ?? "";
      const indent = line.match(/^\s*/)?.[0] ?? "";
      const insertSettings = [];
      if (!settings.some((setting) => setting.includes("CODE_SIGN_ENTITLEMENTS"))) {
        insertSettings.push(`${indent}CODE_SIGN_ENTITLEMENTS = ${entitlementsRelPath};`);
      }
      if (
        configName.includes("name = Debug;") &&
        !settings.some((setting) => setting.includes("CODE_SIGN_ALLOW_ENTITLEMENTS_MODIFICATION"))
      ) {
        insertSettings.push(`${indent}CODE_SIGN_ALLOW_ENTITLEMENTS_MODIFICATION = YES;`);
      }
      if (insertSettings.length > 0) {
        lines.splice(index, 0, ...insertSettings);
        index += insertSettings.length;
        changed = true;
      }
    }
    if (changed) await writeFile(pbxprojPath, lines.join("\n"));
  }
  async #setCodeSignEntitlementsInIosIfExists(entitlementsRelPath: string) {
    const entitlementsPath = path.join(this.app.cwdPath, this.iosProjectPath, entitlementsRelPath);
    if (!(await Bun.file(entitlementsPath).exists())) return;
    await this.#setCodeSignEntitlementsInIos(entitlementsRelPath);
  }
  async #setDeepLinksInAndroid(schemes: string[], domains: string[]) {
    const manifestPath = path.join(this.app.cwdPath, this.androidRootPath, "app/src/main/AndroidManifest.xml");
    const original = await readFile(manifestPath, "utf8");
    const pathPrefix = resolveMobilePath(this.target, "/");
    let manifest = original;
    for (const scheme of schemes) {
      if (manifest.includes(`android:scheme="${scheme}"`)) continue;
      manifest = CapacitorApp.#withIntentFilter(manifest, "<intent-filter>", `<data android:scheme="${scheme}" />`);
    }
    for (const domain of domains) {
      if (manifest.includes(`android:host="${domain}"`) && manifest.includes('android:scheme="https"')) continue;
      manifest = CapacitorApp.#withIntentFilter(
        manifest,
        '<intent-filter android:autoVerify="true">',
        `<data android:scheme="https" android:host="${domain}" android:pathPrefix="${pathPrefix}" />`,
      );
    }
    if (manifest !== original) await writeFile(manifestPath, manifest);
  }
  static #withIntentFilter(manifest: string, open: string, data: string) {
    const filter = [
      `            ${open}`,
      '                <action android:name="android.intent.action.VIEW" />',
      '                <category android:name="android.intent.category.DEFAULT" />',
      '                <category android:name="android.intent.category.BROWSABLE" />',
      `                ${data}`,
      "            </intent-filter>",
    ].join("\n");
    return manifest.replace(/(\s*<\/activity>)/, `\n${filter}$1`);
  }
  #setFeaturesInAndroid(features: string[]) {
    for (const feature of features) {
      if (this.#androidManifestNames("uses-feature").includes(feature)) {
        this.app.logger.info(`${feature} already exists in android`);
        return;
      }
      this.app.logger.info(`Adding ${feature} to android`);
      this.project.android
        .getAndroidManifest()
        .injectFragment("manifest", `<uses-feature android:name="${feature}" />`);
    }
  }
  #setPermissionsInAndroid(permissions: string[]) {
    for (const permission of permissions) {
      if (this.#androidManifestNames("uses-permission").includes(`android.permission.${permission}`)) {
        this.app.logger.info(`${permission} already exists in android`);
        continue;
      }
      this.app.logger.info(`Adding ${permission} to android`);
      this.project.android
        .getAndroidManifest()
        .injectFragment("manifest", `<uses-permission android:name="android.permission.${permission}" />`);
    }
  }
  #androidManifestNames(tagName: "uses-feature" | "uses-permission") {
    const element = this.project.android.getAndroidManifest().getDocumentElement();
    if (!element) throw new Error("manifest not found");
    return Array.from(element.getElementsByTagName(tagName)).map((node) => node.getAttribute("android:name"));
  }
}
