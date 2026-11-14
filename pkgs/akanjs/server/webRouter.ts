import fs from "node:fs";
import path from "node:path";
import type { AkanWebConfig } from "akanjs";
import { AkanError } from "akanjs/base";
import { AppHosts, Logger, type LogRecord, resolveSubRouteHosts } from "akanjs/common";
import type { AkanMetricsReport } from "akanjs/service";
import { PageDefinition } from "../client/route/PageDefinition";
import type { PagePromptSource } from "../signal/mcp/pagePrompt";
import {
  type BuilderRpc,
  ModulePreloadPlan,
  RouteClientCache,
  type RouteSeedIndex,
  RouteSeedIndexStore,
  type RoutesManifest,
  RoutesManifestStore,
} from "./artifact";
import type { RouteCacheInvalidation } from "./cachePolicy";
import { resolveDevCsrMode, SSR_DEV_DIRNAME, SSR_DEV_ROUTE_PREFIX } from "./hmr/csrDevManifest";
import { CsrDevShell } from "./hmr/csrDevShell";
import { DevHmrController } from "./hmr/devHmrController";
import type { HmrWsData, HmrWsHub } from "./hmr/wsHub";
import { HtmlResultCache } from "./htmlResultCache";
import { ImageOptimizer } from "./imageOptimizer";
import type { McpAppShellSource } from "./mcp/McpApps";
import { resolveArtifactDir, warnIgnoredSubRouteBasePaths } from "./proxy/hostBasePathWebProxy";
import { RscWorker, type RscWorkerStatus } from "./rscWorkerHost";
import { SessionRefresh } from "./sessionRefresh";
import { SsrFromRscRenderer } from "./ssrFromRscRenderer";
import { type BaseBuildArtifact, type HttpRoutes, type RenderState, resolveWebConfig } from "./types";
import { WebArtifact } from "./webArtifact";
import { WebAssetRoutes } from "./webAssetRoutes";
import { WebCsrSurface } from "./webCsrSurface";
import { WebDocumentRoute } from "./webDocumentRoute";
import { WebRouteContext } from "./webRouteContext";
import { WebRscRoute } from "./webRscRoute";
import { WebSiteFiles } from "./webSiteFiles";
import { WebStaticApp } from "./webStaticApp";
import { WellKnownRoutes } from "./wellKnownRoutes";

export interface SsrRoutesInputs {
  web: AkanWebConfig;
  upgradeHmrWs: (req: Request, data: HmrWsData) => boolean;
}

interface WebRouterOptions {
  artifact: BaseBuildArtifact;
  web: AkanWebConfig;
  cssBytesByUrl: Record<string, Uint8Array>;
  rsc: RscWorker;
  seedIndex: RouteSeedIndex;
  upgradeHmrWs: (req: Request, data: HmrWsData) => boolean;
  /** The production build's route manifest, which the worker was already handed at boot. */
  prebuilt?: RoutesManifest | null;
}

export class WebRouter {
  /** Where the build writes each `.app()`'s view, beside `csr/`: a native app packs `csr/`, which needs none of them. */
  static readonly mcpAppViewDir = "mcp-apps";
  #logger = new Logger("WebRouter");
  #artifactDir = resolveArtifactDir();
  #rsc: RscWorker;
  #hub: HmrWsHub | null = null;
  // `akan start` outranks a stray NODE_ENV=production (a Bun-loaded `.env`, a CI default): its artifact has no
  // routes manifest, so production mode would throw on every request.
  readonly #prodMode = process.env.NODE_ENV === "production" && process.env.AKAN_COMMAND_TYPE !== "start";
  #builderRpc: BuilderRpc | null;
  #devHmr: DevHmrController | null = null;
  /** Dev only: SSR pages load their client code from the dev module registry it serves. */
  #ssrDevShell: CsrDevShell | null = null;
  readonly #context: WebRouteContext;
  readonly #csr: WebCsrSurface;
  readonly #htmlCache: HtmlResultCache;
  readonly #rscRoute: WebRscRoute;
  readonly #document: WebDocumentRoute;
  readonly renderState: RenderState;
  /** What this router actually mounts, already intersected with what the artifact carries. */
  readonly web: AkanWebConfig;
  readonly #prebuilt: RoutesManifest | null;
  constructor({ artifact, web, cssBytesByUrl, rsc, seedIndex, upgradeHmrWs, prebuilt = null }: WebRouterOptions) {
    this.#logger.verbose(`[SSR] loaded ${Object.keys(cssBytesByUrl).length} CSS assets`);
    this.web = web;
    if (process.env.NODE_ENV === "production" && !this.#prodMode)
      this.#logger.warn("[SSR] NODE_ENV=production ignored under `akan start`; serving in dev mode");
    const importMapKey = Bun.hash(JSON.stringify(artifact.vendorMap)).toString(36);
    const { subRoutes, ignoredBasePaths } = resolveSubRouteHosts({
      subRoutes: artifact.subRoutes,
      basePaths: artifact.basePaths,
      env: process.env.AKAN_SUB_ROUTE_HOSTS,
    });
    AppHosts.declare([...artifact.domains, ...Object.values(subRoutes).flat()]);
    warnIgnoredSubRouteBasePaths(this.#logger, ignoredBasePaths);
    this.#rsc = rsc;
    this.renderState = {
      buildId: 0,
      cssAssets: artifact.cssAssets ?? {},
      cssBytesByUrl,
    };
    this.#prebuilt = prebuilt;
    let htmlCache: HtmlResultCache | null = null;
    try {
      let routeCache: RouteClientCache;
      let csrDevShell: CsrDevShell | null = null;
      if (this.#prodMode) {
        this.#builderRpc = null;
        routeCache = new RouteClientCache({
          buildRoute: async (routeId) => {
            throw new AkanError(
              "artifactMissing",
              `[SSR] route ${routeId} missing from production artifact — rebuild with \`akan build\` to include it`,
            );
          },
        });
      } else {
        this.#devHmr = new DevHmrController({
          artifactDir: this.#artifactDir,
          renderState: this.renderState,
          rsc: this.#rsc,
          seedIndex,
          upgradeHmrWs,
          pagesBundlePath: artifact.pagesBundlePath,
        });
        this.#builderRpc = this.#devHmr.builderRpc;
        routeCache = this.#devHmr.routeCache;
        this.#hub = this.#devHmr.hub;
        if (resolveDevCsrMode() === "registry") csrDevShell = new CsrDevShell(this.#artifactDir);
        this.#ssrDevShell = new CsrDevShell(this.#artifactDir, {
          dirName: SSR_DEV_DIRNAME,
          routePrefix: SSR_DEV_ROUTE_PREFIX,
        });
      }
      this.#context = new WebRouteContext({
        artifact,
        prodMode: this.#prodMode,
        renderState: this.renderState,
        subRoutes,
        seedIndex,
        routeCache,
        hub: () => this.#hub,
      });
      this.#csr = new WebCsrSurface(this.#context, { devShell: csrDevShell, builderRpc: () => this.#builderRpc });
      htmlCache = new HtmlResultCache({ prodMode: this.#prodMode, devRegistry: this.#ssrDevShell !== null });
      this.#htmlCache = htmlCache;
      this.#rscRoute = new WebRscRoute(this.#context, { rsc, importMapKey });
      this.#document = new WebDocumentRoute(this.#context, {
        rsc,
        importMapKey,
        ssrDevShell: this.#ssrDevShell,
        htmlCache: this.#htmlCache,
        //? Only a production build lists chunks: a dev page loads its client code from the SSR dev registry.
        modulePreloadPlan: prebuilt?.modulePreloads
          ? new ModulePreloadPlan(prebuilt.modulePreloads, prebuilt.clientManifest)
          : undefined,
      });
    } catch (error) {
      //? The worker stays the caller's: create() kills it when construction throws.
      this.#devHmr?.dispose();
      htmlCache?.dispose();
      throw error;
    }
  }

  async initializeRoute() {
    const context = this.#context;
    if (this.#prebuilt) context.routeCache.seed(this.#prebuilt);

    const localCsrDir = path.join(process.cwd(), "csr");
    const csrOutputDir = fs.existsSync(localCsrDir) ? localCsrDir : path.join(this.#artifactDir, "csr");
    const publicDir = path.join(process.env.AKAN_APP_DIR ?? path.dirname(Bun.main), "public");
    const siteFiles = new WebSiteFiles(context, { rsc: this.#rsc, publicDir });
    const imageOptimizer = new ImageOptimizer({
      publicDir,
      cacheDir: path.join(this.#artifactDir, "image-cache"),
      prodMode: this.#prodMode,
      config: context.artifact.imageConfig,
    });

    const renderEnvRoutes: HttpRoutes = {
      ...(this.web.csr ? this.#csr.routes(csrOutputDir) : {}),
      ...(this.#ssrDevShell
        ? {
            [`${SSR_DEV_ROUTE_PREFIX}*`]: async (req: Request) => {
              context.stats.staticAsset += 1;
              return (await this.#ssrDevShell?.serve(req)) ?? new Response("Not Found", { status: 404 });
            },
          }
        : {}),
      ...WebAssetRoutes.build(context, { artifactDir: this.#artifactDir, imageOptimizer }),
      ...(!this.#prodMode
        ? {
            "/_akan/hmr": (req: Request) =>
              this.#devHmr?.handleWs(req) ?? new Response("HMR unavailable", { status: 404 }),
          }
        : {}),
      ...this.#rscRoute.routes(),
      ...WellKnownRoutes.build(context.artifact, this.#prodMode),
      "/*": SessionRefresh.answering(async (req) => {
        const url = new URL(req.url);
        if (url.pathname.endsWith("/_akan/image")) {
          context.stats.image += 1;
          return imageOptimizer.handle(req);
        }
        if (this.web.csr) {
          const csrResponse = await this.#csr.answer(req, url, csrOutputDir);
          if (csrResponse) return csrResponse;
        }
        const siteFile = await siteFiles.answer(req, url);
        if (siteFile) return siteFile;
        return await this.#document.render(req, url);
      }),
    };
    return { renderEnvRoutes, hmrHub: this.#hub, builderRpc: this.#builderRpc };
  }
  get builderRpc(): BuilderRpc | null {
    return this.#builderRpc;
  }
  refreshHmrState(): void {
    this.#devHmr?.refreshRegistryState();
  }
  hmrBuildErrors(): { phase: string }[] {
    return this.#devHmr?.buildErrorMessages() ?? [];
  }
  dispose() {
    this.#devHmr?.dispose();
    this.#devHmr = null;
    this.#builderRpc = null;
    this.#htmlCache.dispose();
    this.#rsc.kill();
    this.#hub = null;
  }
  setLogLevel(minSev: number | null) {
    this.#rsc.setLogLevel(minSev);
  }

  pagePrompts(): PagePromptSource {
    const staticApps = new WebStaticApp(this.#context, () => this.#rsc);
    return {
      list: () => this.#rsc.listPagePrompts(),
      visible: (input) => this.#rsc.visiblePagePrompts(input),
      run: (input) => this.#rsc.runPagePrompt(input),
      render: (input) => staticApps.render(input),
    };
  }

  /** Each `.app()`'s single-file view, which `akan build` writes beside the CSR shell. */
  mcpAppShell(): McpAppShellSource | undefined {
    if (!this.web.csr) return undefined;
    const localDir = path.join(process.cwd(), WebRouter.mcpAppViewDir);
    const viewDir = fs.existsSync(localDir) ? localDir : path.join(this.#artifactDir, WebRouter.mcpAppViewDir);
    //? Keyed on mtime: a view is a single-file build of a megabyte, a dev rebuild replaces it, and a stat costs nothing.
    const views = new Map<string, { stamp: number; html: string }>();
    return {
      read: async (app) => {
        if (!PageDefinition.promptName.test(app)) return null;
        const viewPath = path.join(viewDir, `${app}.html`);
        if (this.#csr.devShell) await this.#csr.buildMcpAppViews();
        else if (!fs.existsSync(viewPath)) await this.#csr.armArtifact("mcp app view");
        const file = Bun.file(viewPath);
        if (!(await file.exists())) return null;
        const cached = views.get(app);
        if (cached?.stamp === file.lastModified) return cached.html;
        const html = await file.text();
        views.set(app, { stamp: file.lastModified, html });
        return html;
      },
    };
  }

  onLogRecords(listener: (records: LogRecord[], dropped: number) => void) {
    this.#rsc.onLogRecords = listener;
  }

  get rscWorkerStatus(): RscWorkerStatus {
    return this.#rsc.status;
  }

  getMetrics(): AkanMetricsReport {
    const ssrStats = SsrFromRscRenderer.getChunkRegistryStats();
    const stats = this.#context.stats;
    return {
      ...this.#rsc.getMetrics(),
      ssrChunkRegistrySize: ssrStats.ssrChunkRegistrySize,
      ssrChunkLoadCount: ssrStats.ssrChunkLoadCount,
      ssrChunkCacheHitCount: ssrStats.ssrChunkCacheHitCount,
      ssrChunkEvictionCount: ssrStats.ssrChunkEvictionCount,
      httpFullSsrCount: stats.fullSsr,
      httpRscNavigationCount: stats.rscNavigation,
      httpRscPrefetchCount: stats.rscPrefetch,
      httpStaticAssetCount: stats.staticAsset,
      httpCsrCount: stats.csr,
      httpImageCount: stats.image,
      ...this.#htmlCache.metrics(),
    };
  }

  invalidateRouteCaches(invalidation?: string | RouteCacheInvalidation): void {
    this.#htmlCache.invalidate(invalidation);
    this.#rsc.invalidateRouteResultCache(invalidation);
  }

  /** `null` when the build has no web artifact (an api-only build, or no `page/`): boot without a web surface. */
  static async create({ web, upgradeHmrWs }: SsrRoutesInputs): Promise<WebRouter | null> {
    const artifactDir = resolveArtifactDir();
    const artifactFile = Bun.file(path.join(artifactDir, "base-artifact.json"));
    if (!(await artifactFile.exists())) return null;
    const artifact = WebArtifact.normalize((await artifactFile.json()) as BaseBuildArtifact, artifactDir);
    const builtWeb = resolveWebConfig(artifact.web);
    if (!builtWeb.ssr) return null;
    const cssBytesByUrl = await WebArtifact.loadCssBytesByUrl(artifact, artifactDir);
    await WebArtifact.seedDictionaries(artifact, artifactDir);
    const prodMode = process.env.NODE_ENV === "production" && process.env.AKAN_COMMAND_TYPE !== "start";
    //* Production listens before the bundle loads (renders queue until `ready`) and exits if it cannot load rather
    //* than restart-loop behind a healthy API; dev awaits, as the next rebuild hands the worker a fixed bundle.
    //? The prebuilt route manifest rides the worker's first init: a reload onto it would wait for `ready`, and so would
    //? `listen`.
    const prebuilt = prodMode ? await RoutesManifestStore.read(artifactDir) : null;
    const rsc = new RscWorker(
      prebuilt
        ? {
            ...artifact,
            rscRuntimeClientManifest: { ...artifact.rscRuntimeClientManifest, ...prebuilt.clientManifest },
          }
        : artifact,
      { failBeforeReady: prodMode },
    );
    if (prodMode)
      void rsc.ready.catch((error: unknown) => {
        new Logger("WebRouter").error(`RSC worker failed to load the pages bundle: ${String(error)}`);
        process.exit(1);
      });
    try {
      if (!prodMode) await rsc.ready;
      const seedIndex = await RouteSeedIndexStore.load(artifactDir);
      return new WebRouter({
        artifact,
        web: { ssr: true, csr: web.csr && builtWeb.csr },
        cssBytesByUrl,
        rsc,
        seedIndex,
        upgradeHmrWs,
        prebuilt,
      });
    } catch (error) {
      rsc.kill();
      throw error;
    }
  }
}
