// Desktop: system hot keys in the native shell (native/desktop/src/hotkey.rs: Carbon on macOS;
// win/hotkey.rs: RegisterHotKey; linux/hotkey.rs: XGrabKey), which parses the accelerators
// (accelerator.rs) and answers bad ones with the reason.
import { AkanNativeError } from "../../../packages/core/src/index.ts";
import { defineDesktopPlugin } from "../../../packages/desktop/src/plugin.ts";
import type { GlobalShortcutApi, GlobalShortcutEvents } from "./index.ts";

function accelerator(value: unknown): string {
  if (typeof value !== "string" || value.trim() === "")
    throw new AkanNativeError("INVALID_ARGS", 'accelerator must be a string like "CmdOrCtrl+Shift+K"');
  return value;
}

export default defineDesktopPlugin<GlobalShortcutApi, GlobalShortcutEvents>({
  id: "global-shortcut",
  methods: {
    register: (args, ctx) =>
      ctx.shell("hotkey.register", { accelerator: accelerator(args?.accelerator) }) as Promise<{ accelerator: string }>,
    unregister: (args, ctx) =>
      ctx.shell("hotkey.unregister", { accelerator: accelerator(args?.accelerator) }) as Promise<{ removed: boolean }>,
    unregisterAll: async (_args, ctx) => {
      await ctx.shell("hotkey.unregisterAll");
    },
    isRegistered: (args, ctx) =>
      ctx.shell("hotkey.isRegistered", { accelerator: accelerator(args?.accelerator) }) as Promise<{
        registered: boolean;
      }>,
    list: (_args, ctx) => ctx.shell("hotkey.list") as Promise<string[]>,
  },
  events: {
    // Global: one window handles it, the one the user was in last.
    pressed: (emit, ctx) =>
      ctx.onNativeEvent("hotkey", (e) => {
        emit({ accelerator: e.accelerator as string }, "focused");
      }),
  },
});
