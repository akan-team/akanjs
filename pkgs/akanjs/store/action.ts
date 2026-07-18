import { DataList, type Dayjs, FIELD_META, type GetStateObject } from "akanjs/base";
import {
  capitalize,
  deepObjectify,
  type FetchPolicy,
  isQueryEqual,
  Logger,
  lowerlize,
  pathSet,
  resolveFileUploadCapability,
} from "akanjs/common";
import {
  type BaseInsight,
  type BaseObject,
  ConstantRegistry,
  type DefaultOf,
  type FieldState,
  immerify,
  type ProtoFile,
} from "akanjs/constant";
import type { BaseFilterSortKey, ExtractSort, FilterInstance } from "akanjs/document";
import type { FetchInitForm, FetchProxy } from "akanjs/fetch";
import type {
  SerializedSlice,
  SlceCnstCapitalizedRefName,
  SlceCnstDefault,
  SlceCnstDefaultInput,
  SlceCnstFull,
  SlceCnstInput,
  SlceCnstLight,
  SlceCnstRefName,
  SlceDbFilter,
  SlceDbSort,
  SliceCls,
} from "akanjs/signal";
import type { SliceStateKey } from "./state";
import type { SetGet, StoreSliceArgs, StoreSliceMap, StoreSliceSuffixCap } from "./types";

type SliceActionKey =
  | "initModel"
  | "refreshModel"
  | "selectModel"
  | "setPageOfModel"
  | "addPageOfModel"
  | "setLimitOfModel"
  | "setQueryArgsOfModel"
  | "setSortOfModel";
type _SliceMap<S extends SliceCls> = StoreSliceMap<S>;
type _ActionRefName<S extends SliceCls> = SlceCnstRefName<S>;
type _ActionCap<S extends SliceCls> = SlceCnstCapitalizedRefName<S>;
type _ActionInput<S extends SliceCls> = SlceCnstInput<S>;
type _ActionFull<S extends SliceCls> = SlceCnstFull<S>;
type _ActionLight<S extends SliceCls> = SlceCnstLight<S>;
type _ActionDefault<S extends SliceCls> = SlceCnstDefault<S>;
type _ActionDefaultInput<S extends SliceCls> = SlceCnstDefaultInput<S>;
type _ActionFilter<S extends SliceCls> = SlceDbFilter<S>;
type _ActionSort<S extends SliceCls> = SlceDbSort<S>;

const isNullableSliceArg = (arg: SerializedSlice["args"][number]) => arg.nullable ?? arg.type === "search";

const normalizeQueryArgs = (queryArgs: unknown[], sliceArgs: SerializedSlice["args"]) => {
  let length = Math.min(queryArgs.length, sliceArgs.length);
  while (length > 0 && isNullableSliceArg(sliceArgs[length - 1]) && queryArgs[length - 1] == null) length--;
  return queryArgs.slice(0, length);
};

const expandQueryArgs = (queryArgs: unknown[], sliceArgs: SerializedSlice["args"]) =>
  sliceArgs.map((_, idx) => queryArgs[idx]);

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

type BaseAction<
  RefName extends string,
  Input,
  Full extends { id: string },
  Light,
  _CapitalizedRefName extends string = Capitalize<RefName>,
  _CreateOption = CreateOption<Full>,
  _InputData = GetStateObject<Input>,
> = {
  [K in `create${_CapitalizedRefName}InForm`]: (options?: _CreateOption) => Promise<void>;
} & {
  [K in `update${_CapitalizedRefName}InForm`]: (options?: _CreateOption) => Promise<void>;
} & {
  [K in `create${_CapitalizedRefName}`]: (data: _InputData, options?: _CreateOption) => Promise<void>;
} & {
  [K in `update${_CapitalizedRefName}`]: (id: string, data: _InputData, options?: _CreateOption) => Promise<void>;
} & {
  [K in `remove${_CapitalizedRefName}`]: (
    id: string,
    options?: FetchPolicy & { modal?: string | null },
  ) => Promise<void>;
} & {
  [K in `check${_CapitalizedRefName}Submitable`]: (disabled?: boolean) => Promise<void>;
} & {
  [K in `submit${_CapitalizedRefName}`]: (options?: _CreateOption) => Promise<void>;
} & {
  [K in `new${_CapitalizedRefName}`]: (partial?: PartialOrNull<Full>, options?: NewOption) => void;
} & {
  [K in `edit${_CapitalizedRefName}`]: (
    model: Full | string,
    options?: { modal?: string | null } & FetchPolicy,
  ) => Promise<void>;
} & {
  [K in `merge${_CapitalizedRefName}`]: (
    model: Full | string,
    data: Partial<Full>,
    options?: FetchPolicy,
  ) => Promise<void>;
} & {
  [K in `view${_CapitalizedRefName}`]: (
    model: Full | string,
    options?: { modal?: string | null } & FetchPolicy,
  ) => Promise<void>;
} & { [K in `set${_CapitalizedRefName}`]: (...models: (Full | Light)[]) => void } & {
  [K in `reset${_CapitalizedRefName}`]: (model?: Full) => void;
};

export type SliceAction<
  RefName extends string,
  Suffix extends string,
  Input,
  Light,
  QueryArgs extends any[],
  Filter extends FilterInstance,
  _CapitalizedRefName extends string = Capitalize<RefName>,
  _CapitalizedSuffix extends string = Capitalize<Suffix>,
  _Sort = ExtractSort<Filter>,
  _FetchInitFormWithFetchPolicy = FetchInitForm<Input, Filter, DefaultOf<Input>, _Sort> & FetchPolicy,
> = {
  [KDefaultOf in `init${_CapitalizedRefName}${_CapitalizedSuffix}`]: (
    ...args: [...args: QueryArgs, initForm?: _FetchInitFormWithFetchPolicy]
  ) => Promise<void>;
} & {
  [K in `refresh${_CapitalizedRefName}${_CapitalizedSuffix}`]: (
    initForm?: _FetchInitFormWithFetchPolicy & { queryArgs?: QueryArgs },
  ) => Promise<void>;
} & {
  [K in `select${_CapitalizedRefName}${_CapitalizedSuffix}`]: (
    model: Light | Light[],
    options?: { refresh?: boolean; remove?: boolean },
  ) => void;
} & {
  [K in `setPageOf${_CapitalizedRefName}${_CapitalizedSuffix}`]: (page: number, options?: FetchPolicy) => Promise<void>;
} & {
  [K in `addPageOf${_CapitalizedRefName}${_CapitalizedSuffix}`]: (page: number, options?: FetchPolicy) => Promise<void>;
} & {
  [K in `setLimitOf${_CapitalizedRefName}${_CapitalizedSuffix}`]: (
    limit: number,
    options?: FetchPolicy,
  ) => Promise<void>;
} & {
  [K in `setQueryArgsOf${_CapitalizedRefName}${_CapitalizedSuffix}`]: (
    ...args:
      | [...args: QueryArgs, options?: FetchPolicy]
      | [setQueryArgs: (...prevQueryArgs: QueryArgs) => QueryArgs, options?: FetchPolicy]
  ) => Promise<void>;
} & {
  [K in `setSortOf${_CapitalizedRefName}${_CapitalizedSuffix}`]: (sort: _Sort, options?: FetchPolicy) => Promise<void>;
};

type SingleOf<M> = M extends (infer V)[] ? V : never;
type SetterKey<
  Prefix extends string,
  Key extends string,
  RefName extends string,
  _CapitalizedRefName extends string = Capitalize<RefName>,
  _CapitalizedK extends string = Capitalize<Key>,
> = `${Prefix}${_CapitalizedK}On${_CapitalizedRefName}`;

type FieldFormSetter<DefaultState, RefName extends string, _CapitalizedRefName extends string = Capitalize<RefName>> = {
  [Key in keyof DefaultState as Key extends string ? SetterKey<"set", Key, RefName, _CapitalizedRefName> : never]: (
    value: FieldState<DefaultState[Key]> | (DefaultState[Key] extends any[] ? never : null),
  ) => void;
};
type ArrayFieldAddSetters<RefName extends string, _CapRef extends string, _DefaultState> = {
  [K in keyof _DefaultState as _DefaultState[K] extends any[]
    ? K extends string
      ? SetterKey<"add", K, RefName, _CapRef>
      : never
    : never]: (
    value: DefaultOf<SingleOf<_DefaultState[K]>> | DefaultOf<SingleOf<_DefaultState[K]>>[],
    options?: { idx?: number; limit?: number },
  ) => void;
};
type ArrayFieldSubSetters<RefName extends string, _CapRef extends string, _DefaultState> = {
  [K in keyof _DefaultState as _DefaultState[K] extends any[]
    ? K extends string
      ? SetterKey<"sub", K, RefName, _CapRef>
      : never
    : never]: (idx: number | number[]) => void;
};
type ArrayFieldAddOrSubSetters<RefName extends string, _CapRef extends string, _DefaultState> = {
  [K in keyof _DefaultState as _DefaultState[K] extends any[]
    ? K extends string
      ? SetterKey<"addOrSub", K, RefName, _CapRef>
      : never
    : never]: (value: DefaultOf<SingleOf<_DefaultState[K]>>, options?: { idx?: number; limit?: number }) => void;
};

type FormSetter<
  Full,
  RefName extends string,
  _CapitalizedRefName extends string = Capitalize<RefName>,
  _DefaultState = DefaultOf<Full>,
> = FieldFormSetter<_DefaultState, RefName, _CapitalizedRefName> &
  ArrayFieldAddSetters<RefName, _CapitalizedRefName, _DefaultState> &
  ArrayFieldSubSetters<RefName, _CapitalizedRefName, _DefaultState> &
  ArrayFieldAddOrSubSetters<RefName, _CapitalizedRefName, _DefaultState> & {
    [K in keyof _DefaultState as _DefaultState[K] extends (ProtoFile | null) | ProtoFile[]
      ? K extends string
        ? SetterKey<"upload", K, RefName, _CapitalizedRefName>
        : never
      : never]: (fileList: FileList, idx?: number) => Promise<void>;
  } & {
    [K in `writeOn${_CapitalizedRefName}`]: (path: string | (string | number)[], value: any) => void;
  };

type DefaultSliceActionFields<
  SlceCls extends SliceCls,
  _CapRef extends string,
  _FetchInitFormWithFetchPolicy,
  _Light,
  _Sort,
  _Suffixes extends keyof _SliceMap<SlceCls> = keyof _SliceMap<SlceCls>,
> = {
  [Suffix in _Suffixes as `init${_CapRef}${StoreSliceSuffixCap<SlceCls, Suffix>}`]: (
    ...args: [...args: StoreSliceArgs<SlceCls, Suffix>, initForm?: _FetchInitFormWithFetchPolicy]
  ) => Promise<void>;
} & {
  [Suffix in _Suffixes as `refresh${_CapRef}${StoreSliceSuffixCap<SlceCls, Suffix>}`]: (
    initForm?: _FetchInitFormWithFetchPolicy & { queryArgs?: StoreSliceArgs<SlceCls, Suffix> },
  ) => Promise<void>;
} & {
  [Suffix in _Suffixes as `select${_CapRef}${StoreSliceSuffixCap<SlceCls, Suffix>}`]: (
    model: _Light | _Light[],
    options?: { refresh?: boolean; remove?: boolean },
  ) => void;
} & {
  [Suffix in _Suffixes as
    | `setPageOf${_CapRef}${StoreSliceSuffixCap<SlceCls, Suffix>}`
    | `addPageOf${_CapRef}${StoreSliceSuffixCap<SlceCls, Suffix>}`
    | `setLimitOf${_CapRef}${StoreSliceSuffixCap<SlceCls, Suffix>}`]: (
    value: number,
    options?: FetchPolicy,
  ) => Promise<void>;
} & {
  [Suffix in _Suffixes as `setQueryArgsOf${_CapRef}${StoreSliceSuffixCap<SlceCls, Suffix>}`]: (
    ...args:
      | [...args: StoreSliceArgs<SlceCls, Suffix>, options?: FetchPolicy]
      | [
          setQueryArgs: (...prevQueryArgs: StoreSliceArgs<SlceCls, Suffix>) => StoreSliceArgs<SlceCls, Suffix>,
          options?: FetchPolicy,
        ]
  ) => Promise<void>;
} & {
  [Suffix in _Suffixes as `setSortOf${_CapRef}${StoreSliceSuffixCap<SlceCls, Suffix>}`]: (
    sort: _Sort,
    options?: FetchPolicy,
  ) => Promise<void>;
};

export type DefaultAction<
  SlceCls extends SliceCls,
  _RefName extends string = _ActionRefName<SlceCls>,
  _Input = _ActionInput<SlceCls>,
  _Full extends { id: string } = _ActionFull<SlceCls>,
  _Light = _ActionLight<SlceCls>,
  _Filter extends FilterInstance = _ActionFilter<SlceCls>,
  _CapitalizedRefName extends string = _ActionCap<SlceCls>,
  _Default = _ActionDefault<SlceCls>,
  _DefaultInput = _ActionDefaultInput<SlceCls>,
  _Sort = _ActionSort<SlceCls>,
  _CreateOption = CreateOption<_Full>,
  _FetchInitFormWithFetchPolicy = FetchInitForm<_Input, _Filter, _DefaultInput, _Sort> & FetchPolicy,
> = BaseAction<_RefName, _Input, _Full, _Light, _CapitalizedRefName, _CreateOption> &
  FormSetter<_Full, _RefName, _CapitalizedRefName, _Default> &
  DefaultSliceActionFields<SlceCls, _CapitalizedRefName, _FetchInitFormWithFetchPolicy, _Light, _Sort>;

export const makeFormSetter = (refName: string, fetch: FetchProxy<any>) => {
  type Light = BaseObject;
  const [fieldName, className] = [refName, capitalize(refName)];
  const modelRef = ConstantRegistry.getDatabase(refName).full;
  const fileUploadRefName = resolveFileUploadCapability(fetch.serializedSignal)?.refName;

  const names = {
    model: fieldName,
    Model: className,
    modelForm: `${fieldName}Form`,
    writeOnModel: `writeOn${className}`,
    addModelFiles: `add${className}Files`,
  };
  const baseSetAction = {
    [names.writeOnModel]: function (this: SetGet, path: string | (string | number)[], value: any) {
      this.set((state: { [key: string]: any }) => {
        pathSet(state[names.modelForm], path, value);
      });
    },
  };
  const fieldSetAction = Object.entries(modelRef[FIELD_META]).reduce((acc, [key, field]) => {
    const [fieldKeyName, classKeyName] = [lowerlize(key), capitalize(key)];
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
      [namesOfField.setFieldOnModel]: function (this: SetGet, value: any | null) {
        this.set((state: { [key: string]: any }) => {
          const setValue =
            value === null
              ? null
              : field.isClass
                ? immerify<object>(field.modelRef, value as object)
                : (value as object);
          (state[names.modelForm] as { [key: string]: any })[namesOfField.field] = setValue;
        });
      },
      ...(field.isArray
        ? {
            [namesOfField.addFieldOnModel]: function (
              this: SetGet,
              value: Light | Light[],
              options: { idx?: number; limit?: number } = {},
            ) {
              const form = (this.get() as { [key: string]: any })[names.modelForm] as { [key: string]: any };
              const length = (form[namesOfField.field] as any[]).length;
              if (options.limit && options.limit <= length) return;
              const idx = options.idx ?? length;
              const setValue = field.isClass ? immerify<Light | Light[]>(field.modelRef, value) : value;
              this.set((state: { [key: string]: any }) => {
                (state[names.modelForm] as { [key: string]: any })[namesOfField.field] = [
                  ...(form[namesOfField.field] as object[]).slice(0, idx),
                  ...(Array.isArray(setValue) ? setValue : [setValue]),
                  ...(form[namesOfField.field] as object[]).slice(idx),
                ];
              });
            },
            [namesOfField.subFieldOnModel]: function (this: SetGet, idx: number | number[]) {
              const form = (this.get() as { [key: string]: any })[names.modelForm] as { [key: string]: object[] };
              this.set((state: { [key: string]: any }) => {
                (state[names.modelForm] as { [key: string]: any })[namesOfField.field] =
                  typeof idx === "number"
                    ? form[namesOfField.field].filter((_, i) => i !== idx)
                    : form[namesOfField.field].filter((_, i) => !idx.includes(i));
              });
            },
            [namesOfField.addOrSubFieldOnModel]: function (
              this: SetGet,
              value: any,
              options: { idx?: number; limit?: number } = {},
            ) {
              const { [names.modelForm]: form } = this.get() as { [key: string]: { [key: string]: any[] } };
              const index = form[namesOfField.field].indexOf(value);
              if (index === -1) ((this as any)[namesOfField.addFieldOnModel] as (...args: any) => void)(value, options);
              else ((this as any)[namesOfField.subFieldOnModel] as (...args: any) => void)(index);
            },
          }
        : {}),
      ...(field.isClass && !!fileUploadRefName && ConstantRegistry.getRefName(field.modelRef) === fileUploadRefName
        ? {
            [namesOfField.uploadFieldOnModel]: async function (this: SetGet, fileList: FileList, index?: number) {
              const form = (this.get() as { [key: string]: any })[names.modelForm] as { [key: string]: any };
              if (!fileList.length) return;
              const files = await (fetch[names.addModelFiles] as (...args: any) => Promise<ProtoFile[]>)(
                fileList,
                form.id,
              );
              if (field.isArray) {
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
              files.forEach((file) => {
                const intervalKey = setInterval(() => {
                  void (async () => {
                    const currentFile = await (
                      (fetch as { [key: string]: any })[fileUploadRefName as string] as (
                        id: string,
                      ) => Promise<ProtoFile>
                    )(file.id);
                    if (field.isArray)
                      this.set((state: { [key: string]: { [key: string]: ProtoFile[] } }) => {
                        state[names.modelForm][namesOfField.field] = state[names.modelForm][namesOfField.field].map(
                          (file) => (file.id === currentFile.id ? currentFile : file),
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
export const makeActions = (refName: string, slice: { [key: string]: SerializedSlice }, fetch: FetchProxy<any>) => {
  type Input = BaseObject;
  interface Insight {
    count: number;
  }
  type Full = BaseObject;
  type Light = BaseObject;
  type Filter = FilterInstance;
  type Sort = BaseFilterSortKey;
  const [fieldName, className] = [refName, capitalize(refName)];
  const cnst = ConstantRegistry.getDatabase(refName);
  const modelRef = cnst.full;
  const slices = Object.entries(slice).map(([suffix, serializedSlice]) => ({
    sliceName: `${refName}${capitalize(suffix)}`,
    suffix,
    slice: serializedSlice,
  }));
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
    updateModelInForm: `update${className}InForm`,
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
      this: SetGet,
      { idx, path, modal, sliceName = names.model, onError, onSuccess }: CreateOption<Full> = {},
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
      const modelInput = (cnst.input.purify as (form: any) => DefaultOf<Input> | null)(modelForm);

      if (!modelInput) return;
      this.set({ [names.modelLoading]: true });
      const model = await (fetch[names.createModel] as (...args: any[]) => Promise<Full>)(modelInput, { onError });
      const newModelList = modelListLoading
        ? modelList
        : new DataList([...modelList.slice(0, idx ?? 0), model, ...modelList.slice(idx ?? 0)]);
      const newModelInsight = new cnst.insight().set({
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
      this: SetGet,
      { path, modal, sliceName = names.model, onError, onSuccess }: CreateOption<Full> = {},
    ) {
      const SliceName = capitalize(sliceName);
      const namesOfSlice = {
        defaultModel: SliceName.replace(names.Model, names.defaultModel),
      };
      const currentState = this.get() as { [key: string]: any };
      const model = currentState[names.model] as Full | null;
      const modelForm = currentState[names.modelForm] as Input & { id: string };
      const defaultModel = currentState[namesOfSlice.defaultModel] as Full;
      const modelInput = (cnst.input.purify as (form: any) => DefaultOf<Input> | null)(modelForm);
      if (!modelInput) return;
      if (model?.id === modelForm.id) this.set({ [names.modelLoading]: modelForm.id });
      const updatedModel = await (fetch[names.updateModel] as (...args: any[]) => Promise<Full>)(
        modelForm.id,
        modelInput,
        { onError },
      );
      this.set({
        ...(model?.id === updatedModel.id
          ? { [names.model]: updatedModel, [names.modelLoading]: false, [names.modelViewAt]: new Date() }
          : {}),
        [names.modelForm]: immerify(modelRef, defaultModel),
        [names.modelModal]: modal ?? null,
        ...(typeof path === "string" && path ? { [path]: updatedModel } : {}),
      });
      const updatedLightModel = new cnst.light().set(updatedModel) as unknown as Light;
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
      this: SetGet,
      data: GetStateObject<Input>,
      { idx, path, modal, sliceName = names.model, onError, onSuccess }: CreateOption<Full> = {},
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
      const modelInput = (cnst.input.purify as (data: any) => Input | null)(data);
      if (!modelInput) return;
      this.set({ [names.modelLoading]: true });
      const model = await (fetch[names.createModel] as (...args: any[]) => Promise<Full>)(modelInput, { onError });
      const newModelList = modelListLoading
        ? modelList
        : new DataList([...modelList.slice(0, idx ?? 0), model, ...modelList.slice(idx ?? 0)]);

      const newModelInsight = new cnst.insight().set({
        ...modelInsight,
        count: modelInsight.count + 1,
      }) as unknown as Insight;
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
      this: SetGet,
      id: string,
      data: GetStateObject<Input>,
      { idx, path, modal, sliceName = names.model, onError, onSuccess }: CreateOption<Full> = {},
    ) {
      const currentState = this.get() as { [key: string]: any };
      const model = currentState[names.model] as Full | null;
      const modelInput = (cnst.input.purify as (data: any) => DefaultOf<Input> | null)(data);
      if (!modelInput) return;
      if (model?.id === id) this.set({ [names.modelLoading]: id });
      const updatedModel = await (fetch[names.updateModel] as (...args: any[]) => Promise<Full>)(id, modelInput, {
        onError,
      });
      this.set({
        ...(model?.id === updatedModel.id
          ? { [names.model]: updatedModel, [names.modelLoading]: false, [names.modelViewAt]: new Date() }
          : {}),
        [names.modelModal]: modal ?? null,
        ...(typeof path === "string" && path ? { [path]: updatedModel } : {}),
      });
      const updatedLightModel = new cnst.light().set(updatedModel) as unknown as Light;
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
    [names.removeModel]: async function (this: SetGet, id: string, options?: FetchPolicy & { modal?: string | null }) {
      const { modal, ...fetchPolicyOptions } = options ?? {};
      const model = await (fetch[names.removeModel] as (...args: any[]) => Promise<Full & { removedAt: Dayjs | null }>)(
        id,
        fetchPolicyOptions,
      );
      const lightModel = new cnst.light().set(model) as unknown as Light;
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
          const newModelInsight = new cnst.insight().set({
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
    [names.checkModelSubmitable]: function (this: SetGet, disabled?: boolean) {
      const currentState = this.get() as { [key: string]: any };
      const modelForm = currentState[names.modelForm] as Input;
      const modelSubmit = currentState[names.modelSubmit] as { disabled: boolean };
      const modelInput = (cnst.input.purify as (obj: any) => DefaultOf<Input> | null)(modelForm);
      this.set({ [names.modelSubmit]: { ...modelSubmit, disabled: !modelInput || disabled } });
    },
    [names.submitModel]: async function (this: SetGet, option?: CreateOption<Full>) {
      const currentState = this.get() as { [key: string]: any };
      const modelForm = currentState[names.modelForm] as Input & { id: string };
      const modelSubmit = currentState[names.modelSubmit] as { loading: boolean; times: number };
      this.set({ [names.modelSubmit]: { ...modelSubmit, loading: true } });
      if (modelForm.id) await ((this as any)[names.updateModelInForm] as (...args: any[]) => Promise<Full>)(option);
      else await ((this as any)[names.createModelInForm] as (...args: any[]) => Promise<Full>)(option);
      this.set({ [names.modelSubmit]: { ...modelSubmit, loading: false, times: modelSubmit.times + 1 } });
    },
    [names.newModel]: function (
      this: SetGet,
      partial: Partial<Full> = {},
      { modal, setDefault, sliceName = names.model }: NewOption = {},
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
      this: SetGet,
      modelOrId: Full | string,
      { modal, onError }: { modal?: string | null } & FetchPolicy = {},
    ) {
      const id = typeof modelOrId === "string" ? modelOrId : modelOrId.id;
      this.set({ [names.modelFormLoading]: id, [names.modelModal]: modal ?? "edit" });
      const model = await (fetch[names.model] as (...args: any[]) => Promise<Full>)(id, { onError });
      const modelForm = deepObjectify<Input>(model as unknown as Input);
      this.set({
        [names.model]: model,
        [names.modelFormLoading]: false,
        [names.modelViewAt]: new Date(),
        [names.modelForm]: modelForm,
      });
    },
    [names.mergeModel]: async function (
      this: SetGet,
      modelOrId: Full | string,
      data: Partial<Full>,
      options?: FetchPolicy,
    ) {
      const id = typeof modelOrId === "string" ? modelOrId : modelOrId.id;
      const currentState = this.get() as { [key: string]: any };
      const model = currentState[names.model] as Full | null;
      if (id === model?.id) this.set({ modelLoading: id });
      const updatedModel = await (fetch[names.mergeModel] as (...args: any[]) => Promise<Full>)(
        modelOrId,
        data,
        options,
      );
      this.set({
        [names.model]: id === model?.id ? updatedModel : model,
        [names.modelLoading]: false,
      });
      const updatedLightModel = new cnst.light().set(updatedModel) as unknown as Light;
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
      this: SetGet,
      modelOrId: Full | string,
      { modal, onError }: { modal?: string | null } & FetchPolicy = {},
    ) {
      const id = typeof modelOrId === "string" ? modelOrId : modelOrId.id;
      this.set({ [names.modelModal]: modal ?? "view", [names.modelLoading]: id });
      const model = await (fetch[names.model] as (...args: any[]) => Promise<Full>)(id, { onError });
      this.set({ [names.model]: model, [names.modelViewAt]: new Date(), [names.modelLoading]: false });
    },
    [names.setModel]: function (this: SetGet, ...fullOrLightModels: Full[]) {
      const currentState = this.get() as { [key: string]: any };
      if (fullOrLightModels.length === 0) return;

      // set the first model to the model state
      const firstModel = fullOrLightModels[0];
      const model = currentState[names.model] as Full | null;
      const isFull = firstModel instanceof modelRef;
      if (isFull) {
        const crystalizedModel = new cnst.full().set(firstModel) as unknown as Full;
        this.set({ [names.model]: crystalizedModel });
      } else if (model?.id === firstModel.id) {
        const crystalizedModel = new cnst.full().set({
          ...model,
          ...firstModel,
        }) as unknown as Full;
        this.set({ [names.model]: crystalizedModel });
      }

      // set the rest of the models to the model list
      const lightModels = fullOrLightModels.map(
        (fullOrLightModel) => new cnst.light().set(fullOrLightModel) as unknown as Light,
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
    [names.resetModel]: function (this: SetGet, model?: Full) {
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
  const sliceAction = slices.reduce((acc, { sliceName, slice }) => {
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
        this: SetGet,
        ...args: [...args: any[], initForm: FetchInitForm<Input, Filter, DefaultOf<Input>, Sort> & FetchPolicy]
      ) {
        const initArgLength = Math.min(args.length, slice.args.length);
        const initForm = { invalidate: false, ...(args[slice.args.length] ?? {}) } as FetchInitForm<
          Input,
          Filter,
          DefaultOf<Input>,
          Sort
        > &
          FetchPolicy;
        const queryArgs = new Array(initArgLength).fill(null).map((_, i) => args[i] as object);
        const defaultModel = new cnst.full().set(initForm.default ?? {}) as unknown as Full;
        this.set({ [names.defaultModel]: defaultModel });
        await ((this as any)[namesOfSlice.refreshModel] as (...args: any[]) => Promise<void>)({
          ...initForm,
          queryArgs,
        });
      },
      [namesOfSlice.refreshModel]: async function (
        this: SetGet,
        initForm: FetchInitForm<Input, Filter, DefaultOf<Input>, Sort> & FetchPolicy & { queryArgs?: any[] } = {},
      ) {
        const args = initForm.queryArgs ?? [];
        const refreshArgLength = Math.min(args.length, slice.args.length);
        const currentState = this.get() as { [key: string]: any };
        const existingQueryArgs = currentState[namesOfSlice.queryArgsOfModel] as object[];
        const queryArgs = normalizeQueryArgs(
          [
            ...new Array(refreshArgLength).fill(null).map((_, i) => args[i] as object),
            ...existingQueryArgs.slice(refreshArgLength, slice.args.length),
          ],
          slice.args,
        );
        const {
          default: defaultFromInitForm,
          insight,
          page = currentState[namesOfSlice.pageOfModel] as number,
          limit = currentState[namesOfSlice.limitOfModel] as number,
          sort = currentState[namesOfSlice.sortOfModel] as Sort,
          invalidate = true,
          queryArgs: queryArgsFromInitForm,
          ...fetchPolicy
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
        const fetchQueryArgs = expandQueryArgs(queryArgs, slice.args);
        const [modelDataList, modelInsight] = await Promise.all([
          (fetch[namesOfSlice.modelList] as (...args: any[]) => Promise<Light[]>)(
            ...fetchQueryArgs,
            (page - 1) * limit,
            limit,
            sort,
            { ...fetchPolicy, onError: initForm.onError },
          ),
          (fetch[namesOfSlice.modelInsight] as (...args: any[]) => Promise<Insight & BaseInsight>)(...fetchQueryArgs, {
            ...fetchPolicy,
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
        this: SetGet,
        model: Light | Light[],
        { refresh, remove }: { refresh?: boolean; remove?: boolean } = {},
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
      [namesOfSlice.setPageOfModel]: async function (this: SetGet, page: number, options?: FetchPolicy) {
        const currentState = this.get() as { [key: string]: any };
        const queryArgsOfModel = currentState[namesOfSlice.queryArgsOfModel] as object[];
        const pageOfModel = currentState[namesOfSlice.pageOfModel] as number;
        const limitOfModel = currentState[namesOfSlice.limitOfModel] as number;
        const sortOfModel = currentState[namesOfSlice.sortOfModel] as Sort;
        if (pageOfModel === page) return;
        this.set({ [namesOfSlice.modelListLoading]: true });
        const fetchQueryArgs = expandQueryArgs(queryArgsOfModel, slice.args);
        const modelDataList = await (fetch[namesOfSlice.modelList] as (...args: any[]) => Promise<Light[]>)(
          ...fetchQueryArgs,
          (page - 1) * limitOfModel,
          limitOfModel,
          sortOfModel,
          options,
        );
        const modelList = new DataList(modelDataList);
        this.set({
          [namesOfSlice.modelList]: modelList,
          [namesOfSlice.pageOfModel]: page,
          [namesOfSlice.modelListLoading]: false,
        });
      },
      [namesOfSlice.addPageOfModel]: async function (this: SetGet, page: number, options?: FetchPolicy) {
        const currentState = this.get() as { [key: string]: any };
        const modelList = currentState[namesOfSlice.modelList] as DataList<Light>;
        const queryArgsOfModel = currentState[namesOfSlice.queryArgsOfModel] as object[];
        const pageOfModel = currentState[namesOfSlice.pageOfModel] as number;
        const limitOfModel = currentState[namesOfSlice.limitOfModel] as number;
        const sortOfModel = currentState[namesOfSlice.sortOfModel] as Sort;
        if (pageOfModel === page) return;
        const addFront = page < pageOfModel;
        const fetchQueryArgs = expandQueryArgs(queryArgsOfModel, slice.args);
        const modelDataList = await (fetch[namesOfSlice.modelList] as (...args: any[]) => Promise<Light[]>)(
          ...fetchQueryArgs,
          (page - 1) * limitOfModel,
          limitOfModel,
          sortOfModel,
          options,
        );
        const newModelList = new DataList(
          addFront ? [...modelDataList, ...modelList] : [...modelList, ...modelDataList],
        );
        this.set({ [namesOfSlice.modelList]: newModelList, [namesOfSlice.pageOfModel]: page });
      },
      [namesOfSlice.setLimitOfModel]: async function (this: SetGet, limit: number, options?: FetchPolicy) {
        const currentState = this.get() as { [key: string]: any };
        const modelInsight = currentState[namesOfSlice.modelInsight] as Insight & BaseInsight;
        const queryArgsOfModel = currentState[namesOfSlice.queryArgsOfModel] as object[];
        const pageOfModel = currentState[namesOfSlice.pageOfModel] as number;
        const limitOfModel = currentState[namesOfSlice.limitOfModel] as number;
        const sortOfModel = currentState[namesOfSlice.sortOfModel] as Sort;
        if (limitOfModel === limit) return;
        const skip = (pageOfModel - 1) * limitOfModel;
        const page = Math.max(Math.floor((skip - 1) / limit) + 1, 1);
        const fetchQueryArgs = expandQueryArgs(queryArgsOfModel, slice.args);
        const modelDataList = await (fetch[namesOfSlice.modelList] as (...args: any[]) => Promise<Light[]>)(
          ...fetchQueryArgs,
          (page - 1) * limit,
          limit,
          sortOfModel,
          options,
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
        this: SetGet,
        ...args:
          | [...queryArgs: any, options?: FetchPolicy]
          | [setQueryArgs: (...prevQueryArgs: object[]) => object[], options?: FetchPolicy]
      ) {
        const isSetQueryAsFunction = typeof args[0] === "function";
        const currentState = this.get() as { [key: string]: any };
        const options = (isSetQueryAsFunction ? args[1] : args[slice.args.length]) as FetchPolicy | undefined;
        const queryArgsOfModel = currentState[namesOfSlice.queryArgsOfModel] as object[];
        const queryArgs = normalizeQueryArgs(
          isSetQueryAsFunction
            ? (args[0] as (...prevQueryArgs: object[]) => object[])(...queryArgsOfModel)
            : new Array(slice.args.length).fill(null).map((_, i) => args[i] as object),
          slice.args,
        );
        const limitOfModel = currentState[namesOfSlice.limitOfModel] as number;
        const sortOfModel = currentState[namesOfSlice.sortOfModel] as Sort;
        if (isQueryEqual(queryArgsOfModel, queryArgs)) {
          Logger.trace(`${namesOfSlice.queryArgsOfModel} store-level cache hit`);
          return; // store-level cache hit
        }
        this.set({ [namesOfSlice.modelListLoading]: true });
        const fetchQueryArgs = expandQueryArgs(queryArgs, slice.args);
        const [modelDataList, modelInsight] = await Promise.all([
          (fetch[namesOfSlice.modelList] as (...args: any[]) => Promise<Light[]>)(
            ...fetchQueryArgs,
            0,
            limitOfModel,
            sortOfModel,
            options,
          ),
          (fetch[namesOfSlice.modelInsight] as (...args: any[]) => Promise<Insight & BaseInsight>)(
            ...fetchQueryArgs,
            options,
          ),
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
      [namesOfSlice.setSortOfModel]: async function (this: SetGet, sort: Sort, options?: FetchPolicy) {
        const currentState = this.get() as { [key: string]: any };
        const queryArgsOfModel = currentState[namesOfSlice.queryArgsOfModel] as object[];
        const limitOfModel = currentState[namesOfSlice.limitOfModel] as number;
        const sortOfModel = currentState[namesOfSlice.sortOfModel] as Sort;
        if (sortOfModel === sort) return; // store-level cache hit
        this.set({ [namesOfSlice.modelListLoading]: true });
        const fetchQueryArgs = expandQueryArgs(queryArgsOfModel, slice.args);
        const modelDataList = await (fetch[namesOfSlice.modelList] as (...args: any[]) => Promise<Light[]>)(
          ...fetchQueryArgs,
          0,
          limitOfModel,
          sort,
          options,
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
