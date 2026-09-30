// Process main thread of a desktop app: load the native library, start the plugin host
// Worker, then hand the main thread to the TAO event loop (docs/architecture.md §3.3).
//
// After akan_native_run no JavaScript runs on this thread again (not even worker.onerror), so every
// failure that can be reported must be reported before that call.

import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { renderInitScript } from "../../core/src/protocol.ts";
import { ABI_MAJOR, cstr, lastError, openNative, resolvePaths } from "./ffi.ts";
import { appLocalDataDir, webviewDataDir } from "./paths.ts";
import type { Launch, LaunchWindow } from "./plugin.ts";
import { READY_TIMEOUT } from "./server.ts";

const ENV_OVERRIDE_PREFIX = "AKAN_NATIVE_PUBLIC_";

/** How long the main thread waits for the launch phase: the plugins' setups, then the carried server. */
const LAUNCH_TIMEOUT = 10_000 + READY_TIMEOUT;

/**
 * env.runtime.json, overlaid with what the launch phase learned (the carried server's URL), then with
 * AKAN_NATIVE_PUBLIC_* process variables (ENV-1, highest precedence).
 */
export function runtimeEnv(
  file: Record<string, string>,
  launched: Record<string, string> = {},
  processEnv: Record<string, string | undefined> = process.env,
): Record<string, string> {
  const env = { ...file, ...launched };
  for (const [key, value] of Object.entries(processEnv)) {
    if (key.startsWith(ENV_OVERRIDE_PREFIX) && value !== undefined) env[key.slice("AKAN_NATIVE_".length)] = value;
  }
  return env;
}

interface ShellConfig {
  title: string;
  backgroundColor: string;
  backgroundColorDark: string;
  devtools: boolean;
  width?: number;
  height?: number;
  /** akan-native dev --hmr (dev builds): the dev gateway every page request outside /__akan_native/* goes to. */
  devServer?: string;
  /** With devServer: the main window's first page (akan-native dev --start), else "/". */
  startPath?: string;
  /** security.shell.externalSchemes (L0): schemes links may also hand to the OS. */
  externalSchemes?: string[];
  /** desktop.recovery: what a window does when its page's process ends. */
  recovery?: "errorPage" | "reload";
  /** desktop.screenCapture (Windows): "auto" answers getDisplayMedia with the first screen. */
  screenCapture?: "picker" | "auto";
  /** desktop.window: the main window from its first frame, unless the launch phase says otherwise. */
  fullscreen?: boolean;
  skipTaskbar?: boolean;
}

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** The launch phase's window bounds that akan_native_run understands (x and y only together). */
export function launchBounds(window: LaunchWindow): LaunchWindow {
  const out: LaunchWindow = {};
  if (finite(window.x) && finite(window.y)) Object.assign(out, { x: window.x, y: window.y });
  if (finite(window.width) && window.width >= 1) out.width = window.width;
  if (finite(window.height) && window.height >= 1) out.height = window.height;
  if (window.maximized === true) out.maximized = true;
  if (typeof window.fullscreen === "boolean") out.fullscreen = window.fullscreen;
  if (typeof window.skipTaskbar === "boolean") out.skipTaskbar = window.skipTaskbar;
  return out;
}

/**
 * Windows renames no folder that is some process's working folder: an app started from its install folder (the
 * installer, a shortcut, Explorer) would hand it to the webview's processes, and an update could never swap it
 * (plugins/updates). Called after the launch phase, where single-instance forwards a second launch's folder.
 */
export function leaveInstallFolder(appId: string, platform: NodeJS.Platform = process.platform): void {
  if (platform !== "win32" || !appId) return;
  try {
    const dir = appLocalDataDir(appId);
    mkdirSync(dir, { recursive: true });
    process.chdir(dir);
  } catch (error) {
    console.warn("[akan-native] cannot leave the install folder; an update may not apply", error);
  }
}

function fail(message: string, error?: unknown): never {
  console.error(`[akan-native] ${message}`, error ?? "");
  process.exit(1);
}

export async function startMain(workerUrl: string): Promise<never> {
  const paths = resolvePaths();
  let shell: ShellConfig;
  let boot: string;
  let fileEnv: Record<string, string>;
  let dev = false;
  let appId = "";
  try {
    shell = JSON.parse(readFileSync(join(paths.resources, "shell.json"), "utf8"));
    boot = readFileSync(join(paths.resources, "boot.json"), "utf8");
    fileEnv = JSON.parse(readFileSync(join(paths.resources, "env.runtime.json"), "utf8")) as Record<string, string>;
    const parsed = JSON.parse(boot) as { dev?: boolean; app?: { id?: string } };
    dev = parsed.dev === true;
    appId = parsed.app?.id ?? "";
  } catch (error) {
    fail(`cannot read app resources in ${paths.resources}`, error);
  }

  let lib: ReturnType<typeof openNative>;
  try {
    lib = openNative(paths.lib);
  } catch (error) {
    fail(`cannot load ${paths.lib}`, error);
  }
  // A library of another C ABI major version (a mismatched prebuilt one) is not used at all.
  const abi = lib.symbols.akan_native_abi();
  if (abi >>> 16 !== ABI_MAJOR)
    fail(`${paths.lib} speaks C ABI ${abi >>> 16}.${abi & 0xffff}; this app needs ${ABI_MAJOR}.x`);
  // Before the Worker exists: release builds drop the engines' debugging variables (akan_native_init).
  lib.symbols.akan_native_init(dev ? 1 : 0);
  if (!dev)
    for (const key of Object.keys(process.env))
      if (/^(WEBVIEW2_|WEBKIT_INSPECTOR|WEBKIT_DISABLE_SANDBOX)|^SSLKEYLOGFILE$/.test(key)) delete process.env[key];

  // A Worker's process.argv has no launch arguments unless they are passed (single-instance reads them).
  const worker = new Worker(workerUrl, { argv: process.argv.slice(2) } as WorkerOptions);
  // "ready" ends the plugins' launch phase (DesktopContext.launch): initial bounds, or exit.
  const launch = await new Promise<Launch>((resolve) => {
    const timer = setTimeout(() => fail(`plugin host did not start within ${LAUNCH_TIMEOUT / 1000} s`), LAUNCH_TIMEOUT);
    worker.addEventListener("error", (event) =>
      fail("plugin host failed to start", (event as ErrorEvent).message ?? event),
    );
    worker.addEventListener("message", (event) => {
      const data = (event as MessageEvent).data as { type?: string } & Partial<Launch>;
      if (data?.type === "ready") {
        clearTimeout(timer);
        resolve({ window: data.window ?? {}, exit: data.exit, env: data.env });
      }
    });
  });
  if (typeof launch.exit === "number") {
    worker.terminate();
    process.exit(launch.exit);
  }
  leaveInstallFolder(appId);
  const bounds = launchBounds(launch.window);
  let initJs: string;
  try {
    initJs = renderInitScript(boot.trim(), JSON.stringify(runtimeEnv(fileEnv, launch.env)));
  } catch (error) {
    fail(`cannot render the page's init script from ${paths.resources}`, error);
  }

  const config = {
    title: shell.title,
    width: shell.width ?? 1024,
    height: shell.height ?? 720,
    fullscreen: shell.fullscreen === true,
    skipTaskbar: shell.skipTaskbar === true,
    ...bounds,
    appDir: paths.appDir,
    initJs,
    devtools: shell.devtools,
    menu: true,
    backgroundColor: shell.backgroundColor,
    backgroundColorDark: shell.backgroundColorDark,
    externalSchemes: shell.externalSchemes ?? [],
    ...(shell.recovery ? { recovery: shell.recovery } : {}),
    ...(shell.screenCapture ? { screenCapture: shell.screenCapture } : {}),
    // Tests start the app without stealing focus from the user.
    activation: process.env.AKAN_NATIVE_ACTIVATION ?? "regular",
    // Only a dev build may load its pages from elsewhere.
    ...(dev && shell.devServer ? { devServer: shell.devServer } : {}),
    ...(dev && shell.devServer && shell.startPath ? { startPath: shell.startPath } : {}),
    // Windows and Linux: the webview's storage (paths.ts) and the window icon (CLI icons.ts windowIcon).
    ...(appId && webviewDataDir(appId) ? { dataDir: webviewDataDir(appId) } : {}),
    ...(existsSync(join(paths.resources, "icon.rgba")) ? { icon: join(paths.resources, "icon.rgba") } : {}),
    // Linux: the desktop entry the dock plugin's launcher badge names (<app id>.desktop).
    ...(appId ? { appId } : {}),
  };
  const code = lib.symbols.akan_native_run(cstr(JSON.stringify(config)));
  // akan_native_run only returns on failure: -1 not the main thread, -2 bad config, -3 window, -4 webview.
  // -5: no webview engine on this system (lib.rs); the last error says how to get one.
  fail(`${code === -5 ? "cannot start: " : `akan_native_run failed with ${code}: `}${lastError(lib)}`);
}
