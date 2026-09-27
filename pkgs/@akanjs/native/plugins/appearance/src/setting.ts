import { AkanNativeError } from "../../../packages/core/src/index.ts";

export type ColorScheme = "light" | "dark";
/** What the app asked for: a fixed scheme, or "system" to follow the OS setting. */
export type AppearanceSetting = ColorScheme | "system";

export const APPEARANCE_SETTINGS: readonly AppearanceSetting[] = ["light", "dark", "system"];

/** Checks set()'s argument; the native implementations check the same list. */
export function checkSetting(mode: unknown): AppearanceSetting {
  if (typeof mode !== "string" || !(APPEARANCE_SETTINGS as readonly string[]).includes(mode)) {
    throw new AkanNativeError(
      "INVALID_ARGS",
      `mode must be one of ${APPEARANCE_SETTINGS.join(", ")} (got ${JSON.stringify(mode)})`,
    );
  }
  return mode as AppearanceSetting;
}
