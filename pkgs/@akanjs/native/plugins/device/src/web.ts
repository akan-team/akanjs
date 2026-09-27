import { AkanNativeError, defineWebPlugin } from "../../../packages/core/src/index.ts";
import type { BatteryInfo, DeviceApi, DeviceInfo } from "./index.ts";

// Browsers expose little and freeze much of it. capacitor-plugins/device/src/web.ts parses the
// user agent only, but user agents are reduced now: Chrome reports "Android 10; K",
// "Mac OS X 10_15_7" and "Windows NT 10.0" for every device, Safari 26 keeps "iPhone OS 18_6".
// So the user agent gives the OS family, and Chromium's User-Agent Client Hints (high entropy)
// fill in the real model and versions where available.

export interface UserAgentFields {
  osName: string;
  osVersion: string;
  model: string;
  manufacturer: string;
  browserVersion: string | null;
}

const version = (s: string | undefined) => (s ?? "").replace(/_/g, ".");

/** OS and browser from a user agent string. `touchPoints` tells iPads in desktop mode from Macs. */
export function parseUserAgent(ua: string, touchPoints = 0): UserAgentFields {
  const browserVersion =
    ua.match(/\b(?:Edg|EdgA|EdgiOS|CriOS|FxiOS|Firefox|OPR)\/([\d.]+)/)?.[1] ??
    ua.match(/\b(?:Headless)?Chrome\/([\d.]+)/)?.[1] ??
    ua.match(/\bVersion\/([\d.]+)/)?.[1] ??
    null;
  const safari = ua.match(/\bVersion\/([\d.]+)/)?.[1]; // Safari's version tracks iOS / iPadOS

  const apple = ua.match(/\b(iPhone|iPad|iPod)\b[^)]*? OS ([\d_]+)/);
  if (apple) {
    return {
      osName: apple[1] === "iPad" ? "iPadOS" : "iOS",
      osVersion: safari ?? version(apple[2]),
      model: apple[1]!,
      manufacturer: "Apple",
      browserVersion,
    };
  }
  const android = ua.match(/\bAndroid ([\d.]+)(?:; ([^;)]+))?/);
  if (android) {
    const model = (android[2] ?? "").replace(/\s*Build\/.*$/, "").trim();
    return {
      osName: "Android",
      osVersion: android[1]!,
      model: model && model !== "K" ? model : "unknown",
      manufacturer: "unknown",
      browserVersion,
    };
  }
  const chromeOs = ua.match(/\bCrOS \S+ ([\d.]+)/);
  if (chromeOs) {
    return { osName: "ChromeOS", osVersion: chromeOs[1]!, model: "unknown", manufacturer: "unknown", browserVersion };
  }
  const mac = ua.match(/\bMac OS X ([\d_.]+)/);
  if (mac) {
    if (touchPoints > 1)
      return { osName: "iPadOS", osVersion: safari ?? "", model: "iPad", manufacturer: "Apple", browserVersion };
    return { osName: "macOS", osVersion: version(mac[1]), model: "Macintosh", manufacturer: "Apple", browserVersion };
  }
  const windows = ua.match(/\bWindows NT ([\d.]+)/);
  if (windows) {
    return { osName: "Windows", osVersion: windows[1]!, model: "unknown", manufacturer: "unknown", browserVersion };
  }
  if (/\b(Linux|X11)\b/.test(ua))
    return { osName: "Linux", osVersion: "", model: "unknown", manufacturer: "unknown", browserVersion };
  return { osName: "unknown", osVersion: "", model: "unknown", manufacturer: "unknown", browserVersion };
}

interface HighEntropyValues {
  model?: string;
  platformVersion?: string;
  fullVersionList?: { brand: string; version: string }[];
}

interface UserAgentData {
  getHighEntropyValues(hints: string[]): Promise<HighEntropyValues>;
}

/** Applies Client Hints on top of the user agent fields. */
export function applyClientHints(fields: UserAgentFields, hints: HighEntropyValues): UserAgentFields {
  const next = { ...fields };
  if (hints.platformVersion) {
    // Windows reports its UA-CH platform version, 13+ meaning Windows 11 (Microsoft's documented mapping).
    const major = Number.parseInt(hints.platformVersion, 10);
    next.osVersion =
      fields.osName === "Windows" ? (major >= 13 ? "11" : major > 0 ? "10" : fields.osVersion) : hints.platformVersion;
  }
  if (hints.model) next.model = hints.model;
  const brands = (hints.fullVersionList ?? []).filter((b) => !/not.?a.?brand/i.test(b.brand));
  const brand = brands.find((b) => b.brand !== "Chromium") ?? brands[0];
  if (brand) next.browserVersion = brand.version;
  return next;
}

async function getInfo(): Promise<DeviceInfo> {
  let fields = parseUserAgent(navigator.userAgent, navigator.maxTouchPoints ?? 0);
  const data = (navigator as Navigator & { userAgentData?: UserAgentData }).userAgentData;
  if (typeof data?.getHighEntropyValues === "function") {
    try {
      fields = applyClientHints(
        fields,
        await data.getHighEntropyValues(["model", "platformVersion", "fullVersionList"]),
      );
    } catch {
      // not allowed in this context: keep the user agent fields
    }
  }
  return {
    platform: "web",
    model: fields.model,
    manufacturer: fields.manufacturer,
    osName: fields.osName,
    osVersion: fields.osVersion,
    isVirtual: false,
    webViewVersion: fields.browserVersion,
  };
}

const ID_KEY = "akan-native.device.id";
let sessionId: string | null = null;

function uuid(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID(); // secure contexts only
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function getId(): { identifier: string } {
  try {
    const stored = localStorage.getItem(ID_KEY);
    if (stored) return { identifier: stored };
    const id = uuid();
    localStorage.setItem(ID_KEY, id);
    return { identifier: id };
  } catch {
    // Blocked storage (private mode, disabled site data): stable for this page only.
    sessionId ??= uuid();
    return { identifier: sessionId };
  }
}

interface BatteryManager {
  level: number;
  charging: boolean;
}

async function getBattery(): Promise<BatteryInfo> {
  const nav = navigator as Navigator & { getBattery?: () => Promise<BatteryManager> };
  if (typeof nav.getBattery !== "function")
    throw new AkanNativeError("UNSUPPORTED", "the Battery Status API is not available in this browser");
  const battery = await nav.getBattery();
  // Without a battery the API reports a full, charging one (W3C Battery Status).
  return { level: Math.round(battery.level * 100) / 100, charging: battery.charging };
}

export const web = defineWebPlugin<DeviceApi>({
  methods: {
    getInfo,
    getId: async () => getId(),
    async getLanguage() {
      const tag = navigator.languages?.[0] || navigator.language || "en";
      return { tag, code: tag.split(/[-_]/)[0]!.toLowerCase() };
    },
    getBattery,
  },
});
