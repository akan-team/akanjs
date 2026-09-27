import { AkanNativeError } from "../../../packages/core/src/index.ts";

/** W3C screen orientation types. "primary" is the device's usual way up for that shape. */
export type OrientationType = "portrait-primary" | "portrait-secondary" | "landscape-primary" | "landscape-secondary";

/** What lock() accepts: one type, either way up of a shape, or any orientation. */
export type OrientationLock = "any" | "portrait" | "landscape" | OrientationType;

export const ORIENTATION_TYPES: readonly OrientationType[] = [
  "portrait-primary",
  "portrait-secondary",
  "landscape-primary",
  "landscape-secondary",
];
export const ORIENTATION_LOCKS: readonly OrientationLock[] = ["any", "portrait", "landscape", ...ORIENTATION_TYPES];

/** Checks lock()'s argument; the native implementations check the same list. */
export function checkLock(orientation: unknown): OrientationLock {
  if (typeof orientation !== "string" || !(ORIENTATION_LOCKS as readonly string[]).includes(orientation)) {
    throw new AkanNativeError(
      "INVALID_ARGS",
      `orientation must be one of ${ORIENTATION_LOCKS.join(", ")} (got ${JSON.stringify(orientation)})`,
    );
  }
  return orientation as OrientationLock;
}
