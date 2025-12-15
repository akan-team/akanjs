/* eslint-disable @typescript-eslint/no-unnecessary-type-parameters */
/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { BaseInsight, BaseObject, GetStateObject } from "@akanjs/base";
import { capitalize } from "@akanjs/common";
import { BaseFilterQueryKey, BaseFilterSortKey, FilterInfo, FilterInstance } from "@akanjs/document";
import { ApiInfo, SliceInfo } from "@akanjs/signal";

class FieldTranslation<Languages extends [string, ...string[]]> {
  static translate = <Languages extends [string, ...string[]]>(trans: Languages) =>
    new FieldTranslation<Languages>(trans);
  trans: Languages;
  descTrans?: Languages;
  constructor(trans: Languages) {
    this.trans = trans;
  }
  desc(descTrans: Languages) {
    this.descTrans = descTrans;
    return this;
  }
}

class FunctionTranslation<Languages extends [string, ...string[]], ArgName extends string = never> {
  trans: Languages;
  descTrans?: Languages;
  argTrans: { [key in ArgName]: FieldTranslation<Languages> } = {} as {
    [key in ArgName]: FieldTranslation<Languages>;
  };
  constructor(trans: Languages) {
    this.trans = trans;
  }
  desc(descTrans: Languages) {
    this.descTrans = descTrans;
    return this;
  }
  arg<TransMap extends { [key: string]: FieldTranslation<Languages> }>(
    translate: (t: (trans: Languages) => FieldTranslation<Languages>) => TransMap
  ) {
    Object.assign(this.argTrans, translate(FieldTranslation.translate));
    return this as unknown as FunctionTranslation<Languages, keyof TransMap & string>;
  }
}
const fn = <Languages extends [string, ...string[]] = [string]>(trans: Languages) => new FunctionTranslation(trans);

type BaseModelCrudGetSignalTranslation<
  T extends string,
  Languages extends [string, ...string[]] = [string],
  _CapitalizedT extends string = Capitalize<T>,
> = {
  [K in T]: FunctionTranslation<Languages, `${T}Id`>;
} & {
  [K in `light${_CapitalizedT}`]: FunctionTranslation<Languages, `${T}Id`>;
} & {
  [K in `create${_CapitalizedT}`]: FunctionTranslation<Languages, "data">;
} & {
  [K in `update${_CapitalizedT}`]: FunctionTranslation<Languages, `${T}Id` | "data">;
} & {
  [K in `remove${_CapitalizedT}`]: FunctionTranslation<Languages, `${T}Id`>;
};
type GetBaseSignalKey<T extends string> = keyof BaseModelCrudGetSignalTranslation<T>;

export class ModelDictInfo<
  Languages extends [string, ...string[]] = [string],
  ModelKey extends string = keyof BaseObject,
  InsightKey extends string = keyof BaseInsight,
  QueryKey extends string = BaseFilterQueryKey,
  SortKey extends string = BaseFilterSortKey,
  EnumKey extends string = never,
  BaseSignalKey extends string = never,
  SliceKey extends string = "",
  EndpointKey extends string = never,
  ErrorKey extends string = never,
  EtcKey extends string = never,
> {
  static baseModelDictionary: { [key in keyof BaseObject]: FieldTranslation<[string, string]> } = {
    id: FieldTranslation.translate(["ID", "아이디"]).desc(["Unique ID value", "유니크한 아이디값"]),
    createdAt: FieldTranslation.translate(["CreatedAt", "생성일"]).desc(["Data created time", "데이터 생성 시각"]),
    updatedAt: FieldTranslation.translate(["UpdatedAt", "수정일"]).desc([
      "Data updated time",
      "데이터 마지막 수정 시각",
    ]),
    removedAt: FieldTranslation.translate(["RemovedAt", "삭제일"]).desc(["Data removed time", "데이터 삭제 시각"]),
  };
  static baseInsightDictionary: { [key in keyof BaseInsight]: FieldTranslation<[string, string]> } = {
    count: FieldTranslation.translate(["Count", "개수"]).desc(["Total number of items", "총 아이템 개수"]),
  };
  static baseQueryDictionary: { [key in BaseFilterQueryKey]: FieldTranslation<[string, string]> } = {
    any: fn(["Any", "전체"]).desc(["All", "전체"]),
  };
  static baseSortDictionary: { [key in BaseFilterSortKey]: FieldTranslation<[string, string]> } = {
    latest: FieldTranslation.translate(["Latest", "최신순"]).desc(["Latest", "최신순"]),
    oldest: FieldTranslation.translate(["Oldest", "오래된순"]).desc(["Oldest", "오래된순"]),
  };
  static getBaseSignalDictionary<T extends string>(refName: T): BaseModelCrudGetSignalTranslation<T, [string, string]> {
    return {
      [refName]: fn([`Get ${refName}`, `${refName} 조회`])
        .desc([`Get ${refName}`, `${refName} 조회`])
        .arg((t) => ({ [`${refName}Id`]: t(["Id", "아이디"]).desc([`Id of ${refName}`, `${refName} 아이디`]) })),
      [`light${refName}`]: fn([`Get light version of ${refName}`, `${refName} 경량화 버전 조회`])
        .desc([`Get light version of ${refName}`, `${refName} 경량화 버전 조회`])
        .arg((t) => ({ [`${refName}Id`]: t(["Id", "아이디"]).desc([`Id of ${refName}`, `${refName} 아이디`]) })),
      [`create${refName}`]: fn([`Create ${refName}`, `${refName} 생성`])
        .desc([`Create ${refName}`, `${refName} 생성`])
        .arg((t) => ({ data: t(["Data", "데이터"]).desc([`Data of ${refName}`, `${refName} 데이터`]) })),
      [`update${refName}`]: fn([`Update ${refName}`, `${refName} 수정`])
        .desc([`Update ${refName}`, `${refName} 수정`])
        .arg((t) => ({
          [`${refName}Id`]: t(["Id", "아이디"]).desc([`Id of ${refName}`, `${refName} 아이디`]),
          data: t(["Data", "데이터"]).desc([`Data of ${refName}`, `${refName} 데이터`]),
        })),
      [`remove${refName}`]: fn([`Remove ${refName}`, `${refName} 삭제`])
        .desc([`Remove ${refName}`, `${refName} 삭제`])
        .arg((t) => ({ [`${refName}Id`]: t(["Id", "아이디"]).desc([`Id of ${refName}`, `${refName} 아이디`]) })),
    } as unknown as BaseModelCrudGetSignalTranslation<T, [string, string]>;
  }
  static baseSliceDictionary: {
    [key in ""]: FunctionTranslation<[string, string], "query">;
  } = {
    [""]: fn(["Universal", "유니버설"])
      .desc(["Universal Slice", "유니버설 슬라이스"])
      .arg((t) => ({ query: t(["Query", "쿼리"]).desc(["Query Description", "쿼리 설명"]) })),
  };

  languages: Languages;
  modelTranslation?: FieldTranslation<Languages>;
  modelDictionary: { [K in ModelKey]: FieldTranslation<Languages> } = {} as {
    [K in ModelKey]: FieldTranslation<Languages>;
  };
  insightDictionary: { [K in InsightKey]: FieldTranslation<Languages> } = {} as {
    [K in InsightKey]: FieldTranslation<Languages>;
  };
  queryDictionary: { [K in QueryKey]: FunctionTranslation<Languages> } = {} as {
    [K in QueryKey]: FunctionTranslation<Languages>;
  };
  sortDictionary: { [K in SortKey]: FieldTranslation<Languages> } = {} as {
    [K in SortKey]: FieldTranslation<Languages>;
  };
  enumDictionary: { [K in EnumKey]: { [key: string]: FieldTranslation<Languages> } } = {} as {
    [K in EnumKey]: { [key: string]: FieldTranslation<Languages> };
  };
  baseSignalDictionary: { [K in BaseSignalKey]: FunctionTranslation<Languages> } = {} as {
    [K in BaseSignalKey]: FunctionTranslation<Languages>;
  };
  sliceDictionary: { [K in SliceKey]: FunctionTranslation<Languages> } = {} as {
    [K in SliceKey]: FunctionTranslation<Languages>;
  };
  endpointDictionary: { [K in EndpointKey]: FunctionTranslation<Languages> } = {} as {
    [K in EndpointKey]: FunctionTranslation<Languages>;
  };
  errorDictionary: { [K in ErrorKey]: Languages } = {} as { [K in ErrorKey]: Languages };
  etcDictionary: { [K in EtcKey]: Languages } = {} as { [K in EtcKey]: Languages };
  constructor(languages: Languages) {
    this.languages = languages;
  }
  of(translate: (t: (trans: Languages) => FieldTranslation<Languages>) => FieldTranslation<Languages>) {
    this.modelTranslation = translate(FieldTranslation.translate);
    return this;
  }
  model<Model extends { [key: string]: any }>(
    translate: (t: (trans: Languages) => FieldTranslation<Languages>) => {
      [K in Exclude<keyof GetStateObject<Model>, ModelKey>]: FieldTranslation<Languages>;
    }
  ) {
    Object.assign(
      this.modelDictionary,
      translate(FieldTranslation.translate),
      ModelDictInfo.baseModelDictionary
    ) as unknown as { [K in ModelKey]: FieldTranslation<Languages> };
    return this as unknown as ModelDictInfo<
      Languages,
      keyof GetStateObject<Model> & string,
      InsightKey,
      QueryKey,
      SortKey,
      EnumKey,
      BaseSignalKey,
      SliceKey,
      EndpointKey,
      ErrorKey,
      EtcKey
    >;
  }
  insight<Insight extends { [key: string]: any }>(
    translate: (t: (trans: Languages) => FieldTranslation<Languages>) => {
      [K in Exclude<keyof GetStateObject<Insight>, InsightKey>]: FieldTranslation<Languages>;
    }
  ) {
    Object.assign(
      this.insightDictionary,
      translate(FieldTranslation.translate),
      ModelDictInfo.baseInsightDictionary
    ) as unknown as { [K in InsightKey]: FieldTranslation<Languages> };
    return this as unknown as ModelDictInfo<
      Languages,
      ModelKey,
      keyof GetStateObject<Insight> & string,
      QueryKey,
      SortKey,
      EnumKey,
      BaseSignalKey,
      SliceKey,
      EndpointKey,
      ErrorKey,
      EtcKey
    >;
  }
  query<Filter extends FilterInstance>(
    translate: (fn: (trans: Languages) => FunctionTranslation<Languages>) => {
      [K in Exclude<keyof Filter["query"], QueryKey>]: Filter["query"][K] extends FilterInfo<infer ArgNames, any>
        ? FunctionTranslation<Languages, ArgNames[number]>
        : never;
    }
  ) {
    Object.assign(this.queryDictionary, translate(fn), ModelDictInfo.baseQueryDictionary) as unknown as {
      [K in keyof Filter["query"]]: FunctionTranslation<
        Languages,
        Filter["query"][K] extends FilterInfo<infer ArgNames, any> ? ArgNames[number] : never
      >;
    };
    return this as unknown as ModelDictInfo<
      Languages,
      ModelKey,
      InsightKey,
      keyof Filter["query"] & string,
      SortKey,
      EnumKey,
      BaseSignalKey,
      SliceKey,
      EndpointKey,
      ErrorKey,
      EtcKey
    >;
  }
  sort<Filter extends FilterInstance>(
    translate: (t: (trans: Languages) => FieldTranslation<Languages>) => {
      [K in Exclude<keyof Filter["sort"], SortKey>]: FieldTranslation<Languages>;
    }
  ) {
    Object.assign(
      this.sortDictionary,
      translate(FieldTranslation.translate),
      ModelDictInfo.baseSortDictionary
    ) as unknown as { [K in SortKey]: FieldTranslation<Languages> };
    return this as unknown as ModelDictInfo<
      Languages,
      ModelKey,
      InsightKey,
      QueryKey,
      keyof Filter["sort"] & string,
      EnumKey,
      BaseSignalKey,
      SliceKey,
      EndpointKey,
      ErrorKey,
      EtcKey
    >;
  }

  enum<Enum extends { refName: string; value: any }>(
    enumName: Enum["refName"],
    translate: (t: (trans: Languages) => FieldTranslation<Languages>) => {
      [K in Enum["value"]]: FieldTranslation<Languages>;
    }
  ) {
    Object.assign(this.enumDictionary, { [enumName]: translate(FieldTranslation.translate) });
    return this as unknown as ModelDictInfo<
      Languages,
      ModelKey,
      InsightKey,
      QueryKey,
      SortKey,
      EnumKey | Enum["refName"],
      BaseSignalKey,
      SliceKey,
      EndpointKey,
      ErrorKey,
      EtcKey
    >;
  }
  slice<Slice>(
    translate: (fn: (trans: Languages) => FunctionTranslation<Languages>) => {
      [K in Exclude<keyof Slice, SliceKey>]: Slice[K] extends SliceInfo<
        any,
        any,
        any,
        any,
        any,
        infer ArgNames,
        any,
        any,
        any
      >
        ? FunctionTranslation<Languages, ArgNames[number]>
        : never;
    }
  ) {
    Object.assign(this.sliceDictionary, translate(fn), ModelDictInfo.baseSliceDictionary) as unknown as {
      [K in keyof Slice]: FunctionTranslation<Languages>;
    };
    return this as unknown as ModelDictInfo<
      Languages,
      ModelKey,
      InsightKey,
      QueryKey,
      SortKey,
      EnumKey,
      BaseSignalKey,
      keyof Slice & string,
      EndpointKey,
      ErrorKey,
      EtcKey
    >;
  }
  endpoint<Endpoint>(
    translate: (fn: (trans: Languages) => FunctionTranslation<Languages>) => {
      [K in Exclude<keyof Endpoint, EndpointKey>]: Endpoint[K] extends ApiInfo<
        any,
        any,
        infer ArgNames,
        any,
        any,
        any,
        any,
        any,
        any
      >
        ? FunctionTranslation<Languages, ArgNames[number]>
        : never;
    }
  ) {
    Object.assign(this.endpointDictionary, translate(fn)) as unknown as {
      [K in EndpointKey]: FunctionTranslation<Languages>;
    };
    return this as unknown as ModelDictInfo<
      Languages,
      ModelKey,
      InsightKey,
      QueryKey,
      SortKey,
      EnumKey,
      BaseSignalKey,
      SliceKey,
      keyof Endpoint & string,
      ErrorKey,
      EtcKey
    >;
  }
  error<ErrorDict extends { [key: string]: Languages }>(errorDictionary: ErrorDict) {
    Object.assign(this.errorDictionary, errorDictionary);
    return this as unknown as ModelDictInfo<
      Languages,
      ModelKey,
      InsightKey,
      QueryKey,
      SortKey,
      EnumKey,
      BaseSignalKey,
      SliceKey,
      EndpointKey,
      ErrorKey | (keyof ErrorDict & string),
      EtcKey
    >;
  }
  translate<EtcDict extends { [key: string]: Languages }>(etcDictionary: EtcDict) {
    Object.assign(this.etcDictionary, etcDictionary);
    return this as unknown as ModelDictInfo<
      Languages,
      ModelKey,
      InsightKey,
      QueryKey,
      SortKey,
      EnumKey,
      BaseSignalKey,
      SliceKey,
      EndpointKey,
      ErrorKey,
      EtcKey | (keyof EtcDict & string)
    >;
  }
  _applyBaseSignal<T extends string>(refName: T) {
    Object.assign(this.baseSignalDictionary, ModelDictInfo.getBaseSignalDictionary(refName));
    return this as unknown as ModelDictInfo<
      Languages,
      ModelKey,
      InsightKey,
      QueryKey,
      SortKey,
      EnumKey,
      GetBaseSignalKey<T>,
      SliceKey,
      EndpointKey,
      ErrorKey,
      EtcKey
    >;
  }
  _registerToRoot(refName: string, rootDict: { [key: string]: object }) {
    this.languages.forEach((language) => {
      rootDict[language] ??= {};
      rootDict[language][refName] ??= {};
    });
    if (this.modelTranslation) {
      this.modelTranslation.trans.forEach((t, idx) => (rootDict[this.languages[idx]][refName].modelName = { t }));
      this.modelTranslation.descTrans?.forEach((t, idx) => (rootDict[this.languages[idx]][refName].modelDesc = { t }));
    }
    this.#registerInsightToRoot(refName, rootDict);
    this.#registerQueryToRoot(refName, rootDict);
    this.#registerSortToRoot(refName, rootDict);
    this.#registerEnumToRoot(rootDict);
    this.#registerBaseSignalToRoot(refName, rootDict);
    this.#registerSliceToRoot(refName, rootDict);
    this.#registerEndpointToRoot(refName, rootDict);
    this.#registerErrorToRoot(refName, rootDict);
    this.#registerModelToRoot(refName, rootDict);
    this.#registerEtcToRoot(refName, rootDict);
  }
  #registerModelToRoot(refName: string, rootDict: { [key: string]: object }) {
    Object.entries(this.modelDictionary as { [key: string]: FieldTranslation<Languages> }).forEach(([key, value]) => {
      value.trans.forEach((t, idx) => (rootDict[this.languages[idx]][refName][key] = { t }));
      value.descTrans?.forEach((t, idx) => (rootDict[this.languages[idx]][refName][key].desc = { t }));
    });
  }
  #registerInsightToRoot(refName: string, rootDict: { [key: string]: object }) {
    this.languages.forEach((language) => (rootDict[language][refName].insight ??= {}));
    Object.entries(this.insightDictionary as { [key: string]: FieldTranslation<Languages> }).forEach(([key, value]) => {
      value.trans.forEach((t, idx) => (rootDict[this.languages[idx]][refName].insight[key] = { t }));
      value.descTrans?.forEach((t, idx) => (rootDict[this.languages[idx]][refName].insight[key].desc = { t }));
    });
  }
  #registerQueryToRoot(refName: string, rootDict: { [key: string]: object }) {
    this.languages.forEach((language) => (rootDict[language][refName].query ??= {}));
    Object.entries(this.queryDictionary as { [key: string]: FunctionTranslation<Languages> }).forEach(
      ([key, value]) => {
        value.trans.forEach((t, idx) => (rootDict[this.languages[idx]][refName].query[key] = { t, arg: {} }));
        value.descTrans?.forEach((t, idx) => (rootDict[this.languages[idx]][refName].query[key].desc = { t }));
        Object.entries(value.argTrans as { [key: string]: FieldTranslation<Languages> }).forEach(
          ([argKey, argTrans]) => {
            argTrans.trans.forEach((t, idx) => (rootDict[this.languages[idx]][refName].query[key].arg[argKey] = { t }));
            argTrans.descTrans?.forEach(
              (t, idx) => (rootDict[this.languages[idx]][refName].query[key].arg[argKey].desc = { t })
            );
          }
        );
      }
    );
  }
  #registerSortToRoot(refName: string, rootDict: { [key: string]: object }) {
    this.languages.forEach((language) => (rootDict[language][refName].sort ??= {}));
    Object.entries(this.sortDictionary as { [key: string]: FieldTranslation<Languages> }).forEach(([key, value]) => {
      value.trans.forEach((t, idx) => (rootDict[this.languages[idx]][refName].sort[key] = { t }));
      value.descTrans?.forEach((t, idx) => (rootDict[this.languages[idx]][refName].sort[key].desc = { t }));
    });
  }
  #registerEnumToRoot(rootDict: { [key: string]: object }) {
    Object.entries(this.enumDictionary as { [key: string]: { [key: string]: FieldTranslation<Languages> } }).forEach(
      ([refName, enumTrans]) => {
        this.languages.forEach((language) => (rootDict[language][refName] ??= {}));
        Object.entries(enumTrans as { [key: string]: FieldTranslation<Languages> }).forEach(([enumKey, enumValue]) => {
          enumValue.trans.forEach((t, idx) => (rootDict[this.languages[idx]][refName][enumKey] = { t }));
          enumValue.descTrans?.forEach((t, idx) => (rootDict[this.languages[idx]][refName][enumKey].desc = { t }));
        });
      }
    );
  }
  #registerBaseSignalToRoot(refName: string, rootDict: { [key: string]: object }) {
    this.languages.forEach((language) => (rootDict[language][refName].signal ??= {}));
    Object.entries(this.baseSignalDictionary as { [key: string]: FunctionTranslation<Languages> }).forEach(
      ([key, value]) => {
        value.trans.forEach((t, idx) => (rootDict[this.languages[idx]][refName].signal[key] = { t, arg: {} }));
        value.descTrans?.forEach((t, idx) => (rootDict[this.languages[idx]][refName].signal[key].desc = { t }));
        Object.entries(value.argTrans as { [key: string]: FieldTranslation<Languages> }).forEach(
          ([argKey, argTrans]) => {
            argTrans.trans.forEach(
              (t, idx) => (rootDict[this.languages[idx]][refName].signal[key].arg[argKey] = { t })
            );
            argTrans.descTrans?.forEach(
              (t, idx) => (rootDict[this.languages[idx]][refName].signal[key].arg[argKey].desc = { t })
            );
          }
        );
      }
    );
  }
  #registerSliceToRoot(refName: string, rootDict: { [key: string]: object }) {
    this.languages.forEach((language) => (rootDict[language][refName].signal ??= {}));
    Object.entries(this.sliceDictionary as { [key: string]: FunctionTranslation<Languages> }).forEach(
      ([sliceKey, sliceTrans]) => {
        const listKey = `${refName}List${capitalize(sliceKey)}`;
        const insightKey = `${refName}Insight${capitalize(sliceKey)}`;
        sliceTrans.trans.forEach(
          (t, idx) => (rootDict[this.languages[idx]][refName].signal[listKey] = { t: `Slice List - ${t}`, arg: {} })
        );
        sliceTrans.descTrans?.forEach(
          (t, idx) => (rootDict[this.languages[idx]][refName].signal[listKey].desc = { t: `Slice List - ${t}` })
        );
        sliceTrans.trans.forEach(
          (t, idx) =>
            (rootDict[this.languages[idx]][refName].signal[insightKey] = { t: `Slice Insight - ${t}`, arg: {} })
        );
        sliceTrans.descTrans?.forEach(
          (t, idx) => (rootDict[this.languages[idx]][refName].signal[insightKey].desc = { t: `Slice Insight - ${t}` })
        );
        Object.entries(sliceTrans.argTrans as { [key: string]: FieldTranslation<Languages> }).forEach(
          ([argKey, argTrans]) => {
            argTrans.trans.forEach(
              (t, idx) => (rootDict[this.languages[idx]][refName].signal[listKey].arg[argKey] = { t })
            );
            argTrans.descTrans?.forEach(
              (t, idx) => (rootDict[this.languages[idx]][refName].signal[listKey].arg[argKey].desc = { t })
            );
            ["skip", "limit", "sort"].forEach((argKey) => {
              argTrans.trans.forEach(
                (t, idx) => (rootDict[this.languages[idx]][refName].signal[listKey].arg[argKey] = { t: argKey })
              );
              argTrans.descTrans?.forEach(
                (t, idx) => (rootDict[this.languages[idx]][refName].signal[listKey].arg[argKey].desc = { t: argKey })
              );
            });
            argTrans.trans.forEach(
              (t, idx) => (rootDict[this.languages[idx]][refName].signal[insightKey].arg[argKey] = { t })
            );
            argTrans.descTrans?.forEach(
              (t, idx) => (rootDict[this.languages[idx]][refName].signal[insightKey].arg[argKey].desc = { t })
            );
          }
        );
      }
    );
  }
  #registerEndpointToRoot(refName: string, rootDict: { [key: string]: object }) {
    this.languages.forEach((language) => (rootDict[language][refName].signal ??= {}));
    Object.entries(this.endpointDictionary as { [key: string]: FunctionTranslation<Languages> }).forEach(
      ([key, value]) => {
        value.trans.forEach((t, idx) => (rootDict[this.languages[idx]][refName].signal[key] = { t, arg: {} }));
        value.descTrans?.forEach((t, idx) => (rootDict[this.languages[idx]][refName].signal[key].desc = { t }));
        Object.entries(value.argTrans as { [key: string]: FieldTranslation<Languages> }).forEach(
          ([argKey, argTrans]) => {
            argTrans.trans.forEach(
              (t, idx) => (rootDict[this.languages[idx]][refName].signal[key].arg[argKey] = { t })
            );
            argTrans.descTrans?.forEach(
              (t, idx) => (rootDict[this.languages[idx]][refName].signal[key].arg[argKey].desc = { t })
            );
          }
        );
      }
    );
  }
  #registerErrorToRoot(refName: string, rootDict: { [key: string]: object }) {
    this.languages.forEach((language) => (rootDict[language][refName].error ??= {}));
    Object.entries(this.errorDictionary as { [key: string]: Languages }).forEach(([key, value]) => {
      value.forEach((t, idx) => {
        rootDict[this.languages[idx]][refName].error[key] ??= {};
        rootDict[this.languages[idx]][refName].error[key].t = t;
      });
    });
  }
  #registerEtcToRoot(refName: string, rootDict: { [key: string]: object }) {
    Object.entries(this.etcDictionary as { [key: string]: Languages }).forEach(([key, value]) => {
      value.forEach((t, idx) => {
        rootDict[this.languages[idx]][refName][key] ??= {};
        rootDict[this.languages[idx]][refName][key].t = t;
      });
    });
  }
  getEnum<Enum extends { refName: string; value: any }>(
    enumName: EnumKey
  ): { [K in Enum["value"]]: FieldTranslation<Languages> } {
    return this.enumDictionary[enumName] as unknown as { [K in Enum["value"]]: FieldTranslation<Languages> };
  }
}

type MergeTwoModelDicts<ModelDict1, ModelDict2> =
  ModelDict1 extends ModelDictInfo<
    infer Languages1,
    infer ModelKey1,
    infer InsightKey1,
    infer QueryKey1,
    infer SortKey1,
    infer EnumKey1,
    infer BaseSignalKey1,
    infer SliceKey1,
    infer EndpointKey1,
    infer ErrorKey1,
    infer EtcKey1
  >
    ? ModelDict2 extends ModelDictInfo<
        any,
        infer ModelKey2,
        infer InsightKey2,
        infer QueryKey2,
        infer SortKey2,
        infer EnumKey2,
        infer BaseSignalKey2,
        infer SliceKey2,
        infer EndpointKey2,
        infer ErrorKey2,
        infer EtcKey2
      >
      ? ModelDictInfo<
          Languages1,
          ModelKey1 | ModelKey2,
          InsightKey1 | InsightKey2,
          QueryKey1 | QueryKey2,
          SortKey1 | SortKey2,
          EnumKey1 | EnumKey2,
          BaseSignalKey1 | BaseSignalKey2,
          SliceKey1 | SliceKey2,
          EndpointKey1 | EndpointKey2,
          ErrorKey1 | ErrorKey2,
          EtcKey1 | EtcKey2
        >
      : ModelDict1
    : never;
type MergeModelDicts<ModelDicts extends ModelDictInfo<any>[]> = ModelDicts extends [
  infer First extends ModelDictInfo<any>,
  ...infer Rest extends ModelDictInfo<any>[],
]
  ? Rest extends []
    ? First
    : MergeTwoModelDicts<First, MergeModelDicts<Rest>>
  : never;
export const modelDictionary = <
  Languages extends [string, ...string[]] = [string],
  ExtendModelDicts extends ModelDictInfo<any>[] = [],
>(
  languages: Languages = ["en"] as unknown as Languages,
  ...extendModelDicts: ExtendModelDicts
): MergeModelDicts<[ModelDictInfo<Languages>, ...ExtendModelDicts]> => {
  const modelDictionary = extendModelDicts.at(0) ?? new ModelDictInfo(languages);

  return modelDictionary as any;
};

export class ScalarDictInfo<
  Languages extends [string, ...string[]] = [string],
  ModelKey extends string = keyof BaseObject,
  EnumKey extends string = never,
  ErrorKey extends string = never,
  EtcKey extends string = never,
> {
  languages: Languages;
  modelTranslation?: FieldTranslation<Languages>;
  modelDictionary: { [K in ModelKey]: FieldTranslation<Languages> } = {} as {
    [K in ModelKey]: FieldTranslation<Languages>;
  };
  enumDictionary: { [K in EnumKey]: { [key: string]: FieldTranslation<Languages> } } = {} as {
    [K in EnumKey]: { [key: string]: FieldTranslation<Languages> };
  };
  errorDictionary: { [K in ErrorKey]: Languages } = {} as { [K in ErrorKey]: Languages };
  etcDictionary: { [K in EtcKey]: Languages } = {} as { [K in EtcKey]: Languages };
  constructor(languages: Languages) {
    this.languages = languages;
  }
  of(translate: (t: (trans: Languages) => FieldTranslation<Languages>) => FieldTranslation<Languages>) {
    this.modelTranslation = translate(FieldTranslation.translate);
    return this;
  }
  model<Model>(
    translate: (t: (trans: Languages) => FieldTranslation<Languages>) => {
      [K in keyof GetStateObject<Model>]: FieldTranslation<Languages>;
    }
  ) {
    Object.assign(
      this.modelDictionary,
      translate(FieldTranslation.translate),
      ModelDictInfo.baseModelDictionary
    ) as unknown as { [K in ModelKey]: FieldTranslation<Languages> };
    return this as unknown as ScalarDictInfo<
      Languages,
      keyof GetStateObject<Model> & string,
      EnumKey,
      ErrorKey,
      EtcKey
    >;
  }

  enum<Enum extends { refName: string; value: any }>(
    enumName: Enum["refName"],
    translate: (t: (trans: Languages) => FieldTranslation<Languages>) => {
      [K in Enum["value"]]: FieldTranslation<Languages>;
    }
  ) {
    Object.assign(this.enumDictionary, { [enumName]: translate(FieldTranslation.translate) });
    return this as unknown as ScalarDictInfo<Languages, ModelKey, EnumKey | Enum["refName"], ErrorKey, EtcKey>;
  }
  error<ErrorDict extends { [key: string]: Languages }>(errorDictionary: ErrorDict) {
    Object.assign(this.errorDictionary, errorDictionary);
    return this as unknown as ScalarDictInfo<Languages, ModelKey, EnumKey, keyof ErrorDict & string, EtcKey>;
  }
  translate<EtcDict extends { [key: string]: Languages }>(etcDictionary: EtcDict) {
    Object.assign(this.etcDictionary, etcDictionary);
    return this as unknown as ScalarDictInfo<Languages, ModelKey, EnumKey, ErrorKey, keyof EtcDict & string>;
  }
  _registerToRoot(refName: string, rootDict: { [key: string]: object }) {
    this.languages.forEach((language) => {
      rootDict[language] ??= {};
      rootDict[language][refName] ??= {};
    });
    if (this.modelTranslation) {
      this.modelTranslation.trans.forEach((t, idx) => (rootDict[this.languages[idx]][refName].modelName = { t }));
      this.modelTranslation.descTrans?.forEach((t, idx) => (rootDict[this.languages[idx]][refName].modelDesc = { t }));
    }
    this.#registerEnumToRoot(rootDict);
    this.#registerErrorToRoot(refName, rootDict);
    this.#registerModelToRoot(refName, rootDict);
    this.#registerEtcToRoot(refName, rootDict);
  }
  #registerModelToRoot(refName: string, rootDict: { [key: string]: object }) {
    Object.entries(this.modelDictionary as { [key: string]: FieldTranslation<Languages> }).forEach(([key, value]) => {
      value.trans.forEach((t, idx) => (rootDict[this.languages[idx]][refName][key] = { t }));
      value.descTrans?.forEach((t, idx) => (rootDict[this.languages[idx]][refName][key].desc = { t }));
    });
  }
  #registerEnumToRoot(rootDict: { [key: string]: object }) {
    Object.entries(this.enumDictionary as { [key: string]: { [key: string]: FieldTranslation<Languages> } }).forEach(
      ([refName, enumTrans]) => {
        this.languages.forEach((language) => (rootDict[language][refName] ??= {}));
        Object.entries(enumTrans as { [key: string]: FieldTranslation<Languages> }).forEach(([enumKey, enumValue]) => {
          enumValue.trans.forEach((t, idx) => (rootDict[this.languages[idx]][refName][enumKey] = { t }));
          enumValue.descTrans?.forEach((t, idx) => (rootDict[this.languages[idx]][refName][enumKey].desc = { t }));
        });
      }
    );
  }
  #registerErrorToRoot(refName: string, rootDict: { [key: string]: object }) {
    this.languages.forEach((language) => (rootDict[language][refName].error ??= {}));
    Object.entries(this.errorDictionary as { [key: string]: Languages }).forEach(([key, value]) => {
      value.forEach((t, idx) => {
        rootDict[this.languages[idx]][refName].error[key] ??= {};
        rootDict[this.languages[idx]][refName].error[key].t = t;
      });
    });
  }
  #registerEtcToRoot(refName: string, rootDict: { [key: string]: object }) {
    Object.entries(this.etcDictionary as { [key: string]: Languages }).forEach(([key, value]) => {
      value.forEach((t, idx) => {
        rootDict[this.languages[idx]][refName][key] ??= {};
        rootDict[this.languages[idx]][refName][key].t = t;
      });
    });
  }
}

export const scalarDictionary = <Languages extends [string, ...string[]] = [string]>(
  languages: Languages = ["en"] as unknown as Languages
) => new ScalarDictInfo(languages);

export class ServiceDictInfo<
  Languages extends [string, ...string[]] = [string],
  EndpointKey extends string = never,
  ErrorKey extends string = never,
  EtcKey extends string = never,
> {
  languages: Languages;
  endpointDictionary: { [K in EndpointKey]: FunctionTranslation<Languages> } = {} as {
    [K in EndpointKey]: FunctionTranslation<Languages>;
  };
  errorDictionary: { [K in ErrorKey]: Languages } = {} as { [K in ErrorKey]: Languages };
  etcDictionary: { [K in EtcKey]: Languages } = {} as { [K in EtcKey]: Languages };
  constructor(languages: Languages) {
    this.languages = languages;
  }
  endpoint<Endpoint>(
    translate: (fn: (trans: Languages) => FunctionTranslation<Languages>) => {
      [K in keyof Endpoint]: Endpoint[K] extends ApiInfo<any, any, infer ArgNames, any, any, any, any, any, any>
        ? FunctionTranslation<Languages, ArgNames[number]>
        : never;
    }
  ) {
    Object.assign(this.endpointDictionary, translate(fn)) as unknown as {
      [K in EndpointKey]: FunctionTranslation<Languages>;
    };
    return this as unknown as ServiceDictInfo<Languages, keyof Endpoint & string, ErrorKey, EtcKey>;
  }
  error<ErrorDict extends { [key: string]: Languages }>(errorDictionary: ErrorDict) {
    Object.assign(this.errorDictionary, errorDictionary);
    return this as unknown as ServiceDictInfo<Languages, EndpointKey, keyof ErrorDict & string, EtcKey>;
  }
  translate<EtcDict extends { [key: string]: Languages }>(etcDictionary: EtcDict) {
    Object.assign(this.etcDictionary, etcDictionary);
    return this as unknown as ServiceDictInfo<Languages, EndpointKey, ErrorKey, keyof EtcDict & string>;
  }

  _toTranslation(): { [key: string]: string[] } {
    return Object.assign({}, this.errorDictionary, this.etcDictionary);
  }
  _registerToRoot(refName: string, rootDict: { [key: string]: object }) {
    this.languages.forEach((language) => {
      rootDict[language] ??= {};
      rootDict[language][refName] ??= {};
    });
    this.#registerEndpointToRoot(refName, rootDict);
    this.#registerErrorToRoot(refName, rootDict);
    this.#registerEtcToRoot(refName, rootDict);
  }

  #registerEndpointToRoot(refName: string, rootDict: { [key: string]: object }) {
    this.languages.forEach((language) => (rootDict[language][refName].signal ??= {}));
    Object.entries(this.endpointDictionary as { [key: string]: FunctionTranslation<Languages> }).forEach(
      ([key, value]) => {
        value.trans.forEach((t, idx) => (rootDict[this.languages[idx]][refName].signal[key] = { t, arg: {} }));
        value.descTrans?.forEach((t, idx) => (rootDict[this.languages[idx]][refName].signal[key].desc = { t }));
        Object.entries(value.argTrans as { [key: string]: FieldTranslation<Languages> }).forEach(
          ([argKey, argTrans]) => {
            argTrans.trans.forEach(
              (t, idx) => (rootDict[this.languages[idx]][refName].signal[key].arg[argKey] = { t })
            );
            argTrans.descTrans?.forEach(
              (t, idx) => (rootDict[this.languages[idx]][refName].signal[key].arg[argKey].desc = { t })
            );
          }
        );
      }
    );
  }
  #registerErrorToRoot(refName: string, rootDict: { [key: string]: object }) {
    this.languages.forEach((language) => (rootDict[language][refName].error ??= {}));
    Object.entries(this.errorDictionary as { [key: string]: Languages }).forEach(([key, value]) => {
      value.forEach((t, idx) => {
        rootDict[this.languages[idx]][refName].error[key] ??= {};
        rootDict[this.languages[idx]][refName].error[key].t = t;
      });
    });
  }
  #registerEtcToRoot(refName: string, rootDict: { [key: string]: object }) {
    Object.entries(this.etcDictionary as { [key: string]: Languages }).forEach(([key, value]) => {
      value.forEach((t, idx) => {
        rootDict[this.languages[idx]][refName][key] ??= {};
        rootDict[this.languages[idx]][refName][key].t = t;
      });
    });
  }
}
export const serviceDictionary = <Languages extends [string, ...string[]] = [string]>(
  languages: Languages = ["en"] as unknown as Languages
) => new ServiceDictInfo(languages);
