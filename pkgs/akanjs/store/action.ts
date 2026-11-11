import { FIELD_META, type GetStateObject } from "akanjs/base";
import { type FetchPolicy, pathSet } from "akanjs/common";
import type { DefaultOf, FieldState, ProtoLightFile } from "akanjs/constant";
import type { ExtractSort, FilterInstance } from "akanjs/document";
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
import type { CreateOption, EditOption, NewOption } from "./actionOption";
import { fieldSettersOf, formSetterContextOf } from "./formFieldSetters";
import { modelActionContextOf, type ReportingFetchPolicy } from "./modelActionContext";
import { modelOpenActionsOf, modelStateActionsOf } from "./modelOpenActions";
import { formSaveActionsOf, modelWriteActionsOf } from "./modelWriteActions";
import { sliceListContextOf, sliceLoadActionsOf, slicePageActionsOf, sliceQueryActionsOf } from "./sliceListActions";
import { sliceLiveActionsOf } from "./sliceLiveActions";
import type { SetGet, StoreSliceArgs, StoreSliceMap, StoreSliceSuffixCap } from "./types";

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
type SliceInitForm<S extends SliceCls> = FetchInitForm<_ActionInput<S>, _ActionFilter<S>> & FetchPolicy;
type SliceRefreshForm<S extends SliceCls, Suffix extends keyof _SliceMap<S>> = SliceInitForm<S> & {
  queryArgs?: StoreSliceArgs<S, Suffix>;
};

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
    options?: ReportingFetchPolicy & { modal?: string | null },
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
    options?: EditOption & ReportingFetchPolicy,
  ) => Promise<void>;
} & {
  [K in `load${_CapitalizedRefName}FormDraft`]: (draftScope?: string) => Promise<void>;
} & {
  [K in `restore${_CapitalizedRefName}FormDraft`]: () => void;
} & {
  [K in `discard${_CapitalizedRefName}FormDraft`]: () => void;
} & {
  [K in `merge${_CapitalizedRefName}`]: (
    model: Full | string,
    data: Partial<Full>,
    options?: ReportingFetchPolicy,
  ) => Promise<void>;
} & {
  [K in `view${_CapitalizedRefName}`]: (
    model: Full | string,
    options?: { modal?: string | null } & ReportingFetchPolicy,
  ) => Promise<void>;
} & { [K in `set${_CapitalizedRefName}`]: (...models: (Full | Light)[]) => void } & {
  [K in `reset${_CapitalizedRefName}`]: (model?: Full) => void;
} & { [K in `invalidate${_CapitalizedRefName}`]: () => void };

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
  _FetchInitFormWithFetchPolicy = FetchInitForm<Input, Filter> & FetchPolicy,
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
  [K in `loadMoreOf${_CapitalizedRefName}${_CapitalizedSuffix}`]: (options?: FetchPolicy) => Promise<void>;
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
    [K in keyof _DefaultState as _DefaultState[K] extends (ProtoLightFile | null) | ProtoLightFile[]
      ? K extends string
        ? SetterKey<"upload", K, RefName, _CapitalizedRefName>
        : never
      : never]: (fileList: FileList | File[], idx?: number) => Promise<void>;
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
    initForm?: SliceRefreshForm<SlceCls, Suffix>,
  ) => Promise<void>;
} & {
  [Suffix in _Suffixes as `select${_CapRef}${StoreSliceSuffixCap<SlceCls, Suffix>}`]: (
    model: _Light | _Light[],
    options?: { refresh?: boolean; remove?: boolean },
  ) => void;
} & {
  [Suffix in _Suffixes as
    | `setPageOf${_CapRef}${StoreSliceSuffixCap<SlceCls, Suffix>}`
    | `setLimitOf${_CapRef}${StoreSliceSuffixCap<SlceCls, Suffix>}`]: (
    value: number,
    options?: FetchPolicy,
  ) => Promise<void>;
} & {
  [Suffix in _Suffixes as `loadMoreOf${_CapRef}${StoreSliceSuffixCap<SlceCls, Suffix>}`]: (
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
  _FetchInitFormWithFetchPolicy = SliceInitForm<SlceCls>,
> = BaseAction<_RefName, _Input, _Full, _Light, _CapitalizedRefName, _CreateOption> &
  FormSetter<_Full, _RefName, _CapitalizedRefName, _Default> &
  DefaultSliceActionFields<SlceCls, _CapitalizedRefName, _FetchInitFormWithFetchPolicy, _Light, _Sort>;

export const makeFormSetter = (refName: string, fetch: FetchProxy<any>) => {
  const ctx = formSetterContextOf(refName, fetch);
  const { names, formPatchOf } = ctx;
  const baseSetAction = {
    [names.writeOnModel]: function (this: SetGet, path: string | (string | number)[], value: any) {
      this.set(
        formPatchOf(this.get(), (form) => {
          pathSet(form, path, value);
        }),
      );
    },
  };
  const fieldSetAction = Object.entries(ctx.modelRef[FIELD_META]).reduce(
    (acc, [key, field]) => Object.assign(acc, fieldSettersOf(ctx, key, field)),
    {},
  );
  return Object.assign(fieldSetAction, baseSetAction);
};
export const makeActions = (refName: string, slice: { [key: string]: SerializedSlice }, fetch: FetchProxy<any>) => {
  const model = modelActionContextOf(refName, slice, fetch);
  const baseAction = {
    ...formSaveActionsOf(model),
    ...modelWriteActionsOf(model),
    ...modelOpenActionsOf(model),
    ...modelStateActionsOf(model),
  };
  const sliceAction = model.slices.reduce((acc, entry) => {
    const list = sliceListContextOf(model, entry);
    return Object.assign(
      acc,
      sliceLoadActionsOf(list),
      slicePageActionsOf(list),
      sliceQueryActionsOf(list),
      sliceLiveActionsOf(list),
    );
  }, {});
  return { ...baseAction, ...sliceAction };
};
