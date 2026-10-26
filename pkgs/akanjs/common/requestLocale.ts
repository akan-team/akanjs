import type { AkanI18nConfig } from "./localeConfig";

export interface RequestLocaleInput {
  localeHeader?: string | null;
  pathHeader?: string | null;
  /** The request URL's pathname; absent outside a request. */
  pathname?: string;
}

//? One resolver for the RSC worker's `usePage()` and the host that picks the page's dictionary: a disagreement ships
//? one locale's text to a page rendered in another.
export class RequestLocale {
  static resolve(
    { localeHeader: rawLocaleHeader, pathHeader, pathname }: RequestLocaleInput,
    { defaultLocale, locales }: AkanI18nConfig,
  ): { locale: string; path: string } {
    // `x-locale` can arrive from the wire, not just the locale proxy: trust only a locale this app serves.
    const localeHeader = rawLocaleHeader && locales.includes(rawLocaleHeader) ? rawLocaleHeader : null;
    // Proxy headers when present, else the request URL, so an unadorned dev request (`curl /en/hello`) resolves.
    if (localeHeader && pathHeader) return { locale: localeHeader, path: pathHeader };
    if (pathname === undefined) return { locale: localeHeader ?? defaultLocale, path: pathHeader ?? "/" };
    const [, firstSegment = "", ...rest] = pathname.split("/");
    if (!localeHeader && !locales.includes(firstSegment))
      return { locale: defaultLocale, path: pathHeader ?? pathname };
    return {
      locale: localeHeader ?? (firstSegment || defaultLocale),
      path: pathHeader ?? `/${rest.join("/")}`,
    };
  }
}
