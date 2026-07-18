import type { GetStateObject, SLICE_META } from "akanjs/base";
import type { FetchPolicy } from "akanjs/common";
import type { ConstantModel, DefaultOf, ProtoFile, PurifiedModel } from "akanjs/constant";
import type { DatabaseModel, ExtractSort, FilterInstance } from "akanjs/document";
import type {
  SlceCnstCapitalizedRefName,
  SlceCnstDefaultInput,
  SlceCnstFull,
  SlceCnstInput,
  SlceCnstInsight,
  SlceCnstLight,
  SlceCnstPurifiedInput,
  SlceCnstRefName,
  SlceDbFilter,
  SlceDbSort,
  SliceCls,
  SliceInfoArgs,
} from "akanjs/signal";
import type { EditReturn, InitReturn, ServerEdit, ServerInit, ServerView, ViewReturn } from "./appliedReturn.type";

// Shortcut accessors — avoids re-typing the long lookup path and lets TS
// memoize each access once per SlceCls instantiation.
type _SliceMap<S extends SliceCls> = S[typeof SLICE_META];
type _RefName<S extends SliceCls> = SlceCnstRefName<S>;
type _Cap<S extends SliceCls> = SlceCnstCapitalizedRefName<S>;
type _Input<S extends SliceCls> = SlceCnstInput<S>;
type _Full<S extends SliceCls> = SlceCnstFull<S>;
type _Light<S extends SliceCls> = SlceCnstLight<S>;
type _Insight<S extends SliceCls> = SlceCnstInsight<S>;
type _PurifiedInput<S extends SliceCls> = SlceCnstPurifiedInput<S>;
type _DefaultInput<S extends SliceCls> = SlceCnstDefaultInput<S>;
type _Filter<S extends SliceCls> = SlceDbFilter<S>;
type _Sort<S extends SliceCls> = SlceDbSort<S>;
type _LightWithId<S extends SliceCls> = _Light<S> extends { id: string } ? _Light<S> : { id: string };
type _SliceFetchInitOption<S extends SliceCls> = FetchInitOption<_Input<S>, _Filter<S>, _DefaultInput<S>, _Sort<S>>;

// The 4 dynamic parts below are each a single homomorphic mapped type over
// `keyof SliceMap`, which preserves each result key's declaration trace
// (better hover, slightly better go-to-def) and avoids the
// `UnionToIntersection`/`MergedValues` blow-up.

type SliceListFetch<S extends SliceCls> = {
  [Suffix in keyof _SliceMap<S> as Suffix extends string ? `${_RefName<S>}List${Capitalize<Suffix>}` : never]: (
    ...args: [
      ...SliceInfoArgs<_SliceMap<S>[Suffix]>,
      skip?: number | null,
      limit?: number | null,
      sort?: _Sort<S> | null,
      fetchPolicy?: FetchPolicy,
    ]
  ) => Promise<_Light<S>[]>;
};

type SliceInsightFetch<S extends SliceCls> = {
  [Suffix in keyof _SliceMap<S> as Suffix extends string ? `${_RefName<S>}Insight${Capitalize<Suffix>}` : never]: (
    ...args: [...SliceInfoArgs<_SliceMap<S>[Suffix]>, fetchPolicy?: FetchPolicy]
  ) => Promise<_Insight<S>>;
};

type SliceInitFetch<S extends SliceCls> = {
  [Suffix in keyof _SliceMap<S> as Suffix extends string ? `init${_Cap<S>}${Capitalize<Suffix>}` : never]: (
    ...args: [...SliceInfoArgs<_SliceMap<S>[Suffix]>, option?: _SliceFetchInitOption<S>]
  ) => Promise<
    InitReturn<
      _RefName<S>,
      Suffix & string,
      _Light<S>,
      _Insight<S>,
      SliceInfoArgs<_SliceMap<S>[Suffix]>,
      _Filter<S>,
      _Cap<S>,
      Suffix extends string ? Capitalize<Suffix> : never,
      _LightWithId<S>,
      GetStateObject<_LightWithId<S>>,
      GetStateObject<_Insight<S>>,
      _Sort<S>
    >
  >;
};

type SliceGetInitFetch<S extends SliceCls> = {
  [Suffix in keyof _SliceMap<S> as Suffix extends string ? `get${_Cap<S>}Init${Capitalize<Suffix>}` : never]: (
    ...args: [...SliceInfoArgs<_SliceMap<S>[Suffix]>, option?: _SliceFetchInitOption<S>]
  ) => Promise<
    ServerInit<
      _RefName<S>,
      _Light<S>,
      _Insight<S>,
      SliceInfoArgs<_SliceMap<S>[Suffix]>,
      _Filter<S>,
      _Cap<S>,
      GetStateObject<_LightWithId<S>>,
      GetStateObject<_Insight<S>>,
      _Sort<S>
    >
  >;
};

export type GetFetchTypeFromSlice<SlceCls extends SliceCls> = SlceCls["srv"]["cnst"] extends ConstantModel
  ? SlceCls["srv"]["db"] extends DatabaseModel
    ? SliceListFetch<SlceCls> &
        SliceInsightFetch<SlceCls> &
        SliceInitFetch<SlceCls> &
        SliceGetInitFetch<SlceCls> &
        RawBaseSliceFetchType<
          _RefName<SlceCls>,
          _Input<SlceCls>,
          _Full<SlceCls>,
          _Light<SlceCls>,
          _Cap<SlceCls>,
          _PurifiedInput<SlceCls>
        > &
        AppliedBaseSliceFetchType<
          _RefName<SlceCls>,
          _Input<SlceCls>,
          _Full<SlceCls>,
          _Cap<SlceCls>,
          _PurifiedInput<SlceCls>
        >
    : never
  : never;

type RawBaseSliceFetchType<
  RefName extends string,
  Input,
  Full,
  Light,
  _CapitalizedRefName extends string = Capitalize<RefName>,
  _PurifiedInput = PurifiedModel<Input>,
> = {
  [K in RefName]: (id: string, fetchPolicy?: FetchPolicy) => Promise<Full>;
} & {
  [K in `light${_CapitalizedRefName}`]: (id: string, fetchPolicy?: FetchPolicy) => Promise<Light>;
} & {
  [K in `create${_CapitalizedRefName}`]: (input: _PurifiedInput, fetchPolicy?: FetchPolicy) => Promise<Full>;
} & {
  [K in `update${_CapitalizedRefName}`]: (
    id: string,
    input: _PurifiedInput,
    fetchPolicy?: FetchPolicy,
  ) => Promise<Full>;
} & {
  [K in `remove${_CapitalizedRefName}`]: (id: string, fetchPolicy?: FetchPolicy) => Promise<Full>;
};

type AppliedBaseSliceFetchType<
  RefName extends string,
  Input,
  Full,
  _CapitalizedRefName extends string = Capitalize<RefName>,
  _PurifiedInput = PurifiedModel<Input>,
> = {
  [K in `view${_CapitalizedRefName}`]: (id: string, option?: FetchPolicy) => Promise<ViewReturn<RefName, Full>>;
} & {
  [K in `get${_CapitalizedRefName}View`]: (id: string, option?: FetchPolicy) => Promise<ServerView<RefName, Full>>;
} & {
  [K in `edit${_CapitalizedRefName}`]: (id: string, option?: FetchPolicy) => Promise<EditReturn<RefName, Full>>;
} & {
  [K in `get${_CapitalizedRefName}Edit`]: (id: string, option?: FetchPolicy) => Promise<ServerEdit<RefName, Full>>;
} & {
  // TODO: migrate this to shared
  [K in `add${_CapitalizedRefName}Files`]: (
    fileList: FileList,
    parentId?: string,
    option?: FetchPolicy,
  ) => Promise<ProtoFile[]>;
} & {
  [K in `merge${_CapitalizedRefName}`]: (
    modelOrId: Full | string,
    data: Partial<_PurifiedInput>,
    option?: FetchPolicy,
  ) => Promise<Full>;
};

export interface FetchInitForm<
  Input,
  Filter extends FilterInstance,
  _DefaultInput = DefaultOf<Input>,
  _Sort = ExtractSort<Filter>,
> {
  page?: number;
  limit?: number;
  sort?: _Sort;
  default?: Partial<_DefaultInput>;
  invalidate?: boolean;
  insight?: boolean;
}

type FetchInitOption<
  Input,
  Filter extends FilterInstance,
  _DefaultInput = DefaultOf<Input>,
  _Sort = ExtractSort<Filter>,
> = FetchPolicy & FetchInitForm<Input, Filter, _DefaultInput, _Sort>;
