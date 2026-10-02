// akan-native build linux --installer: an AppImage of the app folder (CLI-9), one file a person downloads, marks
// executable and runs on any distribution with WebKitGTK 4.1 and GTK 3 (the same system libraries the folder needs).
//
//   <fileName>-<version>-<arch>.AppImage = the type 2 runtime (pinned, lib/toolchains.ts) + a squashfs of:
//     AppRun                  starts the executable beside it
//     <fileName>.desktop      the launcher entry (name, icon, the deep link schemes it handles)
//     <fileName>.png, .DirIcon  the icon
//     <exe>, lib/, resources/  the app folder as `build linux` makes it
//
// appimagetool does the same, but is itself an AppImage that needs FUSE and downloads an unpinned runtime.

import { chmodSync, cpSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execOrThrow } from "../lib/exec.ts";
import { iconArt } from "../lib/icons.ts";
import { resize } from "../lib/image.ts";
import { log, ToolchainError } from "../lib/log.ts";
import { encodePng } from "../lib/png.ts";
import type { BuildContext } from "../lib/prepare.ts";
import { ensureInstalled, TOOLCHAIN } from "../lib/toolchains.ts";
import { targetArch } from "./desktop.ts";

/** The launcher entry (freedesktop Desktop Entry): what a menu shows and which link schemes open the app. */
export function desktopEntry(input: { name: string; fileName: string; schemes: string[] }): string {
  const escape = (value: string) => value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n");
  return [
    "[Desktop Entry]",
    "Type=Application",
    `Name=${escape(input.name)}`,
    `Exec=${input.fileName} %u`,
    `Icon=${input.fileName}`,
    "Terminal=false",
    "Categories=Utility;",
    ...(input.schemes.length ? [`MimeType=${input.schemes.map((s) => `x-scheme-handler/${s};`).join("")}`] : []),
    "",
  ].join("\n");
}

/** AppRun: the runtime starts it from the mounted image; it starts the app from beside itself. */
export function appRun(exe: string): string {
  return `#!/bin/sh
HERE="$(dirname "$(readlink -f "$0")")"
exec "$HERE/${exe}" "$@"
`;
}

/** Writes the AppImage beside the app folder and answers its path. */
export async function buildAppImage(ctx: BuildContext, folder: string): Promise<string> {
  const mksquashfs = Bun.which("mksquashfs");
  if (!mksquashfs)
    throw new ToolchainError("mksquashfs packs the AppImage: apt install squashfs-tools (dnf install squashfs-tools)");
  const { config } = ctx.project;
  const arch = targetArch(ctx);
  const spec = TOOLCHAIN.appimageRuntime.downloads[arch];
  if (!spec) throw new ToolchainError(`no pinned AppImage runtime for ${arch}`);
  const runtime = join(
    await ensureInstalled("appimage-runtime", `${TOOLCHAIN.appimageRuntime.version}-${arch}`, spec),
    spec.root,
  );
  if (config.updates)
    log.warn(
      "an AppImage runs from a read-only image, so the updates plugin cannot replace it: publish a new AppImage for each release",
    );

  const appDir = join(ctx.outDir, "gen", "AppDir");
  rmSync(appDir, { recursive: true, force: true });
  cpSync(folder, appDir, { recursive: true, verbatimSymlinks: true });
  writeFileSync(join(appDir, "AppRun"), appRun(config.app.fileName));
  chmodSync(join(appDir, "AppRun"), 0o755);
  writeFileSync(
    join(appDir, `${config.app.fileName}.desktop`),
    desktopEntry({ name: config.app.name, fileName: config.app.fileName, schemes: config.deepLinks.schemes }),
  );
  const art = iconArt(config);
  if (art) {
    writeFileSync(join(appDir, `${config.app.fileName}.png`), encodePng(resize(art.master, 256, 256)));
    symlinkSync(`${config.app.fileName}.png`, join(appDir, ".DirIcon"));
  }

  log.step("installer: AppImage");
  const squashfs = join(ctx.outDir, "gen", "app.squashfs");
  rmSync(squashfs, { force: true });
  await execOrThrow(
    [mksquashfs, appDir, squashfs, "-root-owned", "-noappend", "-comp", "zstd", "-no-progress", "-quiet"],
    { echo: false },
  );
  const outFile = join(ctx.outDir, `${config.app.fileName}-${config.app.version}-${arch}.AppImage`);
  writeFileSync(outFile, Buffer.concat([readFileSync(runtime), readFileSync(squashfs)]));
  chmodSync(outFile, 0o755);
  rmSync(squashfs, { force: true });
  log.info(`installer ${outFile} (${Math.round(readFileSync(outFile).length / 1024 / 1024)} MB)`);
  return outFile;
}
