import fs from "node:fs";
import path from "node:path";
import { getEnv } from "akanjs/base";
import { LocalePath, Logger, parseAkanI18nEnv, resolveSubRouteHosts } from "akanjs/common";
import type { BaseBuildArtifact } from "../types";
import { AkanResponse, type WebProxy } from "./types";

export class HostBasePathWebProxy implements WebProxy {
  static readonly refName = "HostBasePathWebProxy";
  #logger = new Logger("HostBasePathWebProxy");
  #domainMap: Map<string, string> | null = null;

  use(request: Bun.BunRequest) {
    const requestUrl = new URL(request.url);
    const basePath = this.#getBasePath(request);
    if (!basePath) return;

    const targetUrl = getProxyTargetUrl(requestUrl);
    const targetPath = targetUrl.pathname;
    const headers = new Headers(request.headers);
    headers.set("x-base-path", basePath);
    if (targetPath === "/sitemap.xml") return AkanResponse.next({ request: { headers } });

    const segments = targetPath.split("/");
    const locale = segments[1];
    if (!locale) return;

    const firstPath = segments[2] ?? "";

    if (firstPath === basePath) {
      if (isInternalProxyRequest(requestUrl)) return AkanResponse.next({ request: { headers } });
      const publicPath = LocalePath.join(locale, `/${segments.slice(3).filter(Boolean).join("/")}`, parseAkanI18nEnv());
      return Response.redirect(new URL(`${publicPath}${targetUrl.search}`, getPublicRequestUrl(request)), 308);
    }

    const internalPath = `/${[locale, basePath, ...segments.slice(2)].filter(Boolean).join("/")}`;
    targetUrl.pathname = internalPath;
    return AkanResponse.rewrite(toProxyRequestUrl(requestUrl, targetUrl), { request: { headers } });
  }

  #getBasePath(request: Request): string | null {
    const host = normalizeHost(
      request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ?? request.headers.get("host"),
    );
    if (!host) return null;
    const domainMap = this.#getDomainMap();
    return domainMap.get(host) ?? null;
  }

  #getDomainMap(): Map<string, string> {
    if (this.#domainMap) return this.#domainMap;
    const metadata = loadWebRouteMetadata();
    const { subRoutes, ignoredBasePaths } = resolveSubRouteHosts({
      subRoutes: metadata.subRoutes,
      basePaths: metadata.basePaths,
      env: process.env.AKAN_SUB_ROUTE_HOSTS,
    });
    warnIgnoredSubRouteBasePaths(this.#logger, ignoredBasePaths);
    const map = new Map<string, string>();
    for (const [basePath, domains] of Object.entries(subRoutes)) {
      for (const domain of domains) map.set(normalizeHost(domain), basePath);
    }
    this.#domainMap = map;
    return map;
  }
}

function loadWebRouteMetadata(): Pick<BaseBuildArtifact, "subRoutes" | "basePaths"> {
  const artifactPath = path.join(resolveArtifactDir(), "base-artifact.json");
  if (!fs.existsSync(artifactPath)) return { subRoutes: {}, basePaths: [] };
  try {
    const parsed = JSON.parse(fs.readFileSync(artifactPath, "utf8")) as Partial<BaseBuildArtifact>;
    return { subRoutes: parsed.subRoutes ?? {}, basePaths: parsed.basePaths ?? [] };
  } catch {
    return { subRoutes: {}, basePaths: [] };
  }
}

export function resolveArtifactDir(): string {
  const localArtifactDir = path.join(process.cwd(), ".akan", "artifact");
  if (fs.existsSync(path.join(localArtifactDir, "base-artifact.json"))) return localArtifactDir;
  return path.join(process.cwd(), "apps", getEnv().appName, ".akan", "artifact");
}

const warnedIgnoredBasePaths = new Set<string>();

export function warnIgnoredSubRouteBasePaths(logger: Logger, ignoredBasePaths: string[]) {
  const list = ignoredBasePaths.join(", ");
  if (!list || warnedIgnoredBasePaths.has(list)) return;
  warnedIgnoredBasePaths.add(list);
  logger.warn(`AKAN_SUB_ROUTE_HOSTS names basePaths this build does not serve, ignoring: ${list}`);
}

export function normalizeHost(host: string | null): string {
  return (host ?? "").toLowerCase().replace(/:\d+$/, "");
}

export function getPublicRequestUrl(request: Bun.BunRequest): URL {
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ?? request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (host) url.host = host;
  if (host && !host.includes(":")) url.port = "";
  if (proto) url.protocol = proto.endsWith(":") ? proto : `${proto}:`;
  return url;
}

function getProxyTargetUrl(requestUrl: URL): URL {
  if (!isInternalProxyRequest(requestUrl)) return new URL(requestUrl);
  const target = requestUrl.searchParams.get("url");
  return target ? new URL(target, requestUrl.origin) : new URL(requestUrl);
}

export function toProxyRequestUrl(requestUrl: URL, targetUrl: URL): URL {
  if (!isInternalProxyRequest(requestUrl)) return targetUrl;
  const rewritten = new URL(requestUrl);
  rewritten.searchParams.set("url", `${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}`);
  return rewritten;
}

export function isInternalProxyRequest(requestUrl: URL): boolean {
  return requestUrl.pathname === "/__rsc";
}
