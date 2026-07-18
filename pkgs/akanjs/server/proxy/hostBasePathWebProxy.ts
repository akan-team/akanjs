import fs from "node:fs";
import path from "node:path";
import { getEnv } from "akanjs/base";
import type { BaseBuildArtifact } from "../types";
import { AkanResponse } from "./akanResponse";
import type { WebProxy } from "./types";

export class HostBasePathWebProxy implements WebProxy {
  static readonly refName = "HostBasePathWebProxy";
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
      const publicPath = `/${[locale, ...segments.slice(3)].filter(Boolean).join("/")}`;
      return Response.redirect(
        new URL(`${publicPath || `/${locale}`}${targetUrl.search}`, getPublicRequestUrl(request)),
        308,
      );
    }

    const internalPath = `/${[locale, basePath, ...segments.slice(2)].filter(Boolean).join("/")}`;
    targetUrl.pathname = internalPath;
    return AkanResponse.rewrite(toProxyRequestUrl(requestUrl, targetUrl), { request: { headers } });
  }

  #getBasePath(request: Request): string | null {
    const host = normalizeHost(request.headers.get("x-forwarded-host") ?? request.headers.get("host"));
    if (!host) return null;
    const domainMap = this.#getDomainMap();
    return domainMap.get(host) ?? null;
  }

  #getDomainMap(): Map<string, string> {
    if (this.#domainMap) return this.#domainMap;
    const subRoutes = loadWebRouteMetadata();
    const map = new Map<string, string>();
    for (const [basePath, domains] of Object.entries(subRoutes)) {
      for (const domain of domains) map.set(normalizeHost(domain), basePath);
    }
    this.#domainMap = map;
    return map;
  }
}

function loadWebRouteMetadata() {
  const artifactPath = path.join(resolveArtifactDir(), "base-artifact.json");
  if (!fs.existsSync(artifactPath)) return { routes: [] };
  try {
    const parsed = JSON.parse(fs.readFileSync(artifactPath, "utf8")) as Partial<BaseBuildArtifact>;
    return parsed.subRoutes ?? {};
  } catch {
    return { routes: [] };
  }
}

function resolveArtifactDir(): string {
  const localArtifactDir = path.join(process.cwd(), ".akan", "artifact");
  if (fs.existsSync(path.join(localArtifactDir, "base-artifact.json"))) return localArtifactDir;
  return path.join(process.cwd(), "apps", getEnv().appName, ".akan", "artifact");
}

function normalizeHost(host: string | null): string {
  return (host ?? "").toLowerCase().replace(/:\d+$/, "");
}

function getPublicRequestUrl(request: Bun.BunRequest): URL {
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto");
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

function toProxyRequestUrl(requestUrl: URL, targetUrl: URL): URL {
  if (!isInternalProxyRequest(requestUrl)) return targetUrl;
  const rewritten = new URL(requestUrl);
  rewritten.searchParams.set("url", `${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}`);
  return rewritten;
}

function isInternalProxyRequest(requestUrl: URL): boolean {
  return requestUrl.pathname === "/__rsc";
}
