import { definePlugin } from "../../../packages/core/src/index.ts";
import { web } from "./web.ts";

export { OPENER_SCHEMES } from "./url.ts";

/**
 * Opens URLs in other apps (browser, mail, phone) and the app's system settings. This is the
 * explicit API; links the page follows leave the WebView on their own (shell SH-4).
 * Only http, https, mailto and tel URLs are accepted; others reject INVALID_ARGS.
 */
export interface OpenerApi {
  /**
   * Opens the URL with the app the system picks. Rejects NOT_FOUND when no app handles it (e.g. tel:
   * on a simulator), PERMISSION_DENIED on iOS while the app is not in the foreground and on the web
   * when the browser blocked the new window (call it from a click).
   */
  openUrl(args: { url: string }): Promise<void>;
  /**
   * Whether an installed app handles the URL. iOS, macOS, Windows and Linux ask the system (tel: is
   * false on iPad and the simulator, and wherever no phone app is registered); the web cannot tell
   * and answers true. Not available on Android, where apps are
   * invisible to the query unless the manifest lists them in <queries>.
   */
  canOpenUrl(args: { url: string }): Promise<{ value: boolean }>;
  /**
   * Opens this app's page in Settings (iOS, Android), Privacy & Security in System Settings (macOS)
   * or Settings › Privacy & security (Windows). UNSUPPORTED on Linux, whose desktops have no common page.
   */
  openSettings(): Promise<void>;
}

export const opener = definePlugin<OpenerApi>("opener", {
  methods: ["openUrl", "canOpenUrl", "openSettings"],
  web,
});
