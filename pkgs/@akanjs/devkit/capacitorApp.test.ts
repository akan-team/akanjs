import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AkanMobileTargetConfig } from "./akanConfig";
import {
  assertJsonSerializable,
  buildIosNativeRunCommand,
  classifyIosRunFailure,
  clearRootCapacitorConfigs,
  formatAndroidReleaseSigningError,
  getAdbDeviceStateIssues,
  getMissingAndroidReleaseSigningKeys,
  materializeCapacitorConfig,
  parseDevicectlDevices,
  parseSimctlDevices,
  rootCapacitorConfigFilenames,
  sanitizeIosNativeRunEnv,
  writeRootCapacitorConfig,
} from "./capacitorApp";

const tempRoots: string[] = [];

const makeTempRoot = async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "akan-capacitor-app-"));
  tempRoots.push(root);
  return root;
};

const baseTarget: AkanMobileTargetConfig = {
  name: "default",
  appName: "Minimal",
  appId: "com.minimal.app",
  version: "1.2.3",
  buildNum: 7,
  basePath: "admin",
  assets: { icon: "mobile/icon.png" },
  permissions: ["camera"],
  links: { schemes: ["minimal"] },
  files: { android: { "app/google-services.json": "private/google-services.json" } },
};

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("materializeCapacitorConfig", () => {
  test("writes only Capacitor fields for release config", () => {
    const config = materializeCapacitorConfig(
      {
        ...baseTarget,
        plugins: { CapacitorHttp: { enabled: true } },
        android: { flavor: "qa" },
        ios: { scheme: "App QA" },
        cordova: { preferences: { ScrollEnabled: "false" } },
        experimental: { ios: { spm: { swiftToolsVersion: "5.9" } } },
      },
      { operation: "release" },
    );

    expect(config).toMatchObject({
      appId: "com.minimal.app",
      appName: "Minimal",
      webDir: ".akan/mobile/default/www",
      plugins: {
        CapacitorCookies: { enabled: true },
        CapacitorHttp: { enabled: true },
        Keyboard: { resize: "none" },
      },
      android: { flavor: "qa", path: "android" },
      ios: { scheme: "App QA", path: "ios" },
      cordova: { preferences: { ScrollEnabled: "false" } },
      experimental: { ios: { spm: { swiftToolsVersion: "5.9" } } },
    });
    expect(config).not.toHaveProperty("name");
    expect(config).not.toHaveProperty("basePath");
    expect(config).not.toHaveProperty("version");
    expect(config).not.toHaveProperty("buildNum");
    expect(config).not.toHaveProperty("assets");
    expect(config).not.toHaveProperty("permissions");
    expect(config).not.toHaveProperty("links");
    expect(config).not.toHaveProperty("files");
    expect(config).not.toHaveProperty("server");
  });

  test("adds local server config without requiring env target switching", () => {
    const config = materializeCapacitorConfig(
      {
        ...baseTarget,
        server: {
          hostname: "localhost",
          allowNavigation: ["api.example.com"],
        },
      },
      {
        operation: "local",
        localIp: "192.168.0.5",
        localServerUrl: "http://192.168.0.5:8282/en/admin?csr=true&akanMobileTarget=default",
      },
    );

    expect(config.server).toEqual({
      hostname: "localhost",
      androidScheme: "http",
      url: "http://192.168.0.5:8282/en/admin?csr=true&akanMobileTarget=default",
      cleartext: true,
      allowNavigation: ["api.example.com", "192.168.0.5", "localhost"],
    });
  });

  test("allows mobile targets to override the default keyboard resize mode", () => {
    const config = materializeCapacitorConfig(
      {
        ...baseTarget,
        plugins: { Keyboard: { resize: "native" } },
      },
      { operation: "release" },
    );

    expect(config.plugins).toMatchObject({
      Keyboard: { resize: "native" },
    });
  });

  test("rejects non-json config values", () => {
    expect(() => assertJsonSerializable({ plugins: { Custom: () => null } })).toThrow("must be JSON serializable");
  });
});

describe("root capacitor config helpers", () => {
  test("clears root configs before writing the temporary json config", async () => {
    const root = await makeTempRoot();
    await Promise.all(
      rootCapacitorConfigFilenames.map((file) => writeFile(path.join(root, file), `old ${file}\n`)),
    );

    await writeRootCapacitorConfig(root, "{\n  \"appId\": \"com.minimal.app\"\n}\n");

    expect(await Bun.file(path.join(root, "capacitor.config.ts")).exists()).toBe(false);
    expect(await Bun.file(path.join(root, "capacitor.config.js")).exists()).toBe(false);
    expect(await Bun.file(path.join(root, "capacitor.config.json")).text()).toBe(
      "{\n  \"appId\": \"com.minimal.app\"\n}\n",
    );

    await clearRootCapacitorConfigs(root);

    expect(await Bun.file(path.join(root, "capacitor.config.json")).exists()).toBe(false);
  });
});

describe("iOS native run helpers", () => {
  test("parses xcrun device and simulator outputs", () => {
    expect(
      parseDevicectlDevices(
        JSON.stringify({
          result: {
            devices: [
              {
                identifier: "1BCB6563-02FF-5D49-9655-1BFF02A638D3",
                connectionProperties: { pairingState: "paired", transportType: "wired", tunnelState: "available" },
                deviceProperties: { name: "Seok iPhone" },
                hardwareProperties: { udid: "00008130-000200113EC1001C" },
              },
            ],
          },
        }),
      ),
    ).toEqual([
      {
        id: "00008130-000200113EC1001C",
        name: "Seok iPhone",
        kind: "device",
        state: "available wired paired",
        devicectlId: "1BCB6563-02FF-5D49-9655-1BFF02A638D3",
        xcodebuildId: "00008130-000200113EC1001C",
      },
    ]);

    expect(
      parseSimctlDevices(
        JSON.stringify({
          devices: {
            "iOS 18.0": [
              { udid: "11111111-2222-3333-4444-555555555555", name: "iPhone 16", state: "Shutdown", isAvailable: true },
            ],
          },
        }),
      ),
    ).toEqual([{ id: "11111111-2222-3333-4444-555555555555", name: "iPhone 16", kind: "simulator", state: "Shutdown" }]);
  });

  test("builds xcodebuild destinations and output paths by target kind", () => {
    const deviceCommand = buildIosNativeRunCommand({
      appRoot: "/repo/apps/minimal",
      device: { id: "device-1", name: "iPhone", kind: "device" },
      scheme: "App QA",
      configuration: "Debug",
    });
    expect(deviceCommand.xcodebuildArgs).toContain("id=device-1");
    expect(deviceCommand.xcodebuildArgs).toContain("App QA");
    expect(deviceCommand.appPath).toBe("/repo/apps/minimal/ios/DerivedData/device-1/Build/Products/Debug-iphoneos/App.app");

    const simulatorCommand = buildIosNativeRunCommand({
      appRoot: "/repo/apps/minimal",
      device: { id: "sim-1", name: "Simulator", kind: "simulator" },
    });
    expect(simulatorCommand.xcodebuildArgs).toContain("platform=iOS Simulator,id=sim-1");
    expect(simulatorCommand.appPath).toBe(
      "/repo/apps/minimal/ios/DerivedData/sim-1/Build/Products/Debug-iphonesimulator/App.app",
    );
  });

  test("classifies iOS signing and device-state failures", () => {
    expect(classifyIosRunFailure("There are no accounts registered with Xcode").kind).toBe("apple-account");
    expect(classifyIosRunFailure('Failed Registering Bundle Identifier: The app identifier "com.minimal.app" cannot be registered to your development team').kind).toBe("bundle-identifier");
    expect(classifyIosRunFailure("No profiles for 'com.minimal.app' were found").kind).toBe("provisioning-profile");
    expect(classifyIosRunFailure("Developer Mode is disabled on this device").kind).toBe("device-state");
    expect(classifyIosRunFailure("arm64-apple-darwin20.0: error: unknown argument: '-index-store-path'").kind).toBe(
      "compiler-toolchain",
    );
  });

  test("removes shell compiler variables from iOS native run env", () => {
    expect(
      sanitizeIosNativeRunEnv({
        AKAN_PUBLIC_APP_NAME: "minimal",
        CC: "arm64-apple-darwin20.0.0-clang",
        CXX: "arm64-apple-darwin20.0.0-clang++",
        SDKROOT: "/wrong/sdk",
      }),
    ).toEqual({ AKAN_PUBLIC_APP_NAME: "minimal" });
  });
});

describe("Android signing diagnostics", () => {
  test("reports missing release signing keys and adb authorization issues", () => {
    expect(
      getMissingAndroidReleaseSigningKeys({
        env: { MYAPP_RELEASE_STORE_FILE: "release.jks" } as NodeJS.ProcessEnv,
        gradleProperties: "MYAPP_RELEASE_STORE_PASSWORD=secret\n",
      }),
    ).toEqual(["MYAPP_RELEASE_KEY_ALIAS", "MYAPP_RELEASE_KEY_PASSWORD"]);
    expect(formatAndroidReleaseSigningError(["MYAPP_RELEASE_KEY_ALIAS"])).toContain("MYAPP_RELEASE_KEY_ALIAS");
    expect(getAdbDeviceStateIssues("List of devices attached\nabc123 unauthorized\nxyz offline\n")).toEqual([
      "Android device abc123 is unauthorized. Confirm USB debugging authorization on the device.",
      "Android device xyz is offline. Reconnect the device or restart adb.",
    ]);
  });
});
