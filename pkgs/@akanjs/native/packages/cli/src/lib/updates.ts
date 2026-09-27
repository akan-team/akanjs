// Web bundle updates (UP-2) and app updates (UP-1): keys, signed manifests, local serving.
//
// Layout under the update URL (and `akan-native update publish`'s output folder):
//   <platform>/<channel>.json        the manifest (UpdateManifest, JSON)
//   <platform>/<channel>.json.sig    base64 Ed25519 signature of the manifest's exact bytes
//   <platform>/files/<sha256>        web bundle files, content-addressed (unchanged files are shared)
//   macos/app/<sha256>               desktop app archives (UP-1)
//
// The whole manifest is signed, not only the artifact: Tauri signs the artifact and leaves the
// manifest open, then has to compare a signed version string to stop downgrades
// (tauri-plugins-workspace/plugins/updater/src/updater.rs:1661-1708). Here `sequence` inside the
// signed manifest must grow, so an old but validly signed bundle cannot be replayed.

import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Platform } from "../../../core/src/index.ts";
import { CliError } from "./log.ts";
import { akanNativeHome } from "./toolchains.ts";

export interface UpdatesConfig {
  /** Base URL of the update files, e.g. "https://example.com/updates". http:// only for localhost / 10.0.2.2 in dev builds. */
  url: string;
  /** Raw 32-byte Ed25519 public key, base64 (`akan-native update keygen` prints it). */
  publicKey: string;
  /** Manifest name under <platform>/. Default "production". */
  channel: string;
  /** How long a newly applied bundle has to call notifyReady() before it is rolled back, ms. Default 10000. */
  readyTimeout: number;
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
  schema: 1;
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
}

export function validateUpdates(raw: unknown, problems: string[]): UpdatesConfig | null {
  if (raw === undefined) return null;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    problems.push("updates must be an object like { url, publicKey }");
    return null;
  }
  const r = raw as Record<string, unknown>;
  if (typeof r.url !== "string" || !/^https?:\/\/[^/]+/.test(r.url))
    problems.push("updates.url must be an http(s) URL");
  if (typeof r.publicKey !== "string" || Buffer.from(r.publicKey, "base64").length !== 32)
    problems.push("updates.publicKey must be a base64 Ed25519 public key (akan-native update keygen)");
  if (r.channel !== undefined && (typeof r.channel !== "string" || !/^[a-z0-9][a-z0-9._-]{0,40}$/.test(r.channel)))
    problems.push('updates.channel must be a short name like "production"');
  if (r.readyTimeout !== undefined && (typeof r.readyTimeout !== "number" || r.readyTimeout < 1000))
    problems.push("updates.readyTimeout must be a number of milliseconds >= 1000");
  for (const key of Object.keys(r))
    if (!["url", "publicKey", "channel", "readyTimeout"].includes(key))
      problems.push(`updates.${key} is not supported`);
  if (typeof r.url !== "string" || typeof r.publicKey !== "string") return null;
  return {
    url: r.url.replace(/\/+$/, ""),
    publicKey: r.publicKey,
    channel: (r.channel as string | undefined) ?? "production",
    readyTimeout: (r.readyTimeout as number | undefined) ?? 10_000,
  };
}

// ------------------------------------------------------------------ keys

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

export function signManifest(bytes: Uint8Array, keyPath: string, expectedPublicKey: string): string {
  const key = readPrivateKey(keyPath);
  if (publicKeyOf(key) !== expectedPublicKey)
    throw new CliError(`the key at ${keyPath} does not match updates.publicKey in akan-native.config.ts`);
  return sign(null, bytes, key).toString("base64");
}

/** Verifies like the apps do: raw public key, base64 signature over the exact manifest bytes. */
export function verifyManifest(bytes: Uint8Array, signature: string, publicKey: string): boolean {
  const spki = Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(publicKey, "base64")]);
  return verify(
    null,
    bytes,
    createPublicKey({ key: spki, format: "der", type: "spki" }),
    Buffer.from(signature, "base64"),
  );
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
): string {
  return JSON.stringify({
    app: app.id,
    version: app.version,
    platform,
    nativeApi: nativeApi ?? null,
    embeddedSequence: Math.floor(Date.now() / 1000),
    dev,
    url: updates.url,
    publicKey: updates.publicKey,
    channel: updates.channel,
    readyTimeout: updates.readyTimeout,
  });
}
