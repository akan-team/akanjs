// Desktop app updates (UP-1): what `akan-native update publish macos|windows|linux` writes next to the manifest.
//
//   <os>/app/<tar sha256>.tar.gz             the whole app (.app or folder) as a tar (gzip), for any installed version
//   <os>/app/<from>-<to>.delta.gz            delta from the previous release's tar (packages/desktop/src/delta.ts)
//   <os>/app/<tar sha256>.tar                the uncompressed tar, kept only for the next release's delta
//
// Like Electrobun, each release publishes a patch from the release right before it
// (electrobun-v1/package/src/cli/index.ts:3788-3927); an app that is further behind, or has no
// local copy of its own tar, downloads the full archive. /usr/bin/tar keeps modes and the bundle's
// code signature files; --no-mac-metadata leaves out AppleDouble files (xattrs break codesign).
// Windows has bsdtar as tar.exe (since Windows 10), which plugins/updates unpacks with.

import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { createDelta } from "../../../desktop/src/delta.ts";
import { runtimeVersion } from "../lib/boot.ts";
import { execOrThrow } from "../lib/exec.ts";
import { dim, log } from "../lib/log.ts";
import type { BuildContext } from "../lib/prepare.ts";
import { hostArch, sha256, type UpdateManifest } from "../lib/updates.ts";
import { type DesktopOs, resourcesOf } from "./desktop.ts";

const TAR: Record<DesktopOs, string[]> = {
  macos: ["/usr/bin/tar", "--no-mac-metadata"],
  windows: ["tar.exe"],
  linux: ["tar"],
};

export async function publishAppUpdate(
  ctx: BuildContext,
  os: DesktopOs,
  app: string,
  out: string,
  channel: string,
  sequence: number,
): Promise<UpdateManifest> {
  const { config } = ctx.project;
  const dir = join(out, "app");
  mkdirSync(dir, { recursive: true });
  const tmp = join(dir, `.build-${sequence}.tar`);
  await execOrThrow([...TAR[os], "-cf", tmp, "-C", dirname(app), basename(app)], { echo: false });
  const tar = readFileSync(tmp);
  const tarSha = sha256(tar);
  renameSync(tmp, join(dir, `${tarSha}.tar`));
  const gz = Bun.gzipSync(tar, { level: 9 });
  writeFileSync(join(dir, `${tarSha}.tar.gz`), gz);

  // A delta from the release this channel had before, if its tar is still here.
  const patches: NonNullable<UpdateManifest["patches"]> = [];
  const previousPath = join(out, `${channel}.json`);
  if (existsSync(previousPath)) {
    const previous = JSON.parse(readFileSync(previousPath, "utf8")) as UpdateManifest;
    const from = previous.archive?.sha256;
    const base = from ? join(dir, `${from}.tar`) : "";
    if (from && from !== tarSha && existsSync(base)) {
      const started = performance.now();
      const delta = Bun.gzipSync(createDelta(readFileSync(base), tar), { level: 9 });
      const name = `${from}-${tarSha}.delta.gz`;
      writeFileSync(join(dir, name), delta);
      patches.push({ from, url: `app/${name}`, sha256: sha256(delta), size: delta.length });
      log.info(
        dim(
          `delta from ${previous.bundle}: ${(delta.length / 1024).toFixed(0)} KiB instead of ${(gz.length / 1024 / 1024).toFixed(1)} MiB (${Math.round(performance.now() - started)} ms)`,
        ),
      );
    }
    // Only the newest tar is needed for the next delta.
    if (from && from !== tarSha) rmSync(base, { force: true });
  }

  return {
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
    files: [{ path: basename(app), sha256: tarSha, size: statSync(join(dir, `${tarSha}.tar`)).size }],
    archive: { sha256: tarSha, url: `app/${tarSha}.tar.gz`, size: gz.length, gzSha256: sha256(gz) },
    patches,
  };
}
