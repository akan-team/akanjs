import { DataList } from "akanjs/base";
import { capitalize } from "akanjs/common";
import { ConstantRegistry, type DefaultOf } from "akanjs/constant";
import type { ExtractSort, FilterInstance } from "akanjs/document";
import type {
  SerializedSlice,
  SlceCnstCapitalizedRefName,
  SlceCnstDefault,
  SlceCnstFull,
  SlceCnstInsight,
  SlceCnstLight,
  SlceCnstRefName,
  SlceDbFilter,
  SlceDbSort,
  SliceCls,
} from "akanjs/signal";
import type { StoreSliceArgs, StoreSliceMap, StoreSliceSuffixCap, Submit } from "./types";

export type SliceStateKey =
  | "defaultModel"
  | "modelInsight"
  | "modelList"
  | "modelListLoading"
  | "modelInitList"
  | "modelInitAt"
  | "modelSelection"
  | "lastPageOfModel"
  | "pageOfModel"
  | "limitOfModel"
  | "queryArgsOfModel"
  | "sortOfModel";
type _SliceMap<S extends SliceCls> = StoreSliceMap<S>;
type _StateRefName<S extends SliceCls> = SlceCnstRefName<S>;
type _StateCap<S extends SliceCls> = SlceCnstCapitalizedRefName<S>;
type _StateFull<S extends SliceCls> = SlceCnstFull<S>;
type _StateLight<S extends SliceCls> = SlceCnstLight<S>;
type _StateInsight<S extends SliceCls> = SlceCnstInsight<S>;
type _StateDefault<S extends SliceCls> = SlceCnstDefault<S>;
type _StateFilter<S extends SliceCls> = SlceDbFilter<S>;
type _StateSort<S extends SliceCls> = SlceDbSort<S>;

type BaseState<RefName extends string, Full, _Default = DefaultOf<Full>> = {
  [K in RefName]: Full | null;
} & {
  [K in `${RefName}Loading`]: string | boolean;
} & {
  [K in `${RefName}Form`]: _Default;
} & {
  [K in `${RefName}FormLoading`]: string | boolean;
} & {
  [K in `${RefName}Submit`]: Submit;
} & {
  [K in `${RefName}ViewAt`]: Date;
} & {
  [K in `${RefName}Modal`]: string | null;
} & {
  [K in `${RefName}Operation`]: "sleep" | "reset" | "idle" | "error" | "loading";
};
export type SliceState<
  RefName extends string,
  Suffix extends string,
  Full,
  Light extends { id: string },
  Args,
  Insight,
  Filter extends FilterInstance,
  _CapitalizedRefName extends string = Capitalize<RefName>,
  _CapitalizedSuffix extends string = Capitalize<Suffix>,
  _Default = DefaultOf<Full>,
  _Sort = ExtractSort<Filter>,
> = {
  [K in `default${_CapitalizedRefName}${_CapitalizedSuffix}`]: _Default;
} & {
  [K in `${RefName}List${_CapitalizedSuffix}`]: DataList<Light>;
} & {
  [K in `${RefName}ListLoading${_CapitalizedSuffix}`]: boolean;
} & {
  [K in `${RefName}InitList${_CapitalizedSuffix}`]: DataList<Light>;
} & {
  [K in `${RefName}InitAt${_CapitalizedSuffix}`]: Date;
} & {
  [K in `${RefName}Selection${_CapitalizedSuffix}`]: DataList<Light>;
} & {
  [K in `${RefName}Insight${_CapitalizedSuffix}`]: Insight;
} & {
  [K in `lastPageOf${_CapitalizedRefName}${_CapitalizedSuffix}`]: number;
} & {
  [K in `pageOf${_CapitalizedRefName}${_CapitalizedSuffix}`]: number;
} & {
  [K in `limitOf${_CapitalizedRefName}${_CapitalizedSuffix}`]: number;
} & {
  [K in `queryArgsOf${_CapitalizedRefName}${_CapitalizedSuffix}`]: Args;
} & {
  [K in `sortOf${_CapitalizedRefName}${_CapitalizedSuffix}`]: _Sort;
};

type DefaultSliceStateFields<
  SlceCls extends SliceCls,
  _RefName extends string,
  _CapRefName extends string,
  _Full,
  _Light extends { id: string },
  _Insight,
  _Default,
  _Sort,
  _Suffixes extends keyof _SliceMap<SlceCls> = keyof _SliceMap<SlceCls>,
> = {
  [Suffix in _Suffixes as `default${_CapRefName}${StoreSliceSuffixCap<SlceCls, Suffix>}`]: _Default;
} & {
  [Suffix in _Suffixes as
    | `${_RefName}List${StoreSliceSuffixCap<SlceCls, Suffix>}`
    | `${_RefName}InitList${StoreSliceSuffixCap<SlceCls, Suffix>}`
    | `${_RefName}Selection${StoreSliceSuffixCap<SlceCls, Suffix>}`]: DataList<_Light>;
} & {
  [Suffix in _Suffixes as `${_RefName}InitAt${StoreSliceSuffixCap<SlceCls, Suffix>}`]: Date;
} & {
  [Suffix in _Suffixes as `${_RefName}ListLoading${StoreSliceSuffixCap<SlceCls, Suffix>}`]: boolean;
} & {
  [Suffix in _Suffixes as `${_RefName}Insight${StoreSliceSuffixCap<SlceCls, Suffix>}`]: _Insight;
} & {
  [Suffix in _Suffixes as
    | `lastPageOf${_CapRefName}${StoreSliceSuffixCap<SlceCls, Suffix>}`
    | `pageOf${_CapRefName}${StoreSliceSuffixCap<SlceCls, Suffix>}`
    | `limitOf${_CapRefName}${StoreSliceSuffixCap<SlceCls, Suffix>}`]: number;
} & {
  [Suffix in _Suffixes as `queryArgsOf${_CapRefName}${StoreSliceSuffixCap<SlceCls, Suffix>}`]: StoreSliceArgs<
    SlceCls,
    Suffix
  >;
} & {
  [Suffix in _Suffixes as `sortOf${_CapRefName}${StoreSliceSuffixCap<SlceCls, Suffix>}`]: _Sort;
};

export type DefaultState<
  SlceCls extends SliceCls,
  _RefName extends _StateRefName<SlceCls> = _StateRefName<SlceCls>,
  _Full = _StateFull<SlceCls>,
  _Light extends { id: string } = _StateLight<SlceCls>,
  _Insight = _StateInsight<SlceCls>,
  _Filter extends FilterInstance = _StateFilter<SlceCls>,
  _CapitalizedRefName extends string = _StateCap<SlceCls>,
  _Default = _StateDefault<SlceCls>,
  _Sort = _StateSort<SlceCls>,
> = BaseState<_RefName, _Full, _Default> &
  DefaultSliceStateFields<SlceCls, _RefName, _CapitalizedRefName, _Full, _Light, _Insight, _Default, _Sort>;

export const createDatabaseState = (refName: string) => {
  const cnst = ConstantRegistry.getDatabase(refName);
  const [fieldName, className] = [refName, capitalize(refName)];
  const names = {
    model: fieldName,
    Model: className,
    modelLoading: `${fieldName}Loading`,
    modelForm: `${fieldName}Form`,
    modelFormLoading: `${fieldName}FormLoading`,
    modelSubmit: `${fieldName}Submit`,
    modelViewAt: `${fieldName}ViewAt`,
    modelModal: `${fieldName}Modal`,
    modelOperation: `${fieldName}Operation`,
  };
  const baseState = {
    [names.model]: null,
    [names.modelLoading]: true,
    [names.modelForm]: new cnst.input() as object,
    [names.modelFormLoading]: true,
    [names.modelSubmit]: { disabled: true, loading: false, times: 0 },
    [names.modelViewAt]: new Date(0),
    [names.modelModal]: null,
    [names.modelOperation]: "sleep",
  };
  return baseState;
};
export const createSliceState = (refName: string, slice: { [key: string]: SerializedSlice }) => {
  const cnst = ConstantRegistry.getDatabase(refName);
  const [fieldName, className] = [refName, capitalize(refName)];
  const names = {
    model: fieldName,
    Model: className,
    defaultModel: `default${className}`,
    defaultModelInsight: `default${className}Insight`,
    modelList: `${fieldName}List`,
    modelListLoading: `${fieldName}ListLoading`,
    modelInitList: `${fieldName}InitList`,
    modelInitAt: `${fieldName}InitAt`,
    modelSelection: `${fieldName}Selection`,
    modelInsight: `${fieldName}Insight`,
    lastPageOfModel: `lastPageOf${className}`,
    pageOfModel: `pageOf${className}`,
    limitOfModel: `limitOf${className}`,
    queryArgsOfModel: `queryArgsOf${className}`,
    sortOfModel: `sortOf${className}`,
  };
  const sliceState: Record<string, unknown> = {};
  Object.entries(slice).forEach(([suffix]) => {
    const sliceName = `${refName}${capitalize(suffix)}`;
    const SliceName = capitalize(sliceName);
    const namesOfSlice: { [key in SliceStateKey]: string } = {
      defaultModel: SliceName.replace(names.Model, names.defaultModel), //clusterInSelf Cluster
      modelList: sliceName.replace(names.model, names.modelList),
      modelListLoading: sliceName.replace(names.model, names.modelListLoading),
      modelInitList: sliceName.replace(names.model, names.modelInitList),
      modelInitAt: sliceName.replace(names.model, names.modelInitAt),
      modelSelection: sliceName.replace(names.model, names.modelSelection),
      modelInsight: sliceName.replace(names.model, names.modelInsight),
      lastPageOfModel: SliceName.replace(names.Model, names.lastPageOfModel),
      pageOfModel: SliceName.replace(names.Model, names.pageOfModel),
      limitOfModel: SliceName.replace(names.Model, names.limitOfModel),
      queryArgsOfModel: SliceName.replace(names.Model, names.queryArgsOfModel),
      sortOfModel: SliceName.replace(names.Model, names.sortOfModel),
    };
    const singleSliceState = {
      [namesOfSlice.defaultModel]: new cnst.full(),
      [namesOfSlice.modelList]: new DataList(),
      [namesOfSlice.modelListLoading]: true,
      [namesOfSlice.modelInitList]: new DataList(),
      [namesOfSlice.modelInitAt]: new Date(0),
      [namesOfSlice.modelSelection]: new DataList(),
      [namesOfSlice.modelInsight]: new cnst.insight(),
      [namesOfSlice.lastPageOfModel]: 1,
      [namesOfSlice.pageOfModel]: 1,
      [namesOfSlice.limitOfModel]: 20,
      [namesOfSlice.queryArgsOfModel]: [],
      [namesOfSlice.sortOfModel]: "latest",
    };
    Object.assign(sliceState, singleSliceState);
  });
  return sliceState;
};
