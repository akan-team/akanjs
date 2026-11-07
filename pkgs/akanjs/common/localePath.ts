import type { AkanI18nConfig } from "./localeConfig";

type LocaleRouting = Pick<AkanI18nConfig, "defaultLocale" | "locales" | "localePrefix">;

//? The server routes every page under `/:lang` whatever the mode; `"as-needed"` only changes the URL a visitor sees,
//? which the locale proxy maps back onto `/<defaultLocale>/…`.
export class LocalePath {
  static omits(locale: string, { defaultLocale, localePrefix }: Omit<LocaleRouting, "locales">) {
    return localePrefix === "as-needed" && locale === defaultLocale;
  }

  static segmentOf(locale: string, i18n: Omit<LocaleRouting, "locales">) {
    return LocalePath.omits(locale, i18n) ? "" : `/${locale}`;
  }

  static split(pathname: string, i18n: LocaleRouting): { locale: string | null; path: string; isPrefixed: boolean } {
    const [, first = "", ...rest] = pathname.split("/");
    if (first && i18n.locales.includes(first)) return { locale: first, path: `/${rest.join("/")}`, isPrefixed: true };
    const locale = i18n.localePrefix === "as-needed" ? i18n.defaultLocale : null;
    return { locale, path: pathname || "/", isPrefixed: false };
  }

  static join(locale: string, path: string, i18n: Omit<LocaleRouting, "locales">) {
    const segment = LocalePath.segmentOf(locale, i18n);
    if (path === "/" || path === "") return segment || "/";
    return `${segment}${path.startsWith("/") ? path : `/${path}`}`;
  }
}
