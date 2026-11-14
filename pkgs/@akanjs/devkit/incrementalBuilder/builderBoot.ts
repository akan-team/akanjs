import path from "node:path";
import type { App } from "@akanjs/devkit/commandDecorators";
import type { ClientEntryDiscovery } from "@akanjs/devkit/frontendBuild/clientBuildTypes";
import { GraphClientEntryDiscovery } from "@akanjs/devkit/frontendBuild/clientEntryDiscovery";
import { HmrWatcher } from "@akanjs/devkit/frontendBuild/hmrWatcher";
import { WatchRootResolver } from "@akanjs/devkit/frontendBuild/watchRootResolver";
import type { Logger } from "akanjs/common";
import type { BaseBuildArtifact } from "akanjs/server";
import type { OptimizedFonts } from "./buildBatchProtocol";
import type { BuildBatchRunner } from "./buildBatchRunner";
import { BuilderChannel } from "./builderChannel";

export interface IncrementalBuilderOptions {
  app: App;
  artifact: BaseBuildArtifact;
  watch: boolean;
  optimizedFonts: OptimizedFonts;
  discovery: ClientEntryDiscovery;
  initialGeneration?: number;
}

type IncrementalBuilderBootDeps = Pick<IncrementalBuilderOptions, "artifact" | "optimizedFonts" | "discovery">;

export class BuilderBoot {
  // Discovery stays in-process because route builds need it live; it is free at boot, building its graph lazily.
  static async buildBootDeps(app: App, runner: BuildBatchRunner): Promise<IncrementalBuilderBootDeps> {
    const result = await runner.run({
      appName: app.name,
      workspaceRoot: app.workspace.workspaceRoot,
      repoName: app.workspace.repoName,
      generation: 0,
      needs: ["base"],
      changedFiles: [],
      pageKeys: null,
      optimizedFonts: null,
      cssAssets: null,
      artifactDir: path.resolve(`${app.cwdPath}/.akan/artifact`),
    });
    // Throws rather than degrading quietly: `main` catches it to enter degraded watch mode.
    if (result.errors.base) throw new Error(result.errors.base);
    if (!result.artifact || !result.optimizedFonts)
      throw new Error("boot build reported success without an artifact; the build worker likely died");
    const discovery = await GraphClientEntryDiscovery.create(app);
    return { artifact: result.artifact, optimizedFonts: result.optimizedFonts, discovery };
  }

  // A boot compile error must not kill the builder, the dev server's only file watcher: report it, emit builder-ready
  // so the backend keeps the last-good artifact, and retry the boot build on every change.
  static recoverBoot<Builder>(
    app: App,
    bootError: unknown,
    logger: Logger,
    runner: BuildBatchRunner,
    initialGeneration: number,
    create: (options: IncrementalBuilderOptions) => Builder,
  ): Promise<{ builder: Builder; changedFiles: string[] }> {
    const firstMessage = bootError instanceof Error ? bootError.message : String(bootError);
    logger.error(`boot build failed; entering degraded watch mode until the error is fixed: ${firstMessage}`);
    let generation = initialGeneration;
    const sendFailure = (files: string[], message: string) => {
      BuilderChannel.emit({
        type: "build-status",
        data: { generation, phase: "pages", ok: false, files, message: `Boot build failed: ${message}` },
      });
    };
    sendFailure([], firstMessage);
    BuilderChannel.emit({ type: "builder-ready" });
    // Nothing builds until a save fixes the boot, so the next app's boot need not wait for this one.
    BuilderChannel.emit({ type: "boot-armed" });
    return new Promise((resolve, reject) => {
      void (async () => {
        const roots = await new WatchRootResolver(app).resolve();
        const watcher = new HmrWatcher({
          roots,
          logger,
          onBatch: async (batch) => {
            generation += 1;
            const files = [...batch.files].sort();
            try {
              // A broken akan.config.ts caches its import failure; re-import it before rebuilding.
              if (new Set(batch.kinds).has("config")) await app.getConfig({ refresh: true });
              const deps = await BuilderBoot.buildBootDeps(app, runner);
              const builder = create({ app, watch: true, initialGeneration: generation, ...deps });
              watcher.stop();
              logger.info(`boot build recovered generation=${generation}`);
              resolve({ builder, changedFiles: files });
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              logger.error(`boot build retry failed: ${message}`);
              sendFailure(files, message);
            }
          },
        });
        await watcher.start();
        logger.warn(`[degraded] watching ${roots.length} roots for a fix`);
      })().catch(reject);
    });
  }

  //? A replacement builder continues past the host's last generation: from 0, the save fixing an error read older than
  //? the failure the tabs hold, and from that generation itself its arming builds' ok did not read as the fix either.
  static initialGeneration(): number {
    const generation = Number(process.env.AKAN_BUILDER_INITIAL_GENERATION);
    return Number.isInteger(generation) && generation > 0 ? generation + 1 : 0;
  }
}
