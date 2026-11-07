import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { LocaleWebProxy } from "./localeWebProxy";
import { WEB_PROXY_RESULT, type WebProxyResult } from "./types";

const envKeys = ["AKAN_PUBLIC_DEFAULT_LOCALE", "AKAN_PUBLIC_LOCALES", "AKAN_PUBLIC_LOCALE_PREFIX"] as const;
let savedEnv: Record<string, string | undefined> = {};

const setI18nEnv = (locales: string, localePrefix?: "always" | "as-needed") => {
  process.env.AKAN_PUBLIC_DEFAULT_LOCALE = "en";
  process.env.AKAN_PUBLIC_LOCALES = locales;
  if (localePrefix) process.env.AKAN_PUBLIC_LOCALE_PREFIX = localePrefix;
  else delete process.env.AKAN_PUBLIC_LOCALE_PREFIX;
};

beforeEach(() => {
  savedEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
});

afterEach(() => {
  for (const key of envKeys) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

const use = (url: string, headers: Record<string, string> = {}) =>
  new LocaleWebProxy().use(new Request(url, { headers }) as unknown as Bun.BunRequest);

const isProxyResult = (value: unknown): value is WebProxyResult =>
  Boolean(value && typeof value === "object" && WEB_PROXY_RESULT in value);

const forwarded = (value: unknown) => {
  if (!isProxyResult(value)) throw new Error(`expected a proxy result, got ${String(value)}`);
  const headers = new Headers(value.request?.headers);
  const url = value.type === "rewrite" ? new URL(value.url) : null;
  return {
    type: value.type,
    url: url ? `${url.pathname}${url.search}` : null,
    locale: headers.get("x-locale"),
    path: headers.get("x-path"),
  };
};

const redirectOf = (value: unknown) => {
  if (!(value instanceof Response)) throw new Error(`expected a redirect, got ${String(value)}`);
  return { status: value.status, location: value.headers.get("location") };
};

describe("LocaleWebProxy", () => {
  describe('localePrefix "always"', () => {
    beforeEach(() => setI18nEnv("en,ko"));

    test("redirects an unprefixed page by Accept-Language", () => {
      expect(redirectOf(use("http://site.test/pokemon/deoxys?x=1", { "accept-language": "ko-KR,ko;q=0.9" }))).toEqual({
        status: 307,
        location: "http://site.test/ko/pokemon/deoxys?x=1",
      });
      expect(redirectOf(use("http://site.test/"))).toEqual({ status: 307, location: "http://site.test/en/" });
    });

    test("hands a prefixed page on with its locale and the path after it, the default locale included", () => {
      expect(forwarded(use("http://site.test/ko/pokemon/deoxys"))).toEqual({
        type: "next",
        url: null,
        locale: "ko",
        path: "/pokemon/deoxys",
      });
      expect(forwarded(use("http://site.test/en"))).toEqual({ type: "next", url: null, locale: "en", path: "/" });
    });
  });

  describe('localePrefix "as-needed"', () => {
    beforeEach(() => setI18nEnv("en,ko", "as-needed"));

    test("serves an unprefixed page as the default locale whatever the Accept-Language, routed under its segment", () => {
      expect(forwarded(use("http://site.test/pokemon/deoxys?x=1", { "accept-language": "ko" }))).toEqual({
        type: "rewrite",
        url: "/en/pokemon/deoxys?x=1",
        locale: "en",
        path: "/pokemon/deoxys",
      });
      expect(forwarded(use("http://site.test/"))).toEqual({ type: "rewrite", url: "/en/", locale: "en", path: "/" });
    });

    test("keeps another locale's prefix", () => {
      expect(forwarded(use("http://site.test/ko/pokemon/deoxys"))).toEqual({
        type: "next",
        url: null,
        locale: "ko",
        path: "/pokemon/deoxys",
      });
    });

    test("sends the default locale's prefixed URL to its unprefixed one for good", () => {
      expect(redirectOf(use("http://site.test/en/pokemon/deoxys?x=1"))).toEqual({
        status: 308,
        location: "http://site.test/pokemon/deoxys?x=1",
      });
      expect(redirectOf(use("http://site.test/en"))).toEqual({ status: 308, location: "http://site.test/" });
    });

    test("keeps a CSR boot on the prefixed URL its route table matches", () => {
      expect(forwarded(use("http://site.test/en/pokemon?csr=true"))).toEqual({
        type: "next",
        url: null,
        locale: "en",
        path: "/pokemon",
      });
      expect(redirectOf(use("http://site.test/pokemon?csr=true&akanMobileTarget=preview"))).toEqual({
        status: 307,
        location: "http://site.test/en/pokemon?csr=true&akanMobileTarget=preview",
      });
    });

    test("routes no API request under a locale", () => {
      expect(forwarded(use("http://site.test/api/pokemon"))).toMatchObject({ type: "next", url: null, locale: "en" });
    });

    test("serves a single-locale app with no prefix at all", () => {
      setI18nEnv("en", "as-needed");
      expect(forwarded(use("http://site.test/types"))).toMatchObject({ type: "rewrite", url: "/en/types" });
      expect(redirectOf(use("http://site.test/en/types"))).toEqual({
        status: 308,
        location: "http://site.test/types",
      });
    });
  });
});
