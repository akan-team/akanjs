// Desktop: menus are built by the native shell (native/desktop/src/menu.rs on macOS, win/menu.rs
// and linux/menu.rs from the item trees of chrome.rs), which validates the item tree and names the
// item at fault.
import { AkanNativeError } from "../../../packages/core/src/index.ts";
import { defineDesktopPlugin } from "../../../packages/desktop/src/plugin.ts";
import type { MenuApi, MenuClick, MenuEvents, MenuItem } from "./index.ts";

function items(value: unknown): MenuItem[] {
  if (!Array.isArray(value)) throw new AkanNativeError("INVALID_ARGS", "items must be an array of menu items");
  return value as MenuItem[];
}

function coordinate(value: unknown, name: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new AkanNativeError("INVALID_ARGS", `${name} must be a number`);
  return value;
}

export default defineDesktopPlugin<MenuApi, MenuEvents>({
  id: "menu",
  methods: {
    setAppMenu: async (args, ctx) => {
      await ctx.shell("menu.setApp", { items: items(args?.items) });
    },
    resetAppMenu: async (_args, ctx) => {
      await ctx.shell("menu.reset");
    },
    getAppMenu: async (_args, ctx) => ({ items: (await ctx.shell("menu.get")) as MenuItem[] }),
    popupContextMenu: async (args, ctx) => {
      const x = coordinate(args?.x, "x");
      const y = coordinate(args?.y, "y");
      if ((x === undefined) !== (y === undefined))
        throw new AkanNativeError("INVALID_ARGS", "give both x and y, or neither for the mouse position");
      const closeAfterMs = coordinate(args?.closeAfterMs, "closeAfterMs");
      // In the calling window (SH-6); the shell op waits until the menu closes.
      await ctx.shell("menu.popup", { items: items(args?.items), x, y, closeAfterMs, window: ctx.window });
    },
    triggerItem: async (args, ctx) => {
      if (typeof args?.id !== "string") throw new AkanNativeError("INVALID_ARGS", "id must be a string");
      await ctx.shell("menu.trigger", { id: args.id });
    },
  },
  events: {
    click: (emit, ctx) =>
      ctx.onNativeEvent("menu", (e) => {
        const click: MenuClick = { id: e.id as string, source: e.source === "context" ? "context" : "app" };
        if (typeof e.checked === "boolean") click.checked = e.checked;
        // A context menu belongs to its window; the app menu to whichever window the user is in.
        emit(click, click.source === "context" && typeof e.window === "number" ? { window: e.window } : "focused");
      }),
  },
});
