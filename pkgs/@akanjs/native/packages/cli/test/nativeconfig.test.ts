import { describe, expect, test } from "bun:test";
import { mergePlist } from "../src/lib/nativeconfig.ts";

// Architecture review F: arrays union, dictionaries deep, scalar conflicts are errors, the app last.

describe("native config merge", () => {
  test("arrays are a union: two plugins' background modes both stay", () => {
    const merged = mergePlist([
      { who: "plugin push", values: { UIBackgroundModes: ["remote-notification"] } },
      { who: "plugin audio", values: { UIBackgroundModes: ["audio", "remote-notification"] } },
    ]);
    expect(merged.UIBackgroundModes).toEqual(["remote-notification", "audio"]);
  });

  test("dictionaries merge key by key", () => {
    const merged = mergePlist([
      { who: "plugin a", values: { NSAppTransportSecurity: { NSAllowsLocalNetworking: true } } },
      {
        who: "plugin b",
        values: { NSAppTransportSecurity: { NSExceptionDomains: { "example.com": { NSIncludesSubdomains: true } } } },
      },
    ]);
    expect(merged.NSAppTransportSecurity).toEqual({
      NSAllowsLocalNetworking: true,
      NSExceptionDomains: { "example.com": { NSIncludesSubdomains: true } },
    });
  });

  test("a scalar set differently by two contributors is an error naming both; the same value is fine", () => {
    expect(() =>
      mergePlist([
        { who: "plugin a", values: { UIStatusBarStyle: "UIStatusBarStyleLightContent" } },
        { who: "plugin b", values: { UIStatusBarStyle: "UIStatusBarStyleDarkContent" } },
      ]),
    ).toThrow(
      /UIStatusBarStyle: plugin a sets "UIStatusBarStyleLightContent", plugin b sets "UIStatusBarStyleDarkContent"/,
    );
    expect(
      mergePlist([
        { who: "a", values: { X: 1 } },
        { who: "b", values: { X: 1 } },
      ]),
    ).toEqual({ X: 1 });
  });

  test("the app is final: it overrides plugins, adds to arrays, but may not change keys akan-native owns", () => {
    const merged = mergePlist(
      [
        {
          who: "the shell",
          values: {
            CFBundleIdentifier: "com.akanjs.x",
            UIViewControllerBasedStatusBarAppearance: true,
            CFBundleURLTypes: [{ CFBundleURLSchemes: ["x"] }],
          },
        },
        { who: "plugin camera", values: { NSCameraUsageDescription: "plugin text" } },
      ],
      {
        who: "the app",
        values: {
          NSCameraUsageDescription: "app text",
          UIViewControllerBasedStatusBarAppearance: false,
          CFBundleURLTypes: [{ CFBundleURLSchemes: ["y"] }],
        },
      },
      ["CFBundleIdentifier"],
    );
    expect(merged.NSCameraUsageDescription).toBe("app text");
    expect(merged.UIViewControllerBasedStatusBarAppearance).toBe(false);
    expect(merged.CFBundleURLTypes).toEqual([{ CFBundleURLSchemes: ["x"] }, { CFBundleURLSchemes: ["y"] }]);
    expect(() =>
      mergePlist(
        [{ who: "the shell", values: { CFBundleIdentifier: "a" } }],
        { who: "the app", values: { CFBundleIdentifier: "b" } },
        ["CFBundleIdentifier"],
      ),
    ).toThrow(/CFBundleIdentifier: set by akan-native, the app may not change it/);
  });

  test("inputs are not modified", () => {
    const modes = ["audio"];
    mergePlist([
      { who: "a", values: { UIBackgroundModes: modes } },
      { who: "b", values: { UIBackgroundModes: ["fetch"] } },
    ]);
    expect(modes).toEqual(["audio"]);
  });
});
