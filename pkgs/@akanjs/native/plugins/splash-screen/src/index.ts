import { definePlugin } from "../../../packages/core/src/index.ts";
import { web } from "./web.ts";

/**
 * The launch screen (SH-6, plugins.md S2). The picture comes from `splash` in akan-native.config.ts;
 * the shell shows it from launch until the first page load (`splash.autoHide`, the default) or
 * until the app calls hide(), and at the latest until `splash.timeout`.
 * iOS: the launch screen, then a matching cover over the WebView. Android: the system splash
 * screen, kept up until hide. Web and desktop have no splash (desktop windows appear after the
 * first page load instead), so hide() resolves right away there.
 */
export interface SplashScreenApi {
  /**
   * Hides the splash, fading out over `fadeOutDuration` ms (default 200). Resolves at once, also
   * when the splash is already gone, so it is safe to call whenever the UI is ready. With
   * `splash.autoHide: false`, call it once the first screen has rendered.
   */
  hide(options?: { fadeOutDuration?: number }): Promise<void>;
}

export const splashScreen = definePlugin<SplashScreenApi>("splash-screen", {
  methods: ["hide"],
  web,
});
