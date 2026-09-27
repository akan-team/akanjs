// Desktop, from the Bun Worker, through the shell: window.setTheme { theme: "light" | "dark" | null },
// `theme` in window.getState, and the native event { type: "window", event: "themeChanged", theme }.
// - macOS: NSApp.appearance, which only native code can set: TAO has Window::set_theme
//   (tao/src/platform_impl/macos/window.rs:1521, set_ns_theme → NSApp setAppearance:) and
//   Window::theme() (NSApp.effectiveAppearance), and emits WindowEvent::ThemeChanged on
//   AppleInterfaceThemeChangedNotification (tao/src/platform_impl/macos/window_delegate.rs:301).
// - Windows: TAO's app-wide theme (title bars) plus the WebView2 profile's preferred color scheme,
//   which prefers-color-scheme follows (native/desktop/src/win/appearance.rs).
// - Linux: GTK's settings, which WebKitGTK's prefers-color-scheme follows, and the desktop portal's
//   color-scheme for "system" (native/desktop/src/linux/appearance.rs).
// Without a shell answer (an akan-native runtime without these ops, or no window yet): get() answers from
// the stored setting or, on macOS, `defaults read -g AppleInterfaceStyle` (the system setting;
// "Dark" or missing); set() rejects UNSUPPORTED and no change events arrive.
// - The setting is stored in the app data folder and applied again at start (the "init" native
//   event: shell ops sent before the event loop runs are dropped).
// - TAO does not emit ThemeChanged for an appearance the app set (set_theme updates its state
//   directly), so set() reports the change itself; duplicates are filtered.
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AkanNativeError } from "../../../packages/core/src/index.ts";
import { type DesktopContext, defineDesktopPlugin, type NativeEvent } from "../../../packages/desktop/src/plugin.ts";
import type { AppearanceApi, AppearanceEvents, AppearanceState } from "./index.ts";
import { type AppearanceSetting, type ColorScheme, checkSetting } from "./setting.ts";

export type Runner = (argv: string[]) => Promise<{ code: number; stdout: string }>;

const spawnRunner: Runner = async (argv) => {
  const proc = Bun.spawn(argv, { stdin: "ignore", stdout: "pipe", stderr: "ignore" });
  const [stdout, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
  return { code, stdout };
};

const SHELL_TIMEOUT_MS = 2000;

function isUnknownOp(error: unknown): boolean {
  return /unknown op/.test(String((error as Error)?.message ?? error));
}

/** A shell op with a timeout, so a missing native side can never hang a call. */
function shell(ctx: DesktopContext, op: string, args?: Record<string, unknown>): Promise<unknown> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new AkanNativeError("INTERNAL", `shell op ${op} did not answer`)),
      SHELL_TIMEOUT_MS,
    );
  });
  return Promise.race([ctx.shell(op, args), timeout]).finally(() => clearTimeout(timer));
}

/** `run` is replaceable so tests can check the commands and shell ops, `platform` to test the other OSes' fallback. */
export function createDesktopAppearance(run: Runner = spawnRunner, platform: NodeJS.Platform = process.platform) {
  let setting: AppearanceSetting = "system";
  let loadedFrom = "";
  let last: AppearanceState | null = null;
  let send: ((state: AppearanceState) => void) | null = null;

  const file = (ctx: DesktopContext) => join(ctx.appDataDir, "appearance.json");

  const load = (ctx: DesktopContext) => {
    const path = file(ctx);
    if (loadedFrom === path) return;
    loadedFrom = path;
    try {
      if (existsSync(path))
        setting = checkSetting((JSON.parse(readFileSync(path, "utf8")) as { setting?: unknown }).setting);
    } catch (error) {
      console.error(`[akan-native] ${path} is unreadable, following the system appearance`, error);
    }
  };

  const save = (ctx: DesktopContext) => {
    const path = file(ctx);
    writeFileSync(`${path}.tmp`, JSON.stringify({ setting }));
    renameSync(`${path}.tmp`, path);
  };

  const systemMode = async (): Promise<ColorScheme> => {
    if (platform !== "darwin") return "light"; // only without a window: the shell knows the rest
    const { code, stdout } = await run(["/usr/bin/defaults", "read", "-g", "AppleInterfaceStyle"]);
    return code === 0 && stdout.trim() === "Dark" ? "dark" : "light"; // the key is missing in light mode
  };

  const state = async (ctx: DesktopContext): Promise<AppearanceState> => {
    load(ctx);
    try {
      const theme = ((await shell(ctx, "window.getState")) as { theme?: unknown } | null)?.theme;
      if (theme === "light" || theme === "dark") return { mode: theme, setting };
    } catch {
      // no shell (tests) or no window yet
    }
    return { mode: setting === "system" ? await systemMode() : setting, setting };
  };

  const report = (next: AppearanceState) => {
    if (!send || (last && last.mode === next.mode && last.setting === next.setting)) return;
    last = next;
    send(next);
  };

  return defineDesktopPlugin<AppearanceApi, AppearanceEvents>({
    id: "appearance",
    setup(ctx) {
      ctx.onNativeEvent("init", () => {
        load(ctx);
        if (setting !== "system") shell(ctx, "window.setTheme", { theme: setting }).catch(() => {});
      });
      ctx.onNativeEvent("window", (event: NativeEvent) => {
        if (event.event !== "themeChanged" || (event.theme !== "light" && event.theme !== "dark")) return;
        report({ mode: event.theme, setting });
      });
    },
    methods: {
      get: (_args, ctx) => state(ctx),
      async set(args, ctx) {
        const next = checkSetting(args?.mode);
        load(ctx);
        try {
          await shell(ctx, "window.setTheme", { theme: next === "system" ? null : next });
        } catch (error) {
          if (isUnknownOp(error))
            throw new AkanNativeError(
              "UNSUPPORTED",
              "appearance.set needs the window.setTheme shell op, which this akan-native runtime lacks",
            );
          throw error;
        }
        setting = next;
        save(ctx);
        report(await state(ctx));
      },
    },
    events: {
      change(emit, ctx) {
        send = emit;
        last = null;
        void state(ctx).then((s) => {
          if (send === emit && !last) last = s; // the starting point, not a change
        });
        return () => {
          send = null;
          last = null;
        };
      },
    },
  });
}

export default createDesktopAppearance();
