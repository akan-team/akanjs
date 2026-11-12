import { assetHeaders, missingAssetResponse } from "./assetHeaders";
import type { ImageOptimizer } from "./imageOptimizer";
import { resolveStaticPath } from "./staticPath";
import type { HttpRoutes } from "./types";
import { WebRouteContext } from "./webRouteContext";

interface WebAssetRoutesOptions {
  artifactDir: string;
  imageOptimizer: ImageOptimizer;
}

export class WebAssetRoutes {
  static build(context: WebRouteContext, { artifactDir, imageOptimizer }: WebAssetRoutesOptions): HttpRoutes {
    const clientServePrefix = `/_akan/client`;
    const clientOutputDir = `${artifactDir}/client`;
    const dictServePrefix = "/_akan/dict";
    const dictOutputDir = `${artifactDir}/dict`;
    const stylesServePrefix = "/_akan/styles";
    const stylesOutputDir = `${artifactDir}/styles`;
    const fontsServePrefix = "/_akan/fonts";
    const fontsOutputDir = `${artifactDir}/fonts`;
    const { stats, prodMode } = context;
    return {
      [`${clientServePrefix}/*`]: async (req) => {
        stats.staticAsset += 1;
        const url = new URL(req.url);
        const filePath = resolveStaticPath(clientOutputDir, url.pathname.slice(clientServePrefix.length + 1));
        if (!filePath) return missingAssetResponse();
        return WebRouteContext.fileResponse(req, filePath, {
          contentType: Bun.file(filePath).type || "application/javascript",
          cacheControl: prodMode ? "public, max-age=31536000, immutable" : "no-store",
        });
      },
      [`${stylesServePrefix}/*`]: (req) => {
        stats.staticAsset += 1;
        const url = new URL(req.url);
        if (prodMode) {
          const filePath = resolveStaticPath(stylesOutputDir, url.pathname.slice(`${stylesServePrefix}/`.length));
          if (filePath) {
            return WebRouteContext.fileResponse(req, filePath, {
              contentType: "text/css; charset=utf-8",
              cacheControl: "public, max-age=31536000, immutable",
            });
          }
        }
        const cssBytes = context.renderState.cssBytesByUrl[url.pathname];
        if (!cssBytes) return new Response("Not Found", { status: 404 });
        const headers = assetHeaders({
          contentType: "text/css; charset=utf-8",
          cacheControl: "no-store",
        });
        return new Response(
          cssBytes.buffer.slice(cssBytes.byteOffset, cssBytes.byteOffset + cssBytes.byteLength) as ArrayBuffer,
          { headers },
        );
      },
      [`${fontsServePrefix}/*`]: (req) => {
        stats.staticAsset += 1;
        const url = new URL(req.url);
        const filePath = resolveStaticPath(fontsOutputDir, url.pathname.slice(`${fontsServePrefix}/`.length));
        if (!filePath) return new Response("Not Found", { status: 404 });
        return WebRouteContext.fileResponse(req, filePath, {
          contentType: Bun.file(filePath).type || "font/woff2",
          cacheControl: prodMode ? "public, max-age=31536000, immutable" : "no-store",
          anyOrigin: true,
        });
      },
      [`${dictServePrefix}/*`]: (req) => {
        stats.staticAsset += 1;
        const url = new URL(req.url);
        const filePath = resolveStaticPath(dictOutputDir, url.pathname.slice(`${dictServePrefix}/`.length));
        if (!filePath) return new Response("Not Found", { status: 404 });
        return WebRouteContext.fileResponse(req, filePath, {
          contentType: "text/javascript; charset=utf-8",
          cacheControl: prodMode ? "public, max-age=31536000, immutable" : "no-store",
        });
      },
      "/_akan/image": (req) => {
        stats.image += 1;
        return imageOptimizer.handle(req);
      },
    };
  }
}
