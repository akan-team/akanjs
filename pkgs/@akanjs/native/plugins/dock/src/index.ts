import { definePlugin } from "../../../packages/core/src/index.ts";

/**
 * The app's Dock icon on macOS, its taskbar buttons on Windows and its launcher entry on Linux
 * (plugins.md §5): a badge, a progress bar, and whether the app has a Dock icon at all.
 *
 * - Everything is app-wide and outlives the page: after a reload, read it back with getState().
 * - setBadge: any short text ("3", "!", "new"); null or "" removes it. Numbers read best.
 * - setProgress: 0..1, drawn as a bar over the icon in whole percents; null hides it. `state`
 *   colors it: normal (blue), paused (yellow), error (red). There is no indeterminate bar on macOS.
 * - setVisible(false): no Dock icon, not in Cmd+Tab, no menu bar (keyboard shortcuts of the app
 *   menu still work); windows stay open. For apps that live in the menu bar (tray plugin).
 *   `policy` also reports "prohibited", the state `akan-native test` starts the app in.
 * - Windows: every window's taskbar button. setBadge draws the label on a red disc as the overlay
 *   icon (counts over 99 as "99+", other labels longer than 2 characters as a plain disc),
 *   setProgress is the button's progress bar in the same three colors, setVisible(false) takes
 *   the buttons away (policy "accessory"; the windows stay in Alt+Tab).
 * - Linux: the launcher entry of the desktop file "<app id>.desktop" (the Unity LauncherEntry
 *   API, which Ubuntu's dock, Dash to Dock and KDE Plasma show): setBadge takes whole numbers
 *   only (other labels reject UNSUPPORTED), setProgress draws paused and error like normal, and
 *   setVisible(false) sets the windows' skip-taskbar hint. Nothing shows until the app is
 *   installed with a desktop file of that name; the state is kept meanwhile.
 * - Web, iOS and Android: UNSUPPORTED.
 */
export type DockProgressState = "normal" | "paused" | "error";

export interface DockState {
  /** The app has a Dock icon (activation policy "regular"). */
  visible: boolean;
  policy: "regular" | "accessory" | "prohibited";
  badge: string | null;
  /** 0..1 as last set, or null when no bar is shown. */
  progress: number | null;
  progressState: DockProgressState | null;
}

export interface DockApi {
  setBadge(args: { label: string | null }): Promise<DockState>;
  setProgress(args: { progress: number | null; state?: DockProgressState }): Promise<DockState>;
  setVisible(args: { visible: boolean }): Promise<DockState>;
  getState(): Promise<DockState>;
}

export const dock = definePlugin<DockApi>("dock", {
  methods: ["setBadge", "setProgress", "setVisible", "getState"],
});
