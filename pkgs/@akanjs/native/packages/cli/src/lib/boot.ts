// /__akan_native/init.js (docs/architecture.md §3.1).
//
// The script is `INIT_PREFIX + <boot JSON> + "," + <env JSON> + INIT_SUFFIX`.
// Native hosts build the same text by concatenating the bundled boot.json and
// env.runtime.json files, so they never parse or re-encode JSON (ENV-4: replacing
// env.runtime.json is enough to change the runtime env).

import type { Platform, PluginDecl, ResolvedAcl } from "../../../core/src/index.ts";
import { BRIDGE_FEATURES } from "../../../core/src/protocol.ts";
import { VERSION } from "../../../core/src/version.ts";
import { resolveAcl } from "./acl.ts";
import { nativeApi, nativeApiHash, writeBundleInfo } from "./compat.ts";
import { type NativePlatform, pluginDecls } from "./native-plugins.ts";
import type { BuildContext } from "./prepare.ts";
import type { Project, ResolvedConfig } from "./project.ts";

export { INIT_PREFIX, INIT_SUFFIX, renderInitScript } from "../../../core/src/protocol.ts";

export interface BootData {
  v: 1;
  platform: Platform;
  runtimeVersion: string;
  dev: boolean;
  app: { id: string; name: string; version: string; build: number };
  plugins: Record<string, PluginDecl>;
  /** Resolved capabilities (PL-11): the host enforces them before dispatching a call. */
  acl?: ResolvedAcl;
  /** Native builds: what web bundles this binary can run (UP-3, lib/compat.ts). */
  nativeApi?: string;
  /** Native builds: what the hosts speak beyond bridge protocol v1 (architecture.md §4). */
  bridge?: { features: string[] };
}

/** Without `project` there is no ACL (everything allowed), as in unit tests of other parts. */
export function makeBoot(
  config: ResolvedConfig,
  platform: Platform,
  plugins: Record<string, PluginDecl>,
  dev: boolean,
  project?: Project,
): BootData {
  const acl = project ? resolveAcl(config.capabilities, project.plugins, platform) : undefined;
  return {
    v: 1,
    platform,
    runtimeVersion: runtimeVersion(),
    dev,
    app: { id: config.app.id, name: config.app.name, version: config.app.version, build: config.app.build },
    plugins,
    ...(acl ? { acl } : {}),
    ...(project && platform !== "web"
      ? { nativeApi: nativeApiHash(nativeApi(project, platform, plugins, acl, runtimeVersion())) }
      : {}),
    ...(platform !== "web" ? { bridge: { features: [...BRIDGE_FEATURES] } } : {}),
  };
}

/** boot.json of a native build, with <outDir>/bundle.json written next to the build (UP-3). */
export function makeNativeBoot(ctx: BuildContext, platform: NativePlatform): BootData {
  const { project } = ctx;
  const decls = pluginDecls(project.plugins, platform);
  const boot = makeBoot(project.config, platform, decls, ctx.dev, project);
  writeBundleInfo(
    ctx.outDir,
    project,
    platform,
    boot.runtimeVersion,
    nativeApi(project, platform, decls, boot.acl, boot.runtimeVersion),
    ctx.webDir,
    ctx.html,
  );
  return boot;
}

/** The runtime version (UP-3, packages/core/src/version.ts). */
export function runtimeVersion(): string {
  return VERSION;
}
