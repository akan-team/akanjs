import { isNative, platform } from "@akanjs/native/core";

/** Inside an iOS or Android shell of the native runtime; a mobile target opened in a browser is not. */
export const isNativeApp = () => isNative && (platform === "ios" || platform === "android");

/** Inside any shell of the native runtime, desktop included. */
export const isNativeShell = () => isNative;

export const nativePlatform = () => (isNativeApp() ? (platform as "ios" | "android") : null);

export const desktopPlatform = () =>
  isNative && (platform === "macos" || platform === "windows" || platform === "linux") ? platform : null;

/** http(s) in the in-app browser, anything else (mailto:, tel:) in the app the system picks. */
export const openExternalUrl = async (url: string) => {
  if (!isNativeApp()) {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  if (/^https?:/i.test(url)) await (await import("@akanjs/native/plugins/browser")).browser.open({ url });
  else await (await import("@akanjs/native/plugins/opener")).opener.openUrl({ url });
};
