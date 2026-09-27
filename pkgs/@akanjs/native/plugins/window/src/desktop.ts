// Desktop: TAO window operations through the native shell channel (native/desktop akan_native_shell).
// Every op acts on `args.window`, or on the window whose page called (SH-6 multi-window).
import { statSync } from "node:fs";
import { basename } from "node:path";
import { AkanNativeError, mimeFor } from "../../../packages/core/src/index.ts";
import { createPageVeto, type DesktopContext, defineDesktopPlugin } from "../../../packages/desktop/src/plugin.ts";
import type { DragDropEvent, WindowApi, WindowEvents, WindowInfo, WindowState } from "./index.ts";

// The pages' onCloseRequested handlers (plugins.md D4); each window's page is asked for its own window.
const closeVeto = createPageVeto();

function finite(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new AkanNativeError("INVALID_ARGS", `${name} must be a number`);
  return value;
}

function bool(value: unknown, name: string): boolean {
  if (typeof value !== "boolean") throw new AkanNativeError("INVALID_ARGS", `${name} must be a boolean`);
  return value;
}

/** `{ window }` when the call names a target window, else {} (the calling window). */
function target(args: unknown): { window?: number } {
  const window = (args as { window?: unknown } | undefined)?.window;
  if (window === undefined) return {};
  if (typeof window !== "number" || !Number.isInteger(window) || window < 1)
    throw new AkanNativeError("INVALID_ARGS", "window must be a window id");
  return { window };
}

/** Regular files among the dropped paths, served at /__akan_native/file/<id>; folders and unreadable paths are left out. */
export function droppedFiles(
  ctx: Pick<DesktopContext, "registerFile">,
  paths: string[],
): NonNullable<DragDropEvent["files"]> {
  const files: NonNullable<DragDropEvent["files"]> = [];
  for (const path of paths) {
    try {
      if (!statSync(path).isFile()) continue;
    } catch {
      continue;
    }
    const name = basename(path);
    files.push({ ...ctx.registerFile(path, mimeFor(name)), path, name });
  }
  return files;
}

/** The shell says "no window 7" for a window that is gone. */
function shell(ctx: DesktopContext, op: string, args: unknown, extra: Record<string, unknown> = {}): Promise<unknown> {
  return ctx.shell(`window.${op}`, { ...extra, ...target(args) }).catch((error) => {
    const message = String((error as Error)?.message ?? error);
    throw /^no window/.test(message) ? new AkanNativeError("NOT_FOUND", message) : error;
  });
}

const op = (name: string) => (args: unknown, ctx: DesktopContext) => shell(ctx, name, args) as Promise<WindowState>;

function createOptions(args: unknown): Record<string, unknown> {
  const a = (args ?? {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  if (a.path !== undefined) {
    if (typeof a.path !== "string" || !a.path.startsWith("/") || a.path.startsWith("//")) {
      throw new AkanNativeError("INVALID_ARGS", "path must be an app path like /settings");
    }
    out.path = a.path;
  }
  if (a.title !== undefined) {
    if (typeof a.title !== "string") throw new AkanNativeError("INVALID_ARGS", "title must be a string");
    out.title = a.title;
  }
  for (const [x, y] of [
    ["width", "height"],
    ["x", "y"],
  ] as const) {
    if (a[x] === undefined && a[y] === undefined) continue;
    out[x] = finite(a[x], x);
    out[y] = finite(a[y], y);
  }
  if (out.width !== undefined && ((out.width as number) < 1 || (out.height as number) < 1)) {
    throw new AkanNativeError("INVALID_ARGS", "width and height must be positive");
  }
  return out;
}

export default defineDesktopPlugin<WindowApi, WindowEvents>({
  id: "window",
  setup(ctx) {
    ctx.onCloseRequested(({ window }) => closeVeto.ask({}, { window }));
  },
  methods: {
    getState: op("getState"),
    setTitle: (args, ctx) => {
      if (typeof args?.title !== "string") throw new AkanNativeError("INVALID_ARGS", "title must be a string");
      return shell(ctx, "setTitle", args, { title: args.title }) as Promise<WindowState>;
    },
    setSize: (args, ctx) => {
      const width = finite(args?.width, "width");
      const height = finite(args?.height, "height");
      if (width < 1 || height < 1) throw new AkanNativeError("INVALID_ARGS", "width and height must be positive");
      return shell(ctx, "setSize", args, { width, height }) as Promise<WindowState>;
    },
    setPosition: (args, ctx) =>
      shell(ctx, "setPosition", args, { x: finite(args?.x, "x"), y: finite(args?.y, "y") }) as Promise<WindowState>,
    center: op("center"),
    minimize: op("minimize"),
    maximize: op("maximize"),
    unmaximize: op("unmaximize"),
    restore: op("restore"),
    setFullscreen: (args, ctx) =>
      shell(ctx, "setFullscreen", args, { value: bool(args?.value, "value") }) as Promise<WindowState>,
    setAlwaysOnTop: (args, ctx) =>
      shell(ctx, "setAlwaysOnTop", args, { value: bool(args?.value, "value") }) as Promise<WindowState>,
    show: op("show"),
    hide: op("hide"),
    focus: op("focus"),
    startDragging: async (args, ctx) => {
      await shell(ctx, "startDragging", args);
    },
    toggleMaximize: async (args, ctx) => {
      const state = (await shell(ctx, "getState", args)) as WindowState;
      return shell(ctx, state.maximized ? "unmaximize" : "maximize", args) as Promise<WindowState>;
    },
    close: async (args, ctx) => {
      const named = target(args).window;
      if (named !== undefined) await shell(ctx, "getState", args); // NOT_FOUND for a window that is gone
      const window = named ?? ctx.window ?? 1;
      // After this call is answered: destroyed, or the app quits / hides it if it is the last window.
      setTimeout(() => ctx.closeWindow(window), 50);
    },
    create: (args, ctx) => ctx.shell("window.create", createOptions(args)) as Promise<WindowInfo>,
    list: (_args, ctx) => ctx.shell("window.list") as Promise<WindowInfo[]>,
    answerCloseRequested: (args, ctx) => closeVeto.answer(args, ctx.window),
  },
  events: {
    // Window events go to that window's page only.
    resize: (emit, ctx) =>
      ctx.onNativeEvent("window", (e) => {
        if (e.event === "resized")
          emit({ width: e.width as number, height: e.height as number }, { window: (e.window as number) ?? 1 });
      }),
    move: (emit, ctx) =>
      ctx.onNativeEvent("window", (e) => {
        if (e.event === "moved") emit({ x: e.x as number, y: e.y as number }, { window: (e.window as number) ?? 1 });
      }),
    focus: (emit, ctx) =>
      ctx.onNativeEvent("window", (e) => {
        if (e.event === "focused") emit({ focused: e.value === true }, { window: (e.window as number) ?? 1 });
      }),
    closeRequested: (emit, ctx) => closeVeto.source(emit, ctx),
    // Every page that listens hears about windows coming and going.
    created: (emit, ctx) =>
      ctx.onNativeEvent("window", (e) => {
        if (e.event === "created") emit({ id: e.window as number });
      }),
    destroyed: (emit, ctx) =>
      ctx.onNativeEvent("window", (e) => {
        if (e.event === "destroyed") emit({ id: e.window as number });
      }),
    // D9: the shell reports file drags per window (lib.rs drag_drop_event); drops become FileRefs.
    dragDrop: (emit, ctx) =>
      ctx.onNativeEvent("dragDrop", (e) => {
        const data: DragDropEvent = { type: e.event as DragDropEvent["type"] };
        if (Array.isArray(e.paths)) data.paths = e.paths as string[];
        if (typeof e.x === "number" && typeof e.y === "number") data.position = { x: e.x, y: e.y };
        if (data.type === "drop") data.files = droppedFiles(ctx, data.paths ?? []);
        emit(data, { window: (e.window as number) ?? 1 });
      }),
  },
});
