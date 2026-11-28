// Desktop app updates (UP-1): what `akan-native update publish macos|windows|linux` writes next to the manifest.
//
//   <os>/app/<tar sha256>.tar.gz             the whole app (.app or folder) as a tar (gzip), for any installed version
//   <os>/app/<from>-<to>.delta.gz            delta from the previous release's tar (packages/desktop/src/delta.ts)
//
// An unsigned pack (the API's packAppUpdate) writes the same two under its own folder, the delta from the archive it
// is handed, and `manifest.template.json` for whoever holds the key (lib/updates.ts fillManifest).
//
// Everything here is uploaded, so nothing else is kept here: the next delta starts from the previous release's own
// archive. An earlier publish kept the uncompressed <tar sha256>.tar here, which the next one removes.
//
// Like Electrobun, each release publishes a patch from the release right before it
// (electrobun-v1/package/src/cli/index.ts:3788-3927); an app that is further behind, or has no
// local copy of its own tar, downloads the full archive. /usr/bin/tar keeps modes and the bundle's
// code signature files; --no-mac-metadata leaves out AppleDouble files (xattrs break codesign).
// Windows has bsdtar as tar.exe (since Windows 10), which plugins/updates unpacks with.

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { createDelta } from "../../../desktop/src/delta.ts";
import { runtimeVersion } from "../lib/boot.ts";
import { currentSignal, exec, execOrThrow } from "../lib/exec.ts";
import { CliError, dim, log } from "../lib/log.ts";
import type { BuildContext } from "../lib/prepare.ts";
import { hostArch, sha256, type UpdateEnvelope, type UpdateManifest } from "../lib/updates.ts";
import { type DesktopOs, resourcesOf } from "./desktop.ts";

type Patch = NonNullable<UpdateManifest["patches"]>[number];

/** A release's tar, named by its sha256: what a delta to the next release starts from. */
export interface AppArchive {
  sha256: string;
  tar: Uint8Array;
}

/** A pack's manifest, beside its `app/` or `files/`, with what the signer decides left empty. */
export const PACK_TEMPLATE = "manifest.template.json";

const TAR: Record<DesktopOs, string[]> = {
  macos: ["/usr/bin/tar", "--no-mac-metadata"],
  windows: ["tar.exe"],
  linux: ["tar"],
};

/**
 * The release of `channel` in `dir`: the manifest of its envelope, else the v1 `<channel>.json` of a folder published
 * before protocol v2. Read unverified, as the publisher's own folder.
 */
export function publishedApp(dir: string, channel: string): Partial<UpdateManifest> | null {
  const envelope = join(dir, channel, "app.json");
  if (existsSync(envelope)) {
    const { manifest } = JSON.parse(readFileSync(envelope, "utf8")) as Partial<UpdateEnvelope>;
    return JSON.parse(Buffer.from(manifest ?? "", "base64").toString("utf8") || "{}") as Partial<UpdateManifest>;
  }
  const v1 = join(dir, `${channel}.json`);
  return existsSync(v1) ? (JSON.parse(readFileSync(v1, "utf8")) as Partial<UpdateManifest>) : null;
}

/**
 * An installed app refuses a release whose server presence is not its own (plugins/updates): published, this one would
 * be refused by every app the channel reached, and so would every release after it. A manifest from before the field
 * says nothing and is not compared.
 */
export function assertSameServer(dir: string, channel: string, server: boolean): void {
  const previous = publishedApp(dir, channel);
  if (typeof previous?.server !== "boolean" || previous.server === server) return;
  throw new CliError(
    `the ${channel} release in ${dir} (${previous.bundle}) ${previous.server ? "carries a server and this build does not" : "carries no server and this build does"}, and installed apps refuse a release that differs: publish this build on another channel (updates.channel), or remove ${join(dir, channel)} and ${join(dir, `${channel}.json`)} to start the channel over`,
  );
}

/** The previous release's tar from its published archive, when it is still here and still what it says. */
function previousTar(out: string, previous: Partial<UpdateManifest>): Uint8Array | null {
  const archive = previous.archive;
  const file = archive ? join(out, archive.url) : "";
  if (!archive || !existsSync(file)) return null;
  const tar = Bun.gunzipSync(readFileSync(file));
  return sha256(tar) === archive.sha256 ? tar : null;
}

/** The app as a tar, and its gzip written as `<dir>/<tar sha256>.tar.gz`. */
async function archiveApp(os: DesktopOs, app: string, dir: string, tag: string | number) {
  mkdirSync(dir, { recursive: true });
  const tmp = join(dir, `.build-${tag}.tar`);
  await execOrThrow([...TAR[os], "-cf", tmp, "-C", dirname(app), basename(app)], { echo: false });
  const tar = readFileSync(tmp);
  rmSync(tmp);
  const tarSha = sha256(tar);
  const gz = Bun.gzipSync(tar, { level: 9 });
  writeFileSync(join(dir, `${tarSha}.tar.gz`), gz);
  return { tar, tarSha, gz };
}

/** The gzip delta from `base` to `tar`, written into `dir` as publish names it, and its entry in `patches`. */
function writeDelta(
  dir: string,
  base: AppArchive,
  tarSha: string,
  tar: Uint8Array,
  full: number,
  label: string,
): Patch {
  const started = performance.now();
  const delta = Bun.gzipSync(createDelta(base.tar, tar), { level: 9 });
  const name = `${base.sha256}-${tarSha}.delta.gz`;
  writeFileSync(join(dir, name), delta);
  log.info(
    dim(
      `delta from ${label}: ${(delta.length / 1024).toFixed(0)} KiB instead of ${(full / 1024 / 1024).toFixed(1)} MiB (${Math.round(performance.now() - started)} ms)`,
    ),
  );
  return { from: base.sha256, url: `app/${name}`, sha256: sha256(delta), size: delta.length };
}

function appManifest(
  ctx: BuildContext,
  os: DesktopOs,
  app: string,
  release: { channel: string; sequence: number; bundle: string; patches: Patch[] },
  { tar, tarSha, gz }: Awaited<ReturnType<typeof archiveApp>>,
): UpdateManifest {
  const { config } = ctx.project;
  const resources = resourcesOf(os, app);
  return {
    schema: 1,
    kind: "app",
    app: config.app.id,
    platform: os,
    channel: release.channel,
    sequence: release.sequence,
    bundle: release.bundle,
    runtimeVersion: runtimeVersion(),
    version: config.app.version,
    build: (JSON.parse(readFileSync(join(resources, "updates.json"), "utf8")) as { embeddedSequence: number })
      .embeddedSequence,
    arch: ctx.arch ?? hostArch(),
    files: [{ path: basename(app), sha256: tarSha, size: tar.length }],
    archive: { sha256: tarSha, url: `app/${tarSha}.tar.gz`, size: gz.length, gzSha256: sha256(gz) },
    patches: release.patches,
    server: existsSync(join(resources, "server.json")),
  };
}

export async function publishAppUpdate(
  ctx: BuildContext,
  os: DesktopOs,
  app: string,
  out: string,
  channel: string,
  sequence: number,
): Promise<{ manifest: UpdateManifest; leftovers: string[] }> {
  assertSameServer(out, channel, existsSync(join(resourcesOf(os, app), "server.json")));
  const previous = publishedApp(out, channel);
  const dir = join(out, "app");
  const archive = await archiveApp(os, app, dir, sequence);

  // A delta from the release this channel had before, if its archive is still here.
  const from = previous?.archive?.sha256;
  const base = previous && from && from !== archive.tarSha ? previousTar(out, previous) : null;
  const patches =
    from && base
      ? [
          writeDelta(
            dir,
            { sha256: from, tar: base },
            archive.tarSha,
            archive.tar,
            archive.gz.length,
            `${previous?.bundle}`,
          ),
        ]
      : [];
  const leftovers = readdirSync(dir)
    .filter((name) => /^[0-9a-f]{64}\.tar$/.test(name))
    .map((name) => join(dir, name));
  const bundle = `${ctx.project.config.app.version}-${sequence}`;
  return { manifest: appManifest(ctx, os, app, { channel, sequence, bundle, patches }, archive), leftovers };
}

/**
 * The archive a delta starts from, as a publish or a pack named it (`<tar sha256>.tar.gz`): a file, or a URL of the
 * feed. Refused unless it unpacks to the tar its name says, since a delta from other bytes patches no installed app.
 */
export async function readAppArchive(source: string): Promise<AppArchive> {
  const remote = /^https?:\/\//i.test(source);
  const name = basename(remote ? new URL(source).pathname : source);
  const named = /^([0-9a-f]{64})\.tar\.gz$/.exec(name)?.[1];
  if (!named) throw new CliError(`${source} is not named as a release archive is: <tar sha256>.tar.gz`);
  let gz: Uint8Array<ArrayBuffer>;
  if (remote) {
    const response = await fetch(source, { signal: currentSignal(), redirect: "follow" });
    if (!response.ok) throw new CliError(`${source} answered ${response.status}`);
    gz = await response.bytes();
  } else {
    if (!existsSync(source)) throw new CliError(`${source} does not exist`);
    gz = readFileSync(source);
  }
  let tar: Uint8Array;
  try {
    tar = Bun.gunzipSync(gz);
  } catch {
    throw new CliError(`${source} is not a gzip archive`);
  }
  if (sha256(tar) !== named) throw new CliError(`${source} does not unpack to the tar its name says`);
  return { sha256: named, tar };
}

/** Who signed an app's files: the one an installed copy's updater holds a release to (plugins/updates signer.ts). */
export interface AppSigner {
  /** macOS: the certificate's team. */
  teamId?: string;
  /** Windows: the certificate's SHA-1, as updates.windowsSigners lists it, and its subject when that is plain ASCII. */
  thumbprint?: string;
  subject?: string;
}

const SIGNER = `$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$signature = Get-AuthenticodeSignature -LiteralPath $env:AKAN_NATIVE_SIGNED_EXE
if ("$($signature.Status)" -ceq 'Valid') {
  "akan-signer-thumbprint: $($signature.SignerCertificate.Thumbprint)"
  "akan-signer-subject: $($signature.SignerCertificate.Subject)"
}`;

/**
 * The signer of a built app, read from the app as its updater reads it; null for an app signed ad hoc or not at all,
 * which takes any release. Never the pack's failure: a tool that does not answer leaves no signer named.
 */
export async function appSigner(os: DesktopOs, app: string, fileName: string): Promise<AppSigner | null> {
  try {
    if (os === "macos") {
      const shown = await exec(["/usr/bin/codesign", "--display", "--verbose=2", app], { echo: false });
      const teamId = /^TeamIdentifier=([A-Z0-9]{10})$/m.exec(`${shown.stdout}${shown.stderr}`)?.[1];
      return shown.code === 0 && teamId ? { teamId } : null;
    }
    if (os !== "windows") return null;
    const powershell = join(
      process.env.SystemRoot ?? "C:\\Windows",
      "System32",
      "WindowsPowerShell",
      "v1.0",
      "powershell.exe",
    );
    const encoded = Buffer.from(SIGNER, "utf16le").toString("base64");
    const { code, stdout } = await exec([powershell, "-NoProfile", "-NonInteractive", "-EncodedCommand", encoded], {
      echo: false,
      env: { ...process.env, AKAN_NATIVE_SIGNED_EXE: join(app, `${fileName}.exe`) },
    });
    const thumbprint = code === 0 ? /^akan-signer-thumbprint: ([0-9A-F]{40})\r?$/m.exec(stdout)?.[1] : undefined;
    if (!thumbprint) return null;
    const subject = /^akan-signer-subject: ([\x20-\x7e]+?)\r?$/m.exec(stdout)?.[1];
    return { thumbprint, ...(subject ? { subject } : {}) };
  } catch {
    return null;
  }
}

/**
 * An unsigned release under `out`: the archive, a delta from `previous` when one is given, and the manifest with
 * `channel`, `sequence` and `bundle` left empty in `manifest.template.json`. It names updates.target, as an installed
 * app refuses a release that does not; what a release revokes and when it expires are the signer's to add.
 */
export async function packAppUpdate(
  ctx: BuildContext,
  os: DesktopOs,
  app: string,
  out: string,
  previous?: AppArchive,
): Promise<{ manifest: UpdateManifest; patch: Patch | null }> {
  const dir = join(out, "app");
  const archive = await archiveApp(os, app, dir, process.pid);
  const patch =
    previous && previous.sha256 !== archive.tarSha
      ? writeDelta(dir, previous, archive.tarSha, archive.tar, archive.gz.length, previous.sha256.slice(0, 12))
      : null;
  const target = ctx.project.config.updates?.target;
  const manifest: UpdateManifest = {
    ...appManifest(ctx, os, app, { channel: "", sequence: 0, bundle: "", patches: patch ? [patch] : [] }, archive),
    schema: 2,
    ...(target ? { target } : {}),
  };
  writeFileSync(join(out, PACK_TEMPLATE), `${JSON.stringify(manifest, null, 2)}\n`);
  return { manifest, patch };
}
