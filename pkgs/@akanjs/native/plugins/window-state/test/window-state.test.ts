import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pluginDecls } from "../../../packages/cli/src/lib/native-plugins.ts";
import type { DesktopContext, NativeEvent } from "../../../packages/desktop/src/plugin.ts";
import manifest from "../native-plugin.json";
import { createDesktopWindowState, STATE_FILE } from "../src/desktop.ts";
import type { SavedWindowState } from "../src/index.ts";
import { createTracker, nextState, parseSaved, serialize, type WindowSnapshot } from "../src/state.ts";

const normal: WindowSnapshot = {
  x: 10,
  y: 20,
  width: 800,
  height: 600,
  maximized: false,
  minimized: false,
  fullscreen: false,
  visible: true,
};
const saved: SavedWindowState = { x: 10, y: 20, width: 800, height: 600, maximized: false };

describe("window-state file and rules", () => {
  test("round trip; corrupt, foreign or absurd files read as nothing", () => {
    expect(parseSaved(serialize(saved))).toEqual(saved);
    expect(parseSaved(serialize({ ...saved, x: -1440, maximized: true }))).toEqual({
      ...saved,
      x: -1440,
      maximized: true,
    });
    for (const text of [
      null,
      "",
      "{",
      "[]",
      "null",
      '{"x":1}',
      JSON.stringify({ ...saved }),
      JSON.stringify({ format: 2, ...saved }),
    ]) {
      expect(parseSaved(text)).toBeNull();
    }
    for (const bad of [{ width: 0 }, { height: -5 }, { x: "1" }, { y: 1e9 }, { width: Number.NaN }, { maximized: 1 }]) {
      expect(parseSaved(JSON.stringify({ format: 1, ...saved, ...bad }))).toBeNull();
    }
  });

  test("normal bounds are saved; maximized only flips the flag; minimized, hidden and full screen change nothing", () => {
    expect(nextState(null, normal)).toEqual(saved);
    const moved = nextState(saved, { ...normal, x: 300 })!;
    expect(moved).toEqual({ ...saved, x: 300 });
    expect(nextState(moved, { ...normal, x: 0, y: 25, width: 1440, height: 875, maximized: true })).toEqual({
      ...moved,
      maximized: true,
    });
    expect(nextState(moved, { ...normal, minimized: true, x: -32000 })).toBe(moved);
    expect(nextState(moved, { ...normal, visible: false })).toBe(moved);
    expect(nextState(moved, { ...normal, fullscreen: true, width: 1440 })).toBe(moved);
    expect(nextState(moved, { ...normal, width: 0 })).toBe(moved);
    // Maximized before anything else was seen: keep the maximized bounds rather than nothing.
    expect(nextState(null, { ...normal, maximized: true })).toEqual({ ...saved, maximized: true });
  });

  test("tracker debounces bursts, writes only changes, flush captures right away", async () => {
    let snap = normal;
    let reads = 0;
    const writes: SavedWindowState[] = [];
    const tracker = createTracker({
      initial: saved,
      delay: 20,
      read: async () => (reads++, snap),
      write: (s) => writes.push(s),
    });
    for (let i = 0; i < 5; i++) tracker.changed();
    await Bun.sleep(50);
    expect(reads).toBe(1);
    expect(writes).toEqual([]); // unchanged: nothing written
    snap = { ...normal, width: 900 };
    tracker.changed();
    await Bun.sleep(50);
    expect(writes).toEqual([{ ...saved, width: 900 }]);
    snap = { ...snap, maximized: true, width: 1440 };
    expect(await tracker.flush()).toEqual({ ...saved, width: 900, maximized: true });
    expect(writes).toHaveLength(2);
    tracker.clear();
    expect(tracker.saved).toBeNull();
    tracker.stop();
  });

  test("a read that fails (window gone while quitting) keeps the saved state", async () => {
    const tracker = createTracker({ initial: saved, read: () => Promise.reject(new Error("gone")), write: () => {} });
    expect(await tracker.flush()).toEqual(saved);
  });

  test("desktop only", () => {
    const plugin = { spec: "window-state", dir: `${import.meta.dir}/..`, manifest: manifest as never };
    expect(pluginDecls([plugin], "ios")).toEqual({});
    expect(pluginDecls([plugin], "android")).toEqual({});
    expect(pluginDecls([plugin], "macos")).toEqual({
      "window-state": { methods: ["getSaved", "save", "clear"], events: [] },
    });
  });
});

describe("window-state desktop plugin", () => {
  let dir = "";
  afterEach(() => {
    //? Only a folder a test made: Bun on Windows reads rmSync("") as the working folder, this package.
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = "";
  });

  function fakeContext(state: () => WindowSnapshot) {
    dir = mkdtempSync(join(tmpdir(), "akan-native-ws-"));
    const listeners = new Map<string, ((e: NativeEvent) => void)[]>();
    const launch: Partial<SavedWindowState>[] = [];
    const quitHooks: (() => void | Promise<void>)[] = [];
    const ctx = {
      app: { id: "com.akanjs.test", name: "Test", version: "1.0.0" },
      appDataDir: dir,
      shell: async (op: string) => {
        if (op !== "window.getState") throw new Error(op);
        return state();
      },
      onNativeEvent: (type: string, listener: (e: NativeEvent) => void) => {
        listeners.set(type, [...(listeners.get(type) ?? []), listener]);
        return () => {};
      },
      launch: { setWindow: (b: Partial<SavedWindowState>) => void launch.push(b), exit() {} },
      onQuit: (fn: () => void | Promise<void>) => (quitHooks.push(fn), () => {}),
    } as unknown as DesktopContext;
    const fire = (type: string, event: Record<string, unknown>) => {
      for (const l of listeners.get(type) ?? []) l({ type, ...event });
    };
    return { ctx, launch, quitHooks, fire };
  }

  test("restores in the launch phase, saves after moves and on quit, clear forgets", async () => {
    let snap = normal;
    const { ctx, launch, quitHooks, fire } = fakeContext(() => snap);
    const file = join(dir, STATE_FILE);
    writeFileSync(file, serialize({ ...saved, maximized: true }));
    const plugin = createDesktopWindowState({ delay: 10 });
    await plugin.setup!(ctx);
    expect(launch).toEqual([{ ...saved, maximized: true }]);

    snap = { ...normal, x: 50 };
    fire("window", { event: "moved", x: 50, y: 20 });
    await Bun.sleep(40);
    expect(parseSaved(readFileSync(file, "utf8"))).toEqual({ ...saved, x: 50 });
    expect(await plugin.methods.getSaved!(undefined, ctx)).toEqual({ state: { ...saved, x: 50 } });

    snap = { ...normal, x: 70, height: 700 };
    await Promise.all(quitHooks.map((q) => q()));
    expect(parseSaved(readFileSync(file, "utf8"))).toEqual({ ...saved, x: 70, height: 700 });

    await plugin.methods.clear!(undefined, ctx);
    expect(existsSync(file)).toBe(false);
    expect(await plugin.methods.getSaved!(undefined, ctx)).toEqual({ state: null });
    expect(await plugin.methods.save!(undefined, ctx)).toEqual({ state: { ...saved, x: 70, height: 700 } });
    expect(existsSync(file)).toBe(true);
  });

  test("nothing saved: the configured size is kept; a corrupt file is ignored", async () => {
    const { ctx, launch } = fakeContext(() => normal);
    writeFileSync(join(dir, STATE_FILE), "{ not json");
    await createDesktopWindowState().setup!(ctx);
    expect(launch).toEqual([]);
  });
});
