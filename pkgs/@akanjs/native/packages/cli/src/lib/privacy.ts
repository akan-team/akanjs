// iOS privacy manifest (akanjs readiness O1-4). App Store Connect rejects an upload whose binary calls a
// Required Reason API without declaring a reason in PrivacyInfo.xcprivacy at the app bundle's root.
// akan-native's shell calls none; each plugin manifest lists its own (ios.privacyApis) and the app adds its
// data practices (config.privacy). Categories and reasons:
// https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api

import type { AkanNativeConfig } from "../config.ts";
import type { PlistValue } from "./plist.ts";

/** The categories Apple lists, without the NSPrivacyAccessedAPICategory prefix. */
export const PRIVACY_API_CATEGORIES = [
  "FileTimestamp",
  "SystemBootTime",
  "DiskSpace",
  "ActiveKeyboards",
  "UserDefaults",
] as const;
const REASON = /^[0-9A-F]{4}\.\d$/;

export interface PrivacySource {
  /** Who declares it, for error messages ("plugin filesystem", "the app"). */
  who: string;
  apis: Record<string, string[]> | undefined;
}

/** Problems with a category → reasons map. */
export function privacyApiProblems({ who, apis }: PrivacySource): string[] {
  if (apis === undefined) return [];
  if (!apis || typeof apis !== "object" || Array.isArray(apis))
    return [`${who}: privacy APIs must be an object like { "UserDefaults": ["CA92.1"] }`];
  const problems: string[] = [];
  for (const [category, reasons] of Object.entries(apis)) {
    if (!(PRIVACY_API_CATEGORIES as readonly string[]).includes(category))
      problems.push(
        `${who}: unknown Required Reason API category ${JSON.stringify(category)} (${PRIVACY_API_CATEGORIES.join(", ")})`,
      );
    if (!Array.isArray(reasons) || !reasons.length || !reasons.every((r) => typeof r === "string" && REASON.test(r))) {
      problems.push(`${who}: ${category} needs reason codes like "CA92.1"`);
    }
  }
  return problems;
}

/** PrivacyInfo.xcprivacy's root dictionary: every declared category once, reasons merged and sorted. */
export function privacyManifest(
  sources: PrivacySource[],
  privacy: AkanNativeConfig["privacy"] = {},
): Record<string, PlistValue> {
  const merged = new Map<string, Set<string>>();
  for (const { apis } of [...sources, { who: "the app", apis: privacy.accessedApis }]) {
    for (const [category, reasons] of Object.entries(apis ?? {})) {
      const set = merged.get(category) ?? new Set<string>();
      for (const r of reasons) set.add(r);
      merged.set(category, set);
    }
  }
  return {
    NSPrivacyTracking: privacy.tracking ?? false,
    NSPrivacyTrackingDomains: privacy.trackingDomains ?? [],
    NSPrivacyCollectedDataTypes: (privacy.collectedDataTypes ?? []) as PlistValue[],
    NSPrivacyAccessedAPITypes: [...merged]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([category, reasons]) => ({
        NSPrivacyAccessedAPIType: `NSPrivacyAccessedAPICategory${category}`,
        NSPrivacyAccessedAPITypeReasons: [...reasons].sort(),
      })),
  };
}
