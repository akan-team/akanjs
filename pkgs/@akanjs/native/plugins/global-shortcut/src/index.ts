import { definePlugin } from "../../../packages/core/src/index.ts";

/**
 * System-wide keyboard shortcuts that reach the app even when another app is in front
 * (plugins.md §5).
 *
 * - Accelerators: modifiers plus one key joined by "+", e.g. "CmdOrCtrl+Shift+K", "Alt+F12".
 *   Modifiers: Cmd, Ctrl, CmdOrCtrl (Command on macOS), Alt/Option, Shift. Keys: A–Z, 0–9,
 *   F1–F20, punctuation, Space, Tab, Enter, Escape, Backspace, Delete, arrows, Home, End,
 *   PageUp, PageDown, Num0–Num9.
 * - macOS: Carbon hot keys, no permission needed. Keys are positions on the US layout. A
 *   combination another app registered fails with an error; a system shortcut (Cmd+Space,
 *   Cmd+Tab) may register and never fire.
 * - Shortcuts belong to the app: they stay registered when the page reloads, and registering
 *   one the app already has succeeds. `pressed` goes to the window the user was in last.
 * - Windows: RegisterHotKey. CmdOrCtrl is Ctrl and Cmd the Windows key; some combinations
 *   (Win+L, Ctrl+Alt+Del) never reach an app.
 * - Linux: X11 only (XGrabKey), with the same rules. On Wayland register() rejects UNSUPPORTED:
 *   GNOME and KDE offer global shortcuts there only through the GlobalShortcuts portal.
 * - Web, iOS and Android: UNSUPPORTED.
 */
export interface GlobalShortcutApi {
  /** Resolves with the canonical spelling ("CmdOrCtrl+Shift+K"). */
  register(args: { accelerator: string }): Promise<{ accelerator: string }>;
  unregister(args: { accelerator: string }): Promise<{ removed: boolean }>;
  unregisterAll(): Promise<void>;
  isRegistered(args: { accelerator: string }): Promise<{ registered: boolean }>;
  /** The registered accelerators, as they were written. */
  list(): Promise<string[]>;
}

export interface GlobalShortcutEvents {
  /** `accelerator` as it was registered. */
  pressed: { accelerator: string };
}

export const globalShortcut = definePlugin<GlobalShortcutApi, GlobalShortcutEvents>("global-shortcut", {
  methods: ["register", "unregister", "unregisterAll", "isRegistered", "list"],
  events: ["pressed"],
});

/**
 * Registers a shortcut and calls `handler` when it is pressed. The returned function stops
 * listening and unregisters the shortcut.
 */
export async function onShortcut(accelerator: string, handler: () => void): Promise<() => Promise<void>> {
  await globalShortcut.register({ accelerator });
  const stop = globalShortcut.listen("pressed", (e) => {
    if (e.accelerator === accelerator) handler();
  });
  return async () => {
    stop();
    await globalShortcut.unregister({ accelerator });
  };
}
