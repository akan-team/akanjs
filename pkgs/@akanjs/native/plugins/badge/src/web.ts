import { AkanNativeError, defineWebPlugin } from "../../../packages/core/src/index.ts";
import { checkCount } from "./count.ts";
import type { BadgeApi } from "./index.ts";

// The Badging API. setAppBadge(0) clears the badge (W3C Badging), clearAppBadge() as well.
// Browsers show the badge only for an installed web app and may reject NotAllowedError, e.g.
// Safari without the notification permission → PERMISSION_DENIED through AkanNativeError.from.
// No permission of its own: the permission methods answer "granted" wherever the API exists.

interface BadgingNavigator {
  setAppBadge?: (count?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
}

function badging(): Required<BadgingNavigator> {
  const nav = (typeof navigator === "undefined" ? undefined : navigator) as BadgingNavigator | undefined;
  if (typeof nav?.setAppBadge !== "function" || typeof nav.clearAppBadge !== "function") {
    throw new AkanNativeError("UNSUPPORTED", "this browser has no Badging API (navigator.setAppBadge)");
  }
  return { setAppBadge: nav.setAppBadge.bind(nav), clearAppBadge: nav.clearAppBadge.bind(nav) };
}

export const web = defineWebPlugin<BadgeApi>({
  methods: {
    async set(options) {
      const count = checkCount(options?.count);
      const api = badging();
      await (count === 0 ? api.clearAppBadge() : api.setAppBadge(count));
    },
    async clear() {
      await badging().clearAppBadge();
    },
    async checkPermission() {
      badging();
      return { badge: "granted" };
    },
    async requestPermission() {
      badging();
      return { badge: "granted" };
    },
  },
});
