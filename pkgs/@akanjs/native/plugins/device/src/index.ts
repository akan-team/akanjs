import { createLiveValue, definePlugin, type Platform } from "../../../packages/core/src/index.ts";
import { useLiveValue } from "../../../packages/react/src/index.ts";
import { web } from "./web.ts";

export interface DeviceInfo {
  /** The akan-native platform: "web" in a browser, otherwise the app host. */
  platform: Platform;
  /** Hardware model identifier, e.g. "iPhone17,1", "Pixel 9", "Mac16,7". Best effort on the web. */
  model: string;
  /** e.g. "Apple", "Google", "samsung". "unknown" where the host cannot tell (most browsers). */
  manufacturer: string;
  /** "iOS", "iPadOS", "Android", "macOS", "Windows", "Linux", "ChromeOS" or "unknown". */
  osName: string;
  /** e.g. "26.0", "16". Browsers freeze the version in the user agent, so it may be stale on the web. */
  osVersion: string;
  /**
   * True in the iOS simulator, the Android emulator and virtual machines (macOS: the hypervisor
   * flag; Windows and Linux: the firmware's vendor and product names, and the CPU's hypervisor flag
   * on Linux). Always false on the web.
   */
  isVirtual: boolean;
  /**
   * Version of the engine rendering the page: WebKit ships with iOS, the WebView package on Android,
   * Safari on macOS, the WebView2 runtime on Windows, WebKitGTK on Linux, the browser on the web.
   */
  webViewVersion: string | null;
}

export interface BatteryInfo {
  /** Charge from 0 to 1, or null without a battery (iOS simulator, desktop Macs) or a reading. iOS reports 5% steps. */
  level: number | null;
  /** True while connected to power (charging or full), null without a battery. */
  charging: boolean | null;
}

export interface DeviceApi {
  getInfo(): Promise<DeviceInfo>;
  /**
   * A stable identifier for this app on this device. Not a hardware id:
   * iOS identifierForVendor (reset when all of the vendor's apps are removed), Android ANDROID_ID
   * (differs per signing key and user), desktop and web a random UUID stored with the app data.
   */
  getId(): Promise<{ identifier: string }>;
  /**
   * The user's preferred language as a BCP 47 tag ("ko-KR", "zh-Hans-CN") and its language subtag ("ko").
   * Prefer this over navigator.language inside apps: WKWebView answers from the app bundle's
   * localizations, not the user's language list (an app without any reports "en-US"; verified on macOS).
   */
  getLanguage(): Promise<{ tag: string; code: string }>;
  /** Rejects UNSUPPORTED where the host cannot read the battery (Safari, Firefox). */
  getBattery(): Promise<BatteryInfo>;
}

export const device = definePlugin<DeviceApi>("device", {
  methods: ["getInfo", "getId", "getLanguage", "getBattery"],
  web,
});

// Fetched once for the page: the values do not change while the app runs.
let requested = false;
const info = createLiveValue<DeviceInfo | null>(null, (set) => {
  if (requested) return;
  requested = true;
  device.getInfo().then(set, (error) => {
    requested = false;
    console.warn("[akan-native] device.getInfo failed", error);
  });
});

/** Device information, or null until it has loaded. */
export function useDeviceInfo(): DeviceInfo | null {
  return useLiveValue(info);
}
