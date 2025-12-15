/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import type { GetStateObject, ObjectAssign, Prettify } from "@akanjs/base";
import { pathGet } from "@akanjs/common";

import { DictModule } from "./locale";

type TranslationSingle = readonly [string, string] | readonly [string, string, string, string];
type TranslationWithParam = readonly [string, string, { [key: string]: string | number }];
export type Translation = TranslationSingle | TranslationWithParam;

export type Translate<Checker> = {
  [K in keyof GetStateObject<Checker>]: Translation;
} & Record<string, Translation> & { modelName: Translation };

export type TransMessage<Locale extends Record<string, any>> = {
  [K in keyof Locale]-?: `${K & string}${Locale[K] extends Record<string, any> ? `.${keyof Locale[K] extends string ? keyof Locale[K] : never}` : ""}`;
}[keyof Locale];

export const makeDictionary = <Dicts extends { [key: string]: any }[]>(
  ...dicts: Dicts
): Prettify<ObjectAssign<Dicts>> => {
  return Object.assign(...(dicts as unknown as [object, object])) as Prettify<ObjectAssign<Dicts>>;
};

const languages = ["en", "ko", "zhChs", "zhCht"] as const;

type Language = (typeof languages)[number];
export interface TransMessageOption {
  key?: string;
  duration?: number;
  data?: { [key: string]: any };
}

export const msg = {
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

const rootDictionary = {} as { [key: string]: object };
export const makeTrans = <
  GlobalTransMap extends Record<string, DictModule<string, string>>,
  _DictKey extends string = GlobalTransMap[keyof GlobalTransMap]["__Dict_Key__"],
  _ErrorKey extends string = GlobalTransMap[keyof GlobalTransMap]["__Error_Key__"],
>(
  transMap: GlobalTransMap,
  { build = false }: { build?: boolean } = {}
): {
  revert: (key: _ErrorKey, data?: any) => never;
  Revert: {
    new (key: _ErrorKey, data?: any): Error;
    prototype: Error;
  };
  translate: (lang: Language, key: _DictKey, data?: { [key: string]: any }) => string;
  msg: {
    info: (key: _DictKey, option?: TransMessageOption) => void;
    success: (key: _DictKey, option?: TransMessageOption) => void;
    error: (key: _DictKey, option?: TransMessageOption) => void;
    warning: (key: _DictKey, option?: TransMessageOption) => void;
    loading: (key: _DictKey, option?: TransMessageOption) => void;
  };
  getDictionary: (lang: Language) => object;
  getAllDictionary: () => { [key: string]: object };
  __Dict_Key__: _DictKey;
  __Error_Key__: _ErrorKey;
} => {
  Object.entries(transMap).forEach(([refName, trans]) => {
    trans.dict._registerToRoot(refName, rootDictionary);
  });
  const revert = (key: _ErrorKey, data?: any): never => {
    throw new Error(key as string);
  };
  class Revert extends Error {
    constructor(key: _ErrorKey, data?: any) {
      super(key as string);
    }
  }
  const translate = (lang: Language, key: _DictKey, data?: { [key: string]: any }) => {
    const [modelName, msgKey] = key.split(".");
    const langDict = rootDictionary[lang] ?? {};
    const model = langDict[modelName] ?? {};
    const message = pathGet(msgKey, model, ".", { t: key }) as { t: string };
    return message.t;
  };
  const getDictionary = (lang: Language) => {
    return rootDictionary[lang];
  };
  const getAllDictionary = () => {
    return rootDictionary;
  };
  return {
    revert,
    Revert,
    translate,
    msg,
    getDictionary,
    getAllDictionary,
    __Dict_Key__: null as unknown as _DictKey,
    __Error_Key__: null as unknown as _ErrorKey,
  };
};
