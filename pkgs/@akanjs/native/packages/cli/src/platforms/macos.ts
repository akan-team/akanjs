// akan-native build macos: a .app with the Bun runtime, the TAO/WRY dylib and the web app
// (docs/architecture.md §3.3, §8).
//
//   <Name>.app/Contents/
//     Info.plist
//     MacOS/<exe>                      bun build --compile (main + plugin host Worker)
//     Frameworks/libakan_native_desktop.dylib native/desktop (Rust cdylib)
//     Resources/app/                   index.html (+ init script tag) and static files
//     Resources/boot.json              platform, plugins, app info
//     Resources/env.runtime.json       replaceable runtime env (ENV-4)
//     Resources/shell.json, updates.json (platforms/desktop.ts)

import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ParsedArgs } from "../lib/args.ts";
import { execOrThrow } from "../lib/exec.ts";
import { icns, iconArt, macosIconImage } from "../lib/icons.ts";
import type { Launched, LaunchOptions } from "../lib/launch.ts";
import { dim, log } from "../lib/log.ts";
import { permissionPlist } from "../lib/permissions.ts";
import { type PlistValue, toPlist } from "../lib/plist.ts";
import type { BuildContext } from "../lib/prepare.ts";
import { devIdentity } from "../lib/signing.ts";
import {
  buildNativeLibrary,
  compileExecutable,
  folderSize,
  launchExecutable,
  NATIVE_LIB,
  requireHost,
  runExecutable,
  writeDesktopResources,
} from "./desktop.ts";

export const MACOS_MIN = "26.0";

export async function buildMacos(ctx: BuildContext): Promise<string> {
  requireHost("macos");
  const { project, outDir } = ctx;
  const { config } = project;
  const lib = await buildNativeLibrary("macos", !ctx.dev);

  const appPath = join(outDir, `${config.app.name}.app`);
  const contents = join(appPath, "Contents");
  const exe = config.app.fileName;
  rmSync(outDir, { recursive: true, force: true });
  for (const dir of ["MacOS", "Frameworks", "Resources"]) mkdirSync(join(contents, dir), { recursive: true });

  await compileExecutable(ctx, join(contents, "MacOS", exe));
  cpSync(lib, join(contents, "Frameworks", NATIVE_LIB.macos));

  const resources = join(contents, "Resources");
  // `akan-native signing setup`'s identity when there is one (a stable designated requirement: TCC grants
  // and Keychain items survive rebuilds), else ad-hoc. AKAN_NATIVE_SIGNING=adhoc forces ad-hoc.
  const identity = await devIdentity();
  writeDesktopResources(ctx, resources, "macos", { signing: identity ? "identity" : "adhoc" });

  const art = iconArt(config);
  if (art) writeFileSync(join(resources, "AppIcon.icns"), icns(macosIconImage(art)));

  const usage: Record<string, PlistValue> = {};
  for (const plugin of project.plugins) Object.assign(usage, plugin.manifest.macos?.infoPlist ?? {});
  Object.assign(usage, permissionPlist(config.permissions, "macos")); // C8
  for (const key of Object.keys(usage)) if (config.usageDescriptions[key]) usage[key] = config.usageDescriptions[key]!;
  writeFileSync(
    join(contents, "Info.plist"),
    toPlist({
      CFBundleDevelopmentRegion: "en",
      CFBundleExecutable: exe,
      CFBundleIdentifier: config.app.id,
      CFBundleName: config.app.name,
      CFBundleDisplayName: config.app.name,
      CFBundlePackageType: "APPL",
      CFBundleShortVersionString: config.app.version,
      CFBundleVersion: String(config.app.build),
      CFBundleInfoDictionaryVersion: "6.0",
      LSMinimumSystemVersion: MACOS_MIN,
      NSHighResolutionCapable: true,
      NSSupportsAutomaticGraphicsSwitching: true,
      ...(art ? { CFBundleIconFile: "AppIcon" } : {}),
      ...(config.deepLinks.schemes.length
        ? { CFBundleURLTypes: [{ CFBundleURLName: config.app.id, CFBundleURLSchemes: config.deepLinks.schemes }] }
        : {}),
      ...usage,
    }),
  );

  const sign = identity?.hash ?? "-";
  log.step(`sign: ${identity ? identity.name : "ad-hoc"}`);
  // Extended attributes break signing (Tauri clears them too, QA1940). Inner code first, then the bundle (no --deep).
  await execOrThrow(["xattr", "-cr", appPath], { echo: false });
  await execOrThrow(["codesign", "--force", "--sign", sign, join(contents, "Frameworks", NATIVE_LIB.macos)], {
    echo: false,
  });
  await execOrThrow(["codesign", "--force", "--sign", sign, appPath], { echo: false });
  const size = await folderSize(appPath);
  if (size) log.info(dim(`size ${size}`));
  return appPath;
}

export async function launchMacos(ctx: BuildContext, appPath: string, opts: LaunchOptions): Promise<Launched> {
  // The executable itself (not `open`), so native logs and the page console reach the CLI (WV-3).
  return launchExecutable(join(appPath, "Contents", "MacOS", ctx.project.config.app.fileName), opts);
}

export async function runMacos(ctx: BuildContext, appPath: string, args: ParsedArgs): Promise<number> {
  return runExecutable(join(appPath, "Contents", "MacOS", ctx.project.config.app.fileName), appPath, args);
}
