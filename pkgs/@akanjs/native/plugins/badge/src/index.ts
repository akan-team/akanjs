import { definePlugin } from "../../../packages/core/src/index.ts";
import { web } from "./web.ts";

export { checkCount, MAX_BADGE_COUNT } from "./count.ts";

export type PermissionState = "granted" | "denied" | "prompt";

/**
 * The number on the app icon (plugins.md §4.6).
 *
 * - iOS: UNUserNotificationCenter.setBadgeCount. Badges are part of the notification permission:
 *   set() rejects PERMISSION_DENIED until requestPermission() was granted, or when the user
 *   switched badges off for the app. The prompt asks for alerts, sounds and badges together
 *   (one prompt per app), the same set as @akanjs/native/plugins/local-notifications.
 * - Web: the Badging API (navigator.setAppBadge), shown for installed web apps (Chromium PWAs;
 *   Safari home screen / Dock web apps, which also need the notification permission). Browsers
 *   without it reject UNSUPPORTED. The API has no permission of its own, so the permission
 *   methods answer "granted" there.
 * - Desktop, through the dock plugin's badge (no permission, "granted"): the Dock tile's label on
 *   macOS; on Windows the taskbar buttons' overlay icon (counts over 99 as "99+"); on Linux the
 *   launcher entry's count, shown by docks that support it once the app is installed with its
 *   desktop file (@akanjs/native/plugins/dock).
 * - Android has no badge API (launchers draw dots for notifications): every method rejects
 *   UNSUPPORTED there.
 */
export interface BadgeApi {
  /** Shows `count` (an integer from 0 to 2147483647) on the app icon; 0 removes the badge. */
  set(options: { count: number }): Promise<void>;
  /** Removes the badge. Resolves without the permission as well (no badge can be shown then). */
  clear(): Promise<void>;
  /** Never prompts. */
  checkPermission(): Promise<{ badge: PermissionState }>;
  /** Prompts when the state is "prompt"; otherwise answers like checkPermission. */
  requestPermission(): Promise<{ badge: PermissionState }>;
}

export const badge = definePlugin<BadgeApi>("badge", {
  methods: ["set", "clear", "checkPermission", "requestPermission"],
  web,
});
