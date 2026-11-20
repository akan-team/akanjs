import { Logger } from "akanjs/common";
import { isNativeApp, shellPlatform } from "./nativeShell";

export { desktopPlatform, isNativeApp, isNativeShell, nativePlatform } from "./nativeShell";

//* Loading core connects the bridge, hands macOS printing to the shell and forwards a dev console, so a shell starts it.
//? Through a file of its own: `import()` of core itself keeps every export, even where the page imports it statically.
if (shellPlatform())
  import("./nativeBoot").catch((error: unknown) => {
    Logger.error(`@akanjs/native/core did not load, so this shell's native bridge is not connected: ${String(error)}`);
  });

/** http(s) in the in-app browser, anything else (mailto:, tel:) in the app the system picks. */
export const openExternalUrl = async (url: string) => {
  if (!isNativeApp()) {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  if (/^https?:/i.test(url)) await (await import("@akanjs/native/plugins/browser")).browser.open({ url });
  else await (await import("@akanjs/native/plugins/opener")).opener.openUrl({ url });
};
