// A signed release for @akanjs/native/plugins/updates (UP-1, UP-2) from a finished release build: `akan-native
// update publish` and the API's publishUpdate() both end here. The layout and its rules are in lib/updates.ts.

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { assertSameServer, publishAppUpdate } from "../platforms/desktop-update.ts";
import { BUNDLE_FILE, readBundleInfo } from "./compat.ts";
import { CliError, log } from "./log.ts";
import type { BuildContext } from "./prepare.ts";
import {
  assertChannel,
  hostArch,
  sealManifest,
  signingKey,
  signManifest,
  type UpdateEnvelope,
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
  /** The file installed apps read: `<dir>/<channel>.json`, or a phone's `<dir>/<channel>/<nativeApi>.json`. */
  file: string;
}

/** The largest sequence published to `channel` in `dir`: a desktop's `<channel>.json`, every `<channel>/*.json` of a phone. */
function publishedSequence(dir: string, channel: string): number | null {
  const sequences: unknown[] = [];
  const v1 = join(dir, `${channel}.json`);
  if (existsSync(v1)) sequences.push((JSON.parse(readFileSync(v1, "utf8")) as Partial<UpdateManifest>).sequence);
  const v2 = join(dir, channel);
  if (existsSync(v2))
    for (const name of readdirSync(v2).filter((name) => name.endsWith(".json"))) {
      const envelope = JSON.parse(readFileSync(join(v2, name), "utf8")) as Partial<UpdateEnvelope>;
      const manifest = JSON.parse(Buffer.from(envelope.manifest ?? "", "base64").toString("utf8") || "{}");
      sequences.push((manifest as Partial<UpdateManifest>).sequence);
    }
  const numbers = sequences.filter((sequence): sequence is number => typeof sequence === "number");
  return numbers.length ? Math.max(...numbers) : null;
}

/**
 * The publish time in seconds, and past every release of the channel in `dir`: apps take only a larger sequence, so a
 * clock behind the last publisher's would make this release look older to every one of them. A phone's native APIs
 * share one count, so a binary moving to the next generation never meets a smaller number.
 */
export function nextSequence(dir: string, channel: string, now = Math.floor(Date.now() / 1000)): number {
  const previous = publishedSequence(dir, channel);
  if (previous === null || previous < now) return now;
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

/**
 * Refuses before the build a release that could not be signed: no key on this machine, another app's, or for a desktop
 * app one the app does not trust (it trusts the first of updates.publicKeys).
 */
export function assertSigningKey(
  config: { app: { id: string }; updates?: { publicKeys: string[] } | null },
  platform?: ReleasePlatform,
): void {
  if (!config.updates)
    throw new CliError("akan-native.config.ts has no updates: { url, publicKeys } (run `akan-native update keygen`)");
  const { index } = signingKey(updateKeyPath(config.app.id), config.updates.publicKeys);
  if (index !== 0 && (platform === "macos" || platform === "windows" || platform === "linux"))
    throw new CliError("a desktop app trusts the first of updates.publicKeys only: sign with that key");
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

/** A phone's envelope replaces the last one in a single rename, so no reader meets half of either. */
function writeEnvelope(dir: string, channel: string, nativeApi: string, envelope: UpdateEnvelope): string {
  const file = join(dir, channel, `${nativeApi}.json`);
  mkdirSync(join(dir, channel), { recursive: true });
  writeFileSync(`${file}.tmp`, `${JSON.stringify(envelope)}\n`);
  renameSync(`${file}.tmp`, file);
  return file;
}

/** Writes the release of `artifact` (the app a release build made) and its signed manifest under `out`. */
export async function publishRelease(
  ctx: BuildContext,
  platform: ReleasePlatform,
  artifact: string,
  out: string,
  channel: string,
): Promise<PublishedRelease> {
  const { config } = ctx.project;
  if (!config.updates)
    throw new CliError("akan-native.config.ts has no updates: { url, publicKeys } (run `akan-native update keygen`)");
  const desktop = platform === "macos" || platform === "windows" || platform === "linux" ? platform : null;
  // A desktop app runs on one CPU: x64 and arm64 releases of the same OS live side by side.
  const dir = releaseDir(out, platform);
  assertChannel(channel);
  assertSigningKey(config, platform);
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
  mkdirSync(dir, { recursive: true });
  let file: string;
  if (desktop) {
    writeSigned(dir, channel, bytes, `${signManifest(bytes, keyPath, config.updates.publicKeys)}\n`);
    file = join(dir, `${channel}.json`);
  } else
    file = writeEnvelope(
      dir,
      channel,
      manifest.nativeApi ?? "",
      sealManifest(bytes, keyPath, config.updates.publicKeys),
    );
  for (const leftover of leftovers) rmSync(leftover, { force: true });
  return { dir, manifest, file };
}
