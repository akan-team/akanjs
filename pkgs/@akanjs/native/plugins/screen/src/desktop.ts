// Desktop: displays and the cursor from the native shell (native/desktop/src/screen.rs: TAO
// monitors plus the NSScreen work area; win/screen.rs: plus GetMonitorInfo; linux/screen.rs: GDK
// monitors). `change`: the shell watches for display changes (screen.watch: AppKit's
// NSApplicationDidChangeScreenParametersNotification, WM_DISPLAYCHANGE, GDK's monitors-changed)
// and sends a bare `screen` event; the OS often sends several for one change, so the host reads
// the displays again and emits only when they differ.
import { defineDesktopPlugin } from "../../../packages/desktop/src/plugin.ts";
import type { Display, ScreenApi, ScreenEvents } from "./index.ts";
import { sameDisplays } from "./web.ts";

export default defineDesktopPlugin<ScreenApi, ScreenEvents>({
  id: "screen",
  methods: {
    getDisplays: (_args, ctx) => ctx.shell("screen.displays") as Promise<Display[]>,
    getCursorPoint: (_args, ctx) => ctx.shell("screen.cursor") as Promise<{ x: number; y: number }>,
  },
  events: {
    change(emit, ctx) {
      let active = true;
      let last: Display[] | null = null;
      let reading = false;
      let again = false;
      // One read at a time; a notification during a read makes one more read after it.
      const refresh = async () => {
        if (reading) {
          again = true;
          return;
        }
        reading = true;
        try {
          do {
            again = false;
            const displays = (await ctx.shell("screen.displays")) as Display[];
            if (!active) return;
            if (last && !sameDisplays(last, displays)) emit({ displays });
            last = displays;
          } while (again && active);
        } catch (error) {
          console.warn("[akan-native] screen: reading the displays failed", error);
        } finally {
          reading = false;
        }
      };
      const stop = ctx.onNativeEvent("screen", () => void refresh());
      ctx
        .shell("screen.watch")
        .then(refresh, (error) => console.warn("[akan-native] screen: cannot watch display changes", error));
      return () => {
        active = false;
        stop();
      };
    },
  },
});
