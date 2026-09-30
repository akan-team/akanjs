// A signed release for @akanjs/native/plugins/updates (UP-1, UP-2) from a finished release build: `akan-native
// update publish` and the API's publishUpdate() both end here. The layout and its rules are in lib/updates.ts.

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { publishAppUpdate } from "../platforms/desktop-update.ts";
import { runtimeVersion } from "./boot.ts";
import { BUNDLE_FILE, readBundleInfo } from "./compat.ts";
import { CliError, log } from "./log.ts";
import type { BuildContext } from "./prepare.ts";
import {
  assertChannel,
  hostArch,
  sha256,
  signManifest,
  type UpdateFile,
  type UpdateManifest,
  updateKeyPath,
} from "./updates.ts";

export type ReleasePlatform = "macos" | "windows" | "linux" | "ios" | "android";

export interface PublishedRelease {
  /** `<out>/<os>-<arch>` for a desktop app, `<out>/<platform>` for a phone's web bundle. */
  dir: string;
  manifest: UpdateManifest;
}

/** Every file of a web bundle as the app serves it: index.html with the init script and CSP, public/, env.runtime.json. */
function webFiles(webDir: string, html: string, env: Record<string, string>): { path: string; data: Uint8Array }[] {
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
  const dir = join(out, desktop ? `${desktop}-${hostArch()}` : platform);
  assertChannel(channel);
  const keyPath = updateKeyPath(config.app.id);
  const sequence = nextSequence(dir, channel);

  let manifest: UpdateManifest;
  if (desktop) {
    manifest = await publishAppUpdate(ctx, desktop, artifact, dir, channel, sequence);
  } else {
    const info = readBundleInfo(join(ctx.outDir, BUNDLE_FILE));
    mkdirSync(join(dir, "files"), { recursive: true });
    const files: UpdateFile[] = webFiles(ctx.webDir, ctx.html, ctx.env).map(({ path, data }) => {
      const hash = sha256(data);
      const target = join(dir, "files", hash);
      if (!existsSync(target)) writeFileSync(target, data);
      return { path, sha256: hash, size: data.length };
    });
    manifest = {
      schema: 1,
      kind: "web",
      app: config.app.id,
      platform,
      channel,
      nativeApi: info.nativeApi.hash,
      sequence,
      bundle: `${sequence}-${info.web.hash.slice(0, 8)}`,
      runtimeVersion: runtimeVersion(),
      version: config.app.version,
      files,
    };
  }
  const bytes = new TextEncoder().encode(`${JSON.stringify(manifest, null, 2)}\n`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${channel}.json`), bytes);
  writeFileSync(join(dir, `${channel}.json.sig`), `${signManifest(bytes, keyPath, config.updates.publicKey)}\n`);
  return { dir, manifest };
}
