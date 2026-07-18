import type { GetStateObject, ObjectAssign, Prettify } from "akanjs/base";
import { pathGet } from "akanjs/common";

import type { DictModule } from "./locale";

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

export const makeDictionary = <Dicts extends Record<string, unknown>[]>(
  ...dicts: Dicts
): Prettify<ObjectAssign<Dicts>> => {
  return Object.assign(...(dicts as unknown as [object, object])) as Prettify<ObjectAssign<Dicts>>;
};

const languages = ["en", "ko", "zhChs", "zhCht", "ja"] as const;

type Language = (typeof languages)[number];
export interface TransMessageOption {
  key?: string;
  duration?: number;
  data?: TranslationData;
}

export interface ErrRestoreOption {
  statusCode?: number;
  details?: unknown;
  path?: string;
  timestamp?: string;
}

export interface ErrPayload extends ErrRestoreOption {
  error: string;
  data?: TranslationData;
}

export type ErrInstance = Error & {
  readonly error: string;
  readonly statusCode: number;
  readonly details?: unknown;
  readonly data?: TranslationData;
  readonly path?: string;
  readonly timestamp?: string;
  toJSON(): ErrPayload & { statusCode: number };
};

export type ErrConstructor<ErrorKey extends string> = {
  new (key: ErrorKey, data?: TranslationData, option?: ErrRestoreOption): ErrInstance;
  prototype: ErrInstance;
  fromJSON(payload: ErrPayload): ErrInstance;
  BadRequest: new (key: ErrorKey, data?: TranslationData, option?: ErrRestoreOption) => ErrInstance;
  Unauthorized: new (key: ErrorKey, data?: TranslationData, option?: ErrRestoreOption) => ErrInstance;
  Forbidden: new (key: ErrorKey, data?: TranslationData, option?: ErrRestoreOption) => ErrInstance;
  NotFound: new (key: ErrorKey, data?: TranslationData, option?: ErrRestoreOption) => ErrInstance;
  Conflict: new (key: ErrorKey, data?: TranslationData, option?: ErrRestoreOption) => ErrInstance;
};

export const msg = {
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
  msg: {
    info: (key: _DictKey, option?: TransMessageOption) => void;
    success: (key: _DictKey, option?: TransMessageOption) => void;
    error: (key: _DictKey, option?: TransMessageOption) => void;
    warning: (key: _DictKey, option?: TransMessageOption) => void;
    loading: (key: _DictKey, option?: TransMessageOption) => void;
  };
  getDictionary: (lang: Language) => object;
  getAllDictionary: () => RootDictionary;
  __Dict_Key__: _DictKey;
  __Error_Key__: _ErrorKey;
} => {
  const rootDictionary = {} as RootDictionary;
  Object.entries(transMap).forEach(([refName, trans]) => {
    trans.dict._registerToRoot(refName, rootDictionary);
  });
  class Err extends Error {
    readonly error: string;
    readonly statusCode: number;
    readonly details?: unknown;
    readonly data?: TranslationData;
    readonly path?: string;
    readonly timestamp?: string;

    constructor(key: _ErrorKey, data?: TranslationData, option: ErrRestoreOption = {}) {
      super(key as string);
      this.name = this.constructor.name;
      this.error = key as string;
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
      return new Err(payload.error as _ErrorKey, payload.data, payload);
    }

    static BadRequest = class BadRequestErr extends Err {
      constructor(key: _ErrorKey, data?: TranslationData, option: ErrRestoreOption = {}) {
        super(key, data, { ...option, statusCode: 400 });
      }
    };

    static Unauthorized = class UnauthorizedErr extends Err {
      constructor(key: _ErrorKey, data?: TranslationData, option: ErrRestoreOption = {}) {
        super(key, data, { ...option, statusCode: 401 });
      }
    };

    static Forbidden = class ForbiddenErr extends Err {
      constructor(key: _ErrorKey, data?: TranslationData, option: ErrRestoreOption = {}) {
        super(key, data, { ...option, statusCode: 403 });
      }
    };

    static NotFound = class NotFoundErr extends Err {
      constructor(key: _ErrorKey, data?: TranslationData, option: ErrRestoreOption = {}) {
        super(key, data, { ...option, statusCode: 404 });
      }
    };

    static Conflict = class ConflictErr extends Err {
      constructor(key: _ErrorKey, data?: TranslationData, option: ErrRestoreOption = {}) {
        super(key, data, { ...option, statusCode: 409 });
      }
    };
  }
  const translate = (lang: Language, key: _DictKey, data?: TranslationData) => {
    const [modelName, ...msgKeys] = key.split(".");
    const msgKey = msgKeys.join(".");
    const langDict = rootDictionary[lang] ?? {};
    const model = langDict[modelName as string] ?? {};
    const message = pathGet(msgKey as string, model, ".", { t: key }) as { t: string };
    return message.t;
  };
  const getDictionary = (lang: Language) => {
    return rootDictionary[lang];
  };
  const getAllDictionary = () => {
    return rootDictionary;
  };
  return {
    Err,
    translate,
    msg,
    getDictionary,
    getAllDictionary,
    __Dict_Key__: null as unknown as _DictKey,
    __Error_Key__: null as unknown as _ErrorKey,
  };
};
