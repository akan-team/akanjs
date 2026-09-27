// Desktop: the Dock tile through TAO in the native shell (native/desktop/src/dock.rs), the
// taskbar buttons (win/dock.rs) and the launcher entry (linux/dock.rs). The shell validates too;
// checking here gives INVALID_ARGS without a round trip.
import { AkanNativeError } from "../../../packages/core/src/index.ts";
import { defineDesktopPlugin } from "../../../packages/desktop/src/plugin.ts";
import type { DockApi, DockState } from "./index.ts";

const STATES = ["normal", "paused", "error"];

export default defineDesktopPlugin<DockApi>({
  id: "dock",
  methods: {
    setBadge: (args, ctx) => {
      const label = args?.label ?? null;
      if (label !== null && typeof label !== "string")
        throw new AkanNativeError("INVALID_ARGS", "label must be a string or null");
      return ctx.shell("dock.setBadge", { label }) as Promise<DockState>;
    },
    setProgress: (args, ctx) => {
      const progress = args?.progress ?? null;
      if (progress !== null && (typeof progress !== "number" || !(progress >= 0 && progress <= 1))) {
        throw new AkanNativeError("INVALID_ARGS", "progress must be a number from 0 to 1, or null");
      }
      const state = args?.state ?? "normal";
      if (!STATES.includes(state))
        throw new AkanNativeError("INVALID_ARGS", `state must be one of ${STATES.join(", ")}`);
      return ctx.shell("dock.setProgress", { progress, state }) as Promise<DockState>;
    },
    setVisible: (args, ctx) => {
      if (typeof args?.visible !== "boolean") throw new AkanNativeError("INVALID_ARGS", "visible must be a boolean");
      return ctx.shell("dock.setVisible", { visible: args.visible }) as Promise<DockState>;
    },
    getState: (_args, ctx) => ctx.shell("dock.getState") as Promise<DockState>,
  },
});
