import { definePlugin } from "../../../packages/core/src/index.ts";
import { usePluginEvent } from "../../../packages/react/src/index.ts";
import { web } from "./web.ts";

export { checkColor, checkUrl } from "./args.ts";

/**
 * In-app browser (plugins.md §4.5): a system browser view over the app, sharing the browser's
 * cookies and passwords, with the page's URL visible to the user. For signing in, use
 * auth-session instead, which also returns the redirect.
 *
 * | host    | view                                   | close()     | finished                 |
 * |---------|----------------------------------------|-------------|--------------------------|
 * | iOS     | SFSafariViewController                 | ✓           | ✓                        |
 * | Android | Custom Tab                             | ✓           | ✓                        |
 * | Android | plain browser (no Custom Tabs browser) | UNSUPPORTED | never                    |
 * | web     | new window (popup)                     | ✓           | ✓ (polled, ≤ 0.5 s late) |
 * | desktop | the default browser                    | UNSUPPORTED | never                    |
 */
export interface BrowserApi {
  /**
   * Shows `url` (http or https) and resolves once the browser is up. One at a time: rejects
   * INVALID_ARGS while a browser opened here is still showing. `toolbarColor` ("#rrggbb") colors the
   * Custom Tab toolbar on Android; iOS 26 no longer tints Safari's bars and ignores it.
   * PERMISSION_DENIED on the web when the popup was blocked (call it from a click) and on Android
   * while the app is not in front (Android 15+ blocks activity starts from the background).
   */
  open(args: { url: string; toolbarColor?: string }): Promise<void>;
  /** Closes the browser opened by open(). Resolves also when none is showing. Does not send `finished`. */
  close(): Promise<void>;
}

export interface BrowserEvents {
  /** The user closed the browser (Done, back, or closed the window). */
  finished: Record<string, never>;
}

export const browser = definePlugin<BrowserApi, BrowserEvents>("browser", {
  methods: ["open", "close"],
  events: ["finished"],
  web,
});

/** Calls `handler` whenever the user closes the in-app browser, while mounted. */
export function useBrowserFinished(handler: () => void): void {
  usePluginEvent(browser, "finished", () => handler());
}
