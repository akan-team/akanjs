// Desktop.
// - macOS: SMAppService.mainApp in the native shell (native/desktop/src/autostart.rs).
// - Windows: the HKCU Run key in the native shell (native/desktop/src/win/autostart.rs), with the
//   same ops and answers; the value is named after the app id (`id` argument). Task Manager's and
//   Settings' Startup switch is StartupApproved, which the shell reports as "requiresApproval".
// - Linux: an XDG autostart entry, $XDG_CONFIG_HOME/autostart/<app id>.desktop, written here in
//   the Worker (Autostart spec: specifications.freedesktop.org/autostart-spec). Tauri's plugin
//   writes the same kind of entry through the auto-launch crate
//   (tauri-plugins-workspace/plugins/autostart/src/lib.rs), with $APPIMAGE for AppImages.
// The shells report errors as data ({ status, error }); this decides what they mean. The
// status afterwards counts, not the error: enable() of an enabled app gets
// kSMErrorAlreadyRegistered, and disable() of an app that never registered (status notFound) gets
// SMAppServiceErrorDomain 1 "Operation not permitted" on macOS 26 (SMAppService.h documents
// kSMErrorJobNotFound). Tauri treats the Windows "not found" on disable the same way
// (tauri-plugins-workspace/plugins/autostart/src/lib.rs:85-93).
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { AkanNativeError } from "../../../packages/core/src/index.ts";
import { type DesktopContext, defineDesktopPlugin } from "../../../packages/desktop/src/plugin.ts";
import type { AutostartApi, AutostartState, AutostartStatus } from "./index.ts";

export interface ShellError {
  reason: "alreadyRegistered" | "notRegistered" | "deniedByUser" | "invalidSignature" | "other";
  code: number;
  domain: string;
  message: string;
}

export interface ShellAnswer {
  status: AutostartStatus;
  error?: ShellError | null;
}

const state = (status: AutostartStatus): AutostartState => ({ enabled: status === "enabled", status });

/** Where the user switches login items on and off. */
const SETTINGS_PAGE: Partial<Record<NodeJS.Platform, string>> = {
  darwin: "System Settings › General › Login Items",
  win32: "Settings › Apps › Startup",
};

/** The error an enable/disable answer stands for, or null when the app is where it was asked to be. */
export function failure(
  op: "enable" | "disable",
  answer: ShellAnswer,
  platform: NodeJS.Platform = process.platform,
): AkanNativeError | null {
  const { status, error } = answer;
  const page = SETTINGS_PAGE[platform] ?? SETTINGS_PAGE.darwin!;
  if (op === "enable" && status === "requiresApproval") {
    return new AkanNativeError(
      "PERMISSION_DENIED",
      `the app is switched off in ${page}; openSettings() opens that page`,
    );
  }
  if (op === "enable" ? status === "enabled" : status === "notRegistered" || status === "notFound") return null;
  if (!error) return new AkanNativeError("INTERNAL", `${op} did not change the login item (status ${status})`);
  const detail = `${error.message} (${error.domain} ${error.code})`;
  switch (error.reason) {
    case "deniedByUser":
      return new AkanNativeError("PERMISSION_DENIED", `the user switched the app off in ${page}: ${detail}`);
    case "invalidSignature":
      return new AkanNativeError("INTERNAL", `macOS did not accept the app's code signature: ${detail}`);
    default:
      return new AkanNativeError("INTERNAL", `${op} failed: ${detail}`);
  }
}

// ───────────── Linux: XDG autostart ─────────────

type Env = Record<string, string | undefined>;

/** $XDG_CONFIG_HOME/autostart; the base directory must be absolute (XDG Base Directory spec). */
export function autostartDir(env: Env = process.env, home = homedir()): string {
  const config = env.XDG_CONFIG_HOME?.startsWith("/") ? env.XDG_CONFIG_HOME : join(home, ".config");
  return join(config, "autostart");
}

/**
 * The Exec= value that runs `path`: one quoted argument (Desktop Entry spec, "The Exec key").
 * Inside quotes `"`, `` ` ``, `$` and `\` take a backslash; then the string escaping of values
 * doubles every backslash, and a literal `%` is `%%` (field codes).
 */
export function desktopExec(path: string): string {
  const quoted = `"${path.replace(/["`$\\]/g, (c) => `\\${c}`)}"`;
  return quoted.replace(/\\/g, "\\\\").replace(/%/g, "%%");
}

/** Values of the Desktop Entry spec's string type: no line breaks. */
const oneLine = (value: string) => value.replace(/[\r\n]+/g, " ");

export function desktopEntry(name: string, exec: string): string {
  return [
    "[Desktop Entry]",
    "Type=Application",
    "Version=1.5",
    `Name=${oneLine(name)}`,
    `Exec=${desktopExec(exec)}`,
    "Terminal=false",
    "X-GNOME-Autostart-enabled=true",
    "",
  ].join("\n");
}

/**
 * The state an entry stands for. Hidden=true (the spec's "deleted") or
 * X-GNOME-Autostart-enabled=false (GNOME's startup settings) is an entry the user switched off.
 */
export function entryStatus(text: string | null): AutostartStatus {
  if (text === null) return "notRegistered";
  let group = "";
  const keys = new Map<string, string>();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith("[")) group = line;
    else if (group === "[Desktop Entry]" && line.includes("=") && !line.startsWith("#")) {
      const at = line.indexOf("=");
      keys.set(line.slice(0, at).trim(), line.slice(at + 1).trim());
    }
  }
  if (keys.get("Hidden") === "true" || keys.get("X-GNOME-Autostart-enabled") === "false") return "requiresApproval";
  return "enabled";
}

/** `executable`: the file the entry starts; an AppImage's mount point changes at every start, $APPIMAGE does not. */
export function linuxAutostart(
  dir: () => string = () => autostartDir(),
  executable: () => string = () => process.env.APPIMAGE || process.execPath,
) {
  const file = (ctx: DesktopContext) => join(dir(), `${ctx.app.id}.desktop`);
  const read = (ctx: DesktopContext) => (existsSync(file(ctx)) ? readFileSync(file(ctx), "utf8") : null);
  const answer = (status: AutostartStatus, error?: unknown): ShellAnswer => ({
    status,
    error: error
      ? { reason: "other", code: 0, domain: "filesystem", message: (error as Error).message ?? String(error) }
      : null,
  });
  return {
    status: (ctx: DesktopContext): ShellAnswer => ({ status: entryStatus(read(ctx)) }),
    // Linux has no approval system: enable() also switches an entry the user turned off back on.
    enable(ctx: DesktopContext): ShellAnswer {
      try {
        mkdirSync(dir(), { recursive: true });
        writeFileSync(`${file(ctx)}.tmp`, desktopEntry(ctx.app.name, executable()));
        renameSync(`${file(ctx)}.tmp`, file(ctx));
      } catch (error) {
        return answer(entryStatus(read(ctx)), error);
      }
      return answer(entryStatus(read(ctx)));
    },
    disable(ctx: DesktopContext): ShellAnswer {
      try {
        rmSync(file(ctx), { force: true });
      } catch (error) {
        return answer(entryStatus(read(ctx)), error);
      }
      return answer(entryStatus(read(ctx)));
    },
  };
}

type Backend = {
  status(ctx: DesktopContext): Promise<ShellAnswer>;
  change(op: "enable" | "disable", ctx: DesktopContext): Promise<ShellAnswer>;
};

/** The shell's autostart.* ops (macOS, Windows); `id` names the Windows Run value. */
const shellBackend: Backend = {
  status: async (ctx) => (await ctx.shell("autostart.status", { id: ctx.app.id })) as ShellAnswer,
  change: async (op, ctx) => (await ctx.shell(`autostart.${op}`, { id: ctx.app.id })) as ShellAnswer,
};

/** `platform` and `linux` are replaceable so tests can check every OS's path on any OS. */
export function createDesktopAutostart(platform: NodeJS.Platform = process.platform, linux = linuxAutostart()) {
  const backend: Backend =
    platform === "linux"
      ? {
          status: async (ctx) => linux.status(ctx),
          change: async (op, ctx) => (op === "enable" ? linux.enable(ctx) : linux.disable(ctx)),
        }
      : shellBackend;
  const change = async (op: "enable" | "disable", ctx: DesktopContext): Promise<AutostartState> => {
    const answer = await backend.change(op, ctx);
    const error = failure(op, answer, platform);
    if (error) throw error;
    return state(answer.status);
  };
  return defineDesktopPlugin<AutostartApi>({
    id: "autostart",
    methods: {
      enable: (_args, ctx) => change("enable", ctx),
      disable: (_args, ctx) => change("disable", ctx),
      isEnabled: async (_args, ctx) => state((await backend.status(ctx)).status),
      openSettings: async (_args, ctx) => {
        if (platform === "linux")
          throw new AkanNativeError("UNSUPPORTED", "Linux desktops have no common settings page for startup apps");
        await ctx.shell("autostart.openSettings");
      },
    },
  });
}

export default createDesktopAutostart();
