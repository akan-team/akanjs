import path from "node:path";
import type { RouteJsFileSizes } from "./routeJsBudget";

export interface RouteFilesReportData {
  app: string;
  files: { file: string; rawBytes: number; servedBytes: number }[];
  routes: Record<string, number[]>;
}

const byCodeUnit = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export class RouteFilesReport {
  //? Under `.akan/cache`: the development server clears the rest of `.akan` when it starts.
  static readonly file = ".akan/cache/route-files.json";

  static build(
    app: string,
    modulesByRoute: Record<string, string[]>,
    sizeByUrl: RouteJsFileSizes,
  ): RouteFilesReportData {
    const urls = [...sizeByUrl.keys()].sort(byCodeUnit);
    const indexOf = new Map(urls.map((url, index) => [url, index]));
    const routes = Object.fromEntries(
      Object.entries(modulesByRoute)
        .sort(([a], [b]) => byCodeUnit(a, b))
        .map(([routeId, routeUrls]) => [
          routeId,
          routeUrls.flatMap((url) => indexOf.get(url) ?? []).sort((a, b) => a - b),
        ]),
    );
    return {
      app,
      files: urls.map((url) => ({
        file: url,
        rawBytes: sizeByUrl.get(url)?.raw ?? 0,
        servedBytes: sizeByUrl.get(url)?.brotli ?? 0,
      })),
      routes,
    };
  }

  static async write(appDir: string, report: RouteFilesReportData) {
    const text = `${JSON.stringify({ app: report.app, files: report.files, routes: report.routes })}\n`;
    await Bun.write(path.join(appDir, RouteFilesReport.file), text).catch(() => 0);
  }
}
