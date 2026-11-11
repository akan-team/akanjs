import type { GetStateObject, ObjectAssign, Prettify } from "akanjs/base";
import {
  Err,
  type ErrConstructor,
  type ErrPayload,
  interpolateTranslation,
  parseAkanI18nEnv,
  pathGetLoose,
} from "akanjs/common";

import { DictionaryRegistry } from "./dictionaryRegistry";
import type { DictModule } from "./locale";

export type { ErrConstructor, ErrPayload, ErrRestoreOption } from "akanjs/common";

type TranslationSingle = readonly [string, string] | readonly [string, string, string, string];
type TranslationWithParam = readonly [string, string, { [key: string]: string | number }];
export type Translation = TranslationSingle | TranslationWithParam;
export type TranslationData = Record<string, unknown>;
export type DictionaryNode = Record<string, unknown>;
export type RootDictionary = Record<string, Record<string, DictionaryNode>>;

export type Translate<Checker> = {
  [K in keyof GetStateObject<Checker>]: Translation;
} & Record<string, Translation> & { modelName: Translation };

export type TransMessage<Locale extends Record<string, unknown>> = {
  [K in keyof Locale]-?: `${K & string}${Locale[K] extends Record<string, unknown> ? `.${keyof Locale[K] extends string ? keyof Locale[K] : never}` : ""}`;
}[keyof Locale];

const sortedKeys = <T>(value: T): T => {
  if (Array.isArray(value)) return value.map(sortedKeys) as T;
  if (!value || typeof value !== "object") return value;
  const entries = Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return Object.fromEntries(entries.map(([key, child]) => [key, sortedKeys(child)])) as T;
};

export const makeDictionary = <Dicts extends Record<string, unknown>[]>(...dicts: Dicts) =>
  Object.assign(...(dicts as unknown as [object, object])) as Prettify<ObjectAssign<Dicts>>;

// An autocomplete hint, not a closed set: locales are per-app (`AKAN_PUBLIC_LOCALES`).
type Language = "en" | "ko" | "zhChs" | "zhCht" | "ja" | (string & {});
export interface TransMessageOption {
  key?: string;
  duration?: number;
  data?: TranslationData;
}

/** @deprecated `Err` from `akanjs/common`, the class every dictionary's `Err` is. */
export type ErrInstance = Error & {
  readonly error: string;
  readonly statusCode: number;
  readonly code?: string;
  readonly details?: unknown;
  readonly data?: TranslationData;
  readonly path?: string;
  readonly timestamp?: string;
  toJSON(): ErrPayload & { statusCode: number };
};

type MsgApi<Key> = {
  [Level in "info" | "success" | "error" | "warning" | "loading"]: (key: Key, option?: TransMessageOption) => void;
};

// `<Messages/>` assigns the real toasts over these when it mounts (never on the server); until then a call warns once
// instead of throwing, because a dropped toast must not take the render with it.
const unclaimed = (level: string) => () => {
  if (unclaimed.warned) return null;
  unclaimed.warned = true;
  console.warn(
    `msg.${level}() was called before <Messages/> mounted, so nothing was shown. Mount it in a layout, or move the call into an event handler.`,
  );
  return null;
};
unclaimed.warned = false;

export const msg = {
  info: unclaimed("info"),
  success: unclaimed("success"),
  error: unclaimed("error"),
  warning: unclaimed("warning"),
  loading: unclaimed("loading"),
} as MsgApi<TransMessage<Record<string, unknown>>>;

export const makeTrans = <
  GlobalTransMap extends Record<string, DictModule<string, string>>,
  _DictKey extends string = GlobalTransMap[keyof GlobalTransMap]["__Dict_Key__"],
  _ErrorKey extends string = GlobalTransMap[keyof GlobalTransMap]["__Error_Key__"],
>(
  transMap: GlobalTransMap,
  { build = false }: { build?: boolean } = {},
): {
  Err: ErrConstructor<_ErrorKey>;
  translate: (lang: Language, key: _DictKey, data?: TranslationData) => string;
  msg: MsgApi<_DictKey>;
  getDictionary: (lang: Language) => object;
  getAllDictionary: () => RootDictionary;
  __Dict_Key__: _DictKey;
  __Error_Key__: _ErrorKey;
} => {
  const rootDictionary = {} as RootDictionary;
  for (const [refName, trans] of Object.entries(transMap)) trans.dict._registerToRoot(refName, rootDictionary);
  DictionaryRegistry.register(rootDictionary, transMap);
  const DictionaryErr: ErrConstructor<_ErrorKey> = Err;
  const lookup = (lang: string, modelName: string, msgKey: string) => {
    const model = rootDictionary[lang]?.[modelName];
    if (!model) return undefined;
    const node = pathGetLoose(msgKey, model, ".") as { t?: unknown } | null;
    return typeof node?.t === "string" ? node.t : undefined;
  };
  // A lib's dictionary has no node for a locale only the app configures, so try the default locale before the bare key.
  const lookupDefault = (lang: string, modelName: string, msgKey: string) => {
    const { defaultLocale } = parseAkanI18nEnv();
    return defaultLocale === lang ? undefined : lookup(defaultLocale, modelName, msgKey);
  };
  const translate = (lang: Language, key: _DictKey, data?: TranslationData) => {
    const [modelName = "", ...msgKeys] = key.split(".");
    const msgKey = msgKeys.join(".");
    const message = lookup(lang, modelName, msgKey) ?? lookupDefault(lang, modelName, msgKey) ?? (key as string);
    return interpolateTranslation(message, data);
  };
  return {
    Err: DictionaryErr,
    translate,
    msg,
    getDictionary: (lang: Language) => rootDictionary[lang],
    //? A macro inlines this into the client bundle, and a lib's dictionary is shared with every app that mounts it, so
    //? its key order follows whichever module filled it first in the build process: sorted, a build is its bytes.
    getAllDictionary: () => sortedKeys(rootDictionary),
    __Dict_Key__: null as unknown as _DictKey,
    __Error_Key__: null as unknown as _ErrorKey,
  };
};
