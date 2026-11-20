import type { Platform } from "@akanjs/native/core";

type ShellPlatform = Exclude<Platform, "web">;

const shellPlatforms = { macos: true, windows: true, linux: true, ios: true, android: true } satisfies Record<
  ShellPlatform,
  true
>;

const isShellPlatform = (value: unknown): value is ShellPlatform =>
  typeof value === "string" && Object.hasOwn(shellPlatforms, value);

//* Core reads the same field, which a shell's init.js writes before the bundle runs; a web page then never loads core.
export const shellPlatform = (): ShellPlatform | null => {
  const platform = (globalThis as { __AKAN_NATIVE__?: { platform?: unknown } }).__AKAN_NATIVE__?.platform;
  return isShellPlatform(platform) ? platform : null;
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
