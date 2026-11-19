export interface DeviceName {
  browser: string;
  os: string;
}

export class DeviceLabel {
  //? Order matters: Edge, Opera, Whale and Samsung Internet also say Chrome, and Chrome also says Safari.
  static readonly #browsers = [
    ["Edge", /\bEdg(e|A|iOS)?\//],
    ["Opera", /\bOPR\//],
    ["Whale", /\bWhale\//],
    ["Samsung Internet", /\bSamsungBrowser\//],
    ["KakaoTalk", /\bKAKAOTALK\b/i],
    ["Naver", /\bNAVER\(inapp/i],
    ["Electron", /\bElectron\//],
    ["Firefox", /\b(Firefox|FxiOS)\//],
    ["Android WebView", /; wv\)/],
    ["Chrome", /\b(Chrome|CriOS)\//],
    ["Safari", /\bVersion\/[\d.]+.*\bSafari\//],
  ] as const;
  static readonly #systems = [
    ["iPadOS", /\biPad\b/],
    ["iOS", /\b(iPhone|iPod)\b/],
    ["Android", /\bAndroid\b/],
    ["ChromeOS", /\bCrOS\b/],
    ["Windows", /\bWindows\b/],
    ["macOS", /\bMac OS X\b|\bMacintosh\b/],
    ["Linux", /\bLinux\b/],
  ] as const;

  static of(userAgent: string | null | undefined): DeviceName {
    if (!userAgent) return { browser: "", os: "" };
    const browser = DeviceLabel.#browsers.find(([, pattern]) => pattern.test(userAgent))?.[0] ?? "";
    const os = DeviceLabel.#systems.find(([, pattern]) => pattern.test(userAgent))?.[0] ?? "";
    return { browser, os };
  }
}
