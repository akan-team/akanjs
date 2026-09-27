import { definePlugin } from "../../../packages/core/src/index.ts";
import { web } from "./web.ts";

export { checkShow, createToastQueue, MAX_QUEUED, TOAST_DURATION_MS, type ToastItem } from "./queue.ts";

/** "short" shows the toast for 2 s, "long" for 3.5 s (Android's Toast.LENGTH_SHORT / LENGTH_LONG). */
export type ToastDuration = "short" | "long";

/** Where the toast appears. Android shows text toasts at the bottom whatever is asked (see show). */
export type ToastPosition = "top" | "center" | "bottom";

export interface ToastShowOptions {
  /** The message, not empty. Android 12+ cuts text toasts to two lines. */
  text: string;
  /** Default "short". */
  duration?: ToastDuration;
  /** Default "bottom". Ignored on Android. */
  position?: ToastPosition;
}

/**
 * A short message that goes away by itself (plugins.md §4.2), with the options of
 * capacitor-plugins/toast/src/definitions.ts. It does not take touches or focus.
 *
 * Android shows the system Toast. Web, macOS and iOS show the same in-page toast, which stays
 * above the app's own layers (the top layer, also above open dialogs) and is read by screen
 * readers through a live region. On every platform toasts queue up and show one after another,
 * as Android's do; at most 5 wait at a time, more are dropped (Android drops them as well).
 */
export interface ToastApi {
  /**
   * Resolves once the toast is queued or shown, not when it goes away. Rejects INVALID_ARGS for
   * empty text or an unknown duration or position.
   */
  show(options: ToastShowOptions): Promise<void>;
}

export const toast = definePlugin<ToastApi>("toast", {
  methods: ["show"],
  web,
});
