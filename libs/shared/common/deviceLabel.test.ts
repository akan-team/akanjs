import { describe, expect, test } from "bun:test";

import { DeviceLabel } from "./deviceLabel";

describe("DeviceLabel", () => {
  test("names the browser and the system from a user agent", () => {
    const cases = [
      [
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
        { browser: "Safari", os: "macOS" },
      ],
      [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
        { browser: "Edge", os: "Windows" },
      ],
      [
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0 Mobile/15E148 Safari/604.1",
        { browser: "Chrome", os: "iOS" },
      ],
      [
        "Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0 Mobile Safari/537.36",
        { browser: "Samsung Internet", os: "Android" },
      ],
      [
        "Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0 Mobile Safari/537.36",
        { browser: "Android WebView", os: "Android" },
      ],
      [
        "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0",
        { browser: "Firefox", os: "Linux" },
      ],
      ["Bun/1.3.4", { browser: "", os: "" }],
    ] as const;
    for (const [userAgent, name] of cases) expect(DeviceLabel.of(userAgent)).toEqual(name);
    expect(DeviceLabel.of(undefined)).toEqual({ browser: "", os: "" });
  });
});
