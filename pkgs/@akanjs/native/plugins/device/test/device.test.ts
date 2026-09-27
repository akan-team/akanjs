import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { isAkanNativeError } from "../../../packages/core/src/index.ts";
import { installMockHost, type MockHost } from "../../../packages/core/src/testing.ts";
import type { DesktopContext } from "../../../packages/desktop/src/plugin.ts";
import desktop, {
  createDesktopDevice,
  isVirtualMachine,
  parseAppleLanguages,
  parsePmset,
  parsePowerSupplies,
  plistString,
  posixLanguage,
} from "../src/desktop.ts";
import { type DeviceInfo, device } from "../src/index.ts";
import { applyClientHints, parseUserAgent } from "../src/web.ts";

let host: MockHost | null = null;
afterEach(() => {
  host?.uninstall();
  host = null;
});

const iosInfo: DeviceInfo = {
  platform: "ios",
  model: "iPhone17,1",
  manufacturer: "Apple",
  osName: "iOS",
  osVersion: "26.0",
  isVirtual: true,
  webViewVersion: "26.0",
};

describe("native hosts", () => {
  test("routes every method to the host", async () => {
    host = installMockHost({
      platform: "ios",
      plugins: {
        device: {
          methods: {
            getInfo: () => iosInfo,
            getId: () => ({ identifier: "ABC" }),
            getLanguage: () => ({ tag: "ko-KR", code: "ko" }),
            getBattery: () => ({ level: null, charging: null }),
          },
        },
      },
    });
    expect(await device.getInfo()).toEqual(iosInfo);
    expect(await device.getId()).toEqual({ identifier: "ABC" });
    expect(await device.getLanguage()).toEqual({ tag: "ko-KR", code: "ko" });
    expect(await device.getBattery()).toEqual({ level: null, charging: null });
    expect(host.requests.map((r) => r.method)).toEqual(["getInfo", "getId", "getLanguage", "getBattery"]);
  });

  test("a host without the plugin rejects UNSUPPORTED", async () => {
    host = installMockHost({ platform: "android", plugins: {} });
    expect(isAkanNativeError(await device.getInfo().catch((e) => e), "UNSUPPORTED")).toBe(true);
  });
});

describe("web", () => {
  test("user agents", () => {
    expect(
      parseUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1",
      ),
    ).toEqual({ osName: "iOS", osVersion: "26.0", model: "iPhone", manufacturer: "Apple", browserVersion: "26.0" });
    // iPad Safari asks for desktop sites with a Mac user agent.
    const mac =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15";
    expect(parseUserAgent(mac, 5)).toMatchObject({ osName: "iPadOS", model: "iPad", osVersion: "26.0" });
    expect(parseUserAgent(mac, 0)).toMatchObject({ osName: "macOS", model: "Macintosh", osVersion: "10.15.7" });
    // Chrome's reduced Android user agent hides the model.
    expect(
      parseUserAgent(
        "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36",
      ),
    ).toEqual({
      osName: "Android",
      osVersion: "10",
      model: "unknown",
      manufacturer: "unknown",
      browserVersion: "140.0.0.0",
    });
    expect(
      parseUserAgent(
        "Mozilla/5.0 (Linux; Android 16; Pixel 9 Build/BP22.250325.006; wv) AppleWebKit/537.36 Version/4.0 Chrome/140.0.7339.207 Mobile Safari/537.36",
      ),
    ).toMatchObject({ model: "Pixel 9", osVersion: "16", browserVersion: "140.0.7339.207" });
    expect(
      parseUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.3485.54",
      ),
    ).toMatchObject({ osName: "Windows", browserVersion: "140.0.3485.54" });
    expect(parseUserAgent("Mozilla/5.0 (X11; Linux x86_64; rv:143.0) Gecko/20100101 Firefox/143.0")).toMatchObject({
      osName: "Linux",
      browserVersion: "143.0",
    });
    expect(
      parseUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/140.0.0.0 Safari/537.36",
      ),
    ).toMatchObject({
      osName: "macOS",
      browserVersion: "140.0.0.0",
    });
  });

  test("client hints replace frozen values", () => {
    const android = parseUserAgent(
      "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36",
    );
    expect(
      applyClientHints(android, {
        model: "Pixel 9",
        platformVersion: "16.0.0",
        fullVersionList: [
          { brand: "Not=A?Brand", version: "24.0.0.0" },
          { brand: "Chromium", version: "140.0.7339.207" },
          { brand: "Google Chrome", version: "140.0.7339.207" },
        ],
      }),
    ).toMatchObject({ model: "Pixel 9", osVersion: "16.0.0", browserVersion: "140.0.7339.207" });
    const windows = parseUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36",
    );
    expect(applyClientHints(windows, { platformVersion: "15.0.0" }).osVersion).toBe("11");
    expect(applyClientHints(windows, { platformVersion: "10.0.0" }).osVersion).toBe("10");
  });

  test("getBattery rejects UNSUPPORTED without the Battery Status API", async () => {
    expect(device.implementation("getBattery")).toBe("web");
    expect(isAkanNativeError(await device.getBattery().catch((e) => e), "UNSUPPORTED")).toBe(true);
  });
});

describe("desktop", () => {
  // Only what the device plugin uses; the rest of the context is the host's business.
  const ctx = () =>
    ({
      app: { id: "dev.test", name: "Test", version: "1.0.0" },
      appDataDir: mkdtempSync(join(tmpdir(), "akan-native-device-")),
    }) as DesktopContext;

  test("pmset output", () => {
    const battery =
      "Now drawing from 'Battery Power'\n -InternalBattery-0 (id=22806627)\t85%; discharging; 4:12 remaining present: true\n";
    expect(parsePmset(battery)).toEqual({ level: 0.85, charging: false });
    const charged =
      "Now drawing from 'AC Power'\n -InternalBattery-0 (id=22806627)\t100%; charged; 0:00 remaining present: true\n";
    expect(parsePmset(charged)).toEqual({ level: 1, charging: true });
    const held =
      "Now drawing from 'AC Power'\n -InternalBattery-0 (id=1)\t80%; AC attached; not charging present: true\n";
    expect(parsePmset(held)).toEqual({ level: 0.8, charging: true });
    expect(parsePmset("Now drawing from 'AC Power'\n")).toEqual({ level: null, charging: null });
    expect(parsePmset("Now drawing from 'AC Power'\n -Back-UPS (id=1)\t100%; charged; present: true\n")).toEqual({
      level: null,
      charging: null,
    });
  });

  test("AppleLanguages and plist values", () => {
    expect(parseAppleLanguages('(\n    "en-KR",\n    en,\n    ko\n)\n')).toBe("en-KR");
    expect(parseAppleLanguages("(\n    ko,\n    en\n)\n")).toBe("ko");
    expect(parseAppleLanguages('(\n    "zh-Hans-CN"\n)')).toBe("zh-Hans-CN");
    expect(parseAppleLanguages("")).toBeNull();
    const xml =
      "<dict>\n\t<key>ProductName</key>\n\t<string>macOS</string>\n\t<key>ProductVersion</key>\n\t<string>26.6.2</string>\n</dict>";
    expect(plistString(xml, "ProductVersion")).toBe("26.6.2");
    expect(plistString(xml, "Missing")).toBeNull();
  });

  test("getId persists one random id in the app data folder", async () => {
    const c = ctx();
    const first = await desktop.methods.getId!(undefined, c);
    expect(first.identifier).toMatch(/^[0-9a-f-]{36}$/);
    expect(await desktop.methods.getId!(undefined, c)).toEqual(first);
    expect(readFileSync(join(c.appDataDir, "device-id"), "utf8")).toBe(first.identifier);
  });

  test("Linux power supplies", () => {
    const bat = { type: "Battery", status: "Discharging", capacity: "80" };
    expect(parsePowerSupplies([])).toEqual({ level: null, charging: null });
    // A wireless mouse is not the computer's battery.
    expect(parsePowerSupplies([{ type: "Battery", scope: "Device", capacity: "40", status: "Discharging" }])).toEqual({
      level: null,
      charging: null,
    });
    expect(parsePowerSupplies([bat, { type: "Mains", online: "0" }])).toEqual({ level: 0.8, charging: false });
    expect(
      parsePowerSupplies([
        { ...bat, status: "Not charging" },
        { type: "Mains", online: "1" },
      ]),
    ).toEqual({ level: 0.8, charging: true });
    expect(parsePowerSupplies([{ ...bat, status: "Full", capacity: "100" }])).toEqual({ level: 1, charging: true });
    expect(parsePowerSupplies([{ type: "Battery", capacity: "55" }])).toEqual({ level: 0.55, charging: null });
    // Two batteries (ThinkPads): the summed energy, not the mean of the percentages.
    const two = [
      { type: "Battery", status: "Discharging", capacity: "100", energy_now: "20000000", energy_full: "20000000" },
      { type: "Battery", status: "Discharging", capacity: "10", energy_now: "6000000", energy_full: "60000000" },
    ];
    expect(parsePowerSupplies(two).level).toBeCloseTo(26 / 80);
    expect(
      parsePowerSupplies([
        { type: "Battery", charge_now: "2500000", charge_full: "5000000", capacity: "49" },
        { type: "USB", online: "1" },
      ]),
    ).toEqual({ level: 0.5, charging: true });
  });

  test("POSIX locale variables", () => {
    expect(posixLanguage({ LANG: "ko_KR.UTF-8" })).toBe("ko-KR");
    expect(posixLanguage({ LANGUAGE: "de:en_US", LANG: "en_US.UTF-8" })).toBe("de");
    expect(posixLanguage({ LANGUAGE: "", LC_ALL: "C.UTF-8", LC_MESSAGES: "fr_CA.utf8", LANG: "en_US.UTF-8" })).toBe(
      "fr-CA",
    );
    expect(posixLanguage({ LANG: "sr_RS@latin" })).toBe("sr-Latn-RS");
    expect(posixLanguage({ LANG: "es_419.UTF-8" })).toBe("es-419");
    expect(posixLanguage({ LANG: "C" })).toBeNull();
    expect(posixLanguage({ LC_ALL: "POSIX" })).toBeNull();
    expect(posixLanguage({})).toBeNull();
  });

  test("virtual machines by firmware names", () => {
    expect(isVirtualMachine("QEMU", "Standard PC (Q35 + ICH9, 2009)")).toBe(true);
    expect(isVirtualMachine("innotek GmbH", "VirtualBox")).toBe(true);
    expect(isVirtualMachine("Microsoft Corporation", "Virtual Machine")).toBe(true);
    expect(isVirtualMachine("Apple Inc.", "Apple Virtualization Generic Platform")).toBe(true);
    expect(isVirtualMachine("Microsoft Corporation", "Surface Laptop 7")).toBe(false);
    expect(isVirtualMachine("LENOVO", "21KCCTO1WW")).toBe(false);
  });

  test("Linux: DMI, the device tree, the hypervisor flag, the battery and the WebKitGTK version", async () => {
    const root = mkdtempSync(join(tmpdir(), "akan-native-device-root-"));
    const put = (path: string, text: string) => {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), text);
    };
    put("sys/class/dmi/id/sys_vendor", "LENOVO\n");
    put("sys/class/dmi/id/product_name", "To be filled by O.E.M.\n");
    put("proc/device-tree/model", "Raspberry Pi 5 Model B Rev 1.0\0");
    put("proc/cpuinfo", "processor\t: 0\nflags\t\t: fpu vme sse2 hypervisor lahf_lm\n");
    put("sys/class/power_supply/BAT0/type", "Battery\n");
    put("sys/class/power_supply/BAT0/capacity", "42\n");
    put("sys/class/power_supply/BAT0/status", "Charging\n");
    put("sys/class/power_supply/AC/type", "Mains\n");
    put("sys/class/power_supply/AC/online", "1\n");
    const plugin = createDesktopDevice("linux", root, { LANG: "ko_KR.UTF-8" });
    const c = {
      ...ctx(),
      shell: async (op: string) => (op === "webview.version" ? { version: "2.48.3" } : null),
    } as unknown as DesktopContext;
    expect(await plugin.methods.getInfo!(undefined, c)).toMatchObject({
      platform: "linux",
      osName: "Linux",
      manufacturer: "LENOVO",
      model: "Raspberry Pi 5 Model B Rev 1.0",
      isVirtual: true,
      webViewVersion: "2.48.3",
    });
    expect(await plugin.methods.getBattery!(undefined, c)).toEqual({ level: 0.42, charging: true });
    expect(await plugin.methods.getLanguage!(undefined, c)).toEqual({ tag: "ko-KR", code: "ko" });
  });

  test("Windows: the shell's device ops", async () => {
    const ops: string[] = [];
    const answers: Record<string, unknown> = {
      "device.info": { manufacturer: "Microsoft Corporation", model: "Virtual Machine" },
      "device.language": { tag: "ko-KR" },
      "device.battery": { level: null, charging: null },
      "webview.version": { version: "140.0.3485.54" },
    };
    const c = { ...ctx(), shell: async (op: string) => (ops.push(op), answers[op]) } as unknown as DesktopContext;
    const plugin = createDesktopDevice("win32");
    expect(await plugin.methods.getInfo!(undefined, c)).toMatchObject({
      platform: "windows",
      osName: "Windows",
      manufacturer: "Microsoft Corporation",
      isVirtual: true,
      webViewVersion: "140.0.3485.54",
    });
    expect(await plugin.methods.getLanguage!(undefined, c)).toEqual({ tag: "ko-KR", code: "ko" });
    expect(await plugin.methods.getBattery!(undefined, c)).toEqual({ level: null, charging: null });
    expect(ops).toEqual(["device.info", "webview.version", "device.language", "device.battery"]);
  });

  test.if(process.platform === "darwin")("reads this Mac", async () => {
    const c = ctx();
    const info = await desktop.methods.getInfo!(undefined, c);
    expect(info).toMatchObject({ platform: "macos", manufacturer: "Apple", osName: "macOS" });
    expect(typeof info.isVirtual).toBe("boolean");
    expect(info.model).toMatch(/^[A-Za-z]+\d*,?\d*$/);
    expect(info.osVersion).toMatch(/^\d+\.\d+/);
    const { tag, code } = await desktop.methods.getLanguage!(undefined, c);
    expect(tag.toLowerCase().startsWith(code)).toBe(true);
    const battery = await desktop.methods.getBattery!(undefined, c);
    expect(battery.level === null || (battery.level >= 0 && battery.level <= 1)).toBe(true);
  });
});
