export const akanLocalePrefixes = ["always", "as-needed"] as const;
export type AkanLocalePrefix = (typeof akanLocalePrefixes)[number];

export interface AkanI18nConfig {
  defaultLocale: string;
  locales: string[];
  /**
   * `"always"` (absent means this) serves every page under `/<locale>/…` and redirects an unprefixed path by
   * Accept-Language; `"as-needed"` serves the default locale's pages unprefixed, so a single-locale app has no prefix.
   */
  localePrefix?: AkanLocalePrefix;
}

export interface AkanI18nConfigInput {
  defaultLocale?: string;
  locales?: readonly string[];
  localePrefix?: AkanLocalePrefix;
}

export const DEFAULT_AKAN_I18N: AkanI18nConfig = Object.freeze({
  defaultLocale: "en",
  locales: Object.freeze(["en", "ko"]) as unknown as string[],
  localePrefix: "always",
});

const normalizeLocale = (locale: string) => locale.trim();

export function resolveAkanI18nConfig(input: AkanI18nConfigInput = {}): AkanI18nConfig {
  const locales = [...new Set((input.locales ?? DEFAULT_AKAN_I18N.locales).map(normalizeLocale).filter(Boolean))];
  const defaultLocale = normalizeLocale(input.defaultLocale ?? DEFAULT_AKAN_I18N.defaultLocale);
  const localePrefix = input.localePrefix ?? "always";

  if (locales.length === 0) throw new Error("[i18n] locales must include at least one locale");
  if (!defaultLocale) throw new Error("[i18n] defaultLocale must not be empty");
  if (!locales.includes(defaultLocale)) {
    throw new Error(`[i18n] defaultLocale "${defaultLocale}" must be included in locales: ${locales.join(",")}`);
  }
  if (!akanLocalePrefixes.includes(localePrefix))
    throw new Error(`[i18n] localePrefix "${localePrefix}" must be one of: ${akanLocalePrefixes.join(", ")}`);

  return { defaultLocale, locales, localePrefix };
}

let lastParsed: { defaultLocale?: string; locales?: string; localePrefix?: string; config: AkanI18nConfig } | null =
  null;

//? Read on every page request by the locale proxy and the router, so the last answer is kept while the variables still
//? spell the same; frozen, as the default is, because every caller now shares it.
export function parseAkanI18nEnv(
  env: Record<string, string | undefined> = {
    AKAN_PUBLIC_DEFAULT_LOCALE: typeof process !== "undefined" ? process.env.AKAN_PUBLIC_DEFAULT_LOCALE : undefined,
    AKAN_PUBLIC_LOCALES: typeof process !== "undefined" ? process.env.AKAN_PUBLIC_LOCALES : undefined,
    AKAN_PUBLIC_LOCALE_PREFIX: typeof process !== "undefined" ? process.env.AKAN_PUBLIC_LOCALE_PREFIX : undefined,
  },
): AkanI18nConfig {
  const defaultLocale = env.AKAN_PUBLIC_DEFAULT_LOCALE;
  const locales = env.AKAN_PUBLIC_LOCALES;
  const localePrefix = env.AKAN_PUBLIC_LOCALE_PREFIX;
  if (
    lastParsed &&
    lastParsed.defaultLocale === defaultLocale &&
    lastParsed.locales === locales &&
    lastParsed.localePrefix === localePrefix
  )
    return lastParsed.config;
  const resolved = resolveAkanI18nConfig({
    defaultLocale,
    locales: locales?.split(","),
    localePrefix: (localePrefix || undefined) as AkanLocalePrefix | undefined,
  });
  const config = Object.freeze({ ...resolved, locales: Object.freeze(resolved.locales) as unknown as string[] });
  lastParsed = { defaultLocale, locales, localePrefix, config };
  return config;
}
