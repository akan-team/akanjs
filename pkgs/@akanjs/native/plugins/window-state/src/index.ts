import { definePlugin } from "../../../packages/core/src/index.ts";

/**
 * Remembers the desktop window's position, size and maximized state across launches.
 * Adding the plugin to akan-native.config.ts is all it takes: bounds are saved while the user moves
 * or resizes the window and restored before the window is first shown (no visible jump).
 *
 * - Bounds are logical points of the normal (not maximized, not minimized, not full-screen)
 *   window, like Tauri's window-state; `maximized` is kept separately so un-maximizing after a
 *   restart returns to the last normal bounds.
 * - A saved position whose title bar would be off every connected display is dropped, and the
 *   window opens at the default place (a display was unplugged).
 * - Full screen is not restored: on macOS it would open a new Space at launch.
 * - Web, iOS and Android: UNSUPPORTED (the OS owns the window there).
 */
export interface SavedWindowState {
  x: number;
  y: number;
  width: number;
  height: number;
  maximized: boolean;
}

export interface WindowStateApi {
  /** What the next launch will restore, or null when nothing is saved yet. */
  getSaved(): Promise<{ state: SavedWindowState | null }>;
  /** Saves the current bounds now instead of after the next move or resize settles. */
  save(): Promise<{ state: SavedWindowState | null }>;
  /** Forgets the saved state: the next launch uses the configured size again. */
  clear(): Promise<void>;
}

export const windowState = definePlugin<WindowStateApi>("window-state", {
  methods: ["getSaved", "save", "clear"],
});
