import { cp, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { CapacitorConfig } from "@capacitor/cli";
import { select } from "@inquirer/prompts";
import { MobileProject } from "@trapezedev/project";
import type { AndroidProject } from "@trapezedev/project/dist/android/project";
import type { IosProject } from "@trapezedev/project/dist/ios/project";
import { capitalize } from "akanjs/common";
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

interface PrepareConfig extends RunConfig {}

type MobileCommandEnv = Record<string, string | undefined>;

export type IosRunTargetKind = "device" | "simulator";
export interface IosRunTarget {
  id: string;
  name: string;
  kind: IosRunTargetKind;
  state?: string;
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
  | "unknown";

export interface IosRunFailureClassification {
  kind: IosRunFailureKind;
  title: string;
  detail: string;
}

const iosNativeBlockedEnvKeys = new Set([
  "AR",
  "AS",
  "CC",
  "CFLAGS",
  "CONDA_BUILD_SYSROOT",
  "CONDA_PREFIX",
  "CPP",
  "CPPFLAGS",
  "CPATH",
  "CXX",
  "CXXFLAGS",
  "LD",
  "LDFLAGS",
  "LIBRARY_PATH",
  "MACOSX_DEPLOYMENT_TARGET",
  "NM",
  "OBJC",
  "OBJCXX",
  "PREFIX",
  "RANLIB",
  "SDKROOT",
  "STRIP",
]);

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

const getLocalIP = () => {
  const interfaces = os.networkInterfaces();
  for (const iface of Object.values(interfaces)) {
    if (!iface) continue;
    for (const alias of iface) {
      if (alias.family === "IPv4" && !alias.internal) return alias.address;
    }
  }
  return "127.0.0.1";
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

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
    return Object.values(devices)
      .flatMap((runtimeDevices) => runtimeDevices)
      .filter(isRecord)
      .flatMap((device) => {
        const id = firstString(device.udid, device.UDID, device.identifier);
        const name = firstString(device.name, device.displayName);
        const isAvailable = device.isAvailable !== false && device.availabilityError === undefined;
        if (!id || !name || !isAvailable) return [];
        return [{ id, name, kind: "simulator" as const, state: asString(device.state) }];
      });
  } catch {
    const targets: IosRunTarget[] = [];
    for (const line of output.split(/\r?\n/)) {
      const match = line.match(/^\s*(.+?)\s+\(([0-9A-Fa-f-]{20,})\)\s+\(([^)]+)\)/);
      if (!match) continue;
      targets.push({ id: match[2], name: match[1].trim(), kind: "simulator", state: match[3] });
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
      "Review the xcodebuild/devicectl output above. You can retry with --noAllowProvisioningUpdates to use the conservative path.",
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
    value.forEach((item, index) => {
      assertJsonSerializable(item, `${label}[${index}]`, seen);
    });
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
  const {
    name,
    basePath: _basePath,
    version: _version,
    buildNum: _buildNum,
    assets: _assets,
    permissions: _permissions,
    links: _links,
    files: _files,
    appId,
    appName,
    webDir: _webDir,
    plugins,
    server,
    android,
    ios,
    cordova,
    experimental,
    ...capacitorConfig
  } = target;
  const serverConfig = isRecord(server) ? server : undefined;
  const cordovaConfig = isRecord(cordova) ? cordova : undefined;
  const experimentalConfig = isRecord(experimental) ? experimental : undefined;
  const pluginsConfig = isRecord(plugins) ? plugins : {};
  const keyboardPluginConfig = isRecord(pluginsConfig.Keyboard) ? pluginsConfig.Keyboard : {};
  const config: CapacitorConfig = {
    ...capacitorConfig,
    appId,
    appName,
    webDir: path.posix.join(".akan", "mobile", name, "www"),
    plugins: {
      CapacitorCookies: { enabled: true },
      ...pluginsConfig,
      Keyboard: {
        resize: "none",
        ...keyboardPluginConfig,
      },
    },
    android: {
      ...(isRecord(android) ? android : {}),
      path: "android",
    },
    ios: {
      ...(isRecord(ios) ? ios : {}),
      path: "ios",
    },
  };
  if (operation === "local") {
    if (!localServerUrl) throw new Error(`Local server URL is required for mobile target '${name}'.`);
    config.server = {
      ...serverConfig,
      androidScheme: "http",
      url: localServerUrl,
      cleartext: true,
      allowNavigation: mergeAllowNavigation(serverConfig?.allowNavigation, localIp),
    };
  } else if (serverConfig && Object.keys(serverConfig).length > 0) {
    config.server = serverConfig as never;
  }
  if (cordovaConfig && Object.keys(cordovaConfig).length > 0) {
    config.cordova = cordovaConfig as never;
  }
  if (experimentalConfig && Object.keys(experimentalConfig).length > 0) {
    config.experimental = experimentalConfig as never;
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
  async #prepareIos({ operation, env, regenerate = false }: PrepareConfig) {
    await this.init({ platform: "ios", operation, env, regenerate });
    await this.#prepareTargetAssets();
    await this.#prepareExternalFiles("ios");
    await this.#applyIosMetadata();
    await this.#applyPermissions();
    await this.#applyLinks();
    await this.project.commit();
    await this.#generateAssets({ operation, env });
    this.app.verbose(`syncing iOS`);
    await this.#spawnMobile("npx", ["cap", "sync", "ios"], { operation, env });
    this.app.verbose(`sync completed.`);
  }
  async buildIos({ env = "debug", regenerate = false }: { env?: RunConfig["env"]; regenerate?: boolean } = {}) {
    await this.prepareWww();
    await this.#prepareIos({ operation: "release", env, regenerate });
    await this.#spawnMobile("npx", ["cap", "build", "ios"], { operation: "release", env }, { stdio: "inherit" });
    this.app.verbose(`build completed iOS.`);
    return;
  }
  async syncIos() {
    await this.#spawnMobile("npx", ["cap", "sync", "ios"], { operation: "local", env: "local" });
  }
  async openIos() {
    await this.#spawnMobile("npx", ["cap", "open", "ios"], { operation: "local", env: "local" });
  }
  async runIos({ operation, env, regenerate = false, noAllowProvisioningUpdates = false, iosDeviceId }: RunIosConfig) {
    if (operation === "release") await this.prepareWww();
    await this.#prepareIos({ operation, env, regenerate });
    const runTarget = await this.#selectIosRunTarget(iosDeviceId);
    if (runTarget.kind === "simulator") {
      await this.#spawnMobile(
        "npx",
        ["cap", "run", "ios", "--target", runTarget.id],
        { operation, env },
        { stdio: "inherit" },
      );
      return;
    }
    await this.#runIosPhysicalDevice({ operation, env, runTarget, noAllowProvisioningUpdates });
  }

  async #selectIosRunTarget(deviceId?: string) {
    const targets = await this.#loadIosRunTargets();
    if (deviceId) {
      const found = targets.find((target) => target.id === deviceId);
      if (!found) throw new Error(`iOS run target '${deviceId}' was not found.`);
      return found;
    }
    if (targets.length === 0) {
      throw new Error("No iOS run targets found. Open Simulator or connect an iPhone, then retry.");
    }
    return await select<IosRunTarget>({
      message: "Select iOS run target",
      choices: targets.map((target) => ({
        name: `[${target.kind}] ${target.name}${target.state ? ` (${target.state})` : ""}`,
        value: target,
      })),
    });
  }

  async #loadIosRunTargets() {
    const devices = await this.#loadPhysicalIosDevices();
    const simulators = await this.#loadIosSimulators();
    return [...devices, ...simulators];
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
    const configContent = await this.#writeCapacitorConfig({ operation }, mobileEnv);
    await this.#writeRootCapacitorConfig(configContent);
    const scheme = this.#iosScheme();
    const command = buildIosNativeRunCommand({
      appRoot: this.app.cwdPath,
      device: runTarget,
      scheme,
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
      await this.#spawn("xcrun", ["devicectl", "device", "install", "app", "--device", devicectlId, command.appPath], {
        env: mobileEnv,
      });
      await this.#spawn(
        "xcrun",
        ["devicectl", "device", "process", "launch", "--device", devicectlId, this.target.appId],
        {
          env: mobileEnv,
        },
      );
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
      await this.#clearRootCapacitorConfigs();
    }
  }

  #iosScheme() {
    return isRecord(this.target.ios) && typeof this.target.ios.scheme === "string" ? this.target.ios.scheme : "App";
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
    await this.#applyPermissions();
    await this.#applyLinks();
    await this.project.commit();
    await this.#generateAssets({ operation, env });
    await this.#ensureAndroidAssetsDir();
    await this.#ensureAndroidDebugKeystore();
    await this.#spawnMobile("npx", ["cap", "sync", "android"], { operation, env });
  }

  async #updateAndroidBuildTypes() {
    //keystore 기본 설정 및 debug, release 설정

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
    //윈도우는 gradlew.bat 사용
    const isWindows = process.platform === "win32";
    const gradleCommand = isWindows ? "gradlew.bat" : "./gradlew";

    await this.app.spawn(gradleCommand, [assembleType === "apk" ? "assembleRelease" : "bundleRelease"], {
      stdio: "inherit",
      cwd: path.join(this.app.cwdPath, this.androidRootPath),
      env: await this.#commandEnv("release", env),
    });
  }
  async openAndroid() {
    await this.#spawnMobile("npx", ["cap", "open", "android"], { operation: "local", env: "local" });
  }
  async #ensureAndroidAssetsDir() {
    await mkdir(path.join(this.app.cwdPath, this.androidAssetsPath), { recursive: true });
  }
  async #ensureAndroidDebugKeystore() {
    const keystorePath = path.join(this.app.cwdPath, this.androidRootPath, "app/debug.keystore");
    if (await Bun.file(keystorePath).exists()) return;

    await this.#spawn("keytool", [
      "-genkeypair",
      "-v",
      "-keystore",
      keystorePath,
      "-storepass",
      "android",
      "-alias",
      "androiddebugkey",
      "-keypass",
      "android",
      "-keyalg",
      "RSA",
      "-keysize",
      "2048",
      "-validity",
      "10000",
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
    const args = ["cap", "run", "android"];
    await this.#spawnMobile("npx", args, { operation, env }, { stdio: "inherit" });
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
    const script = `<script>window.__AKAN_MOBILE_TARGET__=${JSON.stringify({ name: this.target.name, basePath })};</script>`;
    if (html.includes("window.__AKAN_MOBILE_TARGET__")) return html;
    return html.replace(/<\/head\s*>/i, `${script}\n</head>`);
  }
  async #writeCapacitorConfig({ operation }: Pick<RunConfig, "operation">, commandEnv: MobileCommandEnv) {
    await mkdir(this.targetRoot, { recursive: true });
    const localIp = operation === "local" ? getLocalIP() : undefined;
    const config = materializeCapacitorConfig(this.target, {
      operation,
      localIp,
      localServerUrl: localIp ? this.#localCsrUrl(localIp, commandEnv) : undefined,
    });
    const content = `${JSON.stringify(config, null, 2)}\n`;
    await Bun.write(path.join(this.targetRoot, "capacitor.config.json"), content);
    return content;
  }
  async #prepareTargetAssets() {
    if (!this.target.assets) return;
    await mkdir(this.targetAssetRoot, { recursive: true });
    if (this.target.assets.icon)
      await cp(path.join(this.app.cwdPath, this.target.assets.icon), path.join(this.targetAssetRoot, "icon.png"), {
        force: true,
      });
    if (this.target.assets.splash)
      await cp(path.join(this.app.cwdPath, this.target.assets.splash), path.join(this.targetAssetRoot, "splash.png"), {
        force: true,
      });
  }
  async #prepareExternalFiles(platform: "ios" | "android") {
    const files = this.target.files?.[platform];
    if (!files) return;
    const platformRoot = path.join(this.app.cwdPath, platform === "ios" ? this.iosRootPath : this.androidRootPath);
    await Promise.all(
      Object.entries(files).map(async ([to, from]) => {
        const targetPath = path.join(platformRoot, to);
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
  async #applyPermissions() {
    for (const permission of this.target.permissions ?? []) {
      if (permission === "camera") await this.addCamera();
      else if (permission === "contacts") await this.addContact();
      else if (permission === "location") await this.addLocation();
      else if (permission === "push") await this.addPush();
    }
  }
  async #applyLinks() {
    const links = this.target.links;
    if (!links) return;
    const schemes = links.schemes ?? [];
    if (schemes.length > 0) {
      await this.#setPermissionInIos({
        appTransportSecurity: "",
      });
      for (const scheme of schemes) {
        this.project.android
          .getAndroidManifest()
          .injectFragment(
            "activity",
            `<intent-filter><action android:name="android.intent.action.VIEW" /><category android:name="android.intent.category.DEFAULT" /><category android:name="android.intent.category.BROWSABLE" /><data android:scheme="${scheme}" /></intent-filter>`,
          );
      }
    }
    for (const domain of links.associatedDomains ?? []) {
      this.app.logger.info(`Configure iOS associated domain manually if needed: ${domain}`);
    }
    for (const host of links.androidHosts ?? []) {
      const pathPrefix = resolveMobilePath(this.target, "/");
      this.project.android
        .getAndroidManifest()
        .injectFragment(
          "activity",
          `<intent-filter android:autoVerify="true"><action android:name="android.intent.action.VIEW" /><category android:name="android.intent.category.DEFAULT" /><category android:name="android.intent.category.BROWSABLE" /><data android:scheme="https" android:host="${host}" android:pathPrefix="${pathPrefix}" /></intent-filter>`,
        );
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
    return `http://${ip}:${port}/${pathname}?${params}`;
  }
  async #clearRootCapacitorConfigs() {
    await clearRootCapacitorConfigs(this.app.cwdPath);
  }
  async #writeRootCapacitorConfig(content: string) {
    await writeRootCapacitorConfig(this.app.cwdPath, content);
  }
  async #spawn(command: string, args: string[] = [], options: Parameters<AppExecutor["spawn"]>[2] = {}) {
    return await this.app.spawn(command, args, { cwd: this.app.cwdPath, ...options });
  }
  async #spawnMobile(
    command: string,
    args: string[] = [],
    { operation, env }: Pick<RunConfig, "operation" | "env">,
    options: Parameters<AppExecutor["spawn"]>[2] = {},
  ) {
    const mobileEnv = { ...(await this.#commandEnv(operation, env)), ...options.env };
    const configContent = await this.#writeCapacitorConfig({ operation }, mobileEnv);
    await this.#writeRootCapacitorConfig(configContent);
    try {
      return await this.#spawn(command, args, {
        ...options,
        env: mobileEnv,
      });
    } finally {
      await this.#clearRootCapacitorConfigs();
    }
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
  async addPush() {
    await this.#setPermissionInIos({
      userNotificationsUsageDescription: "$(PRODUCT_NAME) uses notifications to keep you updated.",
    });
    this.#setPermissionsInAndroid(["POST_NOTIFICATIONS"]);
  }
  async #setPermissionInIos(permissions: { [key: string]: string }) {
    const updateNs = Object.fromEntries(
      Object.entries(permissions).map(([key, value]) => [`NS${capitalize(key)}`, value]),
    );
    await Promise.all([
      this.project.ios.updateInfoPlist(this.iosTargetName, "Debug", updateNs),
      this.project.ios.updateInfoPlist(this.iosTargetName, "Release", updateNs),
    ]);
  }
  #setFeaturesInAndroid(features: string[]) {
    for (const feature of features) {
      if (this.#hasFeatureInAndroid(feature)) {
        this.app.logger.info(`${feature} already exists in android`);
        return this;
      }
      this.app.logger.info(`Adding ${feature} to android`);
      this.project.android
        .getAndroidManifest()
        .injectFragment("manifest", `<uses-feature android:name="${feature}" />`);
    }
    return this;
  }
  #getFeaturesInAndroid() {
    const androidManifest = this.project.android.getAndroidManifest();
    const element = androidManifest.getDocumentElement();
    if (!element) throw new Error("manifest not found");
    const usesFeature = element.getElementsByTagName("uses-feature");
    return Array.from(usesFeature).map((feature) => feature.getAttribute("android:name"));
  }
  #hasFeatureInAndroid(feature: string) {
    return this.#getFeaturesInAndroid().includes(feature);
  }

  #setPermissionsInAndroid(permissions: string[]) {
    for (const permission of permissions) {
      if (this.#hasPermissionInAndroid(permission)) {
        this.app.logger.info(`${permission} already exists in android`);
        return this;
      }
      this.app.logger.info(`Adding ${permission} to android`);
      this.project.android
        .getAndroidManifest()
        .injectFragment("manifest", `<uses-permission android:name="android.permission.${permission}" />`);
    }
    return this;
  }
  #getPermissionsInAndroid() {
    const androidManifest = this.project.android.getAndroidManifest();
    const element = androidManifest.getDocumentElement();
    if (!element) throw new Error("manifest not found");
    const usesPermission = element.getElementsByTagName("uses-permission");
    return Array.from(usesPermission).map((permission) => permission.getAttribute("android:name"));
  }
  #hasPermissionInAndroid(permission: string) {
    return this.#getPermissionsInAndroid().includes(permission);
  }
}
