import type { GetStateObject } from "akanjs/base";
import { capitalize, modelNames, sliceNames } from "akanjs/common";
import type { BaseInsight, BaseObject } from "akanjs/constant";
import type { BaseFilterQueryKey, BaseFilterSortKey } from "akanjs/document";
import type { DictArgNames, DictEndpointShape, DictFilterQuery, DictFilterSort, DictSliceShape } from "./dictShape";
import type { DictionaryNode, RootDictionary } from "./trans";

type MutableDictionaryNode = DictionaryNode & { t?: string; desc?: DictionaryNode };
type EnumValueKey = string | number;
interface Translated {
  trans: readonly string[];
  descTrans?: readonly string[];
}

const ensureNode = (target: DictionaryNode, key: string): MutableDictionaryNode => {
  target[key] ??= {};
  return target[key] as MutableDictionaryNode;
};

const getRootModelNode = (rootDict: RootDictionary, language: string, refName: string): MutableDictionaryNode => {
  rootDict[language] ??= {};
  return ensureNode(rootDict[language], refName);
};

const asIs = (t: string) => t;

// Write order becomes the output's key order.
const rootWriter = (rootDict: RootDictionary, languages: readonly string[], refName: string) => {
  const at = (idx: number, path: readonly string[]) =>
    path.reduce<MutableDictionaryNode>(ensureNode, getRootModelNode(rootDict, languages[idx] as string, refName));
  const put = (
    path: readonly string[],
    key: string,
    { trans, descTrans }: Translated,
    text: (t: string) => string,
    withArg: boolean,
  ) => {
    trans.forEach((t, idx) => {
      at(idx, path)[key] = withArg ? { t: text(t), arg: {} } : { t: text(t) };
    });
    descTrans?.forEach((t, idx) => {
      ensureNode(at(idx, path), key).desc = { t: text(t) };
    });
  };
  const each = <Value>(path: readonly string[], dict: object, write: (key: string, value: Value) => void) => {
    for (const idx of languages.keys()) at(idx, path);
    for (const [key, value] of Object.entries(dict as { [key: string]: Value })) write(key, value);
  };
  for (const idx of languages.keys()) at(idx, []);
  return {
    heading: (translation?: Translated) => {
      translation?.trans.forEach((t, idx) => {
        at(idx, []).modelName = { t };
      });
      translation?.descTrans?.forEach((t, idx) => {
        at(idx, []).modelDesc = { t };
      });
    },
    field: (path: readonly string[], key: string, value: Translated, text = asIs) => put(path, key, value, text, false),
    head: (path: readonly string[], key: string, value: Translated, text: (t: string) => string) =>
      put(path, key, value, text, true),
    fields: (path: readonly string[], dict: object) =>
      each<Translated>(path, dict, (key, value) => put(path, key, value, asIs, false)),
    fns: (path: readonly string[], dict: object) =>
      each<Translated & { argTrans: { [key: string]: Translated } }>(path, dict, (key, value) => {
        put(path, key, value, asIs, true);
        for (const [argKey, argTrans] of Object.entries(value.argTrans))
          put([...path, key, "arg"], argKey, argTrans, asIs, false);
      }),
    texts: (path: readonly string[], dict: object) =>
      each<readonly string[]>(path, dict, (key, value) =>
        value.forEach((t, idx) => {
          ensureNode(at(idx, path), key).t = t;
        }),
      ),
  };
};

const registerEnums = (rootDict: RootDictionary, languages: readonly string[], enumDictionary: object) => {
  for (const [refName, enumTrans] of Object.entries(enumDictionary as { [key: string]: object }))
    rootWriter(rootDict, languages, refName).fields([], enumTrans);
};

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
  argTrans = {} as { [key in ArgName]: FieldTranslation<Languages> };
  constructor(trans: Languages) {
    this.trans = trans;
  }
  desc(descTrans: Languages) {
    this.descTrans = descTrans;
    return this;
  }
  arg<TransMap extends { [key: string]: FieldTranslation<Languages> }>(
    translate: (t: (trans: Languages) => FieldTranslation<Languages>) => TransMap,
  ) {
    Object.assign(this.argTrans, translate(FieldTranslation.translate));
    return this as unknown as FunctionTranslation<Languages, keyof TransMap & string>;
  }
}
const fn = <Languages extends [string, ...string[]] = [string]>(trans: Languages) => new FunctionTranslation(trans);

type BaseModelCrudGetSignalTranslation<
  T extends string,
  Languages extends [string, ...string[]] = [string],
  _CapitalizedRefName extends string = Capitalize<T>,
> = {
  [K in T]: FunctionTranslation<Languages, `${T}Id`>;
} & {
  [K in `light${_CapitalizedRefName}`]: FunctionTranslation<Languages, `${T}Id`>;
} & {
  [K in `create${_CapitalizedRefName}`]: FunctionTranslation<Languages, "data">;
} & {
  [K in `update${_CapitalizedRefName}`]: FunctionTranslation<Languages, `${T}Id` | "data">;
} & {
  [K in `remove${_CapitalizedRefName}`]: FunctionTranslation<Languages, `${T}Id`>;
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
  static baseModelDictionary: {
    [key in keyof BaseObject]: FieldTranslation<[string, string]>;
  } = {
    id: FieldTranslation.translate(["ID", "아이디"]).desc(["Unique ID value", "유니크한 아이디값"]),
    createdAt: FieldTranslation.translate(["CreatedAt", "생성일"]).desc(["Data created time", "데이터 생성 시각"]),
    updatedAt: FieldTranslation.translate(["UpdatedAt", "수정일"]).desc([
      "Data updated time",
      "데이터 마지막 수정 시각",
    ]),
    removedAt: FieldTranslation.translate(["RemovedAt", "삭제일"]).desc(["Data removed time", "데이터 삭제 시각"]),
  };
  static baseInsightDictionary: {
    [key in keyof BaseInsight]: FieldTranslation<[string, string]>;
  } = {
    count: FieldTranslation.translate(["Count", "개수"]).desc(["Total number of items", "총 아이템 개수"]),
  };
  static baseQueryDictionary: {
    [key in BaseFilterQueryKey]: FieldTranslation<[string, string]>;
  } = {
    any: fn(["Any", "전체"]).desc(["All", "전체"]),
  };
  static baseSortDictionary: {
    [key in BaseFilterSortKey]: FieldTranslation<[string, string]>;
  } = {
    latest: FieldTranslation.translate(["Latest", "최신순"]).desc(["Latest", "최신순"]),
    oldest: FieldTranslation.translate(["Oldest", "오래된순"]).desc(["Oldest", "오래된순"]),
    relevance: FieldTranslation.translate(["Relevance", "관련도순"]).desc([
      "Best text-search match first",
      "검색어와 가장 관련있는 순",
    ]),
  };
  static getBaseSignalDictionary<T extends string>(refName: T): BaseModelCrudGetSignalTranslation<T, [string, string]> {
    const capRefName = capitalize(refName);
    const names = modelNames(refName);
    type Translate = (trans: [string, string]) => FieldTranslation<[string, string]>;
    const crud = (en: string, ko: string) => fn([en, ko]).desc([en, ko]);
    const idArg = (t: Translate) => ({
      [names.modelId]: t(["Id", "아이디"]).desc([`Id of ${capRefName}`, `${capRefName} 아이디`]),
    });
    const dataArg = (t: Translate) => ({
      data: t(["Data", "데이터"]).desc([`Data of ${capRefName}`, `${capRefName} 데이터`]),
    });
    return {
      [names.model]: crud(`Get ${capRefName}`, `${capRefName} 조회`).arg(idArg),
      [names.lightModel]: crud(`Get light version of ${capRefName}`, `${capRefName} 경량화 버전 조회`).arg(idArg),
      [names.createModel]: crud(`Create ${capRefName}`, `${capRefName} 생성`).arg(dataArg),
      [names.updateModel]: crud(`Update ${capRefName}`, `${capRefName} 수정`).arg((t) => ({
        ...idArg(t),
        ...dataArg(t),
      })),
      [names.removeModel]: crud(`Remove ${capRefName}`, `${capRefName} 삭제`).arg(idArg),
    } as unknown as BaseModelCrudGetSignalTranslation<T, [string, string]>;
  }
  static baseSliceDictionary: {
    [key in ""]: FunctionTranslation<[string, string], "queryKey" | "args">;
  } = {
    "": fn(["Universal", "유니버설"])
      .desc(["Universal Slice", "유니버설 슬라이스"])
      .arg((t) => ({
        queryKey: t(["Query", "쿼리"]).desc(["Filter query to run", "실행할 필터 쿼리"]),
        args: t(["Arguments", "인자"]).desc(["Arguments of the filter query", "필터 쿼리의 인자"]),
      })),
  };

  languages: Languages;
  modelTranslation?: FieldTranslation<Languages>;
  modelDictionary = {} as { [K in ModelKey]: FieldTranslation<Languages> };
  insightDictionary = {} as { [K in InsightKey]: FieldTranslation<Languages> };
  queryDictionary = {} as { [K in QueryKey]: FunctionTranslation<Languages> };
  sortDictionary = {} as { [K in SortKey]: FieldTranslation<Languages> };
  enumDictionary = {} as { [K in EnumKey]: { [key: string]: FieldTranslation<Languages> } };
  baseSignalDictionary = {} as { [K in BaseSignalKey]: FunctionTranslation<Languages> };
  sliceDictionary = {} as { [K in SliceKey]: FunctionTranslation<Languages> };
  endpointDictionary = {} as { [K in EndpointKey]: FunctionTranslation<Languages> };
  errorDictionary = {} as { [K in ErrorKey]: Languages };
  etcDictionary = {} as { [K in EtcKey]: Languages };
  constructor(languages: Languages) {
    this.languages = languages;
  }
  of(translate: (t: (trans: Languages) => FieldTranslation<Languages>) => FieldTranslation<Languages>) {
    this.modelTranslation = translate(FieldTranslation.translate);
    return this;
  }
  model<Model extends object>(
    translate: (t: (trans: Languages) => FieldTranslation<Languages>) => {
      [K in Exclude<keyof GetStateObject<Model>, ModelKey>]: FieldTranslation<Languages>;
    },
  ) {
    Object.assign(this.modelDictionary, translate(FieldTranslation.translate), ModelDictInfo.baseModelDictionary);
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
  insight<Insight extends object>(
    translate: (t: (trans: Languages) => FieldTranslation<Languages>) => {
      [K in Exclude<keyof GetStateObject<Insight>, InsightKey>]: FieldTranslation<Languages>;
    },
  ) {
    Object.assign(this.insightDictionary, translate(FieldTranslation.translate), ModelDictInfo.baseInsightDictionary);
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
  query<Filter>(
    translate: (fn: (trans: Languages) => FunctionTranslation<Languages>) => {
      [K in Exclude<keyof DictFilterQuery<Filter>, QueryKey>]: FunctionTranslation<
        Languages,
        DictArgNames<DictFilterQuery<Filter>[K]>
      >;
    },
  ) {
    Object.assign(this.queryDictionary, translate(fn), ModelDictInfo.baseQueryDictionary);
    return this as unknown as ModelDictInfo<
      Languages,
      ModelKey,
      InsightKey,
      keyof DictFilterQuery<Filter> & string,
      SortKey,
      EnumKey,
      BaseSignalKey,
      SliceKey,
      EndpointKey,
      ErrorKey,
      EtcKey
    >;
  }
  sort<Filter>(
    translate: (t: (trans: Languages) => FieldTranslation<Languages>) => {
      [K in Exclude<keyof DictFilterSort<Filter>, SortKey>]: FieldTranslation<Languages>;
    },
  ) {
    Object.assign(this.sortDictionary, translate(FieldTranslation.translate), ModelDictInfo.baseSortDictionary);
    return this as unknown as ModelDictInfo<
      Languages,
      ModelKey,
      InsightKey,
      QueryKey,
      keyof DictFilterSort<Filter> & string,
      EnumKey,
      BaseSignalKey,
      SliceKey,
      EndpointKey,
      ErrorKey,
      EtcKey
    >;
  }

  enum<Enum extends { refName: string; value: EnumValueKey }>(
    enumName: Enum["refName"],
    translate: (t: (trans: Languages) => FieldTranslation<Languages>) => {
      [K in Enum["value"]]: FieldTranslation<Languages>;
    },
  ) {
    Object.assign(this.enumDictionary, {
      [enumName]: translate(FieldTranslation.translate),
    });
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
      [K in Exclude<keyof DictSliceShape<Slice>, SliceKey>]: FunctionTranslation<
        Languages,
        DictArgNames<DictSliceShape<Slice>[K]>
      >;
    },
  ) {
    Object.assign(this.sliceDictionary, translate(fn), ModelDictInfo.baseSliceDictionary);
    return this as unknown as ModelDictInfo<
      Languages,
      ModelKey,
      InsightKey,
      QueryKey,
      SortKey,
      EnumKey,
      BaseSignalKey,
      keyof DictSliceShape<Slice> & string,
      EndpointKey,
      ErrorKey,
      EtcKey
    >;
  }
  endpoint<Endpoint>(
    translate: (fn: (trans: Languages) => FunctionTranslation<Languages>) => {
      [K in Exclude<keyof DictEndpointShape<Endpoint>, EndpointKey>]: FunctionTranslation<
        Languages,
        DictArgNames<DictEndpointShape<Endpoint>[K]>
      >;
    },
  ) {
    Object.assign(this.endpointDictionary, translate(fn));
    return this as unknown as ModelDictInfo<
      Languages,
      ModelKey,
      InsightKey,
      QueryKey,
      SortKey,
      EnumKey,
      BaseSignalKey,
      SliceKey,
      keyof DictEndpointShape<Endpoint> & string,
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
  applyBaseSignal<RefName extends string>(refName: RefName) {
    Object.assign(this.baseSignalDictionary, ModelDictInfo.getBaseSignalDictionary(refName));
    return this as unknown as ModelDictInfo<
      Languages,
      ModelKey,
      InsightKey,
      QueryKey,
      SortKey,
      EnumKey,
      GetBaseSignalKey<RefName>,
      SliceKey,
      EndpointKey,
      ErrorKey,
      EtcKey
    >;
  }
  _registerToRoot(refName: string, rootDict: RootDictionary) {
    const root = rootWriter(rootDict, this.languages, refName);
    root.heading(this.modelTranslation);
    root.fields(["insight"], this.insightDictionary);
    root.fns(["query"], this.queryDictionary);
    root.fields(["sort"], this.sortDictionary);
    registerEnums(rootDict, this.languages, this.enumDictionary);
    root.fns(["signal"], this.baseSignalDictionary);
    for (const [sliceKey, sliceTrans] of Object.entries(
      this.sliceDictionary as { [key: string]: FunctionTranslation<Languages> },
    )) {
      const { list: listKey, insight: insightKey } = sliceNames(refName, sliceKey).endpoint;
      root.head(["signal"], listKey, sliceTrans, (t) => `Slice List - ${t}`);
      root.head(["signal"], insightKey, sliceTrans, (t) => `Slice Insight - ${t}`);
      for (const [argKey, argTrans] of Object.entries(sliceTrans.argTrans as { [key: string]: Translated })) {
        root.field(["signal", listKey, "arg"], argKey, argTrans);
        for (const pageKey of ["skip", "limit", "sort"])
          root.field(["signal", listKey, "arg"], pageKey, argTrans, () => pageKey);
        root.field(["signal", insightKey, "arg"], argKey, argTrans);
      }
    }
    root.fns(["signal"], this.endpointDictionary);
    // Under its own `error` node rather than beside `signal`, because an error key may equal an endpoint key.
    root.texts(["error"], this.errorDictionary);
    root.fields([], this.modelDictionary);
    root.texts([], this.etcDictionary);
  }
  getEnum<Enum extends { refName: string; value: EnumValueKey }>(
    enumName: EnumKey,
  ): { [K in Enum["value"]]: FieldTranslation<Languages> } {
    return this.enumDictionary[enumName] as unknown as {
      [K in Enum["value"]]: FieldTranslation<Languages>;
    };
  }
}

// XXX: a parameter added to `ModelDictInfo` must be added in the same slot of all three lists below — a missed one
// still compiles, but inference shifts and the last parameter silently becomes `never`.
// biome-ignore lint/suspicious/noExplicitAny: wildcard type used to merge arbitrary dictionary instances.
type AnyModelDictInfo = ModelDictInfo<any, any, any, any, any, any, any, any, any, any, any>;

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
        infer _Languages2,
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
type MergeModelDicts<ModelDicts extends AnyModelDictInfo[]> = ModelDicts extends [
  infer First extends AnyModelDictInfo,
  ...infer Rest extends AnyModelDictInfo[],
]
  ? Rest extends []
    ? First
    : MergeTwoModelDicts<First, MergeModelDicts<Rest>>
  : never;
export const modelDictionary = <
  Languages extends [string, ...string[]] = [string],
  ExtendModelDicts extends AnyModelDictInfo[] = [],
>(
  languages: Languages = ["en"] as unknown as Languages,
  ...extendModelDicts: ExtendModelDicts
) =>
  (extendModelDicts.at(0) ?? new ModelDictInfo(languages)) as unknown as MergeModelDicts<
    [ModelDictInfo<Languages>, ...ExtendModelDicts]
  >;

export class ScalarDictInfo<
  Languages extends [string, ...string[]] = [string],
  ModelKey extends string = keyof BaseObject,
  EnumKey extends string = never,
  ErrorKey extends string = never,
  EtcKey extends string = never,
> {
  languages: Languages;
  modelTranslation?: FieldTranslation<Languages>;
  modelDictionary = {} as { [K in ModelKey]: FieldTranslation<Languages> };
  enumDictionary = {} as { [K in EnumKey]: { [key: string]: FieldTranslation<Languages> } };
  errorDictionary = {} as { [K in ErrorKey]: Languages };
  etcDictionary = {} as { [K in EtcKey]: Languages };
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
    },
  ) {
    Object.assign(this.modelDictionary, translate(FieldTranslation.translate), ModelDictInfo.baseModelDictionary);
    return this as unknown as ScalarDictInfo<
      Languages,
      keyof GetStateObject<Model> & string,
      EnumKey,
      ErrorKey,
      EtcKey
    >;
  }

  enum<Enum extends { refName: string; value: EnumValueKey }>(
    enumName: Enum["refName"],
    translate: (t: (trans: Languages) => FieldTranslation<Languages>) => {
      [K in Enum["value"]]: FieldTranslation<Languages>;
    },
  ) {
    Object.assign(this.enumDictionary, {
      [enumName]: translate(FieldTranslation.translate),
    });
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
  _registerToRoot(refName: string, rootDict: RootDictionary) {
    const root = rootWriter(rootDict, this.languages, refName);
    root.heading(this.modelTranslation);
    registerEnums(rootDict, this.languages, this.enumDictionary);
    root.texts(["error"], this.errorDictionary);
    root.fields([], this.modelDictionary);
    root.texts([], this.etcDictionary);
  }
}

export const scalarDictionary = <Languages extends [string, ...string[]] = [string]>(
  languages: Languages = ["en"] as unknown as Languages,
) => new ScalarDictInfo(languages);

export class ServiceDictInfo<
  Languages extends [string, ...string[]] = [string],
  EndpointKey extends string = never,
  ErrorKey extends string = never,
  EtcKey extends string = never,
> {
  languages: Languages;
  endpointDictionary = {} as { [K in EndpointKey]: FunctionTranslation<Languages> };
  errorDictionary = {} as { [K in ErrorKey]: Languages };
  etcDictionary = {} as { [K in EtcKey]: Languages };
  constructor(languages: Languages) {
    this.languages = languages;
  }
  endpoint<Endpoint>(
    translate: (fn: (trans: Languages) => FunctionTranslation<Languages>) => {
      [K in keyof DictEndpointShape<Endpoint>]: FunctionTranslation<
        Languages,
        DictArgNames<DictEndpointShape<Endpoint>[K]>
      >;
    },
  ) {
    Object.assign(this.endpointDictionary, translate(fn));
    return this as unknown as ServiceDictInfo<Languages, keyof DictEndpointShape<Endpoint> & string, ErrorKey, EtcKey>;
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
  _registerToRoot(refName: string, rootDict: RootDictionary) {
    const root = rootWriter(rootDict, this.languages, refName);
    root.fns(["signal"], this.endpointDictionary);
    root.texts(["error"], this.errorDictionary);
    root.texts([], this.etcDictionary);
  }
}
export const serviceDictionary = <Languages extends [string, ...string[]] = [string]>(
  languages: Languages = ["en"] as unknown as Languages,
) => new ServiceDictInfo(languages);
