"use client";
/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-empty-object-type */
import {
  BaseInsight,
  BaseObject,
  DataList,
  type Dayjs,
  type GetStateObject,
  type MergeAllKeyOfTypes,
  type MergeAllTypes,
  type MergedValues,
  type Prettify,
  Type,
} from "@akanjs/base";
import {
  applyMixins,
  capitalize,
  deepObjectify,
  type FetchPolicy,
  isQueryEqual,
  Logger,
  lowerlize,
  pathSet,
} from "@akanjs/common";
import {
  constantInfo,
  DefaultOf,
  DocumentModel,
  FieldState,
  getFieldMetas,
  ProtoFile,
  QueryOf,
} from "@akanjs/constant";
import { msg } from "@akanjs/dictionary";
import type { BaseFilterSortKey, ExtractQuery, ExtractSort, FilterInstance } from "@akanjs/document";
import {
  DbGraphQL,
  type DynamicSliceArgMap,
  FetchInitForm,
  immerify,
  SerializedSignal,
  SliceMeta,
} from "@akanjs/signal";
import { RefObject, useEffect, useRef } from "react";
import { create, Mutate, StoreApi } from "zustand";
import { devtools, subscribeWithSelector } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";

import { storeInfo } from "./storeInfo";
import type { Submit } from "./types";

export const baseSt = {} as unknown as WithSelectors<unknown, unknown, {}>;

class StoreStorage {}
interface StoreMeta {
  refName: string;
  useKeys: string[];
  doKeys: string[];
  slices: SliceMeta[];
}
export const getStoreMeta = (storeName: string): StoreMeta => {
  const storeMeta = Reflect.getMetadata(storeName, StoreStorage.prototype as object) as StoreMeta | undefined;
  if (!storeMeta) throw new Error(`storeMeta is not defined: ${storeName}`);
  return storeMeta;
};
export const setStoreMeta = (storeName: string, storeMeta: StoreMeta) => {
  Reflect.defineMetadata(storeName, storeMeta, StoreStorage.prototype);
};

type SliceStateKey =
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
type SliceActionKey =
  | "initModel"
  | "refreshModel"
  | "selectModel"
  | "setPageOfModel"
  | "addPageOfModel"
  | "setLimitOfModel"
  | "setQueryArgsOfModel"
  | "setSortOfModel";
type BaseState<T extends string, Full, _Default = DefaultOf<Full>> = {
  [K in T]: Full | null;
} & {
  [K in `${T}Loading`]: string | boolean;
} & {
  [K in `${T}Form`]: _Default;
} & {
  [K in `${T}FormLoading`]: string | boolean;
} & {
  [K in `${T}Submit`]: Submit;
} & {
  [K in `${T}ViewAt`]: Date;
} & {
  [K in `${T}Modal`]: string | null;
} & {
  [K in `${T}Operation`]: "sleep" | "reset" | "idle" | "error" | "loading";
};

type SliceState<
  T extends string,
  Full,
  Light extends { id: string },
  QueryArgs,
  Insight,
  Filter extends FilterInstance,
  _CapitalizedT extends string = Capitalize<T>,
  _Default = DefaultOf<Full>,
  _Sort = ExtractSort<Filter>,
> = {
  [K in `default${_CapitalizedT}`]: _Default;
} & {
  [K in `${T}List`]: DataList<Light>;
} & {
  [K in `${T}ListLoading`]: boolean;
} & {
  [K in `${T}InitList`]: DataList<Light>;
} & {
  [K in `${T}InitAt`]: Date;
} & {
  [K in `${T}Selection`]: DataList<Light>;
} & {
  [K in `${T}Insight`]: Insight;
} & {
  [K in `lastPageOf${_CapitalizedT}`]: number;
} & {
  [K in `pageOf${_CapitalizedT}`]: number;
} & {
  [K in `limitOf${_CapitalizedT}`]: number;
} & {
  [K in `queryArgsOf${_CapitalizedT}`]: QueryArgs;
} & {
  [K in `sortOf${_CapitalizedT}`]: _Sort;
};

type DefaultState<
  T extends string,
  Input,
  Full,
  Light extends { id: string },
  Insight,
  Filter extends FilterInstance,
  Signal,
  _CapitalizedT extends string = Capitalize<T>,
  _Default = DefaultOf<Full>,
  _DefaultInput = DefaultOf<Input>,
  _DefaultState = GetStateObject<Full>,
  _DefaultStateInput = GetStateObject<Input>,
  _Doc = DocumentModel<Full>,
  _DocInput = DocumentModel<Input>,
  _QueryOfDoc = QueryOf<DocumentModel<Full>>,
  _Query = ExtractQuery<Filter>,
  _Sort = ExtractSort<Filter>,
  _DynamicSliceArgMap = DynamicSliceArgMap<T, Input, Full, Filter, Signal, _CapitalizedT, _DefaultInput, _Sort>,
  _DefaultSliceState = SliceState<
    T,
    Full,
    Light,
    [query: _QueryOfDoc],
    Insight,
    Filter,
    _CapitalizedT,
    _Default,
    _Sort
  >,
  _DynamicSliceStateMap = {
    [Suffix in keyof _DynamicSliceArgMap as Suffix extends string ? Suffix : never]: Suffix extends string
      ? SliceState<T, Full, Light, _DynamicSliceArgMap[Suffix], Insight, Filter, _CapitalizedT, _Default, _Sort>
      : never;
  },
> = BaseState<T, Full, _Default> &
  _DefaultSliceState &
  MergedValues<{
    [Suffix in keyof _DynamicSliceStateMap as Suffix extends string ? Suffix : never]: {
      [K in keyof _DynamicSliceStateMap[Suffix] as K extends string
        ? Suffix extends string
          ? `${K}${Suffix}`
          : never
        : never]: _DynamicSliceStateMap[Suffix][K];
    };
  }>;

const createDatabaseState = (refName: string) => {
  const cnst = constantInfo.getDatabase(refName);
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
    [names.modelForm]: cnst.getDefault() as object,
    [names.modelFormLoading]: true,
    [names.modelSubmit]: { disabled: true, loading: false, times: 0 },
    [names.modelViewAt]: new Date(0),
    [names.modelModal]: null,
    [names.modelOperation]: "sleep",
  };
  return baseState;
};

const createSliceState = (refName: string, slices: SliceMeta[]) => {
  const cnst = constantInfo.getDatabase(refName);
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
  const sliceState = slices.reduce((acc, { sliceName, defaultArgs }) => {
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
      [namesOfSlice.defaultModel]: cnst.getDefault() as object,
      [namesOfSlice.modelList]: new DataList(),
      [namesOfSlice.modelListLoading]: true,
      [namesOfSlice.modelInitList]: new DataList(),
      [namesOfSlice.modelInitAt]: new Date(0),
      [namesOfSlice.modelSelection]: new DataList(),
      [namesOfSlice.modelInsight]: cnst.getDefaultInsight() as object,
      [namesOfSlice.lastPageOfModel]: 1,
      [namesOfSlice.pageOfModel]: 1,
      [namesOfSlice.limitOfModel]: 20,
      [namesOfSlice.queryArgsOfModel]: defaultArgs,
      [namesOfSlice.sortOfModel]: "latest",
    };
    return Object.assign(acc, singleSliceState);
  }, {});
  return sliceState;
};

type GetState<T, K> = K extends keyof T ? T[K] : never;

type PickState<G> = G extends () => infer S ? PickFunc<S, keyof S> : never;
type PickFunc<T, F extends keyof T = keyof T> = (...fields: F[]) => {
  [K in (typeof fields)[number]]: Exclude<T[K], null | undefined | "loading">;
}; // & { [K in keyof T as T[K] extends (...args: any) => any ? K : never]: T[K] };
type MakeState<Maker> = Maker extends (...args: any) => infer S ? S : Maker;

export interface SetGet<State> {
  set: (state: Partial<MakeState<State>> | ((state: MakeState<State>) => any)) => void;
  get: GetState<Mutate<StoreApi<MakeState<State>>, []>, "getState">;
  pick: PickState<GetState<Mutate<StoreApi<MakeState<State>>, []>, "getState">>;
}
export interface SetPick<State> {
  set: (state: Partial<MakeState<State>> | ((state: MakeState<State>) => any)) => void;
  pick: PickState<GetState<Mutate<StoreApi<MakeState<State>>, []>, "getState">>;
}
export type State<StateMaker, Actions = () => Record<string, never>> = (StateMaker extends (...args: any) => infer R
  ? R
  : StateMaker) &
  (Actions extends (...args: any) => infer R ? R : never);
export type Get<State, Actions> = MakeState<State> & MakeState<Actions>;

export interface CreateOption<Full extends { id: string }> {
  idx?: number;
  path?: string;
  modal?: string;
  sliceName?: string;
  onError?: (e: string) => void;
  onSuccess?: (model: Full) => void | Promise<void>;
}
export interface NewOption {
  modal?: string;
  setDefault?: boolean;
  sliceName?: string;
}

type PartialOrNull<O> = { [K in keyof O]?: O[K] | null };
type OptionalArgs<T extends any[]> = T extends [infer Head, ...infer Tail]
  ? [arg?: Head | null, ...OptionalArgs<Tail>]
  : [];
type BaseAction<
  T extends string,
  Input,
  Full extends { id: string },
  Light,
  _CapitalizedT extends string = Capitalize<T>,
  _CreateOption = CreateOption<Full>,
> = {
  [K in `create${_CapitalizedT}InForm`]: (options?: _CreateOption) => Promise<void>;
} & {
  [K in `update${_CapitalizedT}InForm`]: (options?: _CreateOption) => Promise<void>;
} & {
  [K in `create${_CapitalizedT}`]: (data: Input, options?: _CreateOption) => Promise<void>;
} & {
  [K in `update${_CapitalizedT}`]: (id: string, data: Input, options?: _CreateOption) => Promise<void>;
} & {
  [K in `remove${_CapitalizedT}`]: (id: string, options?: FetchPolicy & { modal?: string | null }) => Promise<void>;
} & {
  [K in `check${_CapitalizedT}Submitable`]: (disabled?: boolean) => Promise<void>;
} & {
  [K in `submit${_CapitalizedT}`]: (options?: _CreateOption) => Promise<void>;
} & {
  [K in `new${_CapitalizedT}`]: (partial?: PartialOrNull<Full>, options?: NewOption) => void;
} & {
  [K in `edit${_CapitalizedT}`]: (
    model: Full | string,
    options?: { modal?: string | null } & FetchPolicy
  ) => Promise<void>;
} & {
  [K in `merge${_CapitalizedT}`]: (model: Full | string, data: Partial<Full>, options?: FetchPolicy) => Promise<void>;
} & {
  [K in `view${_CapitalizedT}`]: (
    model: Full | string,
    options?: { modal?: string | null } & FetchPolicy
  ) => Promise<void>;
} & { [K in `set${_CapitalizedT}`]: (...models: (Full | Light)[]) => void } & {
  [K in `reset${_CapitalizedT}`]: (model?: Full) => void;
};
type SliceAction<
  T extends string,
  Input,
  Full extends { id: string },
  Light,
  QueryArgs extends any[],
  Filter extends FilterInstance,
  _CapitalizedT extends string = Capitalize<T>,
  _Sort = ExtractSort<Filter>,
  _FetchInitFormWithFetchPolicy = FetchInitForm<Input, Full, Filter> & FetchPolicy,
> = {
  [K in `init${_CapitalizedT}`]: (
    ...args: [...args: QueryArgs, initForm?: _FetchInitFormWithFetchPolicy]
  ) => Promise<void>;
} & {
  [K in `refresh${_CapitalizedT}`]: (
    initForm?: _FetchInitFormWithFetchPolicy & { queryArgs?: QueryArgs }
  ) => Promise<void>;
} & {
  [K in `select${_CapitalizedT}`]: (model: Light | Light[], options?: { refresh?: boolean; remove?: boolean }) => void;
} & {
  [K in `setPageOf${_CapitalizedT}`]: (page: number, options?: FetchPolicy) => Promise<void>;
} & {
  [K in `addPageOf${_CapitalizedT}`]: (page: number, options?: FetchPolicy) => Promise<void>;
} & {
  [K in `setLimitOf${_CapitalizedT}`]: (limit: number, options?: FetchPolicy) => Promise<void>;
} & {
  [K in `setQueryArgsOf${_CapitalizedT}`]: (
    ...args:
      | [...args: QueryArgs, options?: FetchPolicy]
      | [setQueryArgs: (...prevQueryArgs: QueryArgs) => QueryArgs, options?: FetchPolicy]
  ) => Promise<void>;
} & {
  [K in `setSortOf${_CapitalizedT}`]: (sort: _Sort, options?: FetchPolicy) => Promise<void>;
};

type DefaultActions<
  T extends string,
  Input,
  Full extends { id: string },
  Light,
  Filter extends FilterInstance,
  Fetch,
  Signal,
  _CapitalizedT extends string = Capitalize<T>,
  _Default = DefaultOf<Full>,
  _DefaultInput = DefaultOf<Input>,
  _DefaultState = GetStateObject<_Default>,
  _DefaultStateInput = GetStateObject<_DefaultInput>,
  _Doc = DocumentModel<Full>,
  _DocInput = DocumentModel<Input>,
  _QueryOfDoc = QueryOf<DocumentModel<Full>>,
  _Sort = ExtractSort<Filter>,
  _DynamicSliceArgMap = DynamicSliceArgMap<T, Input, Full, Filter, Signal, _CapitalizedT, _DefaultInput, _Sort>,
  _CreateOption = CreateOption<Full>,
  _FetchInitFormWithFetchPolicy = FetchInitForm<Input, Full, Filter> & FetchPolicy,
  _DefaultSliceAction = SliceAction<
    T,
    Input,
    Full,
    Light,
    [query: _QueryOfDoc],
    Filter,
    _CapitalizedT,
    _Sort,
    _FetchInitFormWithFetchPolicy
  >,
  _DynamicSliceActionMap = {
    [Suffix in keyof _DynamicSliceArgMap as Suffix extends string ? Suffix : never]: Suffix extends string
      ? _DynamicSliceArgMap[Suffix] extends any[]
        ? SliceAction<
            T,
            Input,
            Full,
            Light,
            _DynamicSliceArgMap[Suffix],
            Filter,
            _CapitalizedT,
            _Sort,
            _FetchInitFormWithFetchPolicy
          >
        : never
      : never;
  },
> = BaseAction<T, Input, Full, Light, _CapitalizedT, _CreateOption> &
  FormSetter<Full, T, _CapitalizedT, _DefaultState> &
  _DefaultSliceAction &
  MergedValues<{
    [Suffix in keyof _DynamicSliceActionMap as Suffix extends string ? Suffix : never]: {
      [K in keyof _DynamicSliceActionMap[Suffix] as K extends string
        ? Suffix extends string
          ? `${K}${Suffix}`
          : never
        : never]: _DynamicSliceActionMap[Suffix][K];
    };
  }>;

type SingleOf<M> = M extends (infer V)[] ? V : never;
type SetterKey<
  Prefix extends string,
  K extends string,
  T extends string,
  _CapitalizedT extends string = Capitalize<T>,
  _CapitalizedK extends string = Capitalize<K>,
> = `${Prefix}${_CapitalizedK}On${_CapitalizedT}`;

type FieldFormSetter<DefaultState, T extends string, _CapitalizedT extends string = Capitalize<T>> = {
  [K in keyof DefaultState as K extends string ? SetterKey<"set", K, T, _CapitalizedT> : never]: (
    value: FieldState<DefaultState[K]>
  ) => void;
};
type ArrayFieldFormSetter<
  Key extends string,
  T extends string,
  SingleDefaultField,
  _CapitalizedT extends string = Capitalize<T>,
> = {
  [K in SetterKey<"add", Key, T, _CapitalizedT>]: (
    value: SingleDefaultField | SingleDefaultField[],
    options?: { idx?: number; limit?: number }
  ) => void;
} & {
  [K in SetterKey<"sub", Key, T, _CapitalizedT>]: (idx: number | number[]) => void;
} & {
  [K in SetterKey<"addOrSub", Key, T, _CapitalizedT>]: (
    value: SingleDefaultField,
    options?: { idx?: number; limit?: number }
  ) => void;
};

type FormSetter<
  Full,
  T extends string,
  _CapitalizedT extends string = Capitalize<T>,
  _DefaultState = DefaultOf<Full>,
> = FieldFormSetter<_DefaultState, T, _CapitalizedT> &
  MergedValues<{
    [K in keyof _DefaultState as _DefaultState[K] extends any[] ? K : never]: K extends string
      ? ArrayFieldFormSetter<K, T, DefaultOf<SingleOf<_DefaultState[K]>>, _CapitalizedT>
      : never;
  }> & {
    [K in keyof _DefaultState as _DefaultState[K] extends (ProtoFile | null) | ProtoFile[]
      ? K extends string
        ? SetterKey<"upload", K, T, _CapitalizedT>
        : never
      : never]: (fileList: FileList, idx?: number) => Promise<void>;
  } & {
    [K in `writeOn${_CapitalizedT}`]: (path: string | (string | number)[], value: any) => void;
  };

const makeFormSetter = (refName: string) => {
  type Light = BaseObject;
  const [fieldName, className] = [refName, capitalize(refName)];
  const modelRef = constantInfo.getDatabase(refName).full;
  const fieldMetas = getFieldMetas(modelRef);
  const names = {
    model: fieldName,
    Model: className,
    modelForm: `${fieldName}Form`,
    writeOnModel: `writeOn${className}`,
    addModelFiles: `add${className}Files`,
  };
  const baseSetAction = {
    [names.writeOnModel]: function (this: SetGet<any>, path: string | (string | number)[], value: any) {
      this.set((state: { [key: string]: any }) => {
        pathSet(state[names.modelForm], path, value);
      });
    },
  };
  const fieldSetAction = fieldMetas.reduce((acc, fieldMeta) => {
    const [fieldKeyName, classKeyName] = [lowerlize(fieldMeta.key), capitalize(fieldMeta.key)];
    const namesOfField = {
      field: fieldKeyName,
      Field: classKeyName,
      setFieldOnModel: `set${classKeyName}On${className}`,
      addFieldOnModel: `add${classKeyName}On${className}`,
      subFieldOnModel: `sub${classKeyName}On${className}`,
      addOrSubFieldOnModel: `addOrSub${classKeyName}On${className}`,
      uploadFieldOnModel: `upload${classKeyName}On${className}`,
    };
    const singleFieldSetAction = {
      [namesOfField.setFieldOnModel]: function (this: SetGet<any>, value: any) {
        this.set((state: { [key: string]: any }) => {
          const setValue = fieldMeta.isClass
            ? immerify<object>(fieldMeta.modelRef, value as object)
            : (value as object);
          (state[names.modelForm] as { [key: string]: any })[namesOfField.field] = setValue;
        });
      },
      ...(fieldMeta.isArray
        ? {
            [namesOfField.addFieldOnModel]: function (
              this: SetGet<any>,
              value: Light | Light[],
              options: { idx?: number; limit?: number } = {}
            ) {
              const form = (this.get() as { [key: string]: any })[names.modelForm] as { [key: string]: any };
              const length = (form[namesOfField.field] as any[]).length;
              if (options.limit && options.limit <= length) return;
              const idx = options.idx ?? length;
              const setValue = fieldMeta.isClass ? immerify<Light | Light[]>(fieldMeta.modelRef, value) : value;
              this.set((state: { [key: string]: any }) => {
                (state[names.modelForm] as { [key: string]: any })[namesOfField.field] = [
                  ...(form[namesOfField.field] as object[]).slice(0, idx),
                  ...(Array.isArray(setValue) ? setValue : [setValue]),
                  ...(form[namesOfField.field] as object[]).slice(idx),
                ];
              });
            },
            [namesOfField.subFieldOnModel]: function (this: SetGet<any>, idx: number | number[]) {
              const form = (this.get() as { [key: string]: any })[names.modelForm] as { [key: string]: object[] };
              this.set((state: { [key: string]: any }) => {
                (state[names.modelForm] as { [key: string]: any })[namesOfField.field] =
                  typeof idx === "number"
                    ? form[namesOfField.field].filter((_, i) => i !== idx)
                    : form[namesOfField.field].filter((_, i) => !idx.includes(i));
              });
            },
            [namesOfField.addOrSubFieldOnModel]: function (
              this: SetGet<any>,
              value: any,
              options: { idx?: number; limit?: number } = {}
            ) {
              const { [names.modelForm]: form } = this.get() as { [key: string]: { [key: string]: any[] } };
              const index = form[namesOfField.field].findIndex((v) => v === value);
              if (index === -1) (this[namesOfField.addFieldOnModel] as (...args: any) => void)(value, options);
              else (this[namesOfField.subFieldOnModel] as (...args: any) => void)(index);
            },
          }
        : {}),
      ...(fieldMeta.isClass && constantInfo.getRefName(fieldMeta.modelRef) === "file"
        ? {
            [namesOfField.uploadFieldOnModel]: async function (this: SetGet<any>, fileList: FileList, index?: number) {
              const form = (this.get() as { [key: string]: any })[names.modelForm] as { [key: string]: any };
              if (!fileList.length) return;
              const files = await (fetch[names.addModelFiles] as (...args: any) => Promise<ProtoFile[]>)(
                fileList,
                form.id
              );
              if (fieldMeta.isArray) {
                const idx = index ?? (form[namesOfField.field] as ProtoFile[]).length;
                this.set((state: { [key: string]: { [key: string]: ProtoFile[] } }) => {
                  state[names.modelForm][namesOfField.field] = [
                    ...(form[namesOfField.field] as ProtoFile[]).slice(0, idx),
                    ...files,
                    ...(form[namesOfField.field] as ProtoFile[]).slice(idx),
                  ];
                });
              } else {
                this.set((state: { [key: string]: { [key: string]: ProtoFile | null } }) => {
                  state[names.modelForm][namesOfField.field] = files[0];
                });
              }
              files.map((file) => {
                const intervalKey = setInterval(() => {
                  void (async () => {
                    const currentFile = await (
                      (fetch as { [key: string]: any }).file as (id: string) => Promise<ProtoFile>
                    )(file.id);
                    if (fieldMeta.isArray)
                      this.set((state: { [key: string]: { [key: string]: ProtoFile[] } }) => {
                        state[names.modelForm][namesOfField.field] = state[names.modelForm][namesOfField.field].map(
                          (file) => (file.id === currentFile.id ? currentFile : file)
                        );
                      });
                    else
                      this.set((state: { [key: string]: { [key: string]: ProtoFile | null } }) => {
                        state[names.modelForm][namesOfField.field] = currentFile;
                      });
                    if (currentFile.status !== "uploading") clearInterval(intervalKey);
                  })();
                }, 3000);
              });
            },
          }
        : {}),
    };
    return Object.assign(acc, singleFieldSetAction);
  }, {});
  return Object.assign(fieldSetAction, baseSetAction);
};
const makeActions = (refName: string, slices: SliceMeta[]) => {
  type Input = BaseObject;
  interface Insight {
    count: number;
  }
  type Full = BaseObject;
  type Light = BaseObject;
  type Filter = FilterInstance;
  type Sort = BaseFilterSortKey;
  const [fieldName, className] = [refName, capitalize(refName)];
  const cnst = constantInfo.getDatabase(refName);
  const modelRef = cnst.full;
  const names = {
    model: fieldName,
    _model: `_${fieldName}`,
    Model: className,
    modelOperation: `${fieldName}Operation`,
    defaultModel: `default${className}`,
    modelInsight: `${fieldName}Insight`,
    modelForm: `${fieldName}Form`,
    modelSubmit: `${fieldName}Submit`,
    modelLoading: `${fieldName}Loading`,
    modelFormLoading: `${fieldName}FormLoading`,
    modelList: `${fieldName}List`,
    modelListLoading: `${fieldName}ListLoading`,
    modelSelection: `${fieldName}Selection`,
    createModelInForm: `create${className}InForm`,
    updateModelInForm: `modify${className}InForm`,
    createModel: `create${className}`,
    updateModel: `update${className}`,
    removeModel: `remove${className}`,
    checkModelSubmitable: `check${className}Submitable`,
    submitModel: `submit${className}`,
    newModel: `new${className}`,
    editModel: `edit${className}`,
    mergeModel: `merge${className}`,
    viewModel: `view${className}`,
    setModel: `set${className}`,
    resetModel: `reset${className}`,
    modelViewAt: `${fieldName}ViewAt`,
    modelModal: `${fieldName}Modal`,
    initModel: `init${className}`,
    modelInitList: `${fieldName}InitList`,
    modelInitAt: `${fieldName}InitAt`,
    refreshModel: `refresh${className}`,
    selectModel: `select${className}`,
    setPageOfModel: `setPageOf${className}`,
    addPageOfModel: `addPageOf${className}`,
    setLimitOfModel: `setLimitOf${className}`,
    setQueryArgsOfModel: `setQueryArgsOf${className}`,
    setSortOfModel: `setSortOf${className}`,
    lastPageOfModel: `lastPageOf${className}`,
    pageOfModel: `pageOf${className}`,
    limitOfModel: `limitOf${className}`,
    queryArgsOfModel: `queryArgsOf${className}`,
    sortOfModel: `sortOf${className}`,
  };
  const baseAction = {
    [names.createModelInForm]: async function (
      this: SetGet<any>,
      { idx, path, modal, sliceName = names.model, onError, onSuccess }: CreateOption<Full> = {}
    ) {
      const SliceName = capitalize(sliceName);
      const namesOfSlice = {
        defaultModel: SliceName.replace(names.Model, names.defaultModel),
        modelList: sliceName.replace(names.model, names.modelList),
        modelListLoading: sliceName.replace(names.model, names.modelListLoading),
        modelInsight: sliceName.replace(names.model, names.modelInsight),
      };
      const currentState = this.get() as { [key: string]: any };
      const modelForm = currentState[names.modelForm] as Input;
      const modelList = currentState[namesOfSlice.modelList] as DataList<Light>;
      const modelListLoading = currentState[namesOfSlice.modelListLoading] as boolean;
      const modelInsight = currentState[namesOfSlice.modelInsight] as Insight & BaseInsight;
      const defaultModel = currentState[namesOfSlice.defaultModel] as Full;
      const modelInput = (cnst.purify as (form: any) => DefaultOf<Input> | null)(modelForm);
      if (!modelInput) return;
      this.set({ [names.modelLoading]: true });
      const model = await (fetch[names.createModel] as (...args) => Promise<Full>)(modelInput, { onError });
      const newModelList = modelListLoading
        ? modelList
        : new DataList([...modelList.slice(0, idx ?? 0), model, ...modelList.slice(idx ?? 0)]);
      const newModelInsight = (cnst.crystalizeInsight as (obj) => Insight)({
        ...modelInsight,
        count: modelInsight.count + 1,
      });
      this.set({
        [names.modelForm]: immerify(modelRef, defaultModel),
        [names.model]: model,
        [names.modelLoading]: false,
        [namesOfSlice.modelList]: newModelList,
        [namesOfSlice.modelInsight]: newModelInsight,
        [names.modelViewAt]: new Date(),
        [names.modelModal]: modal ?? null,
        ...(typeof path === "string" && path ? { [path]: model } : {}),
      });
      await onSuccess?.(model);
    },
    [names.updateModelInForm]: async function (
      this: SetGet<any>,
      { path, modal, sliceName = names.model, onError, onSuccess }: CreateOption<Full> = {}
    ) {
      const SliceName = capitalize(sliceName);
      const namesOfSlice = {
        defaultModel: SliceName.replace(names.Model, names.defaultModel),
      };
      const currentState = this.get() as { [key: string]: any };
      const model = currentState[names.model] as Full | null;
      const modelForm = currentState[names.modelForm] as Input & { id: string };
      const defaultModel = currentState[namesOfSlice.defaultModel] as Full;
      const modelInput = (cnst.purify as (form) => DefaultOf<Input> | null)(modelForm);
      if (!modelInput) return;
      if (model?.id === modelForm.id) this.set({ [names.modelLoading]: modelForm.id });
      const updatedModel = await (fetch[names.updateModel] as (...args) => Promise<Full>)(modelForm.id, modelInput, {
        onError,
      });
      this.set({
        ...(model?.id === updatedModel.id
          ? { [names.model]: updatedModel, [names.modelLoading]: false, [names.modelViewAt]: new Date() }
          : {}),
        [names.modelForm]: immerify(modelRef, defaultModel),
        [names.modelModal]: modal ?? null,
        ...(typeof path === "string" && path ? { [path]: updatedModel } : {}),
      });
      const updatedLightModel = (cnst.lightCrystalize as (obj) => Light)(updatedModel);
      slices.forEach(({ sliceName }) => {
        const namesOfSlice = {
          modelList: sliceName.replace(names.model, names.modelList),
          modelListLoading: sliceName.replace(names.model, names.modelListLoading),
        };
        const currentState = this.get() as { [key: string]: any };
        const modelList = currentState[namesOfSlice.modelList] as DataList<Light>;
        const modelListLoading = currentState[namesOfSlice.modelListLoading] as boolean;
        if (modelListLoading || !modelList.has(updatedModel.id)) return;
        const newModelList = new DataList(modelList).set(updatedLightModel);
        this.set({ [namesOfSlice.modelList]: newModelList });
      });
      await onSuccess?.(updatedModel);
    },
    [names.createModel]: async function (
      this: SetGet<any>,
      data: GetStateObject<Input>,
      { idx, path, modal, sliceName = names.model, onError, onSuccess }: CreateOption<Full> = {}
    ) {
      const SliceName = capitalize(sliceName);
      const namesOfSlice = {
        defaultModel: SliceName.replace(names.Model, names.defaultModel),
        modelList: sliceName.replace(names.model, names.modelList),
        modelListLoading: sliceName.replace(names.model, names.modelListLoading),
        modelInsight: sliceName.replace(names.model, names.modelInsight),
      };
      const currentState = this.get() as { [key: string]: any };
      const modelList = currentState[namesOfSlice.modelList] as DataList<Light>;
      const modelListLoading = currentState[namesOfSlice.modelListLoading] as boolean;
      const modelInsight = currentState[namesOfSlice.modelInsight] as Insight & BaseInsight;
      const modelInput = (cnst.purify as (data: any) => Input | null)(data);
      if (!modelInput) return;
      this.set({ [names.modelLoading]: true });
      const model = await (fetch[names.createModel] as (...args: any[]) => Promise<Full>)(modelInput, { onError });
      const newModelList = modelListLoading
        ? modelList
        : new DataList([...modelList.slice(0, idx ?? 0), model, ...modelList.slice(idx ?? 0)]);
      const newModelInsight = (cnst.crystalizeInsight as (obj) => Insight)({
        ...modelInsight,
        count: modelInsight.count + 1,
      });
      this.set({
        [names.model]: model,
        [names.modelLoading]: false,
        [namesOfSlice.modelList]: newModelList,
        [namesOfSlice.modelInsight]: newModelInsight,
        [names.modelViewAt]: new Date(),
        [names.modelModal]: modal ?? null,
        ...(typeof path === "string" && path ? { [path]: model } : {}),
      });
      await onSuccess?.(model);
    },
    [names.updateModel]: async function (
      this: SetGet<any>,
      id: string,
      data: GetStateObject<Input>,
      { idx, path, modal, sliceName = names.model, onError, onSuccess }: CreateOption<Full> = {}
    ) {
      const currentState = this.get() as { [key: string]: any };
      const model = currentState[names.model] as Full | null;
      const modelInput = (cnst.purify as (data) => DefaultOf<Input> | null)(data);
      if (!modelInput) return;
      if (model?.id === id) this.set({ [names.modelLoading]: id });
      const updatedModel = await (fetch[names.updateModel] as (...args) => Promise<Full>)(id, modelInput, { onError });
      this.set({
        ...(model?.id === updatedModel.id
          ? { [names.model]: updatedModel, [names.modelLoading]: false, [names.modelViewAt]: new Date() }
          : {}),
        [names.modelModal]: modal ?? null,
        ...(typeof path === "string" && path ? { [path]: updatedModel } : {}),
      });
      const updatedLightModel = (cnst.lightCrystalize as (obj) => Light)(updatedModel);
      slices.forEach(({ sliceName }) => {
        const namesOfSlice = {
          modelList: sliceName.replace(names.model, names.modelList),
          modelListLoading: sliceName.replace(names.model, names.modelListLoading),
        };
        const currentState = this.get() as { [key: string]: any };
        const modelList = currentState[namesOfSlice.modelList] as DataList<Light>;
        const modelListLoading = currentState[namesOfSlice.modelListLoading] as boolean;
        if (modelListLoading || !modelList.has(updatedModel.id)) return;
        const newModelList = new DataList(modelList).set(updatedLightModel);
        this.set({ [namesOfSlice.modelList]: newModelList });
      });
      await onSuccess?.(updatedModel);
    },
    [names.removeModel]: async function (
      this: SetGet<any>,
      id: string,
      options?: FetchPolicy & { modal?: string | null }
    ) {
      const { modal, ...fetchPolicyOptions } = options ?? {};
      const model = await (fetch[names.removeModel] as (...args) => Promise<Full & { removedAt: Dayjs | null }>)(
        id,
        fetchPolicyOptions
      );
      const lightModel = (cnst.lightCrystalize as (obj) => Light)(model);
      slices.forEach(({ sliceName }) => {
        const namesOfSlice = {
          modelList: sliceName.replace(names.model, names.modelList),
          modelListLoading: sliceName.replace(names.model, names.modelListLoading),
          modelSelection: sliceName.replace(names.model, names.modelSelection),
          modelInsight: sliceName.replace(names.model, names.modelInsight),
        };
        const currentState = this.get() as { [key: string]: any };
        const modelList = currentState[namesOfSlice.modelList] as DataList<Light>;
        const modelListLoading = currentState[namesOfSlice.modelListLoading] as boolean;
        const modelSelection = currentState[namesOfSlice.modelSelection] as DataList<Light>;
        const modelInsight = currentState[namesOfSlice.modelInsight] as Insight & BaseInsight;
        if (modelListLoading || !modelList.has(model.id)) return;
        const newModelList = new DataList(modelList);
        if (model.removedAt) {
          newModelList.delete(id);
          const newModelInsight = (cnst.crystalizeInsight as (obj) => Full)({
            ...modelInsight,
            count: modelInsight.count - 1,
          });
          const newModelSelection = new DataList(modelSelection);
          newModelSelection.delete(id);
          this.set({
            [namesOfSlice.modelList]: newModelList,
            [namesOfSlice.modelInsight]: newModelInsight,
            ...(modelSelection.has(model.id) ? { [namesOfSlice.modelSelection]: newModelSelection } : {}),
            ...(modal !== undefined ? { [names.modelModal]: modal } : {}),
          });
        } else {
          newModelList.set(lightModel);
          this.set({
            [namesOfSlice.modelList]: newModelList,
            ...(modal !== undefined ? { [names.modelModal]: modal } : {}),
          });
        }
      });
    },
    [names.checkModelSubmitable]: function (this: SetGet<any>, disabled?: boolean) {
      const currentState = this.get() as { [key: string]: any };
      const modelForm = currentState[names.modelForm] as Input;
      const modelSubmit = currentState[names.modelSubmit] as { disabled: boolean };
      const modelInput = (cnst.purify as (obj) => DefaultOf<Input> | null)(modelForm);
      this.set({ [names.modelSubmit]: { ...modelSubmit, disabled: !modelInput || disabled } });
    },
    [names.submitModel]: async function (this: SetGet<any>, option?: CreateOption<Full>) {
      const currentState = this.get() as { [key: string]: any };
      const modelForm = currentState[names.modelForm] as Input & { id: string };
      const modelSubmit = currentState[names.modelSubmit] as { loading: boolean; times: number };
      this.set({ [names.modelSubmit]: { ...modelSubmit, loading: true } });
      if (modelForm.id) await (this[names.updateModelInForm] as (...args) => Promise<Full>)(option);
      else await (this[names.createModelInForm] as (...args) => Promise<Full>)(option);
      this.set({ [names.modelSubmit]: { ...modelSubmit, loading: false, times: modelSubmit.times + 1 } });
    },
    [names.newModel]: function (
      this: SetGet<any>,
      partial: Partial<Full> = {},
      { modal, setDefault, sliceName = names.model }: NewOption = {}
    ) {
      const SliceName = capitalize(sliceName);
      const namesOfSlice = {
        defaultModel: SliceName.replace(names.Model, names.defaultModel),
      };
      const currentState = this.get() as { [key: string]: any };
      const defaultModel = currentState[namesOfSlice.defaultModel] as Full;
      this.set({
        [names.modelForm]: immerify(modelRef, { ...defaultModel, ...partial }),
        [namesOfSlice.defaultModel]: setDefault ? immerify(modelRef, { ...defaultModel, ...partial }) : defaultModel,
        [names.model]: null,
        [names.modelModal]: modal ?? "edit",
        [names.modelFormLoading]: false,
      });
    },
    [names.editModel]: async function (
      this: SetGet<any>,
      modelOrId: Full | string,
      { modal, onError }: { modal?: string | null } & FetchPolicy = {}
    ) {
      const id = typeof modelOrId === "string" ? modelOrId : modelOrId.id;
      this.set({ [names.modelFormLoading]: id, [names.modelModal]: modal ?? "edit" });
      const model = await (fetch[names.model] as (...args) => Promise<Full>)(id, { onError });
      const modelForm = deepObjectify<Input>(model as unknown as Input);
      this.set({
        [names.model]: model,
        [names.modelFormLoading]: false,
        [names.modelViewAt]: new Date(),
        [names.modelForm]: modelForm,
      });
    },
    [names.mergeModel]: async function (
      this: SetGet<any>,
      modelOrId: Full | string,
      data: Partial<Full>,
      options?: FetchPolicy
    ) {
      const id = typeof modelOrId === "string" ? modelOrId : modelOrId.id;
      const currentState = this.get() as { [key: string]: any };
      const model = currentState[names.model] as Full | null;
      if (id === model?.id) this.set({ modelLoading: id });
      const updatedModel = await (fetch[names.mergeModel] as (...args) => Promise<Full>)(modelOrId, data, options);
      this.set({
        [names.model]: id === model?.id ? updatedModel : model,
        [names.modelLoading]: false,
      });
      const updatedLightModel = (cnst.lightCrystalize as (obj) => Light)(updatedModel);
      slices.forEach(({ sliceName }) => {
        const namesOfSlice = {
          modelList: sliceName.replace(names.model, names.modelList),
          modelListLoading: sliceName.replace(names.model, names.modelListLoading),
        };
        const currentState = this.get() as { [key: string]: any };
        const modelList = currentState[namesOfSlice.modelList] as DataList<Light>;
        const modelListLoading = currentState[namesOfSlice.modelListLoading] as boolean;
        if (modelListLoading || !modelList.has(updatedModel.id)) return;
        const newModelList = new DataList(modelList).set(updatedLightModel);
        this.set({ [namesOfSlice.modelList]: newModelList });
      });
    },
    [names.viewModel]: async function (
      this: SetGet<any>,
      modelOrId: Full | string,
      { modal, onError }: { modal?: string | null } & FetchPolicy = {}
    ) {
      const id = typeof modelOrId === "string" ? modelOrId : modelOrId.id;
      this.set({ [names.modelModal]: modal ?? "view", [names.modelLoading]: id });
      const model = await (fetch[names.model] as (...args) => Promise<Full>)(id, { onError });
      this.set({ [names.model]: model, [names.modelViewAt]: new Date(), [names.modelLoading]: false });
    },
    [names.setModel]: function (this: SetGet<any>, ...fullOrLightModels: Full[]) {
      const currentState = this.get() as { [key: string]: any };
      if (fullOrLightModels.length === 0) return;

      // set the first model to the model state
      const firstModel = fullOrLightModels[0];
      const model = currentState[names.model] as Full | null;
      const isFull = firstModel instanceof modelRef;
      if (isFull) {
        const crystalizedModel = (cnst.crystalize as (obj) => Full)(firstModel);
        this.set({ [names.model]: crystalizedModel });
      } else if (model?.id === firstModel.id) {
        const crystalizedModel = (cnst.crystalize as (obj) => Full)({ ...model, ...firstModel });
        this.set({ [names.model]: crystalizedModel });
      }

      // set the rest of the models to the model list
      const lightModels = fullOrLightModels.map((fullOrLightModel) =>
        (cnst.lightCrystalize as (obj) => Light)(fullOrLightModel)
      );
      slices.forEach(({ sliceName }) => {
        const namesOfSlice = {
          modelList: sliceName.replace(names.model, names.modelList),
          modelListLoading: sliceName.replace(names.model, names.modelListLoading),
        };
        const modelList = currentState[namesOfSlice.modelList] as DataList<Light>;
        const modelListLoading = currentState[namesOfSlice.modelListLoading] as boolean;
        if (modelListLoading) return;
        lightModels.forEach((lightModel) => {
          if (!modelList.has(lightModel.id)) return;
          modelList.set(lightModel);
        });
        this.set({ [namesOfSlice.modelList]: modelList.save() });
      });
    },
    [names.resetModel]: function (this: SetGet<any>, model?: Full) {
      const currentState = this.get() as { [key: string]: any };
      const defaultModel = currentState[names.defaultModel] as Full;
      this.set({
        [names.model]: model ?? null,
        [names.modelViewAt]: new Date(0),
        [names.modelForm]: immerify(modelRef, defaultModel),
        [names.modelModal]: null,
      });
      return model ?? null;
    },
  };
  const sliceAction = slices.reduce((acc, { sliceName, argLength }) => {
    const SliceName = capitalize(sliceName);
    const namesOfSlice: { [key in SliceActionKey | SliceStateKey | "modelList"]: string } = {
      defaultModel: SliceName.replace(names.Model, names.defaultModel),
      modelInsight: sliceName.replace(names.model, names.modelInsight),
      modelList: sliceName.replace(names.model, names.modelList),
      modelListLoading: sliceName.replace(names.model, names.modelListLoading),
      initModel: SliceName.replace(names.Model, names.initModel),
      modelInitList: SliceName.replace(names.Model, names.modelInitList),
      modelInitAt: SliceName.replace(names.Model, names.modelInitAt),
      refreshModel: SliceName.replace(names.Model, names.refreshModel),
      selectModel: SliceName.replace(names.Model, names.selectModel),
      setPageOfModel: SliceName.replace(names.Model, names.setPageOfModel),
      addPageOfModel: SliceName.replace(names.Model, names.addPageOfModel),
      setLimitOfModel: SliceName.replace(names.Model, names.setLimitOfModel),
      setQueryArgsOfModel: SliceName.replace(names.Model, names.setQueryArgsOfModel),
      setSortOfModel: SliceName.replace(names.Model, names.setSortOfModel),
      lastPageOfModel: SliceName.replace(names.Model, names.lastPageOfModel),
      pageOfModel: SliceName.replace(names.Model, names.pageOfModel),
      limitOfModel: SliceName.replace(names.Model, names.limitOfModel),
      queryArgsOfModel: SliceName.replace(names.Model, names.queryArgsOfModel),
      sortOfModel: SliceName.replace(names.Model, names.sortOfModel),
      modelSelection: SliceName.replace(names.Model, names.modelSelection),
    };
    const singleSliceAction = {
      [namesOfSlice.initModel]: async function (
        this: SetGet<any>,
        ...args: [...args: any[], initForm: FetchInitForm<Input, Full, Filter> & FetchPolicy]
      ) {
        const initArgLength = Math.min(args.length, argLength);
        const initForm = { invalidate: false, ...(args[argLength] ?? {}) } as FetchInitForm<Input, Full, Filter> &
          FetchPolicy;
        const queryArgs = new Array(initArgLength).fill(null).map((_, i) => args[i] as object);
        const defaultModel = immerify(modelRef, { ...cnst.getDefault(), ...(initForm.default ?? {}) }) as Input;
        this.set({ [names.defaultModel]: defaultModel });
        await (this[namesOfSlice.refreshModel] as (...args) => Promise<void>)({ ...initForm, queryArgs });
      },
      [namesOfSlice.refreshModel]: async function (
        this: SetGet<any>,
        initForm: FetchInitForm<Input, Full, Filter> & FetchPolicy & { queryArgs?: any[] } = {}
      ) {
        const args = initForm.queryArgs ?? [];
        const refreshArgLength = Math.min(args.length, argLength);
        const currentState = this.get() as { [key: string]: any };
        const existingQueryArgs = currentState[namesOfSlice.queryArgsOfModel] as object[];
        const queryArgs = [
          ...new Array(refreshArgLength).fill(null).map((_, i) => args[i] as object),
          ...existingQueryArgs.slice(refreshArgLength, argLength),
        ];
        const {
          page = currentState[namesOfSlice.pageOfModel] as number,
          limit = currentState[namesOfSlice.limitOfModel] as number,
          sort = currentState[namesOfSlice.sortOfModel] as Sort,
          invalidate = true,
        } = initForm;
        const modelOperation = currentState[names.modelOperation] as string;
        const queryArgsOfModel = currentState[namesOfSlice.queryArgsOfModel] as object[];
        const pageOfModel = currentState[namesOfSlice.pageOfModel] as number;
        const limitOfModel = currentState[namesOfSlice.limitOfModel] as number;
        const sortOfModel = currentState[namesOfSlice.sortOfModel] as Sort;
        if (
          !invalidate &&
          !["sleep", "reset"].includes(modelOperation) &&
          isQueryEqual(queryArgs, queryArgsOfModel) &&
          page === pageOfModel &&
          limit === limitOfModel &&
          isQueryEqual(sort as unknown as object, sortOfModel as unknown as object)
        )
          return; // store-level cache hit
        else this.set({ [namesOfSlice.modelListLoading]: true });
        const [modelDataList, modelInsight] = await Promise.all([
          (fetch[namesOfSlice.modelList] as (...args) => Promise<Light[]>)(
            ...queryArgs,
            (page - 1) * limit,
            limit,
            sort,
            { onError: initForm.onError }
          ),
          (fetch[namesOfSlice.modelInsight] as (...args) => Promise<Insight & BaseInsight>)(...queryArgs, {
            onError: initForm.onError,
          }),
        ]);
        const modelList = new DataList(modelDataList);
        this.set({
          [namesOfSlice.modelList]: modelList,
          [namesOfSlice.modelListLoading]: false,
          [namesOfSlice.modelInsight]: modelInsight,
          [namesOfSlice.modelInitList]: modelList,
          [namesOfSlice.modelInitAt]: new Date(),
          [namesOfSlice.lastPageOfModel]: Math.max(Math.floor((modelInsight.count - 1) / limit) + 1, 1),
          [namesOfSlice.limitOfModel]: limit,
          [namesOfSlice.queryArgsOfModel]: queryArgs,
          [namesOfSlice.sortOfModel]: sort,
          [namesOfSlice.pageOfModel]: page,
          [names.modelOperation]: "idle",
        });
      },
      [namesOfSlice.selectModel]: function (
        this: SetGet<any>,
        model: Light | Light[],
        { refresh, remove }: { refresh?: boolean; remove?: boolean } = {}
      ) {
        const models = Array.isArray(model) ? model : [model];
        const currentState = this.get() as { [key: string]: any };
        const modelSelection = currentState[namesOfSlice.modelSelection] as DataList<Light>;
        if (refresh) this.set({ [namesOfSlice.modelSelection]: new DataList(models) });
        else if (remove) {
          const newModelSelection = new DataList(modelSelection);
          models.map((model) => newModelSelection.delete(model.id));
          this.set({ [namesOfSlice.modelSelection]: newModelSelection });
        } else {
          this.set({ [namesOfSlice.modelSelection]: new DataList([...modelSelection.values, ...models]) });
        }
      },
      [namesOfSlice.setPageOfModel]: async function (this: SetGet<any>, page: number, options?: FetchPolicy) {
        const currentState = this.get() as { [key: string]: any };
        const queryArgsOfModel = currentState[namesOfSlice.queryArgsOfModel] as object[];
        const pageOfModel = currentState[namesOfSlice.pageOfModel] as number;
        const limitOfModel = currentState[namesOfSlice.limitOfModel] as number;
        const sortOfModel = currentState[namesOfSlice.sortOfModel] as Sort;
        if (pageOfModel === page) return;
        this.set({ [namesOfSlice.modelListLoading]: true });
        const modelDataList = await (fetch[namesOfSlice.modelList] as (...args) => Promise<Light[]>)(
          ...queryArgsOfModel,
          (page - 1) * limitOfModel,
          limitOfModel,
          sortOfModel,
          options
        );
        const modelList = new DataList(modelDataList);
        this.set({
          [namesOfSlice.modelList]: modelList,
          [namesOfSlice.pageOfModel]: page,
          [namesOfSlice.modelListLoading]: false,
        });
      },
      [namesOfSlice.addPageOfModel]: async function (this: SetGet<any>, page: number, options?: FetchPolicy) {
        const currentState = this.get() as { [key: string]: any };
        const modelList = currentState[namesOfSlice.modelList] as DataList<Light>;
        const queryArgsOfModel = currentState[namesOfSlice.queryArgsOfModel] as object[];
        const pageOfModel = currentState[namesOfSlice.pageOfModel] as number;
        const limitOfModel = currentState[namesOfSlice.limitOfModel] as number;
        const sortOfModel = currentState[namesOfSlice.sortOfModel] as Sort;
        if (pageOfModel === page) return;
        const addFront = page < pageOfModel;
        const modelDataList = await (fetch[namesOfSlice.modelList] as (...args) => Promise<Light[]>)(
          ...queryArgsOfModel,
          (page - 1) * limitOfModel,
          limitOfModel,
          sortOfModel,
          options
        );
        const newModelList = new DataList(
          addFront ? [...modelDataList, ...modelList] : [...modelList, ...modelDataList]
        );
        this.set({ [namesOfSlice.modelList]: newModelList, [namesOfSlice.pageOfModel]: page });
      },
      [namesOfSlice.setLimitOfModel]: async function (this: SetGet<any>, limit: number, options?: FetchPolicy) {
        const currentState = this.get() as { [key: string]: any };
        const modelInsight = currentState[namesOfSlice.modelInsight] as Insight & BaseInsight;
        const queryArgsOfModel = currentState[namesOfSlice.queryArgsOfModel] as object[];
        const pageOfModel = currentState[namesOfSlice.pageOfModel] as number;
        const limitOfModel = currentState[namesOfSlice.limitOfModel] as number;
        const sortOfModel = currentState[namesOfSlice.sortOfModel] as Sort;
        if (limitOfModel === limit) return;
        const skip = (pageOfModel - 1) * limitOfModel;
        const page = Math.max(Math.floor((skip - 1) / limit) + 1, 1);
        const modelDataList = await (fetch[namesOfSlice.modelList] as (...args) => Promise<Light[]>)(
          ...queryArgsOfModel,
          (page - 1) * limit,
          limit,
          sortOfModel,
          options
        );
        const modelList = new DataList(modelDataList);
        this.set({
          [namesOfSlice.modelList]: modelList,
          [namesOfSlice.lastPageOfModel]: Math.max(Math.floor((modelInsight.count - 1) / limit) + 1, 1),
          [namesOfSlice.limitOfModel]: limit,
          [namesOfSlice.pageOfModel]: page,
        });
      },
      [namesOfSlice.setQueryArgsOfModel]: async function (
        this: SetGet<any>,
        ...args:
          | [...queryArgs: any, options?: FetchPolicy]
          | [setQueryArgs: (...prevQueryArgs: object[]) => object[], options?: FetchPolicy]
      ) {
        const isSetQueryAsFunction = typeof args[0] === "function";
        const currentState = this.get() as { [key: string]: any };
        const options = (isSetQueryAsFunction ? args[1] : args[argLength]) as FetchPolicy | undefined;
        const queryArgsOfModel = currentState[namesOfSlice.queryArgsOfModel] as object[];
        const queryArgs = isSetQueryAsFunction
          ? (args[0] as (...prevQueryArgs: object[]) => object[])(...queryArgsOfModel)
          : new Array(argLength).fill(null).map((_, i) => args[i] as object);
        const limitOfModel = currentState[namesOfSlice.limitOfModel] as number;
        const sortOfModel = currentState[namesOfSlice.sortOfModel] as Sort;
        if (isQueryEqual(queryArgsOfModel, queryArgs)) {
          Logger.trace(`${namesOfSlice.queryArgsOfModel} store-level cache hit`);
          return; // store-level cache hit
        }
        this.set({ [namesOfSlice.modelListLoading]: true });
        const [modelDataList, modelInsight] = await Promise.all([
          (fetch[namesOfSlice.modelList] as (...args) => Promise<Light[]>)(
            ...queryArgs,
            0,
            limitOfModel,
            sortOfModel,
            options
          ),
          (fetch[namesOfSlice.modelInsight] as (...args) => Promise<Insight & BaseInsight>)(...queryArgs, options),
        ]);
        const modelList = new DataList(modelDataList);
        this.set({
          [namesOfSlice.queryArgsOfModel]: queryArgs,
          [namesOfSlice.modelList]: modelList,
          [namesOfSlice.modelInsight]: modelInsight,
          [namesOfSlice.lastPageOfModel]: Math.max(Math.floor((modelInsight.count - 1) / limitOfModel) + 1, 1),
          [namesOfSlice.pageOfModel]: 1,
          [namesOfSlice.modelSelection]: new Map(),
          [namesOfSlice.modelListLoading]: false,
        });
      },
      [namesOfSlice.setSortOfModel]: async function (this: SetGet<any>, sort: Sort, options?: FetchPolicy) {
        const currentState = this.get() as { [key: string]: any };
        const queryArgsOfModel = currentState[namesOfSlice.queryArgsOfModel] as object[];
        const limitOfModel = currentState[namesOfSlice.limitOfModel] as number;
        const sortOfModel = currentState[namesOfSlice.sortOfModel] as Sort;
        if (sortOfModel === sort) return; // store-level cache hit
        this.set({ [namesOfSlice.modelListLoading]: true });
        const modelDataList = await (fetch[namesOfSlice.modelList] as (...args) => Promise<Light[]>)(
          ...queryArgsOfModel,
          0,
          limitOfModel,
          sort,
          options
        );
        const modelList = new DataList(modelDataList);
        this.set({
          [namesOfSlice.modelList]: modelList,
          [namesOfSlice.sortOfModel]: sort,
          [namesOfSlice.pageOfModel]: 1,
          [namesOfSlice.modelListLoading]: false,
        });
      },
    };
    return Object.assign(acc, singleSliceAction);
  }, {});
  return { ...baseAction, ...sliceAction };
};

export interface SliceInfo<T extends string, State, Action> {
  refName: T;
  state: State;
  action: Action;
}

export type StoreInstance<ApplyState, ApplyAction, SliceInfoMap> = SetGet<ApplyState> &
  ApplyAction & {
    __STATE_INFO__: ApplyState;
    __SLICE_INFO__: SliceInfoMap;
  };

export function store<RefNameOrGql, State extends { [key: string]: any }>(
  refNameOrGql: RefNameOrGql,
  state: State,
  ...libStores: Type[]
): RefNameOrGql extends string
  ? Type<StoreInstance<State, {}, {}>>
  : RefNameOrGql extends DbGraphQL<
        infer T,
        infer Input,
        infer Full,
        infer Light,
        infer Insight,
        infer Filter,
        infer Fetch,
        infer Signal,
        infer _CapitalizedT,
        infer _Default,
        infer _DefaultInput,
        infer _DefaultState,
        infer _DefaultStateInput,
        infer _Doc,
        infer _DocInput,
        infer _QueryOfDoc,
        infer _Query,
        infer _Sort,
        infer _DynamicSliceArgMap
      >
    ? Type<
        DatabaseStore<
          T extends string ? T : "unknown",
          Input,
          Full extends { id: string } ? Full : { id: string },
          Light,
          Insight,
          Filter,
          Fetch,
          Signal,
          State,
          _CapitalizedT,
          _Default,
          _DefaultInput,
          _DefaultState,
          _DefaultStateInput,
          _Doc,
          _DocInput,
          _QueryOfDoc,
          _Query,
          _Sort,
          _DynamicSliceArgMap
        >
      >
    : never {
  const storeRef = libStores.at(0) ?? class StateStore {};
  storeInfo.setState(storeRef, state);
  return storeRef as any;
  // if (typeof refNameOrGql === "string") return serviceStateOf(refNameOrGql, state) as any;
  // else
  //   return stateOf(
  //     refNameOrGql as DbGraphQL<any, any, any, any, any, any, any, any, any, any, any, any, any>,
  //     state
  //   ) as any;
}

export type DatabaseStore<
  T extends string,
  Input,
  Full extends { id: string },
  Light extends { id: string },
  Insight,
  Filter extends FilterInstance,
  Fetch,
  Signal,
  State extends { [key: string]: any },
  _CapitalizedT extends string = Capitalize<T>,
  _Default = DefaultOf<Full>,
  _DefaultInput = DefaultOf<Input>,
  _DefaultState = GetStateObject<Full>,
  _DefaultStateInput = GetStateObject<Input>,
  _Doc = DocumentModel<Full>,
  _DocInput = DocumentModel<Input>,
  _QueryOfDoc = QueryOf<DocumentModel<Full>>,
  _Query = ExtractQuery<Filter>,
  _Sort = ExtractSort<Filter>,
  _DynamicSliceArgMap = DynamicSliceArgMap<T, Input, Full, Filter, Signal, _CapitalizedT, _DefaultInput, _Sort>,
  _CreateOption = CreateOption<Full>,
  _FetchInitFormWithFetchPolicy = FetchInitForm<Input, Full, Filter> & FetchPolicy,
  _DefaultSliceState = SliceState<
    T,
    Full,
    Light,
    [query: _QueryOfDoc],
    Insight,
    Filter,
    _CapitalizedT,
    _Default,
    _Sort
  >,
  _DynamicSliceStateMap = {
    [Suffix in keyof _DynamicSliceArgMap as Suffix extends string ? Suffix : never]: Suffix extends string
      ? SliceState<T, Full, Light, _DynamicSliceArgMap[Suffix], Insight, Filter, _CapitalizedT, _Default, _Sort>
      : never;
  },
  _DefaultSliceAction = SliceAction<
    T,
    Input,
    Full,
    Light,
    [query: _QueryOfDoc],
    Filter,
    _CapitalizedT,
    _Sort,
    _FetchInitFormWithFetchPolicy
  >,
  _DynamicSliceActionMap = {
    [Suffix in keyof _DynamicSliceArgMap as Suffix extends string ? Suffix : never]: Suffix extends string
      ? _DynamicSliceArgMap[Suffix] extends any[]
        ? SliceAction<
            T,
            Input,
            Full,
            Light,
            _DynamicSliceArgMap[Suffix],
            Filter,
            _CapitalizedT,
            _Sort,
            _FetchInitFormWithFetchPolicy
          >
        : never
      : never;
  },
  _ApplyState = State &
    DefaultState<
      T,
      Input,
      Full,
      Light,
      Insight,
      Filter,
      Signal,
      _CapitalizedT,
      _Default,
      _DefaultInput,
      _DefaultState,
      _DefaultStateInput,
      _Doc,
      _DocInput,
      _QueryOfDoc,
      _Query,
      _Sort,
      _DynamicSliceArgMap,
      _DefaultSliceState,
      _DynamicSliceStateMap
    >,
  _ApplyAction = DefaultActions<
    T,
    Input,
    Full,
    Light,
    Filter,
    Fetch,
    Signal,
    _CapitalizedT,
    _Default,
    _DefaultInput,
    _DefaultState,
    _DefaultStateInput,
    _Doc,
    _DocInput,
    _QueryOfDoc,
    _Sort,
    _DynamicSliceArgMap,
    _CreateOption,
    _FetchInitFormWithFetchPolicy,
    _DefaultSliceAction,
    _DynamicSliceActionMap
  >,
  _SliceInfoMap = {
    [K in T]: SliceInfo<T, _DefaultSliceState, _DefaultSliceAction>;
  } & {
    [Suffix in keyof _DynamicSliceStateMap & keyof _DynamicSliceActionMap as Suffix extends string
      ? `${T}${Suffix}`
      : never]: Suffix extends string
      ? SliceInfo<`${T}${Suffix}`, _DynamicSliceStateMap[Suffix], _DynamicSliceActionMap[Suffix]>
      : never;
  },
> = StoreInstance<_ApplyState, _ApplyAction, _SliceInfoMap>;

const stateOf = <
  T extends string,
  Input,
  Full extends { id: string },
  Light extends { id: string },
  Insight,
  Filter extends FilterInstance,
  Fetch,
  Signal,
  State extends { [key: string]: any },
  _CapitalizedT extends string = Capitalize<T>,
  _Default = DefaultOf<Full>,
  _DefaultInput = DefaultOf<Input>,
  _DefaultState = GetStateObject<Full>,
  _DefaultStateInput = GetStateObject<Input>,
  _Doc = DocumentModel<Full>,
  _DocInput = DocumentModel<Input>,
  _QueryOfDoc = QueryOf<DocumentModel<Full>>,
  _Query = ExtractQuery<Filter>,
  _Sort = ExtractSort<Filter>,
  _DynamicSliceArgMap = DynamicSliceArgMap<T, Input, Full, Filter, Signal, _CapitalizedT, _DefaultInput, _Sort>,
>(
  gql: DbGraphQL<
    T,
    Input,
    Full,
    Light,
    Insight,
    Filter,
    Fetch,
    Signal,
    _CapitalizedT,
    _Default,
    _DefaultInput,
    _DefaultState,
    _DefaultStateInput,
    _Doc,
    _DocInput,
    _QueryOfDoc,
    _Query,
    _Sort,
    _DynamicSliceArgMap
  >,
  state: State
): Type<
  DatabaseStore<
    T,
    Input,
    Full,
    Light,
    Insight,
    Filter,
    Fetch,
    Signal,
    State,
    _CapitalizedT,
    _Default,
    _DefaultInput,
    _DefaultState,
    _DefaultStateInput,
    _Doc,
    _DocInput,
    _QueryOfDoc,
    _Query,
    _Sort,
    _DynamicSliceArgMap
  >
> => {
  // const applyState = Object.assign(createState(gql), state);
  // const applyAction = createActions(gql);
  // setStoreMeta(gql.refName, {
  //   refName: gql.refName,
  //   useKeys: Object.keys(applyState),
  //   doKeys: Object.keys(applyAction),
  //   slices: gql.slices,
  // });
  const applyState = state;
  const applyAction = {};
  // setStoreMeta(gql.refName, {
  //   refName: gql.refName,
  //   useKeys: Object.keys(applyState),
  //   doKeys: Object.keys(applyAction),
  //   slices: gql.slices,
  // });
  const applyStore = { ...applyState, ...applyAction };
  class StateStore {
    readonly get: () => { [key: string]: any };
    readonly set: (
      state: Partial<MakeState<{ [key: string]: any }>> | ((state: MakeState<{ [key: string]: any }>) => any)
    ) => void;
    readonly pick: PickState<GetState<Mutate<StoreApi<MakeState<{ [key: string]: any }>>, []>, "getState">>;
  }
  Object.assign(StateStore.prototype, applyStore);
  // Object.keys(applyStore).forEach((key) =>
  //   Object.defineProperty(StateStore.prototype, key, { value: applyStore[key] as object })
  // );
  // storeInfo.setRefNameTemp(gql.refName, StateStore);
  return StateStore as unknown as Type<
    DatabaseStore<
      T,
      Input,
      Full,
      Light,
      Insight,
      Filter,
      Fetch,
      Signal,
      State,
      _CapitalizedT,
      _Default,
      _DefaultInput,
      _DefaultState,
      _DefaultStateInput,
      _Doc,
      _DocInput,
      _QueryOfDoc,
      _Query,
      _Sort,
      _DynamicSliceArgMap
    >
  >;
};

const serviceStateOf = <State extends { [key: string]: any }>(
  refName: string,
  state: State
): Type<StoreInstance<State, {}, {}>> => {
  const applyState = state;
  setStoreMeta(refName, { refName, useKeys: Object.keys(applyState), doKeys: [], slices: [] });
  class StateStore {}
  Object.keys(applyState).forEach((key) =>
    Object.defineProperty(StateStore.prototype, key, { value: applyState[key] as object })
  );
  storeInfo.setRefNameTemp(refName, StateStore);
  return StateStore as unknown as Type<StoreInstance<State, {}, {}>>;
};

type SetKey<T extends string> = `set${Capitalize<T>}`;

export interface WithSelectors<State, Action, SliceInfoMap> {
  sub: {
    (listener: (selectedState: State, previousSelectedState: State) => void): () => void;
    <U>(
      selector: (state: State) => U,
      listener: (selectedState: U, previousSelectedState: U) => void,
      options?: {
        equalityFn?: (a: U, b: U) => boolean;
        fireImmediately?: boolean;
      }
    ): () => void;
  };
  ref: <U>(selector: (state: State) => U) => RefObject<U>;
  sel: <U>(selector: (state: State) => U, equals?: (a: U, b: U) => boolean) => U;
  use: {
    [K in keyof State]: () => State[K];
  };
  do: {
    [K in Exclude<keyof Action, "__SLICE_INFO__" | "__STATE_INFO__">]: Action[K];
  } & {
    [K in keyof State as K extends string ? SetKey<K> : never]: (value: FieldState<State[K]>) => void;
  };
  get: () => State;
  set: (state: Partial<State> | ((state: State) => any)) => void;
  slice: {
    [K in keyof SliceInfoMap]: SliceInfoMap[K] extends SliceInfo<infer T, infer State, infer Action>
      ? SliceSelectors<T, State, Action>
      : never;
  };
}
export interface SliceSelectors<T extends string, State, Action> {
  refName: T;
  use: {
    [K in keyof State]: () => State[K];
  };
  do: Prettify<
    {
      [K in keyof Action]: Action[K];
    } & {
      [K in keyof State as K extends string ? SetKey<K> : never]: (value: FieldState<State[K]>) => void;
    }
  >;
  get: () => State;
}

const createSelectors = <State, Action, SliceInfoMap>(
  _store: ((...args) => object) & {
    subscribe: (listener: (selectedState: State, previousSelectedState: State) => void) => () => void;
    getState: () => State;
    setState: ((state: Partial<State>) => void) | ((setter: (state: State) => void) => void);
  },
  store = {} as unknown as WithSelectors<State, Action, SliceInfoMap>,
  slices: SliceMeta[]
) => {
  store.get = _store.getState as () => State;
  store.set = (s) => {
    if (typeof s === "function")
      (_store.setState as (setter: (state: State) => void) => void)((st) => {
        s(st);
      });
    else (_store.setState as (state: Partial<State>) => void)(s);
  };
  store.sel = <U>(selectFn: (state: State) => U, equals?: any) => _store(selectFn, equals) as U;
  const state = store.get();
  store.sub = _store.subscribe;
  const useReference = <U>(selectFn: (state: State) => U): RefObject<U> => {
    const ref = useRef(selectFn(store.get()));
    useEffect(() => {
      return store.sub(selectFn, (val) => (ref.current = val));
    }, []);
    return ref as unknown as RefObject<U>;
  };
  store.ref = useReference;
  const existingUse = store.use as unknown as
    | { [K in keyof State as State[K] extends (...args: any) => any ? never : K]: () => State[K] }
    | undefined;
  const existingDo = store.do as unknown as
    | { [K in keyof State as State[K] extends (...args: any) => any ? K : never]: State[K] }
    | undefined;
  const existingSlice = store.slice as unknown as
    | { [K in keyof SliceInfoMap as K extends string ? K : never]: SliceInfoMap[K] }
    | undefined;
  if (!existingUse) Object.assign(store, { use: {} });
  if (!existingDo) Object.assign(store, { do: {} });
  if (!existingSlice) Object.assign(store, { slice: {} });
  for (const k of Object.keys(state as object)) {
    if (typeof state[k] !== "function") {
      store.use[k] = () => store.sel((s) => s[k] as object);
      const setKey = `set${capitalize(k)}`;
      if (!state[setKey])
        store.do[setKey] = (value: object) => {
          store.set({ [k]: value } as object);
        };
    } else {
      store.do[k] = async (...args: object[]) => {
        try {
          Logger.verbose(`${k} action loading...`);
          const start = Date.now();
          await (state[k] as (...args) => Promise<void>)(...args);
          const end = Date.now();
          Logger.verbose(`=> ${k} action dispatched (${end - start}ms)`);
        } catch (e) {
          const errKey = typeof e === "string" ? e : (e as Error).message;
          msg.error(errKey, { key: k });
          throw e;
        }
      };
    }
  }

  for (const slice of slices) {
    const [fieldName, className] = [slice.refName, capitalize(slice.refName)];
    const names: { [key in SliceStateKey | SliceActionKey | "model" | "Model"]: string } = {
      model: fieldName,
      Model: className,
      defaultModel: `default${className}`,
      modelInsight: `${fieldName}Insight`,
      modelList: `${fieldName}List`,
      modelListLoading: `${fieldName}ListLoading`,
      modelInitList: `${fieldName}InitList`,
      modelInitAt: `${fieldName}InitAt`,
      pageOfModel: `pageOf${className}`,
      limitOfModel: `limitOf${className}`,
      queryArgsOfModel: `queryArgsOf${className}`,
      sortOfModel: `sortOf${className}`,
      modelSelection: `${fieldName}Selection`,
      initModel: `init${className}`,
      refreshModel: `refresh${className}`,
      selectModel: `select${className}`,
      setPageOfModel: `setPageOf${className}`,
      addPageOfModel: `addPageOf${className}`,
      setLimitOfModel: `setLimitOf${className}`,
      setQueryArgsOfModel: `setQueryArgsOf${className}`,
      setSortOfModel: `setSortOf${className}`,
      lastPageOfModel: `lastPageOf${className}`,
    };
    const SliceName = capitalize(slice.sliceName);
    const namesOfSliceState: { [key in SliceStateKey]: string } = {
      defaultModel: SliceName.replace(names.Model, names.defaultModel),
      modelInitList: SliceName.replace(names.Model, names.modelInitList),
      modelInsight: slice.sliceName.replace(names.model, names.modelInsight),
      modelList: slice.sliceName.replace(names.model, names.modelList),
      modelListLoading: slice.sliceName.replace(names.model, names.modelListLoading),
      modelInitAt: SliceName.replace(names.Model, names.modelInitAt),
      lastPageOfModel: SliceName.replace(names.Model, names.lastPageOfModel),
      pageOfModel: SliceName.replace(names.Model, names.pageOfModel),
      limitOfModel: SliceName.replace(names.Model, names.limitOfModel),
      queryArgsOfModel: SliceName.replace(names.Model, names.queryArgsOfModel),
      sortOfModel: SliceName.replace(names.Model, names.sortOfModel),
      modelSelection: SliceName.replace(names.Model, names.modelSelection),
    };
    const namesOfSliceAction: { [key in SliceActionKey]: string } = {
      initModel: SliceName.replace(names.Model, names.initModel),
      refreshModel: SliceName.replace(names.Model, names.refreshModel),
      selectModel: SliceName.replace(names.Model, names.selectModel),
      setPageOfModel: SliceName.replace(names.Model, names.setPageOfModel),
      addPageOfModel: SliceName.replace(names.Model, names.addPageOfModel),
      setLimitOfModel: SliceName.replace(names.Model, names.setLimitOfModel),
      setQueryArgsOfModel: SliceName.replace(names.Model, names.setQueryArgsOfModel),
      setSortOfModel: SliceName.replace(names.Model, names.setSortOfModel),
    };
    (store.slice as unknown as { [key: string]: any })[slice.sliceName] = { do: {}, use: {} };
    const targetSlice = store.slice[slice.sliceName] as unknown as {
      do: { [key: string]: (...args) => void };
      use: { [key: string]: () => object };
      get: () => object;
      sliceName: string;
      refName: string;
      argLength: number;
    };
    Object.keys(namesOfSliceAction).forEach((key) => {
      targetSlice.do[names[key] as string] = store.do[namesOfSliceAction[key] as string] as (...args: any) => void;
    });
    Object.keys(namesOfSliceState).map((key) => {
      targetSlice.use[names[key] as string] = store.use[namesOfSliceState[key] as string] as () => object;
      targetSlice.do[`set${capitalize(names[key] as string)}`] = store.do[
        `set${capitalize(namesOfSliceState[key] as string)}`
      ] as (value: object) => void;
    });
    targetSlice.get = () => {
      const state = store.get();
      const stateOfSlice = Object.fromEntries(
        Object.entries(namesOfSliceState).map(([key, value]: [SliceStateKey, string]) => [names[key], state[value]])
      );
      return stateOfSlice;
    };
    targetSlice.sliceName = slice.sliceName;
    targetSlice.refName = slice.refName;
    targetSlice.argLength = slice.argLength;
  }
  return store;
};

const makePicker =
  (set: (state: { [key: string]: object }) => void, get: () => { [key: string]: any }) =>
  (...fields: string[]) => {
    const state = get();
    const ret = {} as { [key: string]: { id: string } | string };
    for (const field of fields) {
      const val = state[field] as { id: string } | string | undefined;
      if (!val) throw new Error(`Field ${field} is not ready`);
      if (typeof val === "string" && val.length === 0) throw new Error(`Field is empty string (${field})`);
      ret[field] = val;
    }
    return ret;
  };

export type StoreOf<RootStore extends StoreInstance<any, any, any>> =
  RootStore extends StoreInstance<infer State, infer Action, infer SliceInfoMap>
    ? WithSelectors<State, Action, SliceInfoMap>
    : never;

export const makeStore = <State, Action, SliceInfoMap>(
  st: WithSelectors<any, any, any>,
  signals: SerializedSignal[]
): WithSelectors<State, Action, SliceInfoMap> => {
  const zustandStore = create(
    devtools(
      subscribeWithSelector(
        immer((set, get: () => object) => {
          const store = {};
          const pick = makePicker(set, get);
          const sliceSet = new Map<string, SliceMeta[]>(signals.map((signal) => [signal.refName, signal.slices]));
          storeInfo.store.forEach((storeRef, refName) => {
            const state = storeInfo.getState(storeRef);
            const action = storeInfo.getAction(storeRef);
            const isDatabase = constantInfo.database.has(refName);
            const slices = sliceSet.get(refName) ?? [];
            Object.assign(
              store,
              state,
              action,
              ...(isDatabase
                ? [
                    createDatabaseState(refName),
                    createSliceState(refName, slices),
                    makeFormSetter(refName),
                    makeActions(refName, slices),
                  ]
                : [])
            );
          });
          Object.assign(store, { set, get, pick });
          return store;
        })
      ),
      { name: "root", anonymousActionType: "root", type: "root" }
    )
  );
  return createSelectors(zustandStore, st, signals.map((signal) => signal.slices).flat()) as WithSelectors<
    State,
    Action,
    SliceInfoMap
  >;
};

export const MixStore = <T extends Type[]>(
  ...stores: [...T]
): Type<
  StoreInstance<
    Prettify<MergeAllKeyOfTypes<T, "__STATE_INFO__">>,
    MergeAllTypes<T, "get" | "set" | "pick" | "__STATE_INFO__" | "__SLICE_INFO__">,
    Prettify<MergeAllKeyOfTypes<T, "__SLICE_INFO__">>
  >
> => {
  if (stores.length === 0) throw new Error("MixStores requires at least one store");
  class Mix {}
  applyMixins(Mix, stores);
  return Mix as unknown as Type<
    StoreInstance<
      Prettify<MergeAllKeyOfTypes<T, "__STATE_INFO__">>,
      MergeAllTypes<T, "get" | "set" | "pick" | "__STATE_INFO__" | "__SLICE_INFO__">,
      Prettify<MergeAllKeyOfTypes<T, "__SLICE_INFO__">>
    >
  >;
};

interface ToastProps {
  root?: string;
  duration?: number;
}
export const Toast = ({ root, duration = 3 }: ToastProps = {}) => {
  return function (target, key: string, descriptor: PropertyDescriptor) {
    const originMethod = descriptor.value as (...args) => Promise<void>;
    descriptor.value = async function (...args) {
      try {
        msg.loading(`${root ? `${root}.` : ""}${key}-loading`, { key, duration });
        const result = (await originMethod.apply(this, args)) as object;
        msg.success(`${root ? `${root}.` : ""}${key}-success`, { key, duration });
        return result;
      } catch (err) {
        const errKey = typeof err === "string" ? err : (err as Error).message;
        msg.error(errKey, { key, duration });
        Logger.error(`${key} action error return: ${err}`);
      }
    };
  };
};
