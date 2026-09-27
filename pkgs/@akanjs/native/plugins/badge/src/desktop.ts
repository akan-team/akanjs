// Desktop: the dock plugin's badge through its shell op: the Dock tile's label on macOS
// (native/desktop/src/dock.rs, TAO set_badge_label), the taskbar overlay icon on Windows
// (win/dock.rs), the launcher entry's count on Linux (linux/dock.rs). 0 clears it, like
// UIApplication's badge (Tauri shows a "0": tauri-runtime-wry src/lib.rs:3534). No permission is
// involved on the desktop.
import { defineDesktopPlugin } from "../../../packages/desktop/src/plugin.ts";
import { checkCount } from "./count.ts";
import type { BadgeApi } from "./index.ts";

export default defineDesktopPlugin<BadgeApi>({
  id: "badge",
  methods: {
    async set(options, ctx) {
      const count = checkCount(options?.count);
      await ctx.shell("dock.setBadge", { label: count === 0 ? null : String(count) });
    },
    async clear(_args, ctx) {
      await ctx.shell("dock.setBadge", { label: null });
    },
    async checkPermission() {
      return { badge: "granted" as const };
    },
    async requestPermission() {
      return { badge: "granted" as const };
    },
  },
});
