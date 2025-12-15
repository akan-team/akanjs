import { baseClientEnv } from "@akanjs/base";
import { getHeader } from "@akanjs/client";
import { Logger, sleep } from "@akanjs/common";
import { AllDictionary, ServerTranslator, type TransMessage } from "@akanjs/dictionary";
import { serverTranslator } from "@akanjs/dictionary";
import { SerializedSignal, signalInfo } from "@akanjs/signal";
import { type ReactNode } from "react";

interface TranslateProps {
  lang: string;
  dictKey: string;
  param?: Record<string, string | number>;
}

const clientTranslate = ({ lang, dictKey, param }: TranslateProps) => {
  const translator = baseClientEnv.side === "server" ? (global.serverTranslator as ServerTranslator) : serverTranslator;
  return translator.getTransSync(lang, dictKey, param) ?? dictKey;
};

const getPageInfo = (): { locale: string; path: string } => {
  if (baseClientEnv.side !== "server") {
    // client side, has window object
    return {
      locale: window.location.pathname.split("/")[1] ?? "en",
      path: "/" + window.location.pathname.split("/").slice(2).join("/"),
    };
  }
  const locale = getHeader("x-locale") ?? "en";
  const path = getHeader("x-path") ?? "/";
  return { locale, path };
};

export interface TransMessageOption {
  key?: string;
  duration?: number;
  data?: { [key: string]: any };
}

const msg = {
  info: () => null,
  success: () => null,
  error: () => null,
  warning: () => null,
  loading: () => null,
} as {
  info: (key: TransMessage<any>, option?: TransMessageOption) => void;
  success: (key: TransMessage<any>, option?: TransMessageOption) => void;
  error: (key: TransMessage<any>, option?: TransMessageOption) => void;
  warning: (key: TransMessage<any>, option?: TransMessageOption) => void;
  loading: (key: TransMessage<any>, option?: TransMessageOption) => void;
};

export const makePageProto = <DictKey extends string, ErrorKey extends string, Fetch, Sig>(cnst: any) => {
  class Revert extends Error {
    constructor(key: ErrorKey, data?: any) {
      super(key);
    }
  }
  return {
    Revert,
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
      const l = (key: DictKey, param?: { [key: string]: string | number }) =>
        clientTranslate({ lang, dictKey: key, param });
      l._ = (key: string, param?: { [key: string]: string | number }) => clientTranslate({ lang, dictKey: key, param });
      l.rich = (key: DictKey, param?: { [key: string]: string | number }) =>
        (
          <span
            dangerouslySetInnerHTML={{
              __html: clientTranslate({
                lang,
                dictKey: key,
                param: {
                  ...param,
                  // strong: (chunks: string) => `<b>${chunks}</b>`,
                  // "bg-primary": (chunks: string) => `<span className="bg-primary text-base-100">${chunks}</span>`,
                  // primary: (chunks: string) => `<span className="bg-base-100 text-primary">${chunks}</span>`,
                  br: `<br />`,
                },
              }),
            }}
          />
        ) as ReactNode;
      l.trans = <Returns extends ReactNode>(
        translation: Record<"en" | "ko" | (string & {}), Returns>
      ): Returns extends string ? string : Returns => {
        return (translation[lang as "en" | "ko" | (string & {})] ?? "unknown translation") as Returns extends string
          ? string
          : Returns;
      };
      return { path, l, lang };
    },
    fetch: baseClientEnv.side === "server" ? (global.builtFetch as Fetch) : (global.fetch as Fetch),
    sig: {} as unknown as Sig,
    registerClient: async (lang?: string): Promise<{ dictionary: AllDictionary; signals: SerializedSignal[] }> => {
      while (!(global.builtFetch as Fetch)) {
        try {
          const [dictionary, { fetch, signals }] = await Promise.all([
            lang ? serverTranslator.init(lang) : serverTranslator.initAllLanguages(global.dictionary as AllDictionary),
            signalInfo.registerClient(cnst),
          ]);
          global.builtFetch = fetch as unknown as typeof global.builtFetch;
          global.signals = signals;
          global.dictionary = dictionary;
          global.serverTranslator = serverTranslator;
          return { dictionary, signals };
        } catch (e) {
          Logger.error(e instanceof Error ? e.message : String(e));
          await sleep(3000);
        }
      }
      return { dictionary: global.dictionary as AllDictionary, signals: global.signals as SerializedSignal[] };
    },
  };
};
