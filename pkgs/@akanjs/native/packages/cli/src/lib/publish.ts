// A signed release for @akanjs/native/plugins/updates (UP-1, UP-2) from a finished release build: `akan-native
// update publish` and the API's publishUpdate() both end here. The layout and its rules are in lib/updates.ts.

import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { assertSameServer, publishAppUpdate } from "../platforms/desktop-update.ts";
import { BUNDLE_FILE, readBundleInfo } from "./compat.ts";
import { CliError, log } from "./log.ts";
import type { BuildContext } from "./prepare.ts";
import {
  assertChannel,
  hostArch,
  signingKey,
  signManifest,
  type UpdateManifest,
  updateKeyPath,
  webManifest,
  writeWebBundle,
} from "./updates.ts";

export type ReleasePlatform = "macos" | "windows" | "linux" | "ios" | "android";

export interface PublishedRelease {
  /** `<out>/<os>-<arch>` for a desktop app, `<out>/<platform>` for a phone's web bundle. */
  dir: string;
  manifest: UpdateManifest;
}

/**
 * The publish time in seconds, and past the release `<channel>.json` in `dir` already names: apps take only a larger
 * sequence, so a clock behind the last publisher's would make this release look older to every one of them.
 */
export function nextSequence(dir: string, channel: string, now = Math.floor(Date.now() / 1000)): number {
  const path = join(dir, `${channel}.json`);
  if (!existsSync(path)) return now;
  const previous = (JSON.parse(readFileSync(path, "utf8")) as Partial<UpdateManifest>).sequence;
  if (typeof previous !== "number" || previous < now) return now;
  if (previous > now)
    log.warn(
      `the ${channel} release already here has sequence ${previous}, later than this computer's clock (${now}): publishing as ${previous + 1}. Check the clock of the computer that publishes.`,
    );
  return previous + 1;
}

/** `<out>/<os>-<arch>` for a desktop release, `<out>/<platform>` for a phone's web bundle. */
export function releaseDir(out: string, platform: ReleasePlatform): string {
  const desktop = platform === "macos" || platform === "windows" || platform === "linux";
  return join(out, desktop ? `${platform}-${hostArch()}` : platform);
}

/** Refuses before the build a desktop release the apps of its channel would refuse for its server (assertSameServer). */
export function assertServerOfChannel(
  config: { desktop?: { server?: unknown } },
  platform: ReleasePlatform,
  out: string,
  channel: string,
): void {
  if (platform === "macos" || platform === "windows" || platform === "linux")
    assertSameServer(releaseDir(out, platform), channel, !!config.desktop?.server);
}

/** Refuses before the build a release that could not be signed: no key on this machine, or another app's. */
export function assertSigningKey(config: { app: { id: string }; updates?: { publicKey: string } | null }): void {
  if (!config.updates)
    throw new CliError("akan-native.config.ts has no updates: { url, publicKey } (run `akan-native update keygen`)");
  signingKey(updateKeyPath(config.app.id), config.updates.publicKey);
}

/**
 * `<channel>.json` and its `.sig` land together, the signature first: an app that reads a manifest beside another
 * one's signature refuses every release until the next publish.
 */
function writeSigned(dir: string, channel: string, bytes: Uint8Array, signature: string): void {
  const json = join(dir, `${channel}.json`);
  writeFileSync(`${json}.tmp`, bytes);
  writeFileSync(`${json}.sig.tmp`, signature);
  renameSync(`${json}.sig.tmp`, `${json}.sig`);
  renameSync(`${json}.tmp`, json);
}

/** Writes the release of `artifact` (the app a release build made) and its signed `<channel>.json` under `out`. */
export async function publishRelease(
  ctx: BuildContext,
  platform: ReleasePlatform,
  artifact: string,
  out: string,
  channel: string,
): Promise<PublishedRelease> {
  const { config } = ctx.project;
  if (!config.updates)
    throw new CliError("akan-native.config.ts has no updates: { url, publicKey } (run `akan-native update keygen`)");
  const desktop = platform === "macos" || platform === "windows" || platform === "linux" ? platform : null;
  // A desktop app runs on one CPU: x64 and arm64 releases of the same OS live side by side.
  const dir = releaseDir(out, platform);
  assertChannel(channel);
  assertSigningKey(config);
  const keyPath = updateKeyPath(config.app.id);
  const sequence = nextSequence(dir, channel);

  let manifest: UpdateManifest;
  let leftovers: string[] = [];
  if (desktop) {
    ({ manifest, leftovers } = await publishAppUpdate(ctx, desktop, artifact, dir, channel, sequence));
  } else {
    const info = readBundleInfo(join(ctx.outDir, BUNDLE_FILE));
    manifest = webManifest({
      app: config.app,
      platform,
      channel,
      nativeApi: info.nativeApi.hash,
      sequence,
      bundle: `${sequence}-${info.web.hash.slice(0, 8)}`,
      files: writeWebBundle(dir, ctx.webDir, ctx.html, ctx.env),
    });
  }
  const bytes = new TextEncoder().encode(`${JSON.stringify(manifest, null, 2)}\n`);
  const signature = `${signManifest(bytes, keyPath, config.updates.publicKey)}\n`;
  mkdirSync(dir, { recursive: true });
  writeSigned(dir, channel, bytes, signature);
  for (const file of leftovers) rmSync(file, { force: true });
  return { dir, manifest };
}
