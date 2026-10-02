// akan-native build windows: a folder with the Bun runtime, the TAO/WRY DLL and the web app
// (docs/architecture.md §3.3, §8), and with --installer an NSIS setup program (windows-installer.ts).
//
//   <Name>/
//     <exe>.exe          bun build --compile (main + plugin host Worker), with icon and version info
//     akan_native_desktop.dll   native/desktop (Rust cdylib, C runtime linked in)
//     resources/         platforms/desktop.ts, plus icon.rgba (the window icon)

import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ParsedArgs } from "../lib/args.ts";
import { ico, iconArt, windowIcon } from "../lib/icons.ts";
import type { Launched, LaunchOptions } from "../lib/launch.ts";
import { log } from "../lib/log.ts";
import type { BuildContext } from "../lib/prepare.ts";
import { peFiles, signWindowsFiles } from "../lib/windowssigning.ts";
import {
  buildNativeLibrary,
  compileExecutable,
  launchExecutable,
  NATIVE_LIB,
  requireHost,
  resourcesOf,
  runExecutable,
  targetArch,
  writeDesktopResources,
} from "./desktop.ts";
import { buildWindowsInstaller } from "./windows-installer.ts";

/** Characters left for the app id under C:\Users\<name>\AppData\Local\ before WebView2's own paths reach MAX_PATH. */
const WEBVIEW2_ID_BUDGET = 40;

/** The version resource wants four numbers: major.minor.patch.build. */
export function windowsVersion(version: string, build: number): string {
  const parts = version
    .split(/[.+-]/)
    .map((p) => Number.parseInt(p, 10))
    .filter((n) => Number.isFinite(n) && n >= 0)
    .slice(0, 3);
  while (parts.length < 3) parts.push(0);
  return [...parts, Math.max(0, Math.floor(build))].join(".");
}

const exePath = (ctx: BuildContext, dir: string) => join(dir, `${ctx.project.config.app.fileName}.exe`);

export async function buildWindows(ctx: BuildContext): Promise<string> {
  requireHost("windows");
  const { outDir } = ctx;
  const { config } = ctx.project;
  const lib = await buildNativeLibrary("windows", !ctx.dev, targetArch(ctx));
  // WebView2 keeps its profile in %LOCALAPPDATA%\<app id>\WebView2, and Chromium's own paths below
  // it run to about 160 characters (service worker caches): a long id can pass MAX_PATH (260).
  if (config.app.id.length > WEBVIEW2_ID_BUDGET) {
    log.warn(
      `app.id is ${config.app.id.length} characters: WebView2's deepest paths under %LOCALAPPDATA%\\${config.app.id} may pass Windows' 260-character limit (keep it under ${WEBVIEW2_ID_BUDGET + 1})`,
    );
  }

  const dir = join(outDir, config.app.name);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });

  const art = iconArt(config);
  const flags = [
    // A GUI program: no console window of its own. Log lines still reach the pipes `akan-native run` gives it.
    "--windows-hide-console",
    `--windows-title=${config.app.name}`,
    `--windows-description=${config.app.name}`,
    `--windows-version=${windowsVersion(config.app.version, config.app.build)}`,
  ];
  if (art) {
    const icon = join(outDir, "gen", "app.ico");
    mkdirSync(join(outDir, "gen"), { recursive: true });
    writeFileSync(icon, ico(art.master));
    flags.push(`--windows-icon=${icon}`);
  }
  await compileExecutable(ctx, exePath(ctx, dir), flags);
  cpSync(lib, join(dir, NATIVE_LIB.windows));

  const resources = resourcesOf("windows", dir);
  writeDesktopResources(ctx, resources, "windows");
  if (art) writeFileSync(join(resources, "icon.rgba"), windowIcon(art.master));
  const signing = ctx.windows?.signing;
  if (signing) {
    log.step("sign: Authenticode");
    await signWindowsFiles(signing, peFiles(dir), config.app.name);
    ctx.signedAs = "distribution";
  } else if (!ctx.dev)
    log.warn(
      "not signed: SmartScreen warns on a downloaded copy (set AKAN_NATIVE_WINDOWS_CERTIFICATE, _THUMBPRINT or _SIGN_COMMAND)",
    );
  if (ctx.windows?.installer) ctx.artifacts.push({ kind: "installer", path: await buildWindowsInstaller(ctx, dir) });
  return dir;
}

export async function launchWindows(ctx: BuildContext, dir: string, opts: LaunchOptions): Promise<Launched> {
  return launchExecutable(exePath(ctx, dir), opts);
}

export async function runWindows(ctx: BuildContext, dir: string, args: ParsedArgs): Promise<number> {
  return runExecutable(exePath(ctx, dir), dir, args);
}
