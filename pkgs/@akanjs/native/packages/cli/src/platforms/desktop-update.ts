// Desktop app updates (UP-1): what `akan-native update publish macos|windows|linux` writes next to the manifest.
//
//   <os>/app/<tar sha256>.tar.gz             the whole app (.app or folder) as a tar (gzip), for any installed version
//   <os>/app/<from>-<to>.delta.gz            delta from the previous release's tar (packages/desktop/src/delta.ts)
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
import { execOrThrow } from "../lib/exec.ts";
import { CliError, dim, log } from "../lib/log.ts";
import type { BuildContext } from "../lib/prepare.ts";
import { hostArch, sha256, type UpdateManifest } from "../lib/updates.ts";
import { type DesktopOs, resourcesOf } from "./desktop.ts";

const TAR: Record<DesktopOs, string[]> = {
  macos: ["/usr/bin/tar", "--no-mac-metadata"],
  windows: ["tar.exe"],
  linux: ["tar"],
};

/**
 * An installed app refuses a release whose server presence is not its own (plugins/updates): published, this one would
 * be refused by every app the channel reached, and so would every release after it. A manifest from before the field
 * says nothing and is not compared.
 */
export function assertSameServer(dir: string, channel: string, server: boolean): void {
  const path = join(dir, `${channel}.json`);
  if (!existsSync(path)) return;
  const previous = JSON.parse(readFileSync(path, "utf8")) as Partial<UpdateManifest>;
  if (typeof previous.server !== "boolean" || previous.server === server) return;
  throw new CliError(
    `the ${channel} release in ${dir} (${previous.bundle}) ${previous.server ? "carries a server and this build does not" : "carries no server and this build does"}, and installed apps refuse a release that differs: publish this build on another channel (updates.channel), or remove ${path} to start the channel over`,
  );
}

/** The previous release's tar from its published archive, when it is still here and still what it says. */
function previousTar(out: string, previous: UpdateManifest): Uint8Array | null {
  const archive = previous.archive;
  const file = archive ? join(out, archive.url) : "";
  if (!archive || !existsSync(file)) return null;
  const tar = Bun.gunzipSync(readFileSync(file));
  return sha256(tar) === archive.sha256 ? tar : null;
}

export async function publishAppUpdate(
  ctx: BuildContext,
  os: DesktopOs,
  app: string,
  out: string,
  channel: string,
  sequence: number,
): Promise<{ manifest: UpdateManifest; leftovers: string[] }> {
  const { config } = ctx.project;
  const server = existsSync(join(resourcesOf(os, app), "server.json"));
  assertSameServer(out, channel, server);
  const previousPath = join(out, `${channel}.json`);
  const previous = existsSync(previousPath) ? (JSON.parse(readFileSync(previousPath, "utf8")) as UpdateManifest) : null;
  const dir = join(out, "app");
  mkdirSync(dir, { recursive: true });
  const tmp = join(dir, `.build-${sequence}.tar`);
  await execOrThrow([...TAR[os], "-cf", tmp, "-C", dirname(app), basename(app)], { echo: false });
  const tar = readFileSync(tmp);
  rmSync(tmp);
  const tarSha = sha256(tar);
  const gz = Bun.gzipSync(tar, { level: 9 });
  writeFileSync(join(dir, `${tarSha}.tar.gz`), gz);

  // A delta from the release this channel had before, if its archive is still here.
  const patches: NonNullable<UpdateManifest["patches"]> = [];
  const from = previous?.archive?.sha256;
  const base = previous && from && from !== tarSha ? previousTar(out, previous) : null;
  if (previous && from && base) {
    const started = performance.now();
    const delta = Bun.gzipSync(createDelta(base, tar), { level: 9 });
    const name = `${from}-${tarSha}.delta.gz`;
    writeFileSync(join(dir, name), delta);
    patches.push({ from, url: `app/${name}`, sha256: sha256(delta), size: delta.length });
    log.info(
      dim(
        `delta from ${previous.bundle}: ${(delta.length / 1024).toFixed(0)} KiB instead of ${(gz.length / 1024 / 1024).toFixed(1)} MiB (${Math.round(performance.now() - started)} ms)`,
      ),
    );
  }
  const leftovers = readdirSync(dir)
    .filter((name) => /^[0-9a-f]{64}\.tar$/.test(name))
    .map((name) => join(dir, name));

  const manifest: UpdateManifest = {
    schema: 1,
    kind: "app",
    app: config.app.id,
    platform: os,
    channel,
    sequence,
    bundle: `${config.app.version}-${sequence}`,
    runtimeVersion: runtimeVersion(),
    version: config.app.version,
    build: (
      JSON.parse(readFileSync(join(resourcesOf(os, app), "updates.json"), "utf8")) as { embeddedSequence: number }
    ).embeddedSequence,
    arch: hostArch(),
    files: [{ path: basename(app), sha256: tarSha, size: tar.length }],
    archive: { sha256: tarSha, url: `app/${tarSha}.tar.gz`, size: gz.length, gzSha256: sha256(gz) },
    patches,
    server,
  };
  return { manifest, leftovers };
}
