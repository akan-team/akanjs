// akan-native build linux: a folder with the Bun runtime, the TAO/WRY shared library and the web app
// (docs/architecture.md §3.3, §8), and with --installer an AppImage of it (linux-appimage.ts).
//
//   <name>/
//     <exe>                      bun build --compile (main + plugin host Worker)
//     lib/libakan_native_desktop.so     native/desktop (Rust cdylib; WebKitGTK 4.1 and GTK 3 from the system)
//     resources/                 platforms/desktop.ts, plus icon.rgba (the window icon)

import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ParsedArgs } from "../lib/args.ts";
import { iconArt, windowIcon } from "../lib/icons.ts";
import type { Launched, LaunchOptions } from "../lib/launch.ts";
import { dim, log } from "../lib/log.ts";
import type { BuildContext } from "../lib/prepare.ts";
import {
  buildNativeLibrary,
  compileExecutable,
  folderSize,
  launchExecutable,
  NATIVE_LIB,
  requireHost,
  resourcesOf,
  runExecutable,
  targetArch,
  writeDesktopResources,
} from "./desktop.ts";
import { buildAppImage } from "./linux-appimage.ts";

const exePath = (ctx: BuildContext, dir: string) => join(dir, ctx.project.config.app.fileName);

export async function buildLinux(ctx: BuildContext): Promise<string> {
  requireHost("linux");
  const { outDir } = ctx;
  const { config } = ctx.project;
  const lib = await buildNativeLibrary("linux", !ctx.dev, targetArch(ctx));

  const dir = join(outDir, config.app.fileName);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(join(dir, "lib"), { recursive: true });

  await compileExecutable(ctx, exePath(ctx, dir));
  cpSync(lib, join(dir, "lib", NATIVE_LIB.linux));

  const resources = resourcesOf("linux", dir);
  writeDesktopResources(ctx, resources, "linux");
  const art = iconArt(config);
  if (art) writeFileSync(join(resources, "icon.rgba"), windowIcon(art.master));
  if (ctx.linux?.appImage) ctx.artifacts.push({ kind: "installer", path: await buildAppImage(ctx, dir) });
  const size = await folderSize(dir);
  if (size) log.info(dim(`size ${size}`));
  return dir;
}

export async function launchLinux(ctx: BuildContext, dir: string, opts: LaunchOptions): Promise<Launched> {
  return launchExecutable(exePath(ctx, dir), opts);
}

export async function runLinux(ctx: BuildContext, dir: string, args: ParsedArgs): Promise<number> {
  return runExecutable(exePath(ctx, dir), dir, args);
}
