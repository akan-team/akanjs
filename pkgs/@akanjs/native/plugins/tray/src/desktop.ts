// Desktop: status items built by the native shell (native/desktop/src/tray.rs on macOS, win/tray.rs,
// linux/tray.rs). The shell resolves icon paths itself (public/ assets and /__akan_native/file URLs) and
// validates menus (menu.rs, chrome.rs).
import { AkanNativeError } from "../../../packages/core/src/index.ts";
import { type DesktopContext, defineDesktopPlugin } from "../../../packages/desktop/src/plugin.ts";
import type { TrayApi, TrayEvents, TrayInfo, TrayOptions } from "./index.ts";

let nextId = 1;

function id(value: unknown): string {
  if (typeof value !== "string" || value === "")
    throw new AkanNativeError("INVALID_ARGS", "id must be a non-empty string");
  return value;
}

const nullableString = (v: unknown) => v === undefined || v === null || typeof v === "string";
const boolean = (v: unknown) => v === undefined || typeof v === "boolean";

/** The fields given, checked; the shell changes only these. */
function fields(args: Partial<TrayOptions>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!nullableString(args.icon)) throw new AkanNativeError("INVALID_ARGS", "icon must be a path or null");
  if (args.title !== undefined && typeof args.title !== "string")
    throw new AkanNativeError("INVALID_ARGS", "title must be a string");
  if (!nullableString(args.tooltip)) throw new AkanNativeError("INVALID_ARGS", "tooltip must be a string or null");
  if (args.menu !== undefined && args.menu !== null && !Array.isArray(args.menu))
    throw new AkanNativeError("INVALID_ARGS", "menu must be an array of menu items or null");
  if (!boolean(args.iconAsTemplate) || !boolean(args.menuOnLeftClick))
    throw new AkanNativeError("INVALID_ARGS", "iconAsTemplate and menuOnLeftClick must be booleans");
  for (const key of ["icon", "iconAsTemplate", "title", "tooltip", "menu", "menuOnLeftClick"] as const) {
    if (args[key] !== undefined) out[key] = args[key];
  }
  return out;
}

const update = (ctx: DesktopContext, trayId: string, args: Partial<TrayOptions>) =>
  ctx.shell("tray.update", { ...fields(args), id: trayId }) as Promise<TrayInfo>;

export default defineDesktopPlugin<TrayApi, TrayEvents>({
  id: "tray",
  methods: {
    create: (args, ctx) => {
      const trayId = args?.id === undefined ? `tray-${nextId++}` : id(args.id);
      return ctx.shell("tray.create", { ...fields(args ?? {}), id: trayId }) as Promise<TrayInfo>;
    },
    update: (args, ctx) => update(ctx, id(args?.id), args),
    setIcon: (args, ctx) => update(ctx, id(args?.id), { icon: args.icon ?? null, iconAsTemplate: args.iconAsTemplate }),
    setTitle: (args, ctx) => update(ctx, id(args?.id), { title: args.title }),
    setTooltip: (args, ctx) => update(ctx, id(args?.id), { tooltip: args.tooltip ?? null }),
    setMenu: (args, ctx) =>
      update(ctx, id(args?.id), { menu: args.menu ?? null, menuOnLeftClick: args.menuOnLeftClick }),
    remove: async (args, ctx) => {
      await ctx.shell("tray.remove", { id: id(args?.id) });
    },
    list: (_args, ctx) => ctx.shell("tray.list") as Promise<TrayInfo[]>,
    trigger: async (args, ctx) => {
      if (args?.button !== undefined && args.button !== "left" && args.button !== "right")
        throw new AkanNativeError("INVALID_ARGS", "button must be left or right");
      await ctx.shell("tray.trigger", { id: id(args?.id), button: args.button });
    },
  },
  events: {
    // A tray belongs to the app: its events go to the window the user was in last.
    click: (emit, ctx) =>
      ctx.onNativeEvent("tray", (e) => {
        if (e.event === "click")
          emit({ id: e.tray as string, button: e.button === "right" ? "right" : "left" }, "focused");
      }),
    menuClick: (emit, ctx) =>
      ctx.onNativeEvent("tray", (e) => {
        if (e.event === "menuClick") emit({ id: e.tray as string, item: e.item as string }, "focused");
      }),
  },
});
