// Per-user app folders of a desktop app, the same places as Tauri's path resolver
// (tauri/crates/tauri/src/path/desktop.rs: app_data_dir, app_local_data_dir).

import { homedir } from "node:os";
import { join } from "node:path";

type Env = Record<string, string | undefined>;

/** XDG base directories must be absolute; anything else is ignored (XDG Base Directory spec). */
const xdg = (value: string | undefined, fallback: string) => (value?.startsWith("/") ? value : fallback);

/**
 * Settings and state the app keeps (preferences, window state, files):
 *   macOS    ~/Library/Application Support/<id>
 *   Windows  %APPDATA%\<id>          (Roaming: follows the user between PCs)
 *   Linux    $XDG_DATA_HOME/<id>     (~/.local/share/<id>)
 */
export function appDataDir(
  id: string,
  platform: NodeJS.Platform = process.platform,
  env: Env = process.env,
  home = homedir(),
): string {
  if (platform === "darwin") return join(home, "Library", "Application Support", id);
  if (platform === "win32") return join(env.APPDATA || join(home, "AppData", "Roaming"), id);
  return join(xdg(env.XDG_DATA_HOME, join(home, ".local", "share")), id);
}

/**
 * What is large and belongs to this PC: the webview's storage, the carried server's databases and logs.
 *   Windows  %LOCALAPPDATA%\<id>    (never Roaming, which follows the user and may be a network share)
 *   macOS, Linux  appDataDir
 */
export function appLocalDataDir(
  id: string,
  platform: NodeJS.Platform = process.platform,
  env: Env = process.env,
  home = homedir(),
): string {
  if (platform === "win32") return join(env.LOCALAPPDATA || join(home, "AppData", "Local"), id);
  return appDataDir(id, platform, env, home);
}

/**
 * The webview's own storage and caches (Windows, Linux; WKWebView chooses its own on macOS):
 *   Windows  %LOCALAPPDATA%\<id>\WebView2
 *   Linux    $XDG_DATA_HOME/<id>/webview
 * WebView2's default would be next to the .exe, which is not writable once installed.
 */
export function webviewDataDir(
  id: string,
  platform: NodeJS.Platform = process.platform,
  env: Env = process.env,
  home = homedir(),
): string | undefined {
  if (platform === "win32") return join(appLocalDataDir(id, platform, env, home), "WebView2");
  if (platform === "linux") return join(appDataDir(id, platform, env, home), "webview");
  return undefined;
}

/**
 * The carried server's folder (server.ts): <app local data>/server. A debug build has the release app's id, so
 * its server keeps its own folder and never opens the databases of the release app on the same PC.
 */
export function serverDataDir(
  id: string,
  dev: boolean,
  platform: NodeJS.Platform = process.platform,
  env: Env = process.env,
  home = homedir(),
): string {
  return join(appLocalDataDir(id, platform, env, home), dev ? "server-debug" : "server");
}

/**
 * Folders whose files no FileRef may serve (L4): the shell's and the plugins' own storage
 * (preferences, secure storage, databases, update bundles, window state, the webview's data, the server's). Only
 * the filesystem plugin's `data` base (<app data>/files) is servable inside the app data folder.
 */
export function reservedDirs(
  id: string,
  platform: NodeJS.Platform = process.platform,
  env: Env = process.env,
  home = homedir(),
): { root: string; except: string[] }[] {
  const data = appDataDir(id, platform, env, home);
  const local = appLocalDataDir(id, platform, env, home);
  const webview = webviewDataDir(id, platform, env, home);
  return [
    { root: data, except: [join(data, "files")] },
    ...(local !== data ? [{ root: local, except: [] }] : []),
    ...(webview ? [{ root: webview, except: [] }] : []),
  ];
}
