import { describe, expect, test } from "bun:test";
import { privacyApiProblems, privacyManifest } from "../src/lib/privacy.ts";

describe("iOS privacy manifest", () => {
  test("merges the plugins' and the app's Required Reason APIs, each category once", () => {
    const manifest = privacyManifest(
      [
        { who: "plugin preferences", apis: { UserDefaults: ["CA92.1"] } },
        { who: "plugin appearance", apis: { UserDefaults: ["CA92.1"] } },
        { who: "plugin filesystem", apis: { FileTimestamp: ["C617.1"] } },
        { who: "plugin camera", apis: undefined },
      ],
      {
        accessedApis: { FileTimestamp: ["3B52.1"] },
        collectedDataTypes: [
          {
            NSPrivacyCollectedDataType: "NSPrivacyCollectedDataTypeEmailAddress",
            NSPrivacyCollectedDataTypeLinked: true,
            NSPrivacyCollectedDataTypeTracking: false,
            NSPrivacyCollectedDataTypePurposes: ["NSPrivacyCollectedDataTypePurposeAppFunctionality"],
          },
        ],
      },
    );
    expect(manifest.NSPrivacyTracking).toBe(false);
    expect(manifest.NSPrivacyTrackingDomains).toEqual([]);
    expect(manifest.NSPrivacyAccessedAPITypes).toEqual([
      {
        NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryFileTimestamp",
        NSPrivacyAccessedAPITypeReasons: ["3B52.1", "C617.1"],
      },
      {
        NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryUserDefaults",
        NSPrivacyAccessedAPITypeReasons: ["CA92.1"],
      },
    ]);
    expect((manifest.NSPrivacyCollectedDataTypes as unknown[]).length).toBe(1);
  });

  test("an app without plugins that call such APIs still gets a manifest (tracking false, no APIs)", () => {
    expect(privacyManifest([])).toEqual({
      NSPrivacyTracking: false,
      NSPrivacyTrackingDomains: [],
      NSPrivacyCollectedDataTypes: [],
      NSPrivacyAccessedAPITypes: [],
    });
  });

  test("unknown categories and malformed reasons are errors", () => {
    expect(privacyApiProblems({ who: "plugin x", apis: { Keychain: ["CA92.1"] } })).toEqual([
      expect.stringContaining('unknown Required Reason API category "Keychain"'),
    ]);
    expect(privacyApiProblems({ who: "plugin x", apis: { UserDefaults: [] } })).toEqual([
      expect.stringContaining("needs reason codes"),
    ]);
    expect(privacyApiProblems({ who: "plugin x", apis: { UserDefaults: ["ca92"] } })).toHaveLength(1);
    expect(privacyApiProblems({ who: "plugin x", apis: undefined })).toEqual([]);
  });
});
