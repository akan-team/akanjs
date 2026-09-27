import { createLiveValue, definePlugin, shallowEqual } from "../../../packages/core/src/index.ts";
import { useLiveValue } from "../../../packages/react/src/index.ts";
import { readWebState, web } from "./web.ts";

export { checkAnnounce } from "./announce.ts";

export interface AccessibilityState {
  /**
   * A screen reader is on: VoiceOver on iOS, a touch-exploration service such as TalkBack on
   * Android. null where the host cannot tell: browsers and macOS (a page cannot see VoiceOver).
   */
  screenReader: boolean | null;
  /**
   * The user asked for less motion: Reduce Motion on iOS, "Remove animations" (animation scales
   * at 0) on Android, `prefers-reduced-motion` on the web and macOS.
   */
  reduceMotion: boolean;
  /**
   * The user's text size as a factor of the default size (1): iOS Dynamic Type (the body text
   * size / 17 pt), Android Configuration.fontScale, the browser's default font size / 16 px on the
   * web and macOS (1 unless the user changed it; iOS browsers always report 1).
   */
  fontScale: number;
}

/** "polite" waits until the screen reader finished speaking, "assertive" interrupts it. */
export type AnnouncePriority = "polite" | "assertive";

/** Screen reader state and announcements (plugins.md §4.1). */
export interface AccessibilityApi {
  getState(): Promise<AccessibilityState>;
  /**
   * Makes the running screen reader speak `text` (e.g. "3 results", "Saved"), for changes that
   * have no focusable element of their own. Resolves once handed over, also when no screen
   * reader runs (then nothing is spoken). Default priority "polite".
   * iOS: UIAccessibility announcement. Web, macOS and Android: a live region in the page
   * (Android's own announcement API is deprecated in API 36); inside a modal <dialog> the region
   * moves into the dialog, since the rest of the page is inert then.
   */
  announce(options: { text: string; priority?: AnnouncePriority }): Promise<void>;
}

export interface AccessibilityEvents {
  /** One of the state's fields changed. */
  change: AccessibilityState;
}

export const accessibility = definePlugin<AccessibilityApi, AccessibilityEvents>("accessibility", {
  methods: ["getState", "announce"],
  events: ["change"],
  web,
});

const current = createLiveValue<AccessibilityState>(
  readWebState(),
  (set) => {
    let live = true;
    const stop = accessibility.listen("change", set);
    accessibility
      .getState()
      .then((state) => live && set(state))
      .catch(() => {});
    return () => {
      live = false;
      stop();
    };
  },
  shallowEqual,
);

/**
 * The current accessibility state. Re-renders on every change. Until the host answered, it is
 * the page's own reading (screenReader null, reduceMotion from `prefers-reduced-motion`).
 */
export function useAccessibility(): AccessibilityState {
  return useLiveValue(current);
}
