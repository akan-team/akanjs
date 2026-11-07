import { getApiPrefix } from "akanjs/base";
import { LocalePath, parseAkanI18nEnv } from "akanjs/common";
import { getPublicRequestUrl, isInternalProxyRequest, toProxyRequestUrl } from "./hostBasePathWebProxy";
import { AkanResponse, type WebProxy } from "./types";

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
    const isInternal = isInternalProxyRequest(requestUrl);
    const isPage = !isInternal && !isWellKnownRequest(pathname) && !isApiRequest(pathname);
    const { locale, path, isPrefixed } = LocalePath.split(pathname, i18n);

    if (isPage && !locale) {
      return Response.redirect(
        new URL(`/${getLocale(request)}/${pathname.slice(1)}${targetUrl.search}`, getPublicRequestUrl(request)),
        307,
      );
    }
    //? A CSR boot's route table matches on the `/:lang` segment, so it always gets one; any other request for the
    //? default locale's prefixed URL moves for good, so a link from an "always" past lands on the one URL it now has.
    if (isPage && locale && LocalePath.omits(locale, i18n)) {
      const publicUrl = getPublicRequestUrl(request);
      if (isCsrRequest(targetUrl) && !isPrefixed)
        return Response.redirect(new URL(`/${locale}${pathname}${targetUrl.search}`, publicUrl), 307);
      if (!isCsrRequest(targetUrl) && isPrefixed)
        return Response.redirect(new URL(`${path}${targetUrl.search}`, publicUrl), 308);
    }

    const headers = new Headers(request.headers);
    headers.set("x-locale", locale ?? i18n.defaultLocale);
    headers.set("x-path", path);

    if (locale && !isPrefixed && (isPage || isInternal)) {
      const localizedUrl = new URL(targetUrl);
      localizedUrl.pathname = `/${locale}${pathname}`;
      return AkanResponse.rewrite(toProxyRequestUrl(requestUrl, localizedUrl), { request: { headers } });
    }
    return AkanResponse.next({ request: { headers } });
  }
}

function getProxyTargetUrl(requestUrl: URL): URL {
  if (!isInternalProxyRequest(requestUrl)) return requestUrl;
  const target = requestUrl.searchParams.get("url");
  return target ? new URL(target, requestUrl.origin) : requestUrl;
}

function isCsrRequest(url: URL): boolean {
  return url.searchParams.get("csr") === "true";
}

function isWellKnownRequest(pathname: string): boolean {
  return pathname === "/.well-known" || pathname.startsWith("/.well-known/");
}

// Read from the env, not the server: this proxy runs per request with no handle on it.
function isApiRequest(pathname: string): boolean {
  const prefix = getApiPrefix();
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}
