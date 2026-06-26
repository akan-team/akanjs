"use client";
import type { RefObject } from "react";
import { debugFrame } from "./frameDebug";
import type {
  CapacitorDeviceInfo,
  CapacitorHapticsModule,
  CapacitorKeyboardInfo,
  CapacitorKeyboardModule,
} from "./capacitor";

type DeviceInfo = CapacitorDeviceInfo;
type Keyboard = CapacitorKeyboardModule["Keyboard"];
type Haptics = CapacitorHapticsModule["Haptics"];
type ImpactStyle = CapacitorHapticsModule["ImpactStyle"];
type ProcessEnvLike = { env?: Record<string, string | undefined> };

const globalWithProcess = globalThis as typeof globalThis & { process?: ProcessEnvLike };

interface DeviceInitOption {
  lang: string;
  info: DeviceInfo;
  topSafeArea: number;
  bottomSafeArea: number;
  keyboard: Keyboard;
  haptics: Haptics;
  impactStyle: ImpactStyle;
}

const noopKeyboard: Keyboard = {
  show: async () => undefined,
  hide: async () => undefined,
  addListener: async () => undefined,
  removeAllListeners: async () => undefined,
};

const noopHaptics: Haptics = {
  vibrate: async () => undefined,
  impact: async () => undefined,
  selectionStart: async () => undefined,
  selectionChanged: async () => undefined,
  selectionEnd: async () => undefined,
};

const noopImpactStyle: ImpactStyle = {
  Light: "light",
  Medium: "medium",
  Heavy: "heavy",
};

const getRenderMode = () => globalWithProcess.process?.env?.AKAN_PUBLIC_RENDER_ENV ?? "csr";

const getBrowserLanguage = () => globalThis.navigator?.language?.split("-")[0] ?? "en";

const isNativeTarget = () => {
  if (typeof window === "undefined") return false;
  return Boolean((window as typeof window & { __AKAN_MOBILE_TARGET__?: unknown }).__AKAN_MOBILE_TARGET__);
};

export const isMobileDevice = () => {
  if (typeof navigator === "undefined") return false;
  if (typeof window !== "undefined" && window.matchMedia?.("(hover: none) and (pointer: coarse)")?.matches) return true;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
};

const createWebDevice = ({
  lang,
  supportLanguages,
}: {
  lang?: string;
  supportLanguages: string[] | readonly string[];
}) => {
  const pathname = typeof window === "undefined" ? "" : window.location.pathname;
  const predefinedLangPath = pathname.split("/")[1]?.split("?")[0];
  const predefinedLang = supportLanguages.find((language) => language === predefinedLangPath);
  return new Device({
    lang: lang ?? predefinedLang ?? getBrowserLanguage(),
    info: { platform: "web", isVirtual: false, osVersion: "" },
    topSafeArea: 0,
    bottomSafeArea: 0,
    keyboard: noopKeyboard,
    haptics: noopHaptics,
    impactStyle: noopImpactStyle,
  });
};

/** Capacitor-aware device helper for platform info, safe areas, keyboard, haptics, and scroll state. */
export class Device {
  static instance: Device | null = null;
  static async load({
    lang,
    supportLanguages = [],
  }: {
    lang?: string;
    supportLanguages?: string[] | readonly string[];
  }) {
    if (Device.instance) return Device.instance;
    if (getRenderMode() !== "csr" || !isNativeTarget()) {
      const device = createWebDevice({ lang, supportLanguages });
      Device.instance = device;
      return device;
    }
    const { loadCapacitorDevice, loadCapacitorHaptics, loadCapacitorKeyboard, loadCapacitorSafeArea } = await import(
      "./capacitor"
    );
    const [{ Device: CapacitorDevice }, { Keyboard }, { Haptics, ImpactStyle }, { SafeArea }] = await Promise.all([
      loadCapacitorDevice(),
      loadCapacitorKeyboard(),
      loadCapacitorHaptics(),
      loadCapacitorSafeArea(),
    ]);
    const [
      info,
      { value: languageCode },
      {
        insets: { top: topSafeArea, bottom: bottomSafeArea },
      },
    ] = await Promise.all([CapacitorDevice.getInfo(), CapacitorDevice.getLanguageCode(), SafeArea.getSafeAreaInsets()]);
    if (info.platform === "ios") await Keyboard.setResizeMode?.({ mode: "none" });
    const predefinedLangPath = window.location.pathname.split("/")[1]?.split("?")[0];
    const predefinedLang = supportLanguages.find((language) => language === predefinedLangPath);
    const device = new Device({
      lang: lang ?? predefinedLang ?? languageCode,
      info,
      topSafeArea,
      bottomSafeArea,
      keyboard: Keyboard,
      haptics: Haptics,
      impactStyle: ImpactStyle,
    });
    Device.instance = device;
    return device;
  }
  static getDevice() {
    if (!Device.instance) throw new Error("Device is not loaded yet");
    return Device.instance;
  }

  info: DeviceInfo;
  lang: string;
  topSafeArea: number;
  bottomSafeArea: number;
  isMobile = isMobileDevice();
  #keyboard: DeviceInitOption["keyboard"];
  #haptics: DeviceInitOption["haptics"];
  #impactStyle: DeviceInitOption["impactStyle"];
  #pageContentRef: RefObject<HTMLDivElement | null> | null = null;

  constructor({ lang, info, topSafeArea, bottomSafeArea, keyboard, haptics, impactStyle }: DeviceInitOption) {
    this.info = info;
    this.lang = lang;
    this.topSafeArea = topSafeArea;
    this.bottomSafeArea = bottomSafeArea;
    this.#keyboard = keyboard;
    this.#haptics = haptics;
    this.#impactStyle = impactStyle;
  }
  setPageContentRef(pageContentRef: RefObject<HTMLDivElement | null>) {
    this.#pageContentRef = pageContentRef;
  }
  async showKeyboard() {
    if (this.info.platform === "web") return;
    await this.#keyboard.show();
  }
  async hideKeyboard() {
    if (this.info.platform === "web") return;
    await this.#keyboard.hide();
  }
  listenKeyboardChanged(onKeyboardChanged: (height: number) => void) {
    if (this.info.platform === "web") return;
    let currentHeight = 0;
    const emitKeyboardHeight = (event: string, height: number) => {
      debugFrame("keyboard.event", { event, height, previousHeight: currentHeight });
      if (currentHeight === height) return;
      currentHeight = height;
      onKeyboardChanged(height);
    };
    void this.#keyboard.addListener("keyboardWillShow", (keyboard: CapacitorKeyboardInfo) => {
      emitKeyboardHeight("keyboardWillShow", keyboard.keyboardHeight);
    });
    void this.#keyboard.addListener("keyboardDidShow", (keyboard: CapacitorKeyboardInfo) => {
      emitKeyboardHeight("keyboardDidShow", keyboard.keyboardHeight);
    });
    void this.#keyboard.addListener("keyboardWillHide", () => {
      emitKeyboardHeight("keyboardWillHide", 0);
    });
    void this.#keyboard.addListener("keyboardDidHide", () => {
      emitKeyboardHeight("keyboardDidHide", 0);
    });
  }
  unlistenKeyboardChanged() {
    if (this.info.platform === "web") return;
    void this.#keyboard.removeAllListeners();
  }
  async vibrate(type: "light" | "medium" | "heavy" | number = "medium") {
    if (typeof type === "number") {
      await this.#haptics.vibrate({ duration: type });
      return;
    }
    const handleImpact = {
      light: async () => {
        await this.#haptics.impact({ style: this.#impactStyle.Light });
      },
      medium: async () => {
        await this.#haptics.impact({ style: this.#impactStyle.Medium });
      },
      heavy: async () => {
        await this.#haptics.impact({ style: this.#impactStyle.Heavy });
      },
      selectionStart: async () => {
        await this.#haptics.selectionStart();
      },
      selectionChanged: async () => {
        await this.#haptics.selectionChanged();
      },
      selectionEnd: async () => {
        await this.#haptics.selectionEnd();
      },
    };
    await handleImpact[type]();
  }
  getScrollTop() {
    if (this.info.platform === "web") return window.scrollY;
    return this.#pageContentRef?.current?.scrollTop ?? 0;
  }
  setScrollTop(scrollTop: number) {
    if (this.info.platform === "web") {
      window.scrollTo({ top: scrollTop });
      return;
    }
    return this.#pageContentRef?.current?.scrollTo({ top: scrollTop });
  }
}
