import path from "node:path";
import type { App } from "@akanjs/devkit/commandDecorators";
// Subpath imports only, and as few as possible: this process is spawned once per generation, so every
// eager import is paid on every save. Measured on a 177-route app: `executors` 24ms, `frontendBuild`
// ~110ms, app config 5ms.
import { AppExecutor, WorkspaceExecutor } from "@akanjs/devkit/executors";
import {
  CsrArtifactBuilder,
  CssCompiler,
  FontOptimizer,
  PagesBundleBuilder,
  SsrBaseArtifactBuilder,
} from "@akanjs/devkit/frontendBuild";
import { Logger } from "akanjs/common";
import type { BuilderMessage, BuildPhase } from "akanjs/server";
import type { BuildBatchRequest, BuildBatchResult, OptimizedFonts, PagesBatchCssAssets } from "./buildBatchProtocol";

/**
 * One generation of frontend build work, in a process that exits when it is done.
 *
 * This exists for one reason: `Bun.build` retains native bundler arenas that the process never returns
 * to the OS — `Bun.gc(true)` reclaims nothing and the JS heap stays flat while RSS climbs ~250MB per
 * save. Exit is the only mechanism that gives that memory back, so the work that scales per save lives
 * here rather than in the long-lived watcher.
 *
 * Nothing is cached here, by design. That costs less than it appears to: `CssCompiler` rebuilds its
 * tailwind compilers on every `compileCss` call, and the watcher always asked for `refresh: true`, so
 * there was no warm state to lose. What genuinely had to be preserved travels in the request — the
 * validated page keys and the previous font optimization.
 */
class BuildBatch {
  #logger = new Logger("BuildBatch");
  #request: BuildBatchRequest;
  #app: App;
  #result: BuildBatchResult;
  constructor(request: BuildBatchRequest, app: App) {
    this.#request = request;
    this.#app = app;
    this.#result = { generation: request.generation, errors: {} };
  }

  async run(): Promise<BuildBatchResult> {
    // `base` arrives alone, from a builder that cannot serve anything until it finishes.
    if (this.#request.needs.includes("base")) await this.#buildBase();
    // Ordered the way the watcher used to run them: csr before pages so a csr failure cannot delay the
    // pages bundle the browser is waiting on, and css last because it depends on the rebuilt client.
    if (this.#request.needs.includes("csr")) await this.#buildCsr();
    if (this.#request.needs.includes("pages")) await this.#buildPages();
    if (this.#request.needs.includes("css")) await this.#buildCss();
    return this.#result;
  }

  /**
   * Broadcast as soon as a need finishes rather than when the batch does. The browser is waiting on the
   * pages bundle; making it wait for the css compile behind it would add latency the in-process version
   * never had, and it would move every artifact write into the window right before the watcher reports
   * the generation complete — which is where a save issued immediately afterwards gets dropped by Bun's
   * recursive `fs.watch` (`local/optimize-resource/06-watcher-dropped-event.md`).
   *
   * A bare `process.send` is safe here, unlike in the watcher, for one reason: this process ends by
   * returning from `main`, and a natural exit flushes a pending ipc write (measured: 1MB delivered
   * 20/20). It is `process.exit` that discards one — so adding an explicit exit to this file, at the end
   * of `main` or anywhere after an emit, would silently start dropping `css-updated` payloads. Route
   * sends through `BuilderChannel` if that ever becomes necessary.
   */
  #emit(message: BuilderMessage): void {
    process.send?.(message);
  }

  #emitStatus(phase: BuildPhase, message?: string): void {
    this.#emit({
      type: "build-status",
      data: {
        generation: this.#request.generation,
        phase,
        ok: !message,
        files: this.#request.changedFiles,
        message,
      },
    });
  }

  /**
   * The boot build. Streams nothing: a builder is not serving yet, so there is no phase board to update
   * and no browser to reload — the watcher learns the outcome from the batch result, and a failure there
   * is what puts it into degraded watch mode.
   */
  async #buildBase(): Promise<void> {
    const started = Date.now();
    try {
      const { artifact, optimizedFonts } = await new SsrBaseArtifactBuilder(this.#app).build();
      this.#result.artifact = artifact;
      this.#result.optimizedFonts = optimizedFonts;
      this.#logger.verbose(`base-artifact ok buildId=${artifact.pagesBundleBuildId} (${Date.now() - started}ms)`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.#logger.error(`base-artifact failed: ${message}`);
      this.#result.errors.base = message;
    }
  }

  async #buildCsr(): Promise<void> {
    const started = Date.now();
    try {
      await new CsrArtifactBuilder(this.#app).build();
      this.#logger.verbose(`csr-rebundle ok (${Date.now() - started}ms)`);
      this.#emitStatus("csr");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.#logger.error(`csr-rebundle failed: ${message}`);
      this.#result.errors.csr = message;
      this.#emitStatus("csr", message);
    }
  }

  async #buildPages(): Promise<void> {
    const started = Date.now();
    try {
      const next = await new PagesBundleBuilder(this.#app).build();
      this.#emit({
        type: "pages-updated",
        data: {
          bundlePath: next.bundlePath,
          buildId: next.buildId,
          generation: this.#request.generation,
          changedFiles: this.#request.changedFiles,
        },
      });
      this.#emitStatus("pages");
      this.#logger.verbose(`pages-rebundle ok buildId=${next.buildId} (${Date.now() - started}ms)`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.#logger.error(`pages-rebundle failed: ${message}`);
      this.#result.errors.pages = message;
      this.#emitStatus("pages", message);
    }
  }

  async #buildCss(): Promise<void> {
    const started = Date.now();
    try {
      const cssByBasePath = await new CssCompiler(this.#app).getCssByBasePath({ refresh: true });
      const optimizedFonts = await this.#optimizeFonts();
      const cssAssetEntries: Array<[string, { cssUrl: string; cssRelPath: string }]> = [];
      const cssBase64ByUrl: Record<string, string> = {};
      await Promise.all(
        Object.entries(cssByBasePath).map(async ([basePath, baseCssText]) => {
          const cssText = [baseCssText, optimizedFonts.css].filter(Boolean).join("\n");
          if (!cssText) return;
          const cssAssetName = basePath || "root";
          const cssHash = Bun.hash(`${basePath}\n${cssText}`).toString(36);
          const cssRelPath = `styles/${cssAssetName}-${cssHash}.css`;
          const cssUrl = `/_akan/styles/${cssAssetName}-${cssHash}.css`;
          await Bun.write(path.join(this.#request.artifactDir, cssRelPath), cssText);
          cssAssetEntries.push([basePath, { cssUrl, cssRelPath }]);
          cssBase64ByUrl[cssUrl] = Buffer.from(new TextEncoder().encode(cssText)).toString("base64");
        }),
      );
      const cssAssets = Object.fromEntries(cssAssetEntries) as PagesBatchCssAssets;
      this.#result.cssAssets = cssAssets;
      this.#emitStatus("css");
      if (JSON.stringify(this.#request.cssAssets ?? {}) === JSON.stringify(cssAssets)) {
        this.#logger.verbose("css-rebuild unchanged assets; broadcast skipped");
        return;
      }
      this.#emit({
        type: "css-updated",
        data: {
          cssAssets,
          cssBase64ByUrl,
          generation: this.#request.generation,
          changedFiles: this.#request.changedFiles,
        },
      });
      this.#logger.verbose(`css-compile ok assets=${Object.keys(cssAssets).length} (${Date.now() - started}ms)`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.#logger.error(`css-rebuild failed: ${message}`);
      this.#result.errors.css = message;
      this.#emitStatus("css", message);
    }
  }

  /** Fonts are expensive and rarely change, so the previous result is reused unless this batch touched it. */
  async #optimizeFonts(): Promise<OptimizedFonts> {
    const previous = this.#request.optimizedFonts;
    if (previous && !BuildBatch.#shouldReoptimizeFonts(previous, this.#request.changedFiles)) {
      this.#logger.verbose(`font-optimize cached files=${previous.files.length}`);
      return previous;
    }
    const started = Date.now();
    const optimizedFonts = await new FontOptimizer(this.#app, "start").optimize();
    this.#result.optimizedFonts = optimizedFonts;
    this.#logger.verbose(`font-optimize ok files=${optimizedFonts.files.length} (${Date.now() - started}ms)`);
    return optimizedFonts;
  }

  static #shouldReoptimizeFonts(previous: OptimizedFonts, changedFiles: string[]): boolean {
    if (changedFiles.length === 0) return false;
    return changedFiles.some((file) => {
      const normalized = path.resolve(file);
      if (/\.(woff2?|ttf|otf)$/i.test(normalized)) return true;
      return previous.files.some((fontFile) => path.resolve(fontFile) === normalized);
    });
  }

  static async main(): Promise<void> {
    const raw = process.argv[2];
    if (!raw) throw new Error("[build-batch] missing request argument");
    const request = JSON.parse(raw) as BuildBatchRequest;
    const workspace = WorkspaceExecutor.fromRoot({
      workspaceRoot: request.workspaceRoot,
      repoName: request.repoName,
    });
    const app = AppExecutor.from(workspace, request.appName);
    // Seeded rather than rediscovered: the watcher already globbed and validated every route source,
    // and repeating that here would be the single largest cost of spawning this process.
    if (request.pageKeys) app.setPageKeys(request.pageKeys);
    const result = await new BuildBatch(request, app).run();
    process.send?.({ type: "build-batch-result", data: result });
  }
}

void BuildBatch.main().catch((err) => {
  console.error(err);
  process.exit(1);
});
