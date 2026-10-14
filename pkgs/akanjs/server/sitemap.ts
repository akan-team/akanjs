import type { AkanI18nConfig } from "akanjs/common";
import type { RouteSeedEntry } from "./artifact";

export interface DefaultSitemapOptions {
  origin: string;
  basePath?: string | null;
  entries: RouteSeedEntry[];
  i18n: AkanI18nConfig;
}

export function createSitemapXml(urls: string[]): string {
  const uniqueUrls = [...new Set(urls)].sort();
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...uniqueUrls.flatMap((url) => ["  <url>", `    <loc>${escapeXml(url)}</loc>`, "  </url>"]),
    "</urlset>",
  ];
  return `${lines.join("\n")}\n`;
}

export function createDefaultSitemapXml({ origin, basePath, entries, i18n }: DefaultSitemapOptions): string {
  return createSitemapXml(createDefaultSitemapUrls({ origin, basePath, entries, i18n }));
}

export function createDefaultSitemapUrls({ origin, basePath, entries, i18n }: DefaultSitemapOptions): string[] {
  const normalizedOrigin = origin.replace(/\/+$/, "");
  const normalizedBasePath = normalizeSegment(basePath ?? "");
  const paths = entries.flatMap((entry) => expandStaticRoute(entry.pattern, normalizedBasePath, i18n.locales));
  return paths.map((pathname) => `${normalizedOrigin}${pathname}`);
}

export function isSitemapPath(pathname: string, basePaths: readonly string[]): boolean {
  return normalizePathname(pathname) === "/sitemap.xml";
}

export function getSitemapBasePath(
  pathname: string,
  basePaths: readonly string[],
  headerBasePath?: string | null,
): string | null | undefined {
  const normalized = normalizePathname(pathname);
  if (basePaths.length === 0) return normalized === "/sitemap.xml" ? null : undefined;
  if (normalized !== "/sitemap.xml") return undefined;
  const normalizedHeaderBasePath = normalizeSegment(headerBasePath ?? "");
  return basePaths.map(normalizeSegment).includes(normalizedHeaderBasePath) ? normalizedHeaderBasePath : undefined;
}

function expandStaticRoute(pattern: string, basePath: string, locales: readonly string[]): string[] {
  const segments = pattern.split("/").filter(Boolean);
  const langIndex = segments.indexOf(":lang");
  if (langIndex < 0) return [];
  const hasUnsupportedParam = segments.some((segment, index) => index !== langIndex && segment.startsWith(":"));
  if (hasUnsupportedParam) return [];

  let staticSegments = segments.filter((_, index) => index !== langIndex);
  if (basePath) {
    if (staticSegments[0] !== basePath) return [];
    staticSegments = staticSegments.slice(1);
  }

  return locales.map((locale) => {
    const parts = [locale, ...staticSegments].filter(Boolean);
    return `/${parts.map(encodePathSegment).join("/")}`;
  });
}

function normalizePathname(pathname: string): string {
  const trimmed = pathname.trim().replace(/\/+$/, "");
  return trimmed ? `/${trimmed.replace(/^\/+/, "")}` : "/";
}

function normalizeSegment(value: string): string {
  return value.trim().replace(/^\/+|\/+$/g, "");
}

function encodePathSegment(value: string): string {
  return encodeURIComponent(value).replace(/%2F/gi, "/");
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
