import { createLiveValue, definePlugin, shallowEqual } from "../../../packages/core/src/index.ts";
import { useLiveValue } from "../../../packages/react/src/index.ts";
import { web } from "./web.ts";

/** Soft (on-screen) keyboard state. `height` is in CSS pixels and covers the bottom of the page. */
export interface KeyboardState {
  visible: boolean;
  height: number;
}

/**
 * What the keyboard does to the page (akanjs readiness O6-1):
 * - "resize" (default, or the app config's keyboard.resize): the page's viewport shrinks by the keyboard, so bottom-fixed UI stays above it
 *   (Android pads the WebView's container, iOS shortens the web view with the keyboard's animation).
 * - "none": the page keeps its full size and the keyboard covers its bottom; the app moves its UI
 *   itself with the heights of the events. iOS still scrolls a focused field into view.
 */
export type KeyboardResizeMode = "resize" | "none";

/** A keyboard transition: its height in CSS pixels once it ends (0 when hiding) and its animation length in ms. */
export interface KeyboardTransition {
  height: number;
  duration: number;
}

export interface KeyboardApi {
  getState(): Promise<KeyboardState>;
  /** Dismisses the soft keyboard. */
  hide(): Promise<void>;
  /** "resize" or "none"; until the app ends (not stored). The app config's keyboard.resize is the mode at launch. */
  setResizeMode(args: { mode: KeyboardResizeMode }): Promise<void>;
}

export interface KeyboardEvents {
  change: KeyboardState;
  /** The keyboard starts to show (Android 11+ and iOS: before its animation; Android 10 and the web: together with didShow). */
  willShow: KeyboardTransition;
  didShow: KeyboardTransition;
  willHide: KeyboardTransition;
  didHide: KeyboardTransition;
}

export const keyboard = definePlugin<KeyboardApi, KeyboardEvents>("keyboard", {
  methods: ["getState", "hide", "setResizeMode"],
  events: ["change", "willShow", "didShow", "willHide", "didHide"],
  web,
});

const hidden: KeyboardState = { visible: false, height: 0 };

const current = createLiveValue<KeyboardState>(
  hidden,
  (set) => {
    if (keyboard.eventImplementation("change") === "none") return;
    let live = true;
    const stop = keyboard.listen("change", set);
    keyboard
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

export interface UseKeyboard extends KeyboardState {
  /** False where the platform has no soft keyboard support (desktop). */
  supported: boolean;
  hide(): Promise<void>;
}

export function useKeyboard(): UseKeyboard {
  const state = useLiveValue(current);
  return { ...state, supported: keyboard.isSupported("getState"), hide: keyboard.hide };
}
