import { definePlugin } from "../../../packages/core/src/index.ts";
import { web } from "./web.ts";

/** UIImpactFeedbackGenerator styles: light / medium / heavy by strength, soft is duller, rigid is crisper. */
export type ImpactStyle = "light" | "medium" | "heavy" | "soft" | "rigid";

export type NotificationType = "success" | "warning" | "error";

/**
 * Haptic feedback, with the four functions of tauri-plugins-workspace/plugins/haptics/guest-js/index.ts.
 *
 * A call resolves once the feedback was handed to the system. Devices without haptic hardware
 * (iOS simulator, iPads, most Android tablets and desktop browsers) resolve and feel nothing.
 * Hosts without any haptics API reject UNSUPPORTED: macOS, and browsers without navigator.vibrate
 * (Safari, so every iOS browser).
 *
 * impact, notification and selection are UI feedback: on iOS and Android they follow the user's
 * system haptics / touch feedback setting.
 */
export interface HapticsApi {
  /** A collision between UI elements, e.g. something snapping into place. Default style "medium". */
  impact(options?: { style?: ImpactStyle }): Promise<void>;
  /** The outcome of a task or action. Default type "success". */
  notification(options?: { type?: NotificationType }): Promise<void>;
  /** A selection changed, e.g. a picker value while scrolling. */
  selection(): Promise<void>;
  /** A plain vibration, for alerts rather than UI feedback. `duration` in ms, 1-10000, default 300. */
  vibrate(options?: { duration?: number }): Promise<void>;
}

export const haptics = definePlugin<HapticsApi>("haptics", {
  methods: ["impact", "notification", "selection", "vibrate"],
  web,
});
