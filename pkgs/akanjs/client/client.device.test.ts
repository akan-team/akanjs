import { afterEach, describe, expect, test } from "bun:test";
import { installMockHost, type MockHost } from "@akanjs/native/core/testing";
import type { Device } from "./device";

const deviceState = {
  platform: "web",
  language: "en",
  safeArea: { top: 11, bottom: 22 },
  infoCalls: 0,
  languageCalls: 0,
};
const calls: unknown[] = [];
let host: MockHost | null = null;

const installNativeHost = (platform: "ios" | "android") => {
  host = installMockHost({
    platform,
    plugins: {
      device: {
        methods: {
          getInfo: () => {
            deviceState.infoCalls += 1;
            return { platform, model: "test-device", osName: "iOS", osVersion: "26.0", isVirtual: true };
          },
          getLanguage: () => {
            deviceState.languageCalls += 1;
            return { tag: `${deviceState.language}-KR`, code: deviceState.language };
          },
        },
      },
      keyboard: {
        methods: { hide: () => calls.push("keyboard.hide") },
        events: ["willShow", "didShow", "willHide", "didHide"],
      },
      haptics: {
        methods: {
          impact: (options: unknown) => calls.push(["haptics.impact", options]),
          vibrate: (options: unknown) => calls.push(["haptics.vibrate", options]),
        },
      },
    },
  });
  return host;
};

const installWindow = (pathname = "/ko/home", options: { nativeTarget?: boolean } = {}) => {
  const scrollCalls: unknown[] = [];
  const insets = {
    "--akan-native-safe-area-top": `${deviceState.safeArea.top}px`,
    "--akan-native-safe-area-bottom": `${deviceState.safeArea.bottom}px`,
  };
  Object.defineProperty(globalThis, "document", { value: { documentElement: {} }, configurable: true });
  Object.defineProperty(globalThis, "window", {
    value: {
      ...(options.nativeTarget ? { __AKAN_MOBILE_TARGET__: { name: "test" } } : {}),
      location: { pathname },
      scrollY: 42,
      scrollTo: (options: unknown) => scrollCalls.push(options),
      getComputedStyle: () => ({ getPropertyValue: (name: keyof typeof insets) => insets[name] ?? "" }),
    },
    configurable: true,
  });
  return { scrollCalls };
};

const expectWebDevice = (device: Device) => {
  expect(device.lang).toBe("ko");
  expect(device.info.platform).toBe("web");
  expect(device.topSafeArea).toBe(0);
  expect(device.bottomSafeArea).toBe(0);
  expect(deviceState.infoCalls).toBe(0);
  expect(deviceState.languageCalls).toBe(0);
};

afterEach(async () => {
  const { Device } = await import("./device");
  Device.instance = null;
  host?.uninstall();
  host = null;
  deviceState.platform = "web";
  deviceState.language = "en";
  deviceState.safeArea = { top: 11, bottom: 22 };
  deviceState.infoCalls = 0;
  deviceState.languageCalls = 0;
  calls.length = 0;
  delete process.env.AKAN_PUBLIC_RENDER_ENV;
  Object.defineProperty(globalThis, "window", { value: undefined, configurable: true });
  Object.defineProperty(globalThis, "document", { value: undefined, configurable: true });
});

describe("Device", () => {
  test("regular web creates fallback device without asking the native runtime", async () => {
    installWindow("/ko/profile");
    const { Device } = await import("./device");

    expect(() => Device.getDevice()).toThrow("Device is not loaded yet");
    const device = await Device.load({ supportLanguages: ["en", "ko"] });
    const second = await Device.load({ lang: "en", supportLanguages: ["en"] });

    expect(device).toBe(second);
    expectWebDevice(device);
    expect(Device.getDevice()).toBe(device);
  });

  test("a mobile target opened in a browser is a web device", async () => {
    installWindow("/ko/profile", { nativeTarget: true });
    const { Device } = await import("./device");

    expectWebDevice(await Device.load({ supportLanguages: ["en", "ko"] }));
  });

  test("native shell loads device info, URL language prefix, and the shell's safe-area insets", async () => {
    installNativeHost("ios");
    installWindow("/ko/profile", { nativeTarget: true });
    const { Device } = await import("./device");

    const device = await Device.load({ supportLanguages: ["en", "ko"] });

    expect(device.lang).toBe("ko");
    expect(device.info.platform).toBe("ios");
    expect(device.info.model).toBe("test-device");
    expect(device.topSafeArea).toBe(11);
    expect(device.bottomSafeArea).toBe(22);
    expect(deviceState.infoCalls).toBe(1);
    expect(deviceState.languageCalls).toBe(1);
  });

  test("native shell falls back to the device language outside a language path", async () => {
    deviceState.language = "ko";
    installNativeHost("android");
    installWindow("/profile", { nativeTarget: true });
    const { Device } = await import("./device");

    expect((await Device.load({ supportLanguages: ["en", "ko"] })).lang).toBe("ko");
  });

  test("ssr render mode creates a web device without asking the native runtime", async () => {
    process.env.AKAN_PUBLIC_RENDER_ENV = "ssr";
    installNativeHost("ios");
    installWindow("/ko/profile", { nativeTarget: true });
    const { Device } = await import("./device");

    const device = await Device.load({ supportLanguages: ["en", "ko"] });

    expectWebDevice(device);
  });

  test("web platform skips native keyboard and haptics but uses window scroll", async () => {
    const { scrollCalls } = installWindow("/en/home");
    const { Device } = await import("./device");
    const device = await Device.load({ supportLanguages: ["en"] });

    await device.hideKeyboard();
    await device.vibrate("light");
    device.listenKeyboardChanged(() => calls.push("keyboard.changed"));
    device.unlistenKeyboardChanged();
    expect(calls).toEqual([]);
    expect(device.getScrollTop()).toBe(42);
    device.setScrollTop(100);
    expect(scrollCalls).toEqual([{ top: 100 }]);
  });

  test("native platform calls keyboard, haptics, and page content scrolling", async () => {
    const nativeHost = installNativeHost("ios");
    installWindow("/en/home", { nativeTarget: true });
    const { Device } = await import("./device");
    const device = await Device.load({ supportLanguages: ["en"] });
    const changed: number[] = [];
    const scrollCalls: unknown[] = [];
    device.setPageContentRef({
      current: {
        scrollTop: 55,
        scrollTo: (options: unknown) => scrollCalls.push(options),
      } as unknown as HTMLDivElement,
    });

    await device.hideKeyboard();
    device.listenKeyboardChanged((height) => changed.push(height));
    await Bun.sleep(0);
    nativeHost.emit("keyboard", "willShow", { height: 320, duration: 250 });
    nativeHost.emit("keyboard", "didShow", { height: 320, duration: 0 });
    nativeHost.emit("keyboard", "willHide", { height: 0, duration: 250 });
    await Bun.sleep(0);
    device.unlistenKeyboardChanged();
    await Bun.sleep(0);
    await device.vibrate("light");
    await device.vibrate(250);

    expect(calls).toContain("keyboard.hide");
    expect(calls).toContainEqual(["haptics.impact", { style: "light" }]);
    expect(calls).toContainEqual(["haptics.vibrate", { duration: 250 }]);
    expect(changed).toEqual([320, 0]);
    expect(nativeHost.subscriptions("keyboard", "willShow")).toBe(0);
    expect(device.getScrollTop()).toBe(55);
    device.setScrollTop(10);
    expect(scrollCalls).toEqual([{ top: 10 }]);
  });
});
