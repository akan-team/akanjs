"use client";
import { Device as CapacitorDevice, type DeviceInfo } from "@capacitor/device";
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import { Keyboard, KeyboardInfo } from "@capacitor/keyboard";
import { SafeArea } from "capacitor-plugin-safe-area";
import type { RefObject } from "react";
import { isMobile } from "react-device-detect";

interface DeviceInitOption {
  lang?: string;
  supportLanguages?: string[] | readonly string[];
}
class Device {
  info: DeviceInfo;
  lang: string;
  topSafeArea: number;
  bottomSafeArea: number;
  isMobile = isMobile;
  #keyboard = Keyboard;
  #haptics = Haptics;
  #pageContentRef: RefObject<HTMLDivElement | null> | null = null;
  async init({ lang, supportLanguages = [] }: DeviceInitOption = {}) {
    const [
      info,
      { value: languageCode },
      {
        insets: { top: topSafeArea, bottom: bottomSafeArea },
      },
    ] = await Promise.all([CapacitorDevice.getInfo(), CapacitorDevice.getLanguageCode(), SafeArea.getSafeAreaInsets()]);
    const predefinedLangPath = window.location.pathname.split("/")[1]?.split("?")[0];
    const predefinedLang = supportLanguages.find((language) => language === predefinedLangPath);
    this.info = info;
    this.lang = lang ?? predefinedLang ?? languageCode;
    this.topSafeArea = topSafeArea;
    this.bottomSafeArea = bottomSafeArea;
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
    void this.#keyboard.addListener("keyboardWillShow", (keyboard: KeyboardInfo) => {
      onKeyboardChanged(keyboard.keyboardHeight);
    });
    void this.#keyboard.addListener("keyboardDidShow", (keyboard: KeyboardInfo) => {
      onKeyboardChanged(keyboard.keyboardHeight);
    });
    void this.#keyboard.addListener("keyboardWillHide", () => {
      onKeyboardChanged(0);
    });
    void this.#keyboard.addListener("keyboardDidHide", () => {
      onKeyboardChanged(0);
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
        await this.#haptics.impact({ style: ImpactStyle.Light });
      },
      medium: async () => {
        await this.#haptics.impact({ style: ImpactStyle.Medium });
      },
      heavy: async () => {
        await this.#haptics.impact({ style: ImpactStyle.Heavy });
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

export const device = new Device();
