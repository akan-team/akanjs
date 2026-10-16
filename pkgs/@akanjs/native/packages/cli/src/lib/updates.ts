// Web bundle updates (UP-2) and app updates (UP-1): keys, signed manifests, local serving.
//
// Layout under the update URL (and `akan-native update publish`'s output folder):
//   <platform>/<channel>/<nativeApi>.json   a phone's web bundle (protocol v2): an UpdateEnvelope holding the
//                                           manifest's bytes, the signer's keyId and the signature, in one file
//   <platform>/files/<sha256>               web bundle files, content-addressed (unchanged files are shared)
//   <os>-<arch>/<channel>.json(.sig)        a desktop app (UP-1, protocol v1): the manifest and its base64 signature
//   <os>-<arch>/app/<sha256>                desktop app archives
//
// The whole manifest is signed, not only the artifact: Tauri signs the artifact and leaves the
// manifest open, then has to compare a signed version string to stop downgrades
// (tauri-plugins-workspace/plugins/updater/src/updater.rs:1661-1708). Here `sequence` inside the
// signed manifest must grow, so an old but validly signed bundle cannot be replayed. A phone binary
// reads only its own native API's envelope, so each binary generation on a channel takes its own fixes.

import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import type { Platform } from "../../../core/src/index.ts";
import {
  checkUpdateEnvelope,
  isChannelName,
  isStrictBase64,
  isUpdateKeyId,
  MAX_REVOKE_KEYS,
  RESERVED_CHANNELS,
} from "../../../core/src/kernel.ts";
import { runtimeVersion } from "./boot.ts";
import { BUNDLE_FILE, readBundleInfo } from "./compat.ts";
import { CliError } from "./log.ts";
import { akanNativeHome } from "./toolchains.ts";

export interface UpdatesConfig {
  /** Base URL of the update files, e.g. "https://example.com/updates". http:// only for localhost / 10.0.2.2 in dev builds. */
  url: string;
  /**
   * Raw 32-byte Ed25519 public keys, base64 (`akan-native update keygen` prints one): the keys a phone binary trusts, the
   * online signing key first and offline spares after it, since a key may revoke only keys listed before it. A desktop
   * app trusts the first.
   */
  publicKeys: string[];
  /**
   * keyIds every phone release revokes, kept in the config so a release published from another folder (a fresh CI
   * checkout) still revokes them. `akan-native update publish --revoke` starts a revocation. A phone build trusts none
   * of them, though publicKeys still lists them.
   */
  revokedKeys: string[];
  /** Manifest name under <platform>/. Default "production". */
  channel: string;
  /** How long a newly applied bundle has to call notifyReady() before it is rolled back, ms. Default 10000. */
  readyTimeout: number;
  /** Where a phone posts what became of each release (downloaded, applied, confirmed, rolled back, failed); null: no reports. */
  reportUrl: string | null;
}

export interface UpdateFile {
  /** Relative path inside the bundle ("index.html", "icons/a.png", "env.runtime.json"). */
  path: string;
  sha256: string;
  size: number;
}

export type DesktopArch = "arm64" | "x64";

/** The CPU of the desktop apps this machine builds (cargo and bun build for the host). */
export function hostArch(): DesktopArch {
  if (process.arch === "arm64" || process.arch === "x64") return process.arch;
  throw new CliError(`desktop apps are built for arm64 or x64, not ${process.arch}`);
}

export interface UpdateManifest {
  /** 2 for a phone's web bundle, which travels in an UpdateEnvelope; 1 for a desktop app. */
  schema: 1 | 2;
  kind: "web" | "app";
  app: string;
  platform: Platform;
  channel: string;
  /** Web bundles: the native API the bundle needs (UP-3); the app ignores bundles for another one. */
  nativeApi?: string;
  /** Grows with every release (seconds since the epoch at publish time); older or equal ones are ignored. */
  sequence: number;
  /** Directory-safe id of this release. */
  bundle: string;
  runtimeVersion: string;
  /** The app version (app updates) or the version the bundle was built with (web bundles). */
  version: string;
  files: UpdateFile[];
  /** App updates: embeddedSequence of the release's app (updates.json), so it knows it is that release. */
  build?: number;
  /** App updates: the CPU the app is built for. Releases live in `<os>-<arch>/`, and an app takes only its own. */
  arch?: DesktopArch;
  /** App updates: the .app as a gzip tar; `sha256` is the tar's (what deltas produce), `gzSha256` the download's. */
  archive?: { sha256: string; url: string; size: number; gzSha256: string };
  /** App updates: gzip deltas from earlier releases' tars (`from` = that tar's sha256). */
  patches?: { from: string; url: string; sha256: string; size: number }[];
  /** App updates: whether the app carries a server; an installed app refuses a release that differs from itself. */
  server?: boolean;
  /** Web bundles: keyIds the phone stops trusting for good; each listed before the signer's key in its updates.publicKeys. */
  revokeKeys?: string[];
  /** Web bundles: with a new revocation, compare this release with the binary's own bundle instead of the running one. */
  resetSequence?: boolean;
}

/** A phone's `<platform>/<channel>/<nativeApi>.json`: one object, so a new manifest never meets an old signature. */
export interface UpdateEnvelope {
  /** The manifest's exact bytes, base64. */
  manifest: string;
  keyId: string;
  /** Ed25519 over the manifest bytes, base64. */
  signature: string;
}

/** Every file of a web bundle as the app serves it: index.html with the init script and CSP, public/, env.runtime.json. */
export function webFiles(
  webDir: string,
  html: string,
  env: Record<string, string>,
): { path: string; data: Uint8Array }[] {
  const files: { path: string; data: Uint8Array }[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir).sort()) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else {
        const rel = relative(webDir, path);
        files.push({ path: rel, data: rel === "index.html" ? new TextEncoder().encode(html) : readFileSync(path) });
      }
    }
  };
  walk(webDir);
  files.push({ path: "env.runtime.json", data: new TextEncoder().encode(JSON.stringify(env, null, 2)) });
  return files;
}

/** Writes a web bundle's files under `<out>/files/<sha256>` (content-addressed, so releases share them) and lists them. */
export function writeWebBundle(out: string, webDir: string, html: string, env: Record<string, string>): UpdateFile[] {
  mkdirSync(join(out, "files"), { recursive: true });
  return webFiles(webDir, html, env).map(({ path, data }) => {
    const hash = sha256(data);
    const target = join(out, "files", hash);
    if (!existsSync(target)) writeFileSync(target, data);
    return { path, sha256: hash, size: data.length };
  });
}

/** A web bundle's manifest (UP-2), keys in the order `update publish` has always written them. */
export function webManifest(release: {
  app: { id: string; version: string };
  platform: Platform;
  channel: string;
  nativeApi: string;
  sequence: number;
  bundle: string;
  files: UpdateFile[];
  revokeKeys?: string[];
  resetSequence?: boolean;
}): UpdateManifest {
  return {
    schema: 2,
    kind: "web",
    app: release.app.id,
    platform: release.platform,
    channel: release.channel,
    nativeApi: release.nativeApi,
    sequence: release.sequence,
    bundle: release.bundle,
    runtimeVersion: runtimeVersion(),
    version: release.app.version,
    files: release.files,
    ...(release.revokeKeys?.length ? { revokeKeys: release.revokeKeys } : {}),
    ...(release.resetSequence ? { resetSequence: true } : {}),
  };
}

/** Refuses a channel no app could be configured for: it would be written but never taken. */
export function assertChannel(channel: string): void {
  if (isChannelName(channel)) return;
  if (RESERVED_CHANNELS.includes(channel))
    throw new CliError(`channel "${channel}" is a name the update folder already uses: name another`);
  throw new CliError(`channel "${channel}" is not a short lowercase name like "production" or "pilot"`);
}

export function validateUpdates(raw: unknown, problems: string[]): UpdatesConfig | null {
  if (raw === undefined) return null;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    problems.push("updates must be an object like { url, publicKey }");
    return null;
  }
  const r = raw as Record<string, unknown>;
  //? The shells append `/<platform>/…` to the URL as text: a query or fragment would swallow the path.
  if (typeof r.url !== "string" || !/^https?:\/\/[^/?#][^?#]*$/.test(r.url))
    problems.push("updates.url must be an http(s) URL without a query or fragment");
  const publicKeys = updatePublicKeys(r, problems);
  const revokedKeys = updateRevokedKeys(r.revokedKeys, problems);
  if (r.channel !== undefined && (typeof r.channel !== "string" || !isChannelName(r.channel)))
    problems.push('updates.channel must be a short name like "production"');
  if (r.readyTimeout !== undefined && (typeof r.readyTimeout !== "number" || r.readyTimeout < 1000))
    problems.push("updates.readyTimeout must be a number of milliseconds >= 1000");
  const reportUrl = updateReportUrl(r.report, problems);
  for (const key of Object.keys(r))
    if (!["url", "publicKey", "publicKeys", "revokedKeys", "channel", "readyTimeout", "report"].includes(key))
      problems.push(`updates.${key} is not supported`);
  if (publicKeys?.every((key) => revokedKeys.includes(keyIdOf(key))))
    problems.push(
      "updates.revokedKeys revokes every key of updates.publicKeys: a phone built from it would trust none (add one with `akan-native update keygen`)",
    );
  if (typeof r.url !== "string" || !publicKeys) return null;
  return {
    url: withoutTrailingSlashes(r.url),
    publicKeys,
    revokedKeys,
    channel: (r.channel as string | undefined) ?? "production",
    readyTimeout: (r.readyTimeout as number | undefined) ?? 10_000,
    reportUrl,
  };
}

function withoutTrailingSlashes(url: string): string {
  let end = url.length;
  while (end > 0 && url[end - 1] === "/") end -= 1;
  return url.slice(0, end);
}

/** `report: { url }`, posted to as it is: the address is the receiver's, a path of its own included. */
function updateReportUrl(raw: unknown, problems: string[]): string | null {
  if (raw === undefined) return null;
  const url = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>).url : undefined;
  if (typeof url !== "string" || !/^https?:\/\/[^/?#][^#]*$/.test(url) || Object.keys(raw as object).length !== 1) {
    problems.push("updates.report must be { url } with an http(s) URL");
    return null;
  }
  return url;
}

/** keyIds, as `update keygen` prints them, each once, no more than a manifest may revoke. */
function updateRevokedKeys(raw: unknown, problems: string[]): string[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || !raw.every((id) => typeof id === "string" && isUpdateKeyId(id))) {
    problems.push("updates.revokedKeys must list keyIds: 16 lowercase hex characters, as `update keygen` prints them");
    return [];
  }
  if (new Set(raw).size !== raw.length) {
    problems.push("updates.revokedKeys lists a key twice");
    return [];
  }
  if (raw.length > MAX_REVOKE_KEYS) {
    problems.push(`updates.revokedKeys lists more than the ${MAX_REVOKE_KEYS} keys a manifest may revoke`);
    return [];
  }
  return raw as string[];
}

/** `publicKeys` (1–3, no repeats) or the one-key `publicKey`, never both. */
function updatePublicKeys(r: Record<string, unknown>, problems: string[]): string[] | null {
  if (r.publicKey !== undefined && r.publicKeys !== undefined) {
    problems.push("updates takes publicKey or publicKeys, not both");
    return null;
  }
  const keys = r.publicKeys ?? (r.publicKey === undefined ? undefined : [r.publicKey]);
  //? Strict, as iOS decodes it: a key Node and Android would take beside it leaves the iOS binary with no updates.
  const isKey = (key: unknown) =>
    typeof key === "string" && isStrictBase64(key) && Buffer.from(key, "base64").length === 32;
  if (!Array.isArray(keys) || keys.length < 1 || keys.length > 3 || !keys.every(isKey)) {
    problems.push(
      "updates.publicKeys must be 1 to 3 base64 Ed25519 public keys (akan-native update keygen), or publicKey one",
    );
    return null;
  }
  if (new Set(keys.map(keyIdOf)).size !== keys.length) {
    problems.push("updates.publicKeys lists a key twice");
    return null;
  }
  return keys as string[];
}

// ------------------------------------------------------------------ keys

/** What an envelope names its signer by: the first 8 bytes of the raw public key's SHA-256, in hex. */
export const keyIdOf = (publicKey: string) =>
  createHash("sha256").update(Buffer.from(publicKey, "base64")).digest().subarray(0, 8).toString("hex");

/** Where the signing key of an app lives: AKAN_NATIVE_UPDATE_KEY (a file path), else ~/.akan/native/keys/<app id>.update.key. */
export function updateKeyPath(appId: string, env: Record<string, string | undefined> = process.env): string {
  return env.AKAN_NATIVE_UPDATE_KEY ?? join(akanNativeHome(env), "keys", `${appId}.update.key`);
}

/** Creates the Ed25519 key pair; returns the public key for akan-native.config.ts. Never overwrites a key. */
export function generateUpdateKey(path: string): { publicKey: string; created: boolean } {
  if (existsSync(path)) return { publicKey: publicKeyOf(readPrivateKey(path)), created: false };
  const { privateKey } = generateKeyPairSync("ed25519");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
  chmodSync(path, 0o600);
  return { publicKey: publicKeyOf(privateKey), created: true };
}

function readPrivateKey(path: string) {
  if (!existsSync(path)) throw new CliError(`no update signing key at ${path} (run \`akan-native update keygen\`)`);
  return createPrivateKey(readFileSync(path, "utf8"));
}

/** Raw 32 bytes, base64: the last 32 bytes of the SPKI DER. */
function publicKeyOf(privateKey: ReturnType<typeof createPrivateKey>): string {
  const der = createPublicKey(privateKey).export({ type: "spki", format: "der" });
  return der.subarray(der.length - 32).toString("base64");
}

/** The key at `keyPath` and where it sits in `publicKeys`, refused unless the apps were built to trust it. */
export function signingKey(keyPath: string, publicKeys: readonly string[]) {
  const key = readPrivateKey(keyPath);
  const publicKey = publicKeyOf(key);
  const index = publicKeys.indexOf(publicKey);
  if (index < 0) throw new CliError(`the key at ${keyPath} is not one of updates.publicKeys in akan-native.config.ts`);
  return { key, keyId: keyIdOf(publicKey), index };
}

/** A desktop app's base64 signature (protocol v1), with the key the app trusts: the first of updates.publicKeys. */
export function signManifest(bytes: Uint8Array, keyPath: string, publicKeys: readonly string[]): string {
  const { key, index } = signingKey(keyPath, publicKeys);
  if (index !== 0)
    throw new CliError(
      `a desktop app trusts the first of updates.publicKeys only, and the key at ${keyPath} is not it`,
    );
  return sign(null, bytes, key).toString("base64");
}

/** A phone's envelope (protocol v2) for the manifest's exact bytes, signed with any key of `publicKeys`. */
export function sealManifest(bytes: Uint8Array, keyPath: string, publicKeys: readonly string[]): UpdateEnvelope {
  const { key, keyId } = signingKey(keyPath, publicKeys);
  return {
    manifest: Buffer.from(bytes).toString("base64"),
    keyId,
    signature: sign(null, bytes, key).toString("base64"),
  };
}

/**
 * The manifest bytes of an envelope, verified as a phone verifies it against `publicKeys` (minus `revoked`):
 * kernel.ts checkUpdateEnvelope. What it then decides (revocation, sequence) is kernel.ts updateDecision.
 */
export function openEnvelope(
  text: string,
  publicKeys: readonly string[],
  revoked: readonly string[] = [],
): { manifest: Uint8Array; keyId: string } {
  let envelope: unknown;
  try {
    envelope = JSON.parse(text);
  } catch {
    throw new CliError("the update envelope is not JSON");
  }
  const { manifest, keyId, signature } = (
    envelope && typeof envelope === "object" && !Array.isArray(envelope) ? envelope : {}
  ) as Partial<UpdateEnvelope>;
  if (typeof manifest !== "string" || typeof keyId !== "string" || typeof signature !== "string")
    throw new CliError("the update envelope needs manifest, keyId and signature");
  const keys = new Map(publicKeys.map((key) => [keyIdOf(key), key]));
  const opened = checkUpdateEnvelope({ manifest, keyId, signature }, [...keys.keys()], revoked, (bytes, sig, id) => {
    const key = keys.get(id);
    return key !== undefined && verifySignature(bytes, sig, key);
  });
  switch (opened.verdict) {
    case "open":
      return { manifest: opened.manifest, keyId };
    case "untrusted":
    case "revoked":
      throw new CliError(`the update envelope is signed by key ${keyId}, which is not trusted`);
    case "encoding":
      throw new CliError("the update envelope's manifest or signature is not padded standard base64");
    case "too-large":
      throw new CliError("the update envelope's manifest is larger than 1 MiB");
    case "signature":
      throw new CliError("the update envelope's signature does not verify");
  }
}

/** Verifies like the apps do: raw public key, base64 signature over the exact manifest bytes. */
export function verifyManifest(bytes: Uint8Array, signature: string, publicKey: string): boolean {
  return verifySignature(bytes, Buffer.from(signature, "base64"), publicKey);
}

function verifySignature(bytes: Uint8Array, signature: Uint8Array, publicKey: string): boolean {
  const spki = Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(publicKey, "base64")]);
  return verify(null, bytes, createPublicKey({ key: spki, format: "der", type: "spki" }), signature);
}

export const sha256 = (data: Uint8Array | string) => createHash("sha256").update(data).digest("hex");

/**
 * updates.json in a native build (next to boot.json), read by the shell at launch and by the
 * updates plugin. `embeddedSequence` is the build time: a downloaded bundle older than the
 * binary's own is dropped when a new binary is installed (Capacitor drops its live-update path on
 * every new binary: capacitor/android/.../Bridge.java:429-455; here only when it is older).
 */
export function updatesResource(
  updates: UpdatesConfig,
  app: { id: string; version: string },
  platform: Platform,
  nativeApi: string | undefined,
  dev: boolean,
  embeddedSequence = Math.floor(Date.now() / 1000),
): string {
  return JSON.stringify({
    app: app.id,
    version: app.version,
    platform,
    nativeApi: nativeApi ?? null,
    embeddedSequence,
    dev,
    url: updates.url,
    protocol: platform === "ios" || platform === "android" ? 2 : 1,
    publicKeys: platform === "ios" || platform === "android" ? phoneRing(updates) : updates.publicKeys,
    //? A desktop app (protocol v1) reads this one key.
    publicKey: updates.publicKeys[0],
    channel: updates.channel,
    readyTimeout: updates.readyTimeout,
    ...(updates.reportUrl && (platform === "ios" || platform === "android") ? { reportUrl: updates.reportUrl } : {}),
  });
}

/**
 * The keys a phone build trusts: updates.publicKeys without the revoked ones, so a fresh install trusts none of them
 * before its first release tells it. A manifest that revokes a key the binary does not hold is still taken.
 */
export const phoneRing = (updates: Pick<UpdatesConfig, "publicKeys" | "revokedKeys">) =>
  updates.publicKeys.filter((key) => !updates.revokedKeys.includes(keyIdOf(key)));

/**
 * updates.json of a phone build, and the same facts in the build's bundle.json: a signer that registers the store build
 * checks the binary reads its URL and keys, and takes `embeddedSequence` as the floor every release must pass.
 */
export function writePhoneUpdates({
  updatesJson,
  outDir,
  updates,
  app,
  platform,
  nativeApi,
  dev,
}: {
  /** Where the binary reads updates.json. */
  updatesJson: string;
  /** The build folder, whose bundle.json records them too. */
  outDir: string;
  updates: UpdatesConfig;
  app: { id: string; version: string };
  platform: "ios" | "android";
  nativeApi: string | undefined;
  dev: boolean;
}): void {
  const embeddedSequence = Math.floor(Date.now() / 1000);
  writeFileSync(updatesJson, updatesResource(updates, app, platform, nativeApi, dev, embeddedSequence));
  const bundlePath = join(outDir, BUNDLE_FILE);
  if (!existsSync(bundlePath)) return;
  const info = readBundleInfo(bundlePath);
  info.updates = {
    protocol: 2,
    url: updates.url,
    channel: updates.channel,
    keyIds: phoneRing(updates).map(keyIdOf),
    embeddedSequence,
    ...(updates.reportUrl ? { reportUrl: updates.reportUrl } : {}),
  };
  writeFileSync(bundlePath, `${JSON.stringify(info, null, 2)}\n`);
}
