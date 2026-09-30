// akan-native update keygen | publish <platform> | serve (UP-1, UP-2): signed releases for
// @akanjs/native/plugins/updates. See packages/cli/src/lib/updates.ts for the layout and the rules.

import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { checkFlags, type ParsedArgs, parseArgs, stringFlag } from "../lib/args.ts";
import { BUNDLE_FILE, readBundleInfo } from "../lib/compat.ts";
import { bold, CliError, dim, log } from "../lib/log.ts";
import { findAppDir, loadProject } from "../lib/project.ts";
import {
  generateUpdateKey,
  hostArch,
  signManifest,
  type UpdateManifest,
  updateKeyPath,
  webManifest,
  writeWebBundle,
} from "../lib/updates.ts";
import { publishAppUpdate } from "../platforms/desktop-update.ts";
import { BOOLEAN_FLAGS, buildFromArgs } from "./build.ts";

export const UPDATE_USAGE =
  "akan-native update keygen [--app <dir>] | akan-native update publish <ios|android|macos|windows|linux> [--app <dir>] [--mode <mode>] [--debug] [--channel <name>] [--out <dir>] | akan-native update serve [--app <dir>] [--out <dir>] [--port <n>]";

const outDir = (args: ParsedArgs, appDir: string) =>
  resolve(stringFlag(args, "out") ?? join(appDir, ".akan", "native", "updates"));

async function keygen(args: ParsedArgs): Promise<number> {
  const project = await loadProject(findAppDir(stringFlag(args, "app") ?? process.cwd()));
  const path = updateKeyPath(project.config.app.id);
  const { publicKey, created } = generateUpdateKey(path);
  if (created)
    log.ok(
      `created the update signing key ${path} ${dim("(keep it private and backed up: without it, installed apps accept no more updates)")}`,
    );
  else log.info(`using the existing key ${path}`);
  log.info(
    `Add to akan-native.config.ts:\n\n  updates: { url: "https://…/updates", publicKey: ${JSON.stringify(publicKey)} },\n`,
  );
  if (project.config.updates && project.config.updates.publicKey !== publicKey)
    log.warn("akan-native.config.ts has a different updates.publicKey");
  return 0;
}

async function publish(args: ParsedArgs): Promise<number> {
  const arg = args.positional[1];
  const desktop = arg === "macos" || arg === "windows" || arg === "linux" ? arg : null;
  if (!desktop && arg !== "ios" && arg !== "android") throw new CliError(`usage: ${UPDATE_USAGE}`, 2);
  const platform = desktop ?? (arg as "ios" | "android");
  const { ctx, artifact } = await buildFromArgs(
    { positional: [platform], flags: args.flags },
    { mode: "production", profile: "release" },
    platform,
  );
  const { config, appDir } = ctx.project;
  if (!config.updates)
    throw new CliError("akan-native.config.ts has no updates: { url, publicKey } (run `akan-native update keygen`)");
  const channel = stringFlag(args, "channel") ?? config.updates.channel;
  // A desktop app runs on one CPU: x64 and arm64 releases of the same OS live side by side.
  const out = join(outDir(args, appDir), desktop ? `${desktop}-${hostArch()}` : platform);
  const keyPath = updateKeyPath(config.app.id);
  const sequence = Math.floor(Date.now() / 1000);

  let manifest: UpdateManifest;
  if (desktop) {
    manifest = await publishAppUpdate(ctx, desktop, artifact, out, channel, sequence);
  } else {
    const info = readBundleInfo(join(ctx.outDir, BUNDLE_FILE));
    const files = writeWebBundle(out, ctx.webDir, ctx.html, ctx.env);
    manifest = webManifest({
      app: config.app,
      platform,
      channel,
      nativeApi: info.nativeApi.hash,
      sequence,
      bundle: `${sequence}-${info.web.hash.slice(0, 8)}`,
      files,
    });
  }
  const bytes = new TextEncoder().encode(`${JSON.stringify(manifest, null, 2)}\n`);
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, `${channel}.json`), bytes);
  writeFileSync(join(out, `${channel}.json.sig`), `${signManifest(bytes, keyPath, config.updates.publicKey)}\n`);
  const size = manifest.files.reduce((n, f) => n + f.size, 0);
  log.ok(
    `published ${bold(manifest.bundle)} to ${relative(process.cwd(), out) || out}/${channel}.json ${dim(`(${manifest.files.length} files, ${(size / 1024).toFixed(0)} KiB${manifest.nativeApi ? `, native API ${manifest.nativeApi}` : ""})`)}`,
  );
  log.info(
    dim(
      `Upload ${relative(process.cwd(), join(out, ".."))} to ${config.updates.url} (or try it with \`akan-native update serve\`).`,
    ),
  );
  return 0;
}

async function serve(args: ParsedArgs): Promise<number> {
  const appDir = findAppDir(stringFlag(args, "app") ?? process.cwd());
  const root = outDir(args, appDir);
  const port = Number(stringFlag(args, "port") ?? 8790);
  const server = Bun.serve({
    port,
    hostname: "0.0.0.0", // the Android emulator reaches the Mac as 10.0.2.2
    fetch(req) {
      const path = decodeURIComponent(new URL(req.url).pathname);
      const file = resolve(root, `.${path}`);
      if (!file.startsWith(root + sep) || !existsSync(file) || statSync(file).isDirectory()) {
        log.info(dim(`404 ${path}`));
        return new Response("not found", { status: 404 });
      }
      log.info(dim(`200 ${path}`));
      return new Response(Bun.file(file), { headers: { "cache-control": "no-store" } });
    },
  });
  log.ok(
    `serving ${relative(process.cwd(), root) || root} at http://localhost:${server.port} ${dim(`(Android emulator: http://10.0.2.2:${server.port})`)}`,
  );
  await new Promise(() => {});
  return 0;
}

export async function update(argv: string[]): Promise<number> {
  const args = parseArgs(argv, BOOLEAN_FLAGS);
  // Updates are release builds; --debug publishes a debug one (trying the update flow with a dev build).
  const known = {
    keygen: ["app"],
    publish: ["app", "mode", "debug", "channel", "out", "skip-web-build"],
    serve: ["app", "out", "port"],
  }[args.positional[0] as string];
  if (known) checkFlags(args, known, UPDATE_USAGE);
  switch (args.positional[0]) {
    case "keygen":
      return keygen(args);
    case "publish":
      return publish(args);
    case "serve":
      return serve(args);
    default:
      throw new CliError(`usage: ${UPDATE_USAGE}`, 2);
  }
}
