import { createLiveValue, definePlugin, shallowEqual } from "../../../packages/core/src/index.ts";
import { useLiveValue } from "../../../packages/react/src/index.ts";
import type { AppearanceSetting, ColorScheme } from "./setting.ts";
import { readWebState, web } from "./web.ts";

export { APPEARANCE_SETTINGS, type AppearanceSetting, type ColorScheme, checkSetting } from "./setting.ts";

export interface AppearanceState {
  /** The scheme the app is drawn in right now; the page's `prefers-color-scheme` matches it. */
  mode: ColorScheme;
  /** The app's setting. Always "system" on the web and until set() was called. */
  setting: AppearanceSetting;
}

/**
 * Light/dark appearance of the app (plugins.md §4.1). To only follow the OS, CSS
 * `prefers-color-scheme` is enough; this plugin is for apps with their own theme switch.
 */
export interface AppearanceApi {
  get(): Promise<AppearanceState>;
  /**
   * Forces light or dark for the whole app (WebView, system UI such as dialogs, keyboards and
   * status bar icons), or goes back to the OS setting with "system". The setting is kept across
   * launches and applied at start (on iOS and Android before the first paint), so call it when the
   * user picks a theme, not at every start. The change event follows once the app redrew. Not
   * available on the web (UNSUPPORTED): a page cannot change `prefers-color-scheme`.
   */
  set(args: { mode: AppearanceSetting }): Promise<void>;
}

export interface AppearanceEvents {
  /** `mode` or `setting` changed: an OS switch while following the system, or set(). */
  change: AppearanceState;
}

export const appearance = definePlugin<AppearanceApi, AppearanceEvents>("appearance", {
  methods: ["get", "set"],
  events: ["change"],
  web,
});

const current = createLiveValue<AppearanceState>(
  readWebState(),
  (set) => {
    let live = true;
    const stop = appearance.listen("change", set);
    appearance
      .get()
      .then((state) => live && set(state))
      .catch(() => {});
    return () => {
      live = false;
      stop();
    };
  },
  shallowEqual,
);

/** The current appearance. Re-renders on every change. */
export function useAppearance(): AppearanceState {
  return useLiveValue(current);
}
