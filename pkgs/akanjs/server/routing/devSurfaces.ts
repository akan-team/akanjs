export type DevSurfaceGate = "devtools" | "devBuild";

export interface DevSurface {
  readonly path: string;
  readonly gate: DevSurfaceGate;
  readonly tunnel: "refuse" | "share";
  readonly productionSetting?: string;
}

const devtools = (path: string): DevSurface => ({ path, gate: "devtools", tunnel: "refuse" });

const surfaces: readonly DevSurface[] = [
  devtools("/_akan/devtools"),
  devtools("/_akan/constant"),
  devtools("/_akan/signal"),
  devtools("/_akan/dictionary"),
  devtools("/_akan/deps"),
  devtools("/_akan/studio"),
  { path: "/_akan/hmr", gate: "devBuild", tunnel: "refuse" },
  { path: "/__rsc/manifest", gate: "devBuild", tunnel: "refuse", productionSetting: "AKAN_EXPOSE_RSC_MANIFEST" },
  //? A dev page loads its client modules from these two, so a shared dev page cannot render without them.
  { path: "/_akan/ssr-dev", gate: "devBuild", tunnel: "share" },
  { path: "/_akan/csr-dev", gate: "devBuild", tunnel: "share" },
];

const reservedPrefixes = ["/_akan", "/__rsc", "/__csr"];

const productionRoutes = [
  "/__rsc",
  "/__csr",
  "/_akan/client/*",
  "/_akan/styles/*",
  "/_akan/fonts/*",
  "/_akan/dict/*",
  "/_akan/image",
  "/_akan/app/health",
  "/_akan/app/ready",
  "/_akan/app/metrics",
  "/_akan/app/info",
  "/_akan/app/logs",
  "/_akan/ops/*",
  "/_akan/bench/ping",
];

//? Operator routes answer in production behind their own access check; a share shows the app, never them.
const operatorPaths = ["/_akan/app", "/_akan/ops"];
//? A dev server starts a CSR build for these, so a share refuses them and renders a `?csr=true` page on the server.
const devBuildPaths = ["/__csr"];
const devBuildQuery = "csr";

export class DevSurfaces {
  static readonly all: readonly DevSurface[] = surfaces;
  static readonly reservedPrefixes: readonly string[] = reservedPrefixes;
  static readonly productionRoutes: readonly string[] = productionRoutes;

  static find(pathname: string): DevSurface | null {
    const route = DevSurfaces.#normalize(pathname);
    if (route === null) return null;
    return surfaces.find((surface) => DevSurfaces.#under(route, surface.path)) ?? null;
  }

  static isReserved(key: string): boolean {
    const route = DevSurfaces.#normalize(key) ?? key.replace(/\/{2,}/g, "/").toLowerCase();
    return reservedPrefixes.some((prefix) => DevSurfaces.#under(route, prefix));
  }

  static isProductionRoute(key: string): boolean {
    return productionRoutes.includes(key);
  }

  static refusedThroughTunnel(pathname: string): boolean {
    const route = DevSurfaces.#normalize(pathname);
    if (route === null || route.endsWith(".map")) return true;
    if ([...operatorPaths, ...devBuildPaths].some((path) => DevSurfaces.#under(route, path))) return true;
    return surfaces.some((surface) => surface.tunnel === "refuse" && DevSurfaces.#under(route, surface.path));
  }

  static searchThroughTunnel(search: string): string {
    const params = new URLSearchParams(search);
    if (!params.has(devBuildQuery)) return search;
    params.delete(devBuildQuery);
    const rest = params.toString();
    return rest ? `?${rest}` : "";
  }

  static #normalize(pathname: string): string | null {
    try {
      // Bun's router serves `//_akan/x` as `/_akan/x`, so repeated slashes collapse before the match.
      return decodeURIComponent(pathname)
        .replace(/\/{2,}/g, "/")
        .toLowerCase();
    } catch {
      return null;
    }
  }

  static #under(route: string, path: string) {
    return route === path || route.startsWith(`${path}/`);
  }
}
