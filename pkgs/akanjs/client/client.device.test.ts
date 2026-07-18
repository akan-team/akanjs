import { afterEach, describe, expect, test } from "bun:test";

const deviceState = {
  platform: "web",
  language: "en",
  safeArea: { top: 11, bottom: 22 },
  infoCalls: 0,
  languageCalls: 0,
  safeAreaCalls: 0,
};
const calls: unknown[] = [];

const testCapacitor = () => ({
  Plugins: {
    Device: {
      getInfo: async () => {
        deviceState.infoCalls += 1;
        return { platform: deviceState.platform, model: "test-device" };
      },
      getLanguageCode: async () => {
        deviceState.languageCalls += 1;
        return { value: deviceState.language };
      },
    },
    Keyboard: {
      show: async () => calls.push("keyboard.show"),
      hide: async () => calls.push("keyboard.hide"),
      addListener: async (event: string, callback: (info: { keyboardHeight: number }) => void) => {
        calls.push(["keyboard.addListener", event]);
        if (event === "keyboardWillShow") callback({ keyboardHeight: 320 });
        if (event === "keyboardWillHide") callback({ keyboardHeight: 0 });
      },
      removeAllListeners: async () => calls.push("keyboard.removeAllListeners"),
    },
    Haptics: {
      vibrate: async (options: { duration: number }) => calls.push(["haptics.vibrate", options]),
      impact: async (options: { style: string }) => calls.push(["haptics.impact", options]),
      selectionStart: async () => calls.push("haptics.selectionStart"),
      selectionChanged: async () => calls.push("haptics.selectionChanged"),
      selectionEnd: async () => calls.push("haptics.selectionEnd"),
    },
    SafeArea: {
      getSafeAreaInsets: async () => {
        deviceState.safeAreaCalls += 1;
        return { insets: deviceState.safeArea };
      },
    },
  },
});

const installWindow = (pathname = "/ko/home", options: { nativeTarget?: boolean } = {}) => {
  const scrollCalls: unknown[] = [];
  const capacitor = options.nativeTarget ? testCapacitor() : undefined;
  Object.defineProperty(globalThis, "window", {
    value: {
      ...(options.nativeTarget ? { __AKAN_MOBILE_TARGET__: { name: "test" } } : {}),
      ...(capacitor ? { Capacitor: capacitor } : {}),
      location: { pathname },
      scrollY: 42,
      scrollTo: (options: unknown) => scrollCalls.push(options),
    },
    configurable: true,
  });
  Object.defineProperty(globalThis, "Capacitor", { value: capacitor, configurable: true });
  return { scrollCalls };
};

afterEach(async () => {
  const { Device } = await import("./device");
  Device.instance = null;
  deviceState.platform = "web";
  deviceState.language = "en";
  deviceState.safeArea = { top: 11, bottom: 22 };
  deviceState.infoCalls = 0;
  deviceState.languageCalls = 0;
  deviceState.safeAreaCalls = 0;
  calls.length = 0;
  globalThis.__AKAN_CAPACITOR_IMPORTS__ = undefined;
  delete process.env.AKAN_PUBLIC_RENDER_ENV;
  Object.defineProperty(globalThis, "window", { value: undefined, configurable: true });
  Object.defineProperty(globalThis, "Capacitor", { value: undefined, configurable: true });
});

describe("Device", () => {
  test("regular web creates fallback device without loading Capacitor modules", async () => {
    installWindow("/ko/profile");
    const { Device } = await import("./device");

    expect(() => Device.getDevice()).toThrow("Device is not loaded yet");
    const device = await Device.load({ supportLanguages: ["en", "ko"] });
    const second = await Device.load({ lang: "en", supportLanguages: ["en"] });

    expect(device).toBe(second);
    expect(device.lang).toBe("ko");
    expect(device.info.platform).toBe("web");
    expect(device.topSafeArea).toBe(0);
    expect(device.bottomSafeArea).toBe(0);
    expect(deviceState.infoCalls).toBe(0);
    expect(deviceState.languageCalls).toBe(0);
    expect(deviceState.safeAreaCalls).toBe(0);
    expect(Device.getDevice()).toBe(device);
  });

  test("native target loads Capacitor info, URL language prefix, and safe-area insets", async () => {
    installWindow("/ko/profile", { nativeTarget: true });
    const { Device } = await import("./device");

    const device = await Device.load({ supportLanguages: ["en", "ko"] });

    expect(device.lang).toBe("ko");
    expect(device.info.platform).toBe("web");
    expect(device.topSafeArea).toBe(11);
    expect(device.bottomSafeArea).toBe(22);
    expect(deviceState.infoCalls).toBe(1);
    expect(deviceState.languageCalls).toBe(1);
    expect(deviceState.safeAreaCalls).toBe(1);
  });

  test("ssr render mode creates a web device without loading Capacitor modules", async () => {
    process.env.AKAN_PUBLIC_RENDER_ENV = "ssr";
    installWindow("/ko/profile");
    const { Device } = await import("./device");

    const device = await Device.load({ supportLanguages: ["en", "ko"] });

    expect(device.lang).toBe("ko");
    expect(device.info.platform).toBe("web");
    expect(device.topSafeArea).toBe(0);
    expect(device.bottomSafeArea).toBe(0);
    expect(deviceState.infoCalls).toBe(0);
    expect(deviceState.languageCalls).toBe(0);
    expect(deviceState.safeAreaCalls).toBe(0);
  });

  test("web platform skips native keyboard and haptics but uses window scroll", async () => {
    const { scrollCalls } = installWindow("/en/home");
    const { Device } = await import("./device");
    const device = await Device.load({ supportLanguages: ["en"] });

    await device.showKeyboard();
    await device.hideKeyboard();
    device.listenKeyboardChanged(() => calls.push("keyboard.changed"));
    device.unlistenKeyboardChanged();
    expect(calls).toEqual([]);
    expect(device.getScrollTop()).toBe(42);
    device.setScrollTop(100);
    expect(scrollCalls).toEqual([{ top: 100 }]);
  });

  test("native platform calls keyboard, haptics, and page content scrolling", async () => {
    deviceState.platform = "ios";
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

    await device.showKeyboard();
    await device.hideKeyboard();
    device.listenKeyboardChanged((height) => changed.push(height));
    device.unlistenKeyboardChanged();
    await device.vibrate("light");
    await device.vibrate(250);

    expect(calls).toContain("keyboard.show");
    expect(calls).toContain("keyboard.hide");
    expect(calls).toContain("keyboard.removeAllListeners");
    expect(calls).toContainEqual(["haptics.impact", { style: "LIGHT" }]);
    expect(calls).toContainEqual(["haptics.vibrate", { duration: 250 }]);
    expect(changed).toEqual([320, 0]);
    expect(device.getScrollTop()).toBe(55);
    device.setScrollTop(10);
    expect(scrollCalls).toEqual([{ top: 10 }]);
  });
});
