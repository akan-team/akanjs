"use client";
import type { RefObject } from "react";
import { readCssSafeAreaInsets } from "./frameConfig";
import type { DeviceInfo } from "./native";

type NativeModule = typeof import("./native");
type NativeControls = Pick<NativeModule, "haptics" | "keyboard">;
type ProcessEnvLike = { env?: Record<string, string | undefined> };
type DebugPayload = Record<string, unknown>;

const globalWithProcess = globalThis as typeof globalThis & { process?: ProcessEnvLike };

const debugSessionId = Math.random().toString(36).slice(2, 8);
let debugSeq = 0;

//? Opt-in only: every native dev build carries a mobile target, so keying on one traced every visibility change of
//? every desktop and phone session into its terminal.
const isFrameDebugEnabled = () => {
  if (typeof window === "undefined") return false;
  if (new URLSearchParams(window.location.search).get("akanFrameDebug") === "1") return true;
  try {
    return window.localStorage.getItem("akan:debug:frame") === "1";
  } catch {
    // Storage a page cannot read (a sandboxed frame, a stub window) leaves tracing off instead of failing the caller.
    return false;
  }
};

export function debugFrame(event: string, payload: DebugPayload = {}) {
  if (!isFrameDebugEnabled()) return;
  debugSeq += 1;
  const details = {
    href: window.location.href,
    now: Math.round(performance.now()),
    ...payload,
  };
  // biome-ignore lint/suspicious/noConsole: opt-in tracing, kept at debug so a native terminal files it under debug
  console.debug(`[akan:frame:${debugSessionId}:${debugSeq}] ${event}`, details);
}

interface DeviceInitOption {
  lang: string;
  info: DeviceInfo;
  topSafeArea: number;
  bottomSafeArea: number;
  /** The shell's keyboard and haptics; a page outside a native shell has neither. */
  native: NativeControls | null;
}

const webDeviceInfo: DeviceInfo = {
  platform: "web",
  model: "",
  manufacturer: "unknown",
  osName: "unknown",
  osVersion: "",
  isVirtual: false,
  webViewVersion: null,
};

const getRenderMode = () => globalWithProcess.process?.env?.AKAN_PUBLIC_RENDER_ENV ?? "csr";

const getBrowserLanguage = () => globalThis.navigator?.language?.split("-")[0] ?? "en";

export const isNativeTarget = () => {
  if (typeof window === "undefined") return false;
  return Boolean((window as typeof window & { __AKAN_MOBILE_TARGET__?: unknown }).__AKAN_MOBILE_TARGET__);
};

export const isMobileDevice = () => {
  if (typeof navigator === "undefined") return false;
  if (typeof window !== "undefined" && window.matchMedia?.("(hover: none) and (pointer: coarse)")?.matches) return true;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
};

const langInPath = (pathname: string, supportLanguages: string[] | readonly string[]) => {
  const predefinedLangPath = pathname.split("/")[1]?.split("?")[0];
  return supportLanguages.find((language) => language === predefinedLangPath);
};

const createWebDevice = ({
  lang,
  supportLanguages,
}: {
  lang?: string;
  supportLanguages: string[] | readonly string[];
}) => {
  const pathname = typeof window === "undefined" ? "" : window.location.pathname;
  return new Device({
    lang: lang ?? langInPath(pathname, supportLanguages) ?? getBrowserLanguage(),
    info: webDeviceInfo,
    topSafeArea: 0,
    bottomSafeArea: 0,
    native: null,
  });
};

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
      Device.instance = createWebDevice({ lang, supportLanguages });
      return Device.instance;
    }
    const native = await import("./native");
    //? a mobile target opened in a browser has no shell to ask
    if (!native.isNativeApp()) {
      Device.instance = createWebDevice({ lang, supportLanguages });
      return Device.instance;
    }
    const [info, { code: languageCode }] = await Promise.all([native.device.getInfo(), native.device.getLanguage()]);
    //* The shell writes the insets into --akan-native-safe-area-* before the bundle runs, on both platforms.
    const { top: topSafeArea, bottom: bottomSafeArea } = readCssSafeAreaInsets();
    Device.instance = new Device({
      lang: lang ?? langInPath(window.location.pathname, supportLanguages) ?? languageCode,
      info,
      topSafeArea,
      bottomSafeArea,
      native: { keyboard: native.keyboard, haptics: native.haptics },
    });
    return Device.instance;
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
  #native: NativeControls | null;
  #stopKeyboardListeners: (() => void)[] = [];
  #pageContentRef: RefObject<HTMLDivElement | null> | null = null;

  constructor({ lang, info, topSafeArea, bottomSafeArea, native }: DeviceInitOption) {
    this.info = info;
    this.lang = lang;
    this.topSafeArea = topSafeArea;
    this.bottomSafeArea = bottomSafeArea;
    this.#native = native;
  }
  setPageContentRef(pageContentRef: RefObject<HTMLDivElement | null>) {
    this.#pageContentRef = pageContentRef;
  }
  async hideKeyboard() {
    await this.#native?.keyboard.hide();
  }
  listenKeyboardChanged(onKeyboardChanged: (height: number) => void) {
    const keyboard = this.#native?.keyboard;
    if (!keyboard) return;
    let currentHeight = 0;
    const emitKeyboardHeight = (event: string, height: number) => {
      debugFrame("keyboard.event", { event, height, previousHeight: currentHeight });
      if (currentHeight === height) return;
      currentHeight = height;
      onKeyboardChanged(height);
    };
    this.#stopKeyboardListeners.push(
      ...(["willShow", "didShow", "willHide", "didHide"] as const).map((event) =>
        keyboard.listen(event, ({ height }) => {
          emitKeyboardHeight(event, height);
        }),
      ),
    );
  }
  unlistenKeyboardChanged() {
    for (const stop of this.#stopKeyboardListeners.splice(0)) stop();
  }
  async vibrate(type: "light" | "medium" | "heavy" | number = "medium") {
    const haptics = this.#native?.haptics;
    if (!haptics) return;
    if (typeof type === "number") await haptics.vibrate({ duration: type });
    else await haptics.impact({ style: type });
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
