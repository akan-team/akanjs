// Update releases through the programmatic API (api.ts exports all of it): a signed release, an unsigned pack for
// whoever holds the key, an earlier desktop release signed again, and the signing key.

import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { AkanNativeConfig } from "./config.ts";
import {
  AkanNativeError,
  type BuildResult,
  buildIn,
  type TaskOptions,
  task,
  toAkanNativeError,
} from "./lib/api-task.ts";
import { makeNativeBoot } from "./lib/boot.ts";
import { BUNDLE_FILE, compatProblems, readBundleInfo } from "./lib/compat.ts";
import type { MacosBuild } from "./lib/macossigning.ts";
import { prepare, type WindowsBuild } from "./lib/prepare.ts";
import { type Project, projectFromConfig } from "./lib/project.ts";
import {
  assertServerOfChannel,
  assertSigningKey,
  publishRelease,
  releaseRevocations,
  republishRelease,
} from "./lib/publish.ts";
import {
  assertChannel,
  type DesktopArch,
  generateUpdateKey,
  hostArch,
  keyIdOf,
  type UpdateManifest,
  updateKeyPath,
  validateUpdates,
  webManifest,
  writeWebBundle,
} from "./lib/updates.ts";
import type { DesktopOs } from "./platforms/desktop.ts";
import {
  type AppSigner,
  appSigner,
  PACK_TEMPLATE,
  packAppUpdate as packApp,
  readAppArchive,
} from "./platforms/desktop-update.ts";
import type { TargetPlatform } from "./platforms/index.ts";

/**
 * An unsigned web bundle update (UP-2), for a signer that keeps the key off the build machine. Writes
 * `<out>/files/<sha256>`, `<out>/manifest.template.json` (the manifest with `channel`, `sequence` and `bundle` left
 * empty for the signer) and `<out>/bundle.json` (the native API the bundle needs, UP-3). Prepares the web bundle as a
 * release build does, without building the native app.
 */
export function packUpdate(
  options: TaskOptions & { platform: "ios" | "android"; out: string },
): Promise<{ manifest: UpdateManifest; out: string }> {
  return task(options, async () => {
    const appDir = resolve(options.appDir);
    let project: Project;
    try {
      project = projectFromConfig(options.config, appDir, { resolveFrom: options.resolveFrom });
    } catch (error) {
      throw toAkanNativeError(error, "CONFIG_INVALID");
    }
    //? Not the build folder: its bundle.json is the store build's, which `compareBundles` checks an update against.
    const out = resolve(options.out);
    mkdirSync(out, { recursive: true });
    const ctx = await prepare(project, options.platform, {
      mode: options.mode ?? "production",
      profile: "release",
      skipWebBuild: options.skipWebBuild ?? false,
      outDir: out,
      envFiles: options.envFiles,
      env: options.env,
      api: true,
    }).catch((error) => {
      throw toAkanNativeError(error, "CONFIG_INVALID");
    });
    makeNativeBoot(ctx, options.platform);
    const info = readBundleInfo(join(out, BUNDLE_FILE));
    const manifest = webManifest({
      app: project.config.app,
      platform: options.platform,
      channel: "",
      nativeApi: info.nativeApi.hash,
      sequence: 0,
      bundle: "",
      files: writeWebBundle(out, ctx.webDir, ctx.html, ctx.env),
    });
    writeFileSync(join(out, PACK_TEMPLATE), `${JSON.stringify(manifest, null, 2)}\n`);
    return { manifest, out };
  });
}

export interface AppUpdatePack {
  build: BuildResult;
  /** Holds `app/<tar sha256>.tar.gz`, `app/<from>-<to>.delta.gz` with `previous`, and `manifest.template.json`. */
  out: string;
  /** manifest.template.json: `channel`, `sequence` and `bundle` are the signer's to fill (fillManifest). */
  manifest: UpdateManifest;
  /**
   * Who signed the app's files (not the update key): an installed app signed by a team or a certificate takes only a
   * release signed by the same. null: ad hoc or unsigned, which only an app signed that way takes.
   */
  signer: AppSigner | null;
}

/**
 * An unsigned desktop app update (UP-1), for a signer that keeps the key off the build machine: a release build, its
 * archive as publishUpdate names it, and the manifest with `channel`, `sequence` and `bundle` left empty. The signer
 * fills it (fillManifest), signs its bytes (manifestBytes) and wraps them (updateEnvelope, sealManifest); the envelope
 * goes to `<os>-<arch>/<channel>/app.json` beside `app/`.
 */
export function packAppUpdate(
  options: TaskOptions & {
    platform: DesktopOs;
    out: string;
    /** The signature a macOS release carries: the installed app's own, or the updater refuses it. No dmg is made. */
    macos?: Pick<MacosBuild, "signing" | "notarize">;
    /** Authenticode for a Windows release's files. No setup program is made. */
    windows?: Pick<WindowsBuild, "signing">;
    /** The CPU of the apps it updates, of the same OS. Default this computer's. */
    arch?: DesktopArch;
    /**
     * The archive of the release the channel has now (`<tar sha256>.tar.gz`, a path or a URL of the feed): the pack
     * then carries the delta from it, and the manifest names it in `patches`.
     */
    previous?: string;
  },
): Promise<AppUpdatePack> {
  return task(options, async (warnings) => {
    if (!options.config.updates)
      throw new AkanNativeError("CONFIG_INVALID", "the config has no updates: { url, publicKeys } to pack for");
    const out = resolve(options.out);
    const previous = options.previous
      ? await readAppArchive(options.previous).catch((error) => {
          throw toAkanNativeError(error, "CONFIG_INVALID");
        })
      : undefined;
    const { ctx, artifact, result } = await buildIn(options, "release", options.mode ?? "production", warnings, {
      ...(options.macos ? { macos: { ...options.macos, dmg: false } } : {}),
      ...(options.windows?.signing ? { windows: { signing: options.windows.signing } } : {}),
      ...(options.arch ? { arch: options.arch } : {}),
    });
    mkdirSync(out, { recursive: true });
    const { manifest } = await packApp(ctx, options.platform, artifact, out, previous);
    const signer = await appSigner(options.platform, artifact, ctx.project.config.app.fileName);
    return { build: result, out, manifest, signer };
  });
}

export interface PublishResult {
  build: BuildResult;
  /** `<out>/<os>-<arch>` (desktop) or `<out>/<platform>` (a phone's web bundle): what to upload under updates.url. */
  dir: string;
  bundle: string;
  channel: string;
  files: number;
  /** Bytes of the files the manifest names. */
  size: number;
}

export interface PublishCheckOptions extends Pick<TaskOptions, "appDir" | "config"> {
  platform: Exclude<TargetPlatform, "web">;
  channel?: string;
  out?: string;
  /** Whether the release will carry a server; the config's `desktop.server` by default. */
  server?: boolean;
  /** A desktop release's CPU, which names its feed folder: this computer's by default. */
  arch?: DesktopArch;
  /**
   * keyIds of updates.publicKeys the release starts revoking, beside updates.revokedKeys and what the channel's releases
   * revoke. It is signed with a key listed after every key it revokes.
   */
  revoke?: string[];
  /** A release that revokes a key: apps compare it with their own build instead of the running release. */
  resetSequence?: boolean;
}

/**
 * What publishUpdate() refuses before it builds, without building (CONFIG_INVALID): no updates settings, a channel no
 * app could be configured for, no signing key on this machine or another app's, a desktop release whose server
 * presence is not the channel's previous release's, and a release whose revocations no app would take. For a
 * caller with a long build of its own before publishUpdate.
 */
export function checkPublishUpdate(options: PublishCheckOptions): { channel: string; out: string } {
  if (!options.config.updates)
    throw new AkanNativeError("CONFIG_INVALID", "the config has no updates: { url, publicKeys } to publish for");
  const channel = options.channel ?? options.config.updates.channel ?? "production";
  const out = resolve(options.out ?? resolve(options.appDir, ".akan", "native", "updates"));
  const problems: string[] = [];
  const updates = validateUpdates(options.config.updates, problems);
  if (!updates || problems.length)
    throw new AkanNativeError("CONFIG_INVALID", "the config's updates are not valid", { problems });
  try {
    if (options.channel !== undefined) assertChannel(options.channel);
    const target = { app: options.config.app, updates };
    assertSigningKey(target);
    releaseRevocations(target, options.platform, out, channel, options, options.arch);
    const server = options.server ?? !!options.config.desktop?.server;
    assertServerOfChannel({ desktop: server ? { server } : {} }, options.platform, out, channel, options.arch);
  } catch (error) {
    throw toAkanNativeError(error, "CONFIG_INVALID");
  }
  return { channel, out };
}

/**
 * A signed release for the updates plugin (UP-1, UP-2): a release build, then its envelope and its files under `out`
 * (default <appDir>/.akan/native/updates), signed with the key updateKeygen() made.
 */
export function publishUpdate(
  options: TaskOptions & {
    platform: Exclude<TargetPlatform, "web">;
    channel?: string;
    out?: string;
    /** The signature a macOS release carries: the installed app's own, or the updater refuses it. No dmg is made. */
    macos?: Pick<MacosBuild, "signing" | "notarize">;
    /** Authenticode for a Windows release's files. No setup program is made. */
    windows?: Pick<WindowsBuild, "signing">;
    /** A desktop release's CPU, of the same OS: an x64 release from an arm64 machine. Default this computer's. */
    arch?: DesktopArch;
    /** keyIds of updates.publicKeys the release starts revoking (PublishCheckOptions.revoke). */
    revoke?: string[];
    /** A release that revokes a key: apps compare it with their own build instead of the running release. */
    resetSequence?: boolean;
  },
): Promise<PublishResult> {
  return task(options, async (warnings) => {
    const { channel, out } = checkPublishUpdate(options);
    const { ctx, artifact, result } = await buildIn(options, "release", options.mode ?? "production", warnings, {
      ...(options.macos ? { macos: { ...options.macos, dmg: false } } : {}),
      ...(options.windows?.signing ? { windows: { signing: options.windows.signing } } : {}),
      ...(options.arch ? { arch: options.arch } : {}),
    });
    const { dir, manifest } = await publishRelease(ctx, options.platform, artifact, out, channel, options).catch(
      (error) => {
        throw toAkanNativeError(error, "CONFIG_INVALID");
      },
    );
    return {
      build: result,
      dir,
      bundle: manifest.bundle,
      channel,
      files: manifest.files.length,
      size: manifest.files.reduce((n, f) => n + f.size, 0),
    };
  });
}

/**
 * Whether a web bundle can run in the binary a store release shipped (UP-3): `shipped` is that build's bundle.json,
 * `bundle` the one `packUpdate` wrote. Anything in `problems` means a new binary.
 */
export function compareBundles(shipped: string, bundle: string): { compatible: boolean; problems: string[] } {
  const [before, now] = [readBundleInfo(resolve(shipped)), readBundleInfo(resolve(bundle))];
  const problems =
    before.app.id !== now.app.id
      ? [`${shipped} is for ${before.app.id}, the bundle for ${now.app.id}`]
      : compatProblems(before.nativeApi.inputs, now.nativeApi.inputs);
  return { compatible: problems.length === 0, problems };
}

/**
 * The app's update signing key: made once (AKAN_NATIVE_UPDATE_KEY, else ~/.akan/native/keys/<app id>.update.key),
 * then read. `publicKey` goes into the config's `updates.publicKeys`; the key file never leaves the machine. `keyId`
 * is what a revocation names it by (`publishUpdate({ revoke })`, `updates.revokedKeys`).
 */
export function updateKeygen(options: { config: AkanNativeConfig }): {
  publicKey: string;
  keyId: string;
  keyPath: string;
  created: boolean;
} {
  const keyPath = updateKeyPath(options.config.app.id);
  const key = generateUpdateKey(keyPath);
  return { ...key, keyId: keyIdOf(key.publicKey), keyPath };
}

export type RepublishResult = Omit<PublishResult, "build"> & {
  /** The bundle id of the release that was signed again. */
  from: string;
};

/**
 * Signs a desktop release publishUpdate wrote under `out` again, as its channel's newest: the same archive under a new
 * sequence and bundle id, with no patch and no build. Apps on any other build take it whole, which is how a release is
 * rolled back by the one who holds the key. Refuses what checkPublishUpdate refuses.
 */
export function republishUpdate(
  options: Pick<TaskOptions, "appDir" | "config" | "resolveFrom" | "log" | "signal"> & {
    platform: DesktopOs;
    /** The release to sign again: its manifest's `bundle`. */
    bundle: string;
    channel?: string;
    out?: string;
    arch?: DesktopArch;
    revoke?: string[];
    resetSequence?: boolean;
  },
): Promise<RepublishResult> {
  return task(options, async () => {
    const { channel, out } = checkPublishUpdate({ ...options, server: undefined });
    let project: Project;
    try {
      project = projectFromConfig(options.config, resolve(options.appDir), { resolveFrom: options.resolveFrom });
    } catch (error) {
      throw toAkanNativeError(error, "CONFIG_INVALID");
    }
    const { platform, bundle, arch = hostArch() } = options;
    const { dir, manifest, from } = await republishRelease(
      project,
      platform,
      bundle,
      out,
      channel,
      options,
      arch,
    ).catch((error) => {
      throw toAkanNativeError(error, "CONFIG_INVALID");
    });
    return {
      dir,
      bundle: manifest.bundle,
      channel,
      files: manifest.files.length,
      size: manifest.files.reduce((n, f) => n + f.size, 0),
      from: from.bundle,
    };
  });
}
