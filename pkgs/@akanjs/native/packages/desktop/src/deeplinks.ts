// Deep links on Windows and Linux (plugins.md D6). macOS knows the app's schemes from Info.plist
// and hands links to the running app (TAO Event::Opened). Windows and Linux start the executable
// with the link as its argument instead:
// - The schemes are registered for the current user at every start, so they follow the executable
//   (the Windows uninstaller removes those still opening it): Windows HKCU\Software\Classes\<scheme>
//   with shell\open\command `"<exe>" "%1"`,
//   Linux a hidden <app id>.desktop in $XDG_DATA_HOME/applications with x-scheme-handler MIME
//   types, made the default in $XDG_CONFIG_HOME/mimeapps.list. As tauri-plugins-workspace
//   deep-link's register() does (plugins/deep-link/src/lib.rs), without xdg-mime.
// - A cold start's link is in process.argv; a link while the app runs starts a second process,
//   which single-instance hands over (DesktopContext.openUrls). Only a single argument that is a
//   URL of one of the app's schemes counts as a link (the same rule as deep-link's
//   handle_cli_arguments): other command lines stay command lines.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

type Env = Record<string, string | undefined>;
type Runner = (argv: string[]) => Promise<{ code: number; stdout: string }>;

const run: Runner = async (argv) => {
  const proc = Bun.spawn(argv, { stdin: "ignore", stdout: "pipe", stderr: "ignore" });
  const [stdout, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
  return { code, stdout };
};

/** The links in a launch's arguments (without the executable): one argument, of an app scheme. */
export function linkArguments(args: readonly string[], schemes: readonly string[]): string[] {
  if (args.length !== 1) return [];
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(args[0]!)?.[1]?.toLowerCase();
  return scheme && schemes.includes(scheme) ? [args[0]!] : [];
}

/** Exec= of a desktop entry: the path quoted, with the characters the spec reserves escaped. */
export function desktopExec(exe: string): string {
  return `"${exe.replace(/[\\"`$]/g, (c) => `\\${c}`)}" %u`;
}

export function desktopEntry(name: string, exe: string, schemes: readonly string[]): string {
  return [
    "[Desktop Entry]",
    "Type=Application",
    `Name=${name.replace(/[\r\n]/g, " ")}`,
    `Exec=${desktopExec(exe)}`,
    "Terminal=false",
    // A link handler, not a launcher entry: the app's package (CLI-9) brings the visible one.
    "NoDisplay=true",
    `MimeType=${schemes.map((s) => `x-scheme-handler/${s};`).join("")}`,
    "",
  ].join("\n");
}

/** mimeapps.list with `x-scheme-handler/<scheme>=<desktop file>` set in [Default Applications]. */
export function withDefaults(list: string, desktopFile: string, schemes: readonly string[]): string {
  const lines = list.split("\n");
  if (lines.at(-1) === "") lines.pop();
  let start = lines.findIndex((l) => l.trim() === "[Default Applications]");
  if (start < 0) {
    if (lines.length) lines.push("");
    lines.push("[Default Applications]");
    start = lines.length - 1;
  }
  let end = lines.findIndex((l, i) => i > start && l.trim().startsWith("["));
  if (end < 0) end = lines.length;
  for (const scheme of schemes) {
    const key = `x-scheme-handler/${scheme}`;
    const at = lines.findIndex((l, i) => i > start && i < end && l.split("=")[0]!.trim() === key);
    if (at >= 0) lines[at] = `${key}=${desktopFile};`;
    else lines.splice(end++, 0, `${key}=${desktopFile};`);
  }
  return `${lines.join("\n")}\n`;
}

const xdg = (value: string | undefined, fallback: string) => (value?.startsWith("/") ? value : fallback);

function writeIfChanged(path: string, text: string): boolean {
  if (existsSync(path) && readFileSync(path, "utf8") === text) return false;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
  return true;
}

async function registerLinux(
  app: { id: string; name: string },
  exe: string,
  schemes: readonly string[],
  env: Env,
  home: string,
  runner: Runner,
): Promise<void> {
  const file = `${app.id}.desktop`;
  const applications = join(xdg(env.XDG_DATA_HOME, join(home, ".local", "share")), "applications");
  const entryChanged = writeIfChanged(join(applications, file), desktopEntry(app.name, exe, schemes));
  const listPath = join(xdg(env.XDG_CONFIG_HOME, join(home, ".config")), "mimeapps.list");
  const list = existsSync(listPath) ? readFileSync(listPath, "utf8") : "";
  writeIfChanged(listPath, withDefaults(list, file, schemes));
  // The MIME cache of that folder (desktop-file-utils); the defaults above work without it.
  if (entryChanged) await runner(["update-desktop-database", applications]).catch(() => undefined);
}

/** The value of a registry key's default (or named) value, or null. */
async function regValue(runner: Runner, key: string, name: string | null): Promise<string | null> {
  const { code, stdout } = await runner(["reg.exe", "query", key, ...(name === null ? ["/ve"] : ["/v", name])]);
  if (code !== 0) return null;
  // "    (Default)    REG_SZ    value" or "    URL Protocol    REG_SZ    "
  const line = stdout.split(/\r?\n/).find((l) => /\sREG_SZ(\s|$)/.test(l));
  return line ? line.replace(/^.*?\sREG_SZ\s{0,4}/, "") : null;
}

async function registerWindows(
  app: { id: string; name: string },
  exe: string,
  schemes: readonly string[],
  runner: Runner,
): Promise<void> {
  const command = `"${exe}" "%1"`;
  for (const scheme of schemes) {
    const key = `HKCU\\Software\\Classes\\${scheme}`;
    if ((await regValue(runner, `${key}\\shell\\open\\command`, null)) === command) continue;
    const values: [string, string | null, string][] = [
      [key, null, `URL:${app.name}`],
      [key, "URL Protocol", ""],
      [`${key}\\DefaultIcon`, null, `${exe},0`],
      [`${key}\\shell\\open\\command`, null, command],
    ];
    for (const [k, name, data] of values) {
      await runner([
        "reg.exe",
        "add",
        k,
        ...(name === null ? ["/ve"] : ["/v", name]),
        "/t",
        "REG_SZ",
        "/d",
        data,
        "/f",
      ]);
    }
  }
}

/** Makes this executable the current user's handler of the app's schemes (Windows, Linux). */
export async function registerDeepLinks(
  app: { id: string; name: string },
  schemes: readonly string[],
  options: { exe?: string; platform?: NodeJS.Platform; env?: Env; home?: string; run?: Runner } = {},
): Promise<void> {
  const platform = options.platform ?? process.platform;
  if (!schemes.length || (platform !== "win32" && platform !== "linux")) return;
  const exe = options.exe ?? process.execPath;
  const runner = options.run ?? run;
  if (platform === "win32") await registerWindows(app, exe, schemes, runner);
  else await registerLinux(app, exe, schemes, options.env ?? process.env, options.home ?? homedir(), runner);
}
