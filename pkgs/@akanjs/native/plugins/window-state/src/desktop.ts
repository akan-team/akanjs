// Desktop: saved in the app data folder, restored through the launch phase so the window is
// created at the saved bounds (it stays hidden until the first page load, D2).
import { readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type DesktopContext, defineDesktopPlugin, type NativeEvent } from "../../../packages/desktop/src/plugin.ts";
import type { SavedWindowState, WindowStateApi } from "./index.ts";
import { createTracker, parseSaved, serialize, type Tracker, type WindowSnapshot } from "./state.ts";

export const STATE_FILE = "window-state.json";

function readText(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

/** Write to a temporary file and rename: a crash mid-write never leaves half a file. */
function writeAtomic(path: string, text: string): void {
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, path);
}

export function createDesktopWindowState(options: { delay?: number } = {}) {
  let tracker: Tracker | null = null;
  let file = "";

  const start = (ctx: DesktopContext) => {
    file = join(ctx.appDataDir, STATE_FILE);
    const initial = parseSaved(readText(file));
    if (initial) ctx.launch.setWindow(initial);
    const t = createTracker({
      initial,
      delay: options.delay,
      // Window 1 only (the window the app opens); windows from createWindow are the app's business.
      read: () => ctx.shell("window.getState", { window: 1 }) as Promise<WindowSnapshot>,
      write: (state) => writeAtomic(file, serialize(state)),
    });
    tracker = t;
    const main = (e: NativeEvent) => e.window === undefined || e.window === 1;
    ctx.onNativeEvent("window", (e) => {
      if ((e.event === "moved" || e.event === "resized") && main(e)) t.changed();
    });
    // The first visible frame: a baseline, so maximizing right away still leaves normal bounds.
    ctx.onNativeEvent("pageLoad", (e) => {
      if (e.event === "finished" && main(e)) t.changed();
    });
    ctx.onQuit(() => t.flush().then(() => {}));
  };

  const need = (): Tracker => {
    if (!tracker) throw new Error("window-state is not set up");
    return tracker;
  };
  const result = (state: SavedWindowState | null) => ({ state: state && { ...state } });

  return defineDesktopPlugin<WindowStateApi>({
    id: "window-state",
    setup: start,
    methods: {
      getSaved: () => result(need().saved),
      save: async () => result(await need().flush()),
      clear: () => {
        need().clear();
        rmSync(file, { force: true });
      },
    },
  });
}

export default createDesktopWindowState();
