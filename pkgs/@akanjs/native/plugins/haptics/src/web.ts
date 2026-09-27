import { AkanNativeError, defineWebPlugin } from "../../../packages/core/src/index.ts";
import type { HapticsApi, ImpactStyle, NotificationType } from "./index.ts";

// navigator.vibrate is the only haptics API on the web, and only Chromium browsers on devices
// with a vibration motor act on it. It has no amplitude, so strength is expressed as length.
// Chrome ignores it without a user gesture on the page (it returns false); like the native
// implementations, a call that the system drops still resolves.

const IMPACT: Record<ImpactStyle, number> = { light: 10, soft: 10, medium: 20, rigid: 20, heavy: 30 };

// The on/off timings of tauri-plugins-workspace/plugins/haptics/android/src/main/java/patterns/Notification.kt
// (its pre-amplitude `oldSDKPattern`), without the leading 0 ms delay.
const NOTIFICATION: Record<NotificationType, number[]> = {
  success: [40, 100, 40],
  warning: [40, 120, 60],
  error: [60, 100, 40, 80, 50],
};

const SELECTION = 10;

function vibrator(): (pattern: number | number[]) => boolean {
  const nav = typeof navigator === "undefined" ? undefined : (navigator as Navigator & { vibrate?: unknown });
  if (typeof nav?.vibrate !== "function")
    throw new AkanNativeError("UNSUPPORTED", "navigator.vibrate is not available in this browser");
  return (pattern) => nav.vibrate(pattern);
}

function choice<T extends string>(value: unknown, allowed: readonly T[], fallback: T, name: string): T {
  if (value === undefined || value === null) return fallback;
  if (typeof value === "string" && (allowed as readonly string[]).includes(value)) return value as T;
  throw new AkanNativeError("INVALID_ARGS", `${name} must be one of ${allowed.join(", ")}`);
}

function checkDuration(value: unknown): number {
  if (value === undefined || value === null) return 300;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 1 || value > 10000) {
    throw new AkanNativeError("INVALID_ARGS", "duration must be a number of milliseconds between 1 and 10000");
  }
  return Math.round(value);
}

export const web = defineWebPlugin<HapticsApi>({
  methods: {
    async impact(options) {
      const style = choice(options?.style, ["light", "medium", "heavy", "soft", "rigid"], "medium", "style");
      vibrator()(IMPACT[style]);
    },
    async notification(options) {
      const type = choice(options?.type, ["success", "warning", "error"], "success", "type");
      vibrator()(NOTIFICATION[type]);
    },
    async selection() {
      vibrator()(SELECTION);
    },
    async vibrate(options) {
      const duration = checkDuration(options?.duration);
      vibrator()(duration);
    },
  },
});
