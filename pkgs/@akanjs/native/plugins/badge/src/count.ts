import { AkanNativeError } from "../../../packages/core/src/index.ts";

/** The largest count: badges are 32-bit integers on iOS (UNUserNotificationCenter.setBadgeCount takes an NSInteger, tauri clamps to i32). */
export const MAX_BADGE_COUNT = 2147483647;

/** Checks set()'s count; the native implementation checks the same range. */
export function checkCount(count: unknown): number {
  if (typeof count !== "number" || !Number.isInteger(count) || count < 0 || count > MAX_BADGE_COUNT) {
    throw new AkanNativeError("INVALID_ARGS", `count must be an integer from 0 to ${MAX_BADGE_COUNT}`);
  }
  return count;
}
