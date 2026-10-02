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
//     Resources/server/                the carried server (desktop.server), its Mach-O files signed too

import {
  closeSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";
import type { ParsedArgs } from "../lib/args.ts";
import { execOrThrow } from "../lib/exec.ts";
import { icns, iconArt, macosIconImage } from "../lib/icons.ts";
import type { Launched, LaunchOptions } from "../lib/launch.ts";
import { dim, log } from "../lib/log.ts";
import {
  appEntitlements,
  assessGatekeeper,
  buildDmg,
  codesign,
  notarize,
  type ResolvedMacosIdentity,
  staple,
  withMacosIdentity,
  writeEntitlements,
  zipForNotary,
} from "../lib/macossigning.ts";
import { permissionPlist } from "../lib/permissions.ts";
import { type PlistValue, toPlist } from "../lib/plist.ts";
import type { BuildContext } from "../lib/prepare.ts";
import { SigningError } from "../lib/prepare.ts";
import { devIdentity } from "../lib/signing.ts";
import { hostArch } from "../lib/updates.ts";
import {
  buildNativeLibrary,
  compileExecutable,
  folderSize,
  launchExecutable,
  NATIVE_LIB,
  requireHost,
  runExecutable,
  targetArch,
  writeDesktopResources,
} from "./desktop.ts";

export const MACOS_MIN = "26.0";

export async function buildMacos(ctx: BuildContext): Promise<string> {
  requireHost("macos");
  const { project, outDir } = ctx;
  const { config } = project;
  const lib = await buildNativeLibrary("macos", !ctx.dev, targetArch(ctx));

  const appPath = join(outDir, `${config.app.name}.app`);
  const contents = join(appPath, "Contents");
  const exe = config.app.fileName;
  rmSync(outDir, { recursive: true, force: true });
  for (const dir of ["MacOS", "Frameworks", "Resources"]) mkdirSync(join(contents, dir), { recursive: true });

  await compileExecutable(ctx, join(contents, "MacOS", exe));
  cpSync(lib, join(contents, "Frameworks", NATIVE_LIB.macos));

  const resources = join(contents, "Resources");
  const usage: Record<string, PlistValue> = {};
  for (const plugin of project.plugins) Object.assign(usage, plugin.manifest.macos?.infoPlist ?? {});
  Object.assign(usage, permissionPlist(config.permissions, "macos")); // C8
  for (const key of Object.keys(usage)) if (config.usageDescriptions[key]) usage[key] = config.usageDescriptions[key]!;

  return withMacosIdentity(
    ctx.macos?.signing,
    async (identity) => {
      if (ctx.macos?.notarize && identity.kind !== "distribution")
        throw new SigningError(
          `notarization takes a Developer ID Application identity, and the build is signed with "${identity.name}"`,
        );
      if (ctx.macos?.notarize && ctx.dev) throw new SigningError("a debug build is never notarized: build a release");
      writeDesktopResources(ctx, resources, "macos", { signing: shellSigning(identity) });

      const art = iconArt(config);
      if (art) writeFileSync(join(resources, "AppIcon.icns"), icns(macosIconImage(art)));
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

      log.step(`sign: ${identity.name}`);
      // Extended attributes break signing (Tauri clears them too, QA1940). Inner code first, then the bundle (no --deep).
      await execOrThrow(["xattr", "-cr", appPath], { echo: false });
      //? The hardened runtime and its entitlements only mean something under a certificate Apple issued.
      const team = identity.kind === "development" || identity.kind === "distribution";
      for (const addon of carriedNativeCode(resources)) await codesign(identity, addon, { hardened: team });
      await codesign(identity, join(contents, "Frameworks", NATIVE_LIB.macos), { hardened: team });
      const entitlements = team
        ? writeEntitlements(
            join(outDir, "gen"),
            appEntitlements(usage, (config.native?.macos?.entitlements ?? {}) as Record<string, PlistValue>),
          )
        : undefined;
      await codesign(identity, appPath, { hardened: team, ...(entitlements ? { entitlements } : {}) });
      await execOrThrow(["codesign", "--verify", "--deep", "--strict", appPath], { echo: false });
      ctx.signedAs =
        identity.kind === "distribution" ? "distribution" : identity.kind === "development" ? "development" : "adhoc";
      if (identity.kind !== "distribution" && !ctx.dev)
        log.warn(
          "not signed with a Developer ID: Gatekeeper blocks this app once it is downloaded to another Mac (set AKAN_NATIVE_MACOS_IDENTITY or AKAN_NATIVE_MACOS_CERTIFICATE)",
        );

      const notarization = ctx.macos?.notarize;
      if (notarization) {
        const zip = join(outDir, "gen", `${config.app.fileName}-notarize.zip`);
        await zipForNotary(appPath, zip);
        await notarize(zip, notarization);
        rmSync(zip, { force: true });
        await staple(appPath);
        await assessGatekeeper(appPath, "execute");
      } else if (identity.kind === "distribution" && !ctx.dev)
        log.warn(
          "signed with a Developer ID but not notarized: Gatekeeper still blocks a downloaded copy (set AKAN_NATIVE_MACOS_NOTARY_KEY, _KEY_ID and _ISSUER)",
        );

      if (ctx.macos?.dmg) {
        const dmg = join(outDir, `${config.app.fileName}-${config.app.version}-${ctx.arch ?? hostArch()}.dmg`);
        log.step(`dmg: ${basename(dmg)}`);
        await buildDmg(appPath, dmg, config.app.name, join(outDir, "gen"));
        //? A disk image is signed with a timestamp but takes no runtime: it is not code that runs.
        if (identity.sign !== "-") await codesign(identity, dmg, { hardened: false, timestamp: team });
        if (notarization) {
          await notarize(dmg, notarization);
          await staple(dmg);
          await assessGatekeeper(dmg, "open");
        }
        ctx.artifacts.push({ kind: "installer", path: dmg });
      }
      const size = await folderSize(appPath);
      if (size) log.info(dim(`size ${size}`));
      return appPath;
    },
    async () => {
      // `akan-native signing setup`'s identity when there is one (a stable designated requirement: TCC grants
      // and Keychain items survive rebuilds), else ad-hoc. AKAN_NATIVE_SIGNING=adhoc forces ad-hoc.
      const dev = await devIdentity();
      return dev ? { sign: dev.hash, name: dev.name, kind: "identity" } : { sign: "-", name: "ad-hoc", kind: "adhoc" };
    },
  );
}

/** shell.json `signing`: secure-storage keeps its items in-process only under a team's signature. */
function shellSigning(identity: ResolvedMacosIdentity): "team" | "identity" | "adhoc" {
  if (identity.kind === "development" || identity.kind === "distribution") return "team";
  return identity.kind === "identity" ? "identity" : "adhoc";
}

/**
 * Mach-O files the app carries in its server and its `bin`, whatever their names (native addons, executables, a
 * package's own executable): nested code the bundle's signature does not sign.
 */
export function carriedNativeCode(resources: string): string[] {
  return ["server", "bin"].flatMap((folder) => {
    const dir = join(resources, folder);
    if (!existsSync(dir)) return [];
    return (readdirSync(dir, { recursive: true }) as string[])
      .filter((file) => !/\.(c?js|mjs|ts|json|map|md|txt|html|css)$/i.test(file))
      .map((file) => join(dir, file))
      .filter(isMachO);
  });
}

function isMachO(file: string): boolean {
  if (!lstatSync(file).isFile()) return false;
  const head = Buffer.alloc(8);
  const fd = openSync(file, "r");
  try {
    if (readSync(fd, head, 0, 8, 0) < 8) return false;
  } finally {
    closeSync(fd);
  }
  const magic = head.readUInt32BE(0);
  if (magic === 0xfeedface || magic === 0xfeedfacf || magic === 0xcefaedfe || magic === 0xcffaedfe) return true;
  //? A Java class file starts with 0xcafebabe too: its next word is the class version (45 and up), a fat header's its arch count.
  return (magic === 0xcafebabe || magic === 0xcafebabf) && head.readUInt32BE(4) < 45;
}

export async function launchMacos(ctx: BuildContext, appPath: string, opts: LaunchOptions): Promise<Launched> {
  // The executable itself (not `open`), so native logs and the page console reach the CLI (WV-3).
  return launchExecutable(join(appPath, "Contents", "MacOS", ctx.project.config.app.fileName), opts);
}

export async function runMacos(ctx: BuildContext, appPath: string, args: ParsedArgs): Promise<number> {
  return runExecutable(join(appPath, "Contents", "MacOS", ctx.project.config.app.fileName), appPath, args);
}
