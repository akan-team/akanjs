import { createLiveValue, definePlugin, shallowEqual } from "../../../packages/core/src/index.ts";
import { useLiveValue } from "../../../packages/react/src/index.ts";
import type { OrientationLock, OrientationType } from "./types.ts";
import { readWebOrientation, web } from "./web.ts";

export {
  checkLock,
  ORIENTATION_LOCKS,
  ORIENTATION_TYPES,
  type OrientationLock,
  type OrientationType,
} from "./types.ts";

export interface OrientationState {
  type: OrientationType;
}

/**
 * Screen orientation (plugins.md §4.1): read it, follow it, lock it. Not available on desktop.
 * The lock belongs to the app and outlives page reloads until unlock().
 */
export interface ScreenOrientationApi {
  get(): Promise<OrientationState>;
  /**
   * Restricts the app to `orientation` and rotates to it if needed; resolves once the screen shows
   * an allowed orientation (or after a moment, when the system rotates later).
   * Rejects UNSUPPORTED where the lock is not honoured: an orientation the app does not support
   * (portrait-secondary on iPhones), iPads with multitasking, Android 16+ screens 600 dp and wider
   * (the system ignores locks there), and browsers without the API. Browsers that have it lock only
   * in fullscreen or installed web apps: PERMISSION_DENIED otherwise.
   */
  lock(args: { orientation: OrientationLock }): Promise<void>;
  /** Lets the system rotate freely again (the app's supported orientations). */
  unlock(): Promise<void>;
}

export interface ScreenOrientationEvents {
  /** The screen orientation changed, including 180° turns (landscape-primary ↔ landscape-secondary). */
  change: OrientationState;
}

export const screenOrientation = definePlugin<ScreenOrientationApi, ScreenOrientationEvents>("screen-orientation", {
  methods: ["get", "lock", "unlock"],
  events: ["change"],
  web,
});

const current = createLiveValue<OrientationState>(
  readWebOrientation(),
  (set) => {
    if (screenOrientation.eventImplementation("change") === "none") return;
    let live = true;
    const stop = screenOrientation.listen("change", set);
    screenOrientation
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

/** The current orientation type. Re-renders on every change. */
export function useScreenOrientation(): OrientationState {
  return useLiveValue(current);
}
