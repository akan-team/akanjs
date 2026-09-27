// akan-native build web: static files you can deploy anywhere (docs/architecture.md §3.2).

import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { PluginDecl } from "../../../core/src/index.ts";
import { makeBoot, renderInitScript } from "../lib/boot.ts";
import type { BuildContext } from "../lib/prepare.ts";

export async function buildWeb(ctx: BuildContext): Promise<string> {
  const { outDir, webDir, project } = ctx;
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  cpSync(webDir, outDir, { recursive: true });
  writeFileSync(join(outDir, "index.html"), ctx.html);

  const plugins: Record<string, PluginDecl> = {};
  for (const plugin of project.plugins) {
    if (plugin.manifest.web) plugins[plugin.manifest.id] = "web";
  }
  const boot = makeBoot(project.config, "web", plugins, ctx.dev, project);
  mkdirSync(join(outDir, "__akan_native"), { recursive: true });
  // After deployment, editing this one file changes the runtime env (ENV-4).
  writeFileSync(
    join(outDir, "__akan_native", "init.js"),
    renderInitScript(JSON.stringify(boot), JSON.stringify(ctx.env, null, 2)),
  );
  return outDir;
}
