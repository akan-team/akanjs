import { getEnv } from "akanjs/base";
import { parseAkanI18nEnv } from "akanjs/common";
import { untrackedHeaders, untrackedRequest } from "akanjs/fetch";
import type { ReactNode } from "react";
import { Translator } from "./translator";

type TransMessage<Locale extends Record<string, unknown>> = {
  [K in keyof Locale]-?: `${K & string}${Locale[K] extends Record<string, unknown> ? `.${keyof Locale[K] extends string ? keyof Locale[K] : never}` : ""}`;
}[keyof Locale];

interface ErrRestoreOption {
  statusCode?: number;
  details?: unknown;
  path?: string;
  timestamp?: string;
}

interface ErrPayload extends ErrRestoreOption {
  error: string;
  data?: Record<string, unknown>;
}

const getPageInfo = (): { locale: string; path: string } => {
  const { defaultLocale, locales } = parseAkanI18nEnv();
  const localeSet = new Set(locales);
  const activeLocale = Translator.getActiveLocale();
  const activePath = Translator.getActivePath();
  if (activePath) return { locale: activeLocale ?? defaultLocale, path: activePath };
  if (getEnv().side !== "server") {
    const [, firstSegment = "", ...rest] = window.location.pathname.split("/");
    const hasLocalePrefix = localeSet.has(firstSegment);
    // Prefer the server-resolved active locale (seeded via ClientWrapper) so client lookups match the
    // SSR render even when the URL's leading segment is not the locale (base-path / cloud routing).
    // Fall back to the URL segment for CSR or any pre-seed render.
    const locale = activeLocale ?? (hasLocalePrefix ? firstSegment : defaultLocale);
    return { locale, path: activePath ?? (hasLocalePrefix ? `/${rest.join("/")}` : window.location.pathname) };
  }
  const h = untrackedHeaders();
  // Honor explicit proxy/middleware headers when present; otherwise derive
  // locale+path from the request URL itself so unadorned dev requests (e.g.
  // `curl /en/hello`) still work.
  const localeHeader = h.get("x-locale");
  const pathHeader = h.get("x-path");
  if (localeHeader && pathHeader) return { locale: localeHeader, path: pathHeader };
  const req = untrackedRequest();
  if (req) {
    const urlPath = new URL(req.url).pathname;
    const [, firstSegment = "", ...rest] = urlPath.split("/");
    if (!localeHeader && !localeSet.has(firstSegment)) return { locale: defaultLocale, path: pathHeader ?? urlPath };
    return {
      locale: localeHeader ?? (firstSegment || defaultLocale),
      path: pathHeader ?? `/${rest.join("/")}`,
    };
  }
  return { locale: localeHeader ?? defaultLocale, path: pathHeader ?? "/" };
};

export interface TransMessageOption {
  key?: string;
  duration?: number;
  data?: Record<string, unknown>;
}

const msg = {
  info: () => null,
  success: () => null,
  error: () => null,
  warning: () => null,
  loading: () => null,
} as {
  info: (key: TransMessage<Record<string, unknown>>, option?: TransMessageOption) => void;
  success: (key: TransMessage<Record<string, unknown>>, option?: TransMessageOption) => void;
  error: (key: TransMessage<Record<string, unknown>>, option?: TransMessageOption) => void;
  warning: (key: TransMessage<Record<string, unknown>>, option?: TransMessageOption) => void;
  loading: (key: TransMessage<Record<string, unknown>>, option?: TransMessageOption) => void;
};

export const makePageProto = <
  Dict extends { __Dict_Key__: string; __Error_Key__: string },
  DictKey extends Dict["__Dict_Key__"] = Dict["__Dict_Key__"],
  ErrorKey extends Dict["__Error_Key__"] = Dict["__Error_Key__"],
>(dictionary: {
  [key: string]: { [key: string]: Record<string, unknown> };
}) => {
  const translator = new Translator(dictionary);
  class Err extends Error {
    readonly error: string;
    readonly statusCode: number;
    readonly details?: unknown;
    readonly data?: Record<string, unknown>;
    readonly path?: string;
    readonly timestamp?: string;

    constructor(key: ErrorKey, data?: Record<string, unknown>, option: ErrRestoreOption = {}) {
      super(key);
      this.name = this.constructor.name;
      this.error = key;
      this.statusCode = option.statusCode ?? 400;
      this.details = option.details;
      this.data = data;
      this.path = option.path;
      this.timestamp = option.timestamp;
    }

    toJSON() {
      return {
        error: this.message,
        statusCode: this.statusCode,
        ...(this.details !== undefined ? { details: this.details } : {}),
        ...(this.data !== undefined ? { data: this.data } : {}),
        ...(this.path !== undefined ? { path: this.path } : {}),
        ...(this.timestamp !== undefined ? { timestamp: this.timestamp } : {}),
      };
    }

    static fromJSON(payload: ErrPayload) {
      return new Err(payload.error as ErrorKey, payload.data, payload);
    }

    static BadRequest = class BadRequestErr extends Err {
      constructor(key: ErrorKey, data?: Record<string, unknown>, option: ErrRestoreOption = {}) {
        super(key, data, { ...option, statusCode: 400 });
      }
    };

    static Unauthorized = class UnauthorizedErr extends Err {
      constructor(key: ErrorKey, data?: Record<string, unknown>, option: ErrRestoreOption = {}) {
        super(key, data, { ...option, statusCode: 401 });
      }
    };

    static Forbidden = class ForbiddenErr extends Err {
      constructor(key: ErrorKey, data?: Record<string, unknown>, option: ErrRestoreOption = {}) {
        super(key, data, { ...option, statusCode: 403 });
      }
    };

    static NotFound = class NotFoundErr extends Err {
      constructor(key: ErrorKey, data?: Record<string, unknown>, option: ErrRestoreOption = {}) {
        super(key, data, { ...option, statusCode: 404 });
      }
    };

    static Conflict = class ConflictErr extends Err {
      constructor(key: ErrorKey, data?: Record<string, unknown>, option: ErrRestoreOption = {}) {
        super(key, data, { ...option, statusCode: 409 });
      }
    };
  }
  return {
    Err,
    msg: msg as {
      info: (key: DictKey, option?: TransMessageOption) => void;
      success: (key: DictKey, option?: TransMessageOption) => void;
      error: (key: DictKey | ErrorKey, option?: TransMessageOption) => void;
      warning: (key: DictKey, option?: TransMessageOption) => void;
      loading: (key: DictKey, option?: TransMessageOption) => void;
    },
    usePage: () => {
      const { locale, path } = getPageInfo();
      const lang = locale;
      const l = (key: DictKey, param?: { [key: string]: string | number }) => translator.translate(lang, key, param);
      l._ = (key: string, param?: { [key: string]: string | number }) => translator.translate(lang, key, param);
      l.rich = (key: DictKey, param?: { [key: string]: string | number }) =>
        (
          <span
            // biome-ignore lint/security/noDangerouslySetInnerHtml: <a>an explanation</a>
            dangerouslySetInnerHTML={{
              __html: translator.translate(lang, key, {
                ...param,
                // strong: (chunks: string) => `<b>${chunks}</b>`,
                // "bg-primary": (chunks: string) => `<span className="bg-primary text-base-100">${chunks}</span>`,
                // primary: (chunks: string) => `<span className="bg-base-100 text-primary">${chunks}</span>`,
                br: `<br />`,
              }),
            }}
          />
        ) as ReactNode;
      l.trans = <Returns extends ReactNode>(
        translation: Record<"en" | "ko" | (string & {}), Returns>,
      ): Returns extends string ? string : Returns => {
        return (translation[lang as "en" | "ko" | (string & {})] ?? "unknown translation") as Returns extends string
          ? string
          : Returns;
      };
      return { path, l, lang };
    },
  };
};
