import { definePlugin } from "../../../packages/core/src/index.ts";

/**
 * Launch the app when the user logs in (plugins.md §5).
 *
 * - macOS 13+: SMAppService.mainApp. The app itself becomes a login item under System Settings ›
 *   General › Login Items › "Open at Login"; no permission prompt, but macOS shows a "Login Item
 *   Added" notification. The user can switch it off there: then `status` is "requiresApproval"
 *   and enable() rejects with PERMISSION_DENIED; openSettings() takes the user to that page.
 * - `status` is macOS's own (SMAppService.Status):
 *     "enabled": registered and will launch at login.
 *     "notRegistered": not registered (typically after disable()).
 *     "requiresApproval": registered, but switched off by the user in System Settings.
 *     "notFound": macOS has no login item record for this app, e.g. it never called enable().
 *       Seen on macOS 26 for an ad-hoc signed bundle that never registered; not an error.
 *   `enabled` is `status === "enabled"`.
 * - The registration belongs to the app bundle: enable() it from the copy users run, normally
 *   the one in /Applications. A bundle whose signature macOS does not accept is refused
 *   (INTERNAL, "invalid signature").
 * - enable() when enabled and disable() when not are no-ops that resolve.
 * - Windows: a value named after the app id under HKCU\Software\Microsoft\Windows\CurrentVersion\Run
 *   that starts this .exe. The user can switch it off in Settings › Apps › Startup or Task Manager:
 *   then `status` is "requiresApproval" and enable() rejects with PERMISSION_DENIED; openSettings()
 *   opens that page. disable() removes the value and that switch. Never "notFound".
 * - Linux: an XDG autostart entry, ~/.config/autostart/<app id>.desktop, that starts this
 *   executable ($APPIMAGE for an AppImage). An entry the user switched off (Hidden=true,
 *   X-GNOME-Autostart-enabled=false) reads "requiresApproval", and enable() switches it on again:
 *   Linux has no approval system. openSettings() is UNSUPPORTED (no common settings page). Never "notFound".
 * - Web, iOS and Android: UNSUPPORTED.
 */
export type AutostartStatus = "enabled" | "notRegistered" | "requiresApproval" | "notFound";

export interface AutostartState {
  enabled: boolean;
  status: AutostartStatus;
}

export interface AutostartApi {
  /** Registers the app to open at login. */
  enable(): Promise<AutostartState>;
  /** Stops opening at login. The running app keeps running. */
  disable(): Promise<AutostartState>;
  /** Reads the state without changing it. */
  isEnabled(): Promise<AutostartState>;
  /** Opens System Settings at Login Items, or Settings › Apps › Startup on Windows (to switch a "requiresApproval" item back on). */
  openSettings(): Promise<void>;
}

export const autostart = definePlugin<AutostartApi>("autostart", {
  methods: ["enable", "disable", "isEnabled", "openSettings"],
});
