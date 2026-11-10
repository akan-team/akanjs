import fs from "node:fs";
import path from "node:path";
import { type AkanI18nConfig, parseAkanI18nEnv } from "akanjs/common";
import { getWebManifestBasePath } from "../client/webManifest";
import { getClientFacingOrigin } from "./cachePolicy";
import { createDefaultRobotsTxt } from "./robots";
import type { RscWorker } from "./rscWorkerHost";
import { createDefaultSitemapXml, getSitemapBasePath } from "./sitemap";
import { resolveStaticPath, staysInTree } from "./staticPath";
import { getPathnameLocale } from "./systemPageDocument";
import { createSubRouteIndexResponse } from "./systemPages";
import { WebRouteContext } from "./webRouteContext";

interface WebSiteFilesOptions {
  rsc: RscWorker;
  publicDir: string;
}

export class WebSiteFiles {
  readonly #context: WebRouteContext;
  readonly #rsc: RscWorker;
  readonly #publicDir: string;
  readonly #shippedPublicFiles: Set<string> | null;

  constructor(context: WebRouteContext, { rsc, publicDir }: WebSiteFilesOptions) {
    this.#context = context;
    this.#rsc = rsc;
    this.#publicDir = publicDir;
    this.#shippedPublicFiles = context.prodMode ? WebSiteFiles.#shippedFiles(publicDir) : null;
  }

  async answer(req: Request, url: URL): Promise<Response | null> {
    const context = this.#context;
    const { artifact, prodMode } = context;
    const filePath = resolveStaticPath(this.#publicDir, url.pathname);
    if (filePath && (await WebSiteFiles.#isPublicFile(filePath, url.pathname, this.#shippedPublicFiles))) {
      context.stats.staticAsset += 1;
      const contentType = Bun.file(filePath).type || "application/octet-stream";
      return WebRouteContext.fileResponse(req, filePath, {
        contentType,
        //? Unversioned paths: a short max-age lets a replaced file show, SWR keeps repeat views off the network.
        cacheControl: prodMode ? "public, max-age=300, stale-while-revalidate=86400" : "no-store",
        anyOrigin: contentType.startsWith("font/"),
      });
    }

    if (url.pathname === "/robots.txt") {
      return new Response(createDefaultRobotsTxt(), {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": prodMode ? "public, max-age=3600" : "no-store",
        },
      });
    }

    const manifestBasePath = getWebManifestBasePath(url.pathname, artifact.basePaths, context.requestBasePath(req));
    if (manifestBasePath !== undefined) {
      const manifestResponse = await this.#webManifestResponse(manifestBasePath);
      if (manifestResponse) return manifestResponse;
    }

    const sitemapBasePath = getSitemapBasePath(url.pathname, artifact.basePaths, context.requestBasePath(req));
    if (sitemapBasePath !== undefined) {
      return new Response(
        createDefaultSitemapXml({
          origin: getClientFacingOrigin(req),
          basePath: sitemapBasePath,
          entries: context.seedIndex.entries,
          i18n: parseAkanI18nEnv(),
        }),
        {
          headers: {
            "Content-Type": "application/xml; charset=utf-8",
            "Cache-Control": prodMode ? "public, max-age=3600" : "no-store",
          },
        },
      );
    }

    const subRouteIndex = this.#localSubRouteIndexResponse(req, url);
    if (subRouteIndex) return await subRouteIndex;
    return null;
  }

  async #webManifestResponse(basePath: string | null): Promise<Response | null> {
    try {
      const manifest = await this.#rsc.webManifest(basePath);
      if (!manifest) return null;
      return new Response(JSON.stringify(manifest), {
        headers: {
          "Content-Type": "application/manifest+json; charset=utf-8",
          "Cache-Control": this.#context.prodMode ? "public, max-age=3600" : "no-store",
        },
      });
    } catch (err) {
      this.#context.logger.warn(
        `web manifest unavailable basePath=${basePath ?? "(root)"}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return new Response("Service Unavailable", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
      });
    }
  }

  // A subRoutes build has no root page (routes live under `page/<basePath>`), so local dev serves a basePath picker;
  // deployed hosts never get here, HostBasePathWebProxy rewrites the root first.
  #localSubRouteIndexResponse(req: Request, url: URL): Promise<Response> | null {
    const { artifact } = this.#context;
    if (process.env.AKAN_PUBLIC_ENV !== "local" || !artifact.basePaths.length) return null;
    if (!WebSiteFiles.#isSiteRootPathname(url.pathname, artifact.i18n)) return null;
    return createSubRouteIndexResponse({
      method: req.method,
      locale: getPathnameLocale(url.pathname, artifact.i18n),
      basePaths: artifact.basePaths,
      subRoutes: this.#context.subRoutes,
    });
  }

  static #isSiteRootPathname(pathname: string, i18n: AkanI18nConfig): boolean {
    const segments = pathname.split("/").filter(Boolean);
    if (!segments.length) return true;
    return segments.length === 1 && i18n.locales.includes(segments[0] ?? "");
  }

  //? A production `public/` is what the build shipped, so an extensionless path, which is a page, is answered from the
  //? list made at boot; a path with an extension is still checked on disk, so a file written there at runtime is served.
  static async #isPublicFile(filePath: string, pathname: string, shipped: Set<string> | null) {
    if (shipped && !path.extname(pathname)) return shipped.has(filePath);
    return await Bun.file(filePath).exists();
  }

  static #shippedFiles(dir: string): Set<string> {
    const files = new Set<string>();
    if (!fs.existsSync(dir)) return files;
    const scan = new Bun.Glob("**/*").scanSync({ cwd: dir, onlyFiles: true, dot: true, followSymlinks: true });
    for (const relative of scan) {
      const filePath = path.resolve(dir, relative);
      if (staysInTree(dir, filePath)) files.add(filePath);
    }
    return files;
  }
}
