import { AkanNativeError, defineWebPlugin } from "../../../packages/core/src/index.ts";
import type { SplashScreenApi } from "./index.ts";

/** Browsers and the desktop WebView have no splash to hide. Arguments are still checked. */
export const web = defineWebPlugin<SplashScreenApi>({
  methods: {
    async hide(options) {
      checkFade(options?.fadeOutDuration);
    },
  },
});

export function checkFade(value: unknown): void {
  if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 10_000)) {
    throw new AkanNativeError("INVALID_ARGS", "fadeOutDuration must be a number of milliseconds between 0 and 10000");
  }
}
