import { afterEach, describe, expect, test } from "bun:test";
import { pluginDecls } from "../../../packages/cli/src/lib/native-plugins.ts";
import { isAkanNativeError } from "../../../packages/core/src/index.ts";
import { installMockHost, type MockHost } from "../../../packages/core/src/testing.ts";
import manifest from "../native-plugin.json";
import { type BiometricStatus, biometric } from "../src/index.ts";

let host: MockHost | null = null;
afterEach(() => {
  host?.uninstall();
  host = null;
});

const rejection = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: unknown) => e,
  );

describe("biometric", () => {
  test("native hosts: status shape and authenticate arguments", async () => {
    const status: BiometricStatus = { available: false, type: "face", reason: "notEnrolled", deviceCredential: true };
    const asked: unknown[] = [];
    host = installMockHost({
      platform: "ios",
      plugins: { biometric: { methods: { isAvailable: () => status, authenticate: (args) => void asked.push(args) } } },
    });
    expect(await biometric.isAvailable()).toEqual(status);
    await biometric.authenticate({ reason: "Unlock your notes", allowDeviceCredential: true, cancelTitle: "Not now" });
    expect(asked).toEqual([{ reason: "Unlock your notes", allowDeviceCredential: true, cancelTitle: "Not now" }]);
  });

  test("native errors keep their code", async () => {
    host = installMockHost({
      platform: "android",
      plugins: {
        biometric: {
          methods: {
            authenticate: () => {
              throw Object.assign(new Error("cancelled"), { name: "AbortError" }); // the mock maps it to CANCELLED
            },
          },
        },
      },
    });
    expect(isAkanNativeError(await rejection(biometric.authenticate({ reason: "x" })), "CANCELLED")).toBe(true);
  });

  test("web and macOS reject UNSUPPORTED", async () => {
    for (const platform of ["web", "macos"] as const) {
      host = installMockHost({ platform, plugins: {} });
      expect(biometric.isSupported("authenticate")).toBe(false);
      expect(isAkanNativeError(await rejection(biometric.isAvailable()), "UNSUPPORTED")).toBe(true);
      expect(isAkanNativeError(await rejection(biometric.authenticate({ reason: "x" })), "UNSUPPORTED")).toBe(true);
      host.uninstall();
      host = null;
    }
  });

  test("manifest: iOS and Android only, with the Face ID text and USE_BIOMETRIC", () => {
    const plugin = { spec: "biometric", dir: `${import.meta.dir}/..`, manifest: manifest as never };
    expect(pluginDecls([plugin], "macos")).toEqual({});
    for (const platform of ["ios", "android"] as const) {
      expect(pluginDecls([plugin], platform)).toEqual({
        biometric: { methods: ["isAvailable", "authenticate"], events: [] },
      });
    }
    expect(manifest.ios.infoPlist.NSFaceIDUsageDescription).toBeTruthy();
    expect(manifest.android.permissions).toEqual(["android.permission.USE_BIOMETRIC"]);
  });
});
