// A signed release for @akanjs/native/plugins/updates (UP-1, UP-2) from a finished release build: `akan-native
// update publish` and the API's publishUpdate() both end here. The layout and its rules are in lib/updates.ts.

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isUpdateKeyId, updateDecision } from "../../../core/src/kernel.ts";
import { assertSameServer, publishAppUpdate } from "../platforms/desktop-update.ts";
import { BUNDLE_FILE, readBundleInfo } from "./compat.ts";
import { CliError, log } from "./log.ts";
import type { BuildContext } from "./prepare.ts";
import {
  assertChannel,
  type DesktopArch,
  hostArch,
  keyIdOf,
  openEnvelope,
  sealManifest,
  signingKey,
  signManifest,
  type UpdateEnvelope,
  type UpdateManifest,
  updateKeyPath,
  webManifest,
  writeWebBundle,
} from "./updates.ts";

//? Phones refuse a manifest whose revokeKeys lists more (UpdatesPlugin).
const MAX_REVOKE_KEYS = 16;

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

/** `<out>/<os>-<arch>` for a desktop release (the arch it was built for), `<out>/<platform>` for a phone's web bundle. */
export function releaseDir(out: string, platform: ReleasePlatform, arch?: DesktopArch): string {
  const desktop = platform === "macos" || platform === "windows" || platform === "linux";
  return join(out, desktop ? `${platform}-${arch ?? hostArch()}` : platform);
}

/** Refuses before the build a desktop release the apps of its channel would refuse for its server (assertSameServer). */
export function assertServerOfChannel(
  config: { desktop?: { server?: unknown } },
  platform: ReleasePlatform,
  out: string,
  channel: string,
  arch?: DesktopArch,
): void {
  if (platform === "macos" || platform === "windows" || platform === "linux")
    assertSameServer(releaseDir(out, platform, arch), channel, !!config.desktop?.server);
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
 * What the phone envelopes of `channel` in `dir` revoke, as a phone with `publicKeys` takes it: from an envelope that
 * verifies, by a signer allowed to and not itself revoked. A file that does not verify revokes nothing, or a stray or
 * forged one would have the next publish sign its revocation.
 */
function publishedRevocations(dir: string, channel: string, publicKeys: readonly string[]): string[] {
  const folder = join(dir, channel);
  if (!existsSync(folder)) return [];
  const ring = publicKeys.map(keyIdOf);
  const signed: { keyId: string; revokeKeys: string[] }[] = [];
  for (const name of readdirSync(folder).filter((name) => name.endsWith(".json"))) {
    try {
      const { manifest, keyId } = openEnvelope(readFileSync(join(folder, name), "utf8"), publicKeys);
      const { revokeKeys = [] } = JSON.parse(new TextDecoder().decode(manifest)) as { revokeKeys?: unknown };
      if (
        Array.isArray(revokeKeys) &&
        revokeKeys.length <= MAX_REVOKE_KEYS &&
        revokeKeys.every((id: unknown) => typeof id === "string" && isUpdateKeyId(id))
      )
        signed.push({ keyId, revokeKeys });
    } catch (error) {
      log.warn(`${join(folder, name)}: ${(error as Error).message}; what it revokes is not carried on`);
    }
  }
  const revoked: string[] = [];
  //? Later keys first: a key revoked by one after it revokes nothing itself.
  for (const { keyId, revokeKeys } of signed.sort((a, b) => ring.indexOf(b.keyId) - ring.indexOf(a.keyId))) {
    const { kind } = updateDecision({
      ring,
      revoked,
      signer: keyId,
      revokeKeys,
      resetSequence: false,
      sequence: 1,
      embedded: 0,
      running: null,
    });
    if (kind === "take") revoked.push(...revokeKeys.filter((id) => !revoked.includes(id)));
  }
  return revoked.sort((a, b) => a.localeCompare(b));
}

/**
 * The revokeKeys of a phone release of `channel` under `out`: those of the channel's releases, since a phone that never
 * saw a revocation (a new install, cleared data) learns it only from a later manifest. Refuses a signing key they
 * revoke, or one listed before a key they revoke: every phone would refuse its manifest.
 */
export function channelRevocations(
  config: { app: { id: string }; updates?: { publicKeys: string[] } | null },
  platform: ReleasePlatform,
  out: string,
  channel: string,
): string[] {
  if ((platform !== "ios" && platform !== "android") || !config.updates) return [];
  const { publicKeys } = config.updates;
  const dir = releaseDir(out, platform);
  const revokeKeys = publishedRevocations(dir, channel, publicKeys);
  if (!revokeKeys.length) return [];
  const keyPath = updateKeyPath(config.app.id);
  const { kind } = updateDecision({
    ring: publicKeys.map(keyIdOf),
    revoked: [],
    signer: signingKey(keyPath, publicKeys).keyId,
    revokeKeys,
    resetSequence: false,
    sequence: 1,
    embedded: 0,
    running: null,
  });
  const by = `the ${channel} releases in ${dir} revoke ${revokeKeys.join(", ")}`;
  if (kind === "self-revoke")
    throw new CliError(`${by}, the key at ${keyPath}: sign with a key listed after it in updates.publicKeys`);
  if (kind === "revoke-later")
    throw new CliError(
      `${by}, listed after the key at ${keyPath} in updates.publicKeys: a key revokes only keys before it, so sign with one after them`,
    );
  if (revokeKeys.length > MAX_REVOKE_KEYS)
    throw new CliError(`${by}: more than the ${MAX_REVOKE_KEYS} keys a manifest may revoke`);
  return revokeKeys;
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
  const dir = releaseDir(out, platform, ctx.arch);
  assertChannel(channel);
  assertSigningKey(config, platform);
  const revokeKeys = channelRevocations(config, platform, out, channel);
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
      revokeKeys,
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
