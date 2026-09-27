// akan-native compat <platform> [--against <bundle.json>] (UP-3): whether the app as it is now needs a new
// binary, or could ship as a web-only update to the binary that bundle.json came from.

import { resolve } from "node:path";
import { resolveAcl } from "../lib/acl.ts";
import { parseArgs, stringFlag } from "../lib/args.ts";
import { runtimeVersion } from "../lib/boot.ts";
import { compatProblems, nativeApi, nativeApiHash, readBundleInfo } from "../lib/compat.ts";
import { bold, CliError, dim, log } from "../lib/log.ts";
import { type NativePlatform, pluginDecls } from "../lib/native-plugins.ts";
import { findAppDir, loadProject } from "../lib/project.ts";

const COMPAT_PLATFORMS: readonly NativePlatform[] = ["macos", "windows", "linux", "ios", "android"];
export const COMPAT_USAGE = `akan-native compat <${COMPAT_PLATFORMS.join("|")}> [--against <bundle.json>] [--app <dir>]`;

export async function compat(argv: string[]): Promise<number> {
  const args = parseArgs(argv);
  const platform = args.positional[0] as NativePlatform | undefined;
  if (!platform || !COMPAT_PLATFORMS.includes(platform)) throw new CliError(`usage: ${COMPAT_USAGE}`, 2);
  const project = await loadProject(findAppDir(stringFlag(args, "app") ?? process.cwd()));
  const decls = pluginDecls(project.plugins, platform);
  const current = nativeApi(
    project,
    platform,
    decls,
    resolveAcl(project.config.capabilities, project.plugins, platform),
    runtimeVersion(),
  );
  const hash = nativeApiHash(current);
  const against = stringFlag(args, "against");
  if (!against) {
    log.info(
      `${platform} native API ${bold(hash)} ${dim(`(runtime ${current.runtime}, ${Object.keys(current.plugins).length} plugins)`)}`,
    );
    log.info(
      dim(
        "Builds write it to .akan/native/build/<platform>/bundle.json; keep the one of each store release for --against.",
      ),
    );
    return 0;
  }
  const shipped = readBundleInfo(resolve(against));
  const where = `${shipped.app.id} ${shipped.app.version} (${shipped.app.build}) ${shipped.nativeApi.hash}`;
  if (shipped.app.id !== project.config.app.id)
    throw new CliError(`${against} is for ${shipped.app.id}, this app is ${project.config.app.id}`);
  const problems = compatProblems(shipped.nativeApi.inputs, current);
  if (!problems.length) {
    log.ok(`compatible with ${where}: a web-only update can run in that binary`);
    return 0;
  }
  log.error(`needs a new app binary: ${where} provides a different native API (now ${hash})`);
  for (const p of problems) log.info(`- ${p}`);
  return 1;
}
