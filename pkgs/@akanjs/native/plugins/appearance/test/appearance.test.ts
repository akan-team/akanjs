import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pluginDecls } from "../../../packages/cli/src/lib/native-plugins.ts";
import { isAkanNativeError } from "../../../packages/core/src/index.ts";
import { installMockHost, type MockHost } from "../../../packages/core/src/testing.ts";
import { createDispatcher } from "../../../packages/desktop/src/dispatcher.ts";
import type { NativeEvent } from "../../../packages/desktop/src/plugin.ts";
import manifest from "../native-plugin.json";
import { createDesktopAppearance, type Runner } from "../src/desktop.ts";
import { type AppearanceState, appearance, checkSetting } from "../src/index.ts";

const g = globalThis as { matchMedia?: unknown };
let host: MockHost | null = null;

afterEach(() => {
  host?.uninstall();
  host = null;
  delete g.matchMedia;
});

const rejection = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: unknown) => e,
  );
const tick = () => new Promise((r) => setTimeout(r, 1));

describe("appearance arguments", () => {
  test("light, dark and system only", () => {
    expect(checkSetting("dark")).toBe("dark");
    for (const bad of ["Dark", "auto", "", 1, null, undefined]) {
      try {
        checkSetting(bad);
        throw new Error(`accepted ${bad}`);
      } catch (e) {
        expect(isAkanNativeError(e, "INVALID_ARGS")).toBe(true);
      }
    }
  });

  test("manifest: every platform implements get, set and change", () => {
    const plugin = { spec: "appearance", dir: `${import.meta.dir}/..`, manifest: manifest as never };
    for (const platform of ["ios", "android", "macos"] as const) {
      expect(pluginDecls([plugin], platform)).toEqual({ appearance: { methods: ["get", "set"], events: ["change"] } });
    }
  });
});

describe("appearance routing", () => {
  test("native hosts get { mode } and push change events", async () => {
    let state: AppearanceState = { mode: "light", setting: "system" };
    host = installMockHost({
      platform: "ios",
      plugins: {
        appearance: {
          methods: {
            get: () => state,
            set: ({ mode }: { mode: "dark" }) => {
              state = { mode, setting: mode };
            },
          },
          events: ["change"],
        },
      },
    });
    const seen: AppearanceState[] = [];
    const stop = appearance.listen("change", (s) => seen.push(s));
    await tick();
    await appearance.set({ mode: "dark" });
    expect(host.requests.at(-1)).toMatchObject({ method: "set", args: { mode: "dark" } });
    host.emit("appearance", "change", state);
    expect(await appearance.get()).toEqual({ mode: "dark", setting: "dark" });
    expect(seen).toEqual([{ mode: "dark", setting: "dark" }]);
    stop();
  });
});

describe("appearance web implementation", () => {
  function fakeMedia(dark: boolean) {
    const list = Object.assign(new EventTarget(), { matches: dark, media: "(prefers-color-scheme: dark)" });
    g.matchMedia = (query: string) => {
      expect(query).toBe("(prefers-color-scheme: dark)");
      return list;
    };
    return {
      flip(next: boolean) {
        list.matches = next;
        list.dispatchEvent(new Event("change"));
      },
    };
  }

  test("get and change follow prefers-color-scheme; set is UNSUPPORTED", async () => {
    host = installMockHost({ platform: "web" });
    const media = fakeMedia(true);
    expect(await appearance.get()).toEqual({ mode: "dark", setting: "system" });
    const seen: AppearanceState[] = [];
    const stop = appearance.listen("change", (s) => seen.push(s));
    media.flip(false);
    stop();
    await tick();
    media.flip(true); // no listener any more
    expect(seen).toEqual([{ mode: "light", setting: "system" }]);
    expect(appearance.isSupported("set")).toBe(false);
    expect(isAkanNativeError(await rejection(appearance.set({ mode: "dark" })), "UNSUPPORTED")).toBe(true);
  });

  test("no matchMedia: light", async () => {
    host = installMockHost({ platform: "web" });
    expect(await appearance.get()).toEqual({ mode: "light", setting: "system" });
  });
});

describe("appearance desktop implementation", () => {
  const mac = process.platform === "darwin";

  function harness(
    options: { shellOps?: boolean; systemDark?: boolean; dir?: string; platform?: NodeJS.Platform } = {},
  ) {
    const dir = options.dir ?? join(mkdtempSync(join(tmpdir(), "akan-native-appearance-")), "data");
    const ops: unknown[] = [];
    const commands: string[][] = [];
    const emitted: unknown[] = [];
    const listeners = new Map<string, (e: NativeEvent) => void>();
    let theme: "light" | "dark" = options.systemDark ? "dark" : "light";
    const run: Runner = async (argv) => {
      commands.push(argv);
      return options.systemDark ? { code: 0, stdout: "Dark\n" } : { code: 1, stdout: "" };
    };
    const dispatcher = createDispatcher([createDesktopAppearance(run, options.platform)], {
      app: { id: "dev.test", name: "Test", version: "1.0.0", build: 1 },
      appDataDir: dir,
      emit: (_window, { plugin, event, data }) => emitted.push({ plugin, event, data }),
      registerFile: () => ({ url: "", mime: "", size: 0 }),
      onNativeEvent: (type, listener) => {
        listeners.set(type, listener);
        return () => {};
      },
      async shell(op, args) {
        ops.push({ op, ...args });
        if (op === "window.getState") return options.shellOps ? { width: 1, theme } : { width: 1 };
        if (op === "window.setTheme" && options.shellOps) {
          const requested = (args as { theme: "light" | "dark" | null }).theme;
          theme = requested ?? (options.systemDark ? "dark" : "light");
          return { width: 1, theme };
        }
        throw new Error(`unknown op ${op}`);
      },
    });
    const call = async (method: string, args?: unknown) => {
      const res = await dispatcher.handle(JSON.stringify({ v: 1, id: 1, plugin: "appearance", method, args }));
      return res;
    };
    return {
      dir,
      ops,
      commands,
      emitted,
      listeners,
      call,
      native: (type: string, e: object) => listeners.get(type)?.({ type, ...e }),
    };
  }

  test.skipIf(!mac)("today's shell: get reads the system setting, set is UNSUPPORTED", async () => {
    const h = harness({ systemDark: true });
    expect(await h.call("get")).toMatchObject({ ok: true, result: { mode: "dark", setting: "system" } });
    expect(h.commands).toEqual([["/usr/bin/defaults", "read", "-g", "AppleInterfaceStyle"]]);
    expect(await h.call("set", { mode: "light" })).toMatchObject({ ok: false, error: { code: "UNSUPPORTED" } });
    expect(await h.call("set", { mode: "sepia" })).toMatchObject({ ok: false, error: { code: "INVALID_ARGS" } });
  });

  test.skipIf(!mac)(
    "with the shell ops: set applies, stores, reports; the stored setting returns at the next start",
    async () => {
      const h = harness({ shellOps: true });
      await h.call("$listen", { event: "change" });
      await tick();
      expect(await h.call("set", { mode: "dark" })).toMatchObject({ ok: true });
      expect(h.ops).toContainEqual({ op: "window.setTheme", theme: "dark", window: 1 }); // the calling window (SH-6)
      expect(JSON.parse(readFileSync(join(h.dir, "appearance.json"), "utf8"))).toEqual({ setting: "dark" });
      expect(await h.call("get")).toMatchObject({ result: { mode: "dark", setting: "dark" } });
      // TAO's ThemeChanged for the same state is a duplicate
      h.native("window", { event: "themeChanged", theme: "dark" });
      expect(h.emitted).toEqual([{ plugin: "appearance", event: "change", data: { mode: "dark", setting: "dark" } }]);

      const next = harness({ shellOps: true, dir: h.dir });
      next.native("init", {});
      await tick();
      expect(next.ops).toContainEqual({ op: "window.setTheme", theme: "dark" });

      expect(await h.call("set", { mode: "system" })).toMatchObject({ ok: true });
      expect(h.ops).toContainEqual({ op: "window.setTheme", theme: null, window: 1 });
      expect(h.emitted.at(-1)).toEqual({
        plugin: "appearance",
        event: "change",
        data: { mode: "light", setting: "system" },
      });
      // A system switch while following the system
      h.native("window", { event: "themeChanged", theme: "dark" });
      expect(h.emitted.at(-1)).toEqual({
        plugin: "appearance",
        event: "change",
        data: { mode: "dark", setting: "system" },
      });
      expect(h.emitted).toHaveLength(3);
    },
  );

  test("Windows and Linux: the shell answers; without it light, and no macOS commands", async () => {
    const bare = harness({ platform: "linux" });
    expect(await bare.call("get")).toMatchObject({ ok: true, result: { mode: "light", setting: "system" } });
    expect(bare.commands).toEqual([]);
    const h = harness({ platform: "win32", shellOps: true, systemDark: true });
    expect(await h.call("get")).toMatchObject({ result: { mode: "dark", setting: "system" } });
    expect(await h.call("set", { mode: "light" })).toMatchObject({ ok: true });
    expect(h.ops).toContainEqual({ op: "window.setTheme", theme: "light", window: 1 });
    expect(await h.call("get")).toMatchObject({ result: { mode: "light", setting: "light" } });
    expect(h.commands).toEqual([]);
  });

  // Real read of the Mac's setting: no UI, nothing changes.
  test.skipIf(!mac)("the real defaults read answers light or dark", async () => {
    const plugin = createDesktopAppearance();
    const ctx = {
      appDataDir: mkdtempSync(join(tmpdir(), "akan-native-appearance-")),
      shell: () => Promise.reject(new Error("no shell")),
    } as never;
    const state = await plugin.methods.get!(undefined, ctx);
    expect(["light", "dark"]).toContain(state.mode);
    expect(state.setting).toBe("system");
  });
});
