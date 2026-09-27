import { AkanNativeError } from "../../../packages/core/src/index.ts";
import type { ToastDuration, ToastPosition } from "./index.ts";

/** Android's toast lengths (NotificationManagerService SHORT_DELAY / LONG_DELAY), also capacitor-plugins/toast/src/web.ts:8-10. */
export const TOAST_DURATION_MS: Readonly<Record<ToastDuration, number>> = { short: 2000, long: 3500 };

/** Toasts of one app that may be waiting or showing at once; Android drops more (MAX_PACKAGE_TOASTS). */
export const MAX_QUEUED = 5;

const DURATIONS: readonly ToastDuration[] = ["short", "long"];
const POSITIONS: readonly ToastPosition[] = ["top", "center", "bottom"];

export interface ToastItem {
  text: string;
  duration: ToastDuration;
  position: ToastPosition;
  /** How long the toast stays fully visible. */
  ms: number;
}

function choice<T extends string>(value: unknown, allowed: readonly T[], fallback: T, name: string): T {
  if (value === undefined || value === null) return fallback;
  if (typeof value === "string" && (allowed as readonly string[]).includes(value)) return value as T;
  throw new AkanNativeError("INVALID_ARGS", `${name} must be one of ${allowed.join(", ")}`);
}

/** Checks show()'s options the way the Android plugin does (generated checks plus the empty text). */
export function checkShow(options: unknown): ToastItem {
  if (typeof options !== "object" || options === null) throw new AkanNativeError("INVALID_ARGS", "text is required");
  const { text, duration, position } = options as Record<string, unknown>;
  if (text === undefined || text === null) throw new AkanNativeError("INVALID_ARGS", "text is required");
  if (typeof text !== "string") throw new AkanNativeError("INVALID_ARGS", "text must be a string");
  if (text.trim() === "") throw new AkanNativeError("INVALID_ARGS", "text must not be empty");
  const d = choice(duration, DURATIONS, "short", "duration");
  return { text, duration: d, position: choice(position, POSITIONS, "bottom", "position"), ms: TOAST_DURATION_MS[d] };
}

/**
 * One toast at a time, in order, like Android's toast queue. `display` resolves once its toast is
 * gone. `push` returns false when MAX_QUEUED toasts are already waiting or showing (the toast is dropped).
 */
export function createToastQueue(display: (item: ToastItem) => Promise<void>, max = MAX_QUEUED) {
  const waiting: ToastItem[] = [];
  let busy = false;

  const next = () => {
    if (busy) return;
    const item = waiting.shift();
    if (!item) return;
    busy = true;
    let shown: Promise<void>;
    try {
      shown = display(item);
    } catch (error) {
      shown = Promise.reject(error);
    }
    shown
      .catch((error) => console.warn("[akan-native] toast: showing a toast failed", error))
      .finally(() => {
        busy = false;
        next();
      });
  };

  return {
    push(item: ToastItem): boolean {
      if (waiting.length + (busy ? 1 : 0) >= max) return false;
      waiting.push(item);
      next();
      return true;
    },
    /** Waiting plus showing. */
    get size(): number {
      return waiting.length + (busy ? 1 : 0);
    },
  };
}
