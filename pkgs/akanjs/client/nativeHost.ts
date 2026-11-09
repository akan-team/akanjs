import type { Platform } from "@akanjs/native/core";

type ShellPlatform = Exclude<Platform, "web">;

const shellPlatforms: readonly ShellPlatform[] = ["macos", "windows", "linux", "ios", "android"];

//* Core reads the same field, which a shell's init.js writes before the bundle runs; a web page then never loads core.
const shellPlatform = (): ShellPlatform | null => {
  const platform = (globalThis as { __AKAN_NATIVE__?: { platform?: unknown } }).__AKAN_NATIVE__?.platform;
  return shellPlatforms.find((shell) => shell === platform) ?? null;
};

/** Inside an iOS or Android shell of the native runtime; a mobile target opened in a browser is not. */
export const isNativeApp = () => nativePlatform() !== null;

/** Inside any shell of the native runtime, desktop included. */
export const isNativeShell = () => shellPlatform() !== null;

export const nativePlatform = () => {
  const platform = shellPlatform();
  return platform === "ios" || platform === "android" ? platform : null;
};

export const desktopPlatform = () => {
  const platform = shellPlatform();
  return platform === "macos" || platform === "windows" || platform === "linux" ? platform : null;
};

//* Loading core connects the bridge, hands macOS printing to the shell and forwards a dev console, so a shell starts it.
//? Through a file of its own: `import()` of core itself keeps every export, even where the page imports it statically.
if (shellPlatform()) void import("./nativeBoot");

/** http(s) in the in-app browser, anything else (mailto:, tel:) in the app the system picks. */
export const openExternalUrl = async (url: string) => {
  if (!isNativeApp()) {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  if (/^https?:/i.test(url)) await (await import("@akanjs/native/plugins/browser")).browser.open({ url });
  else await (await import("@akanjs/native/plugins/opener")).opener.openUrl({ url });
};
