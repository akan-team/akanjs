import { parseAkanI18nEnv } from "akanjs/common";
import { AkanResponse } from "./akanResponse";
import type { WebProxy } from "./types";

function getLocale(request: Bun.BunRequest): string {
  const i18n = parseAkanI18nEnv();
  const acceptLanguage = request.headers.get("accept-language");
  if (!acceptLanguage) return i18n.defaultLocale;
  return matchAcceptedLocale(acceptLanguage, i18n.locales, i18n.defaultLocale);
}

function matchAcceptedLocale(acceptLanguage: string, locales: string[], defaultLocale: string): string {
  const localeByLower = new Map(locales.map((locale) => [locale.toLowerCase(), locale]));
  const acceptedLanguages = acceptLanguage
    .split(",")
    .map((part, index) => {
      const [tag = "", ...params] = part.trim().split(";");
      const quality = params
        .map((param) => param.trim())
        .find((param) => param.startsWith("q="))
        ?.slice(2);
      const q = quality === undefined ? 1 : Number(quality);
      return { tag: tag.trim().toLowerCase(), q: Number.isFinite(q) ? q : 0, index };
    })
    .filter(({ tag, q }) => tag.length > 0 && q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index);

  for (const { tag } of acceptedLanguages) {
    if (tag === "*") return defaultLocale;
    const exact = localeByLower.get(tag);
    if (exact) return exact;
    const [language] = tag.split("-");
    const baseMatch = locales.find((locale) => locale.toLowerCase().split("-")[0] === language);
    if (baseMatch) return baseMatch;
  }
  return defaultLocale;
}

export class LocaleWebProxy implements WebProxy {
  static readonly refName = "LocaleWebProxy";

  use(request: Bun.BunRequest) {
    const i18n = parseAkanI18nEnv();
    const requestUrl = new URL(request.url);

    const targetUrl = getProxyTargetUrl(requestUrl);
    const pathname = targetUrl.pathname;
    const pathnameIsMissingLocale = i18n.locales.every(
      (locale) => !pathname.startsWith(`/${locale}/`) && pathname !== `/${locale}`,
    );

    if (
      !isInternalProxyRequest(requestUrl) &&
      !isWellKnownRequest(pathname) &&
      !isApiRequest(pathname) &&
      pathnameIsMissingLocale
    ) {
      return Response.redirect(
        new URL(`/${getLocale(request)}/${pathname.slice(1)}${targetUrl.search}`, getPublicRequestUrl(request)),
        307,
      );
    }

    const splits = pathname.split("/");
    const [, locale = i18n.defaultLocale] = splits;
    const headers = new Headers(request.headers);

    headers.set("x-locale", i18n.locales.includes(locale) ? locale : i18n.defaultLocale);
    headers.set("x-path", `/${splits.slice(2).join("/")}`);

    return AkanResponse.next({ request: { headers } });
  }
}

function getProxyTargetUrl(requestUrl: URL): URL {
  if (requestUrl.pathname !== "/__rsc") return requestUrl;
  const target = requestUrl.searchParams.get("url");
  return target ? new URL(target, requestUrl.origin) : requestUrl;
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

function isInternalProxyRequest(requestUrl: URL): boolean {
  return requestUrl.pathname === "/__rsc";
}

function isWellKnownRequest(pathname: string): boolean {
  return pathname === "/.well-known" || pathname.startsWith("/.well-known/");
}

// API routes must not be locale-redirected: `POST /api/x` should hit the endpoint, not 307 to `/en/api/x`
// (which 404s and makes raw HTTP endpoint checks impossible). Mirrors AkanServer.prefix = "/api".
function isApiRequest(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}
