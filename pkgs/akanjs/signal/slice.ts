import { Any, type Assign, type MergeAllKeyOfObjects, SLICE_DICT_SHAPE, SLICE_META } from "akanjs/base";
import { applyMixins } from "akanjs/common";
import { type FilterInstance, FilterQueryError, resolveFilterQuery } from "akanjs/document";
import { type Adaptor, type AdaptorCls, dangerouslyAdapt, type ServiceModel } from "akanjs/service";
import { Exception } from "./exception";
import type { GuardCls } from "./guard";
import {
  buildSlice,
  type SliceBuilder,
  type SliceInfo,
  type SliceInfoArgNames,
  type SliceInfoArgs,
  type SliceInfoInternalArgs,
  type SliceInfoServerArgs,
  type SliceInfoSrvs,
} from "./sliceInfo";
import type { CnstFull, CnstInput, CnstInsight, CnstLight, DbFilter, SrvMap, SrvRefName } from "./types";

export type SliceDictArgShape = { [key: string]: readonly string[] };
export type SliceDictShape<SliceInfoObj extends { [key: string]: SliceInfo }> = {
  [K in keyof SliceInfoObj]: SliceInfoArgNames<SliceInfoObj[K]>;
};

export interface Slice<DictShape extends SliceDictArgShape = Record<never, never>> extends Adaptor {
  readonly [SLICE_DICT_SHAPE]: DictShape;
}

export type SliceCls<
  SrvModule extends ServiceModel = ServiceModel,
  SliceInfoObj extends { [key: string]: SliceInfo } = { [key: string]: SliceInfo },
> = AdaptorCls<Slice<SliceDictShape<SliceInfoObj>>> & {
  baseName: SrvRefName<SrvModule>;
  srv: SrvModule;
  prototype: Slice<SliceDictShape<SliceInfoObj>>;
  [SLICE_META]: SliceInfoObj;
  getGuards: GuardCls[];
  cruGuards: GuardCls[];
  createGuards: GuardCls[];
  updateGuards: GuardCls[];
  removeGuards: GuardCls[];
  mcp: ResolvedSliceMcp;
};

/** `root` is absent: it rides on the root slice itself. */
export interface ResolvedSliceMcp {
  get: boolean;
  create: boolean;
  update: boolean;
  remove: boolean;
}

interface RootSliceOption {
  guards?: {
    root?: GuardCls | GuardCls[];
    get?: GuardCls | GuardCls[];
    cru?: GuardCls | GuardCls[];
    create?: GuardCls | GuardCls[];
    update?: GuardCls | GuardCls[];
    remove?: GuardCls | GuardCls[];
  };
  /**
   * Keyed like `guards`, for the root slice and generated CRUD only; `create`/`update`/`remove` fall back to `cru`
   * and a bare boolean sets every key. Curation, not authorization: HTTP is unchanged.
   */
  mcp?:
    | boolean
    | { root?: boolean; get?: boolean; cru?: boolean; create?: boolean; update?: boolean; remove?: boolean };
  prefix?: string;
}

type RootSliceQueryKey<Filter extends FilterInstance> = Extract<keyof Filter["query"], string>;

type ExtendSliceInfoObj<
  SrvModule extends ServiceModel,
  LibSlices extends SliceCls[],
  _Input = CnstInput<SrvModule>,
  _Full = CnstFull<SrvModule>,
  _Light = CnstLight<SrvModule>,
  _Insight = CnstInsight<SrvModule>,
  _Filter extends FilterInstance = DbFilter<SrvModule>,
  _Merged = MergeAllKeyOfObjects<LibSlices, typeof SLICE_META>,
> = {
  [K in keyof _Merged]: _Merged[K] extends SliceInfo
    ? SliceInfo<
        SrvRefName<SrvModule>,
        _Input,
        _Full,
        _Light,
        _Insight,
        _Filter,
        SliceInfoSrvs<_Merged[K]>,
        SliceInfoArgNames<_Merged[K]>,
        SliceInfoArgs<_Merged[K]>,
        SliceInfoInternalArgs<_Merged[K]>,
        SliceInfoServerArgs<_Merged[K]>
      >
    : never;
};

type RootSliceInfoObj<
  SrvModule extends ServiceModel,
  _Input,
  _Full,
  _Light,
  _Insight,
  _Filter extends FilterInstance,
  _QueryKey extends string,
> = {
  [""]: SliceInfo<
    SrvRefName<SrvModule>,
    _Input,
    _Full,
    _Light,
    _Insight,
    _Filter,
    SrvMap<SrvModule>,
    ["queryKey", "args"],
    [queryKey?: _QueryKey | null, args?: unknown[] | null],
    [],
    [_QueryKey | undefined, unknown[] | undefined]
  >;
};

export function slice<
  SrvModule extends ServiceModel,
  BuildSlice extends SliceBuilder<SrvModule>,
  LibSlices extends SliceCls[],
  _Input = CnstInput<SrvModule>,
  _Full = CnstFull<SrvModule>,
  _Light = CnstLight<SrvModule>,
  _Insight = CnstInsight<SrvModule>,
  _Filter extends FilterInstance = DbFilter<SrvModule>,
  _QueryKey extends string = RootSliceQueryKey<_Filter>,
>(
  srv: SrvModule,
  option: RootSliceOption,
  sliceBuilder: BuildSlice,
  ...libSlices: LibSlices
): SliceCls<
  SrvModule,
  LibSlices extends []
    ? Assign<ReturnType<BuildSlice>, RootSliceInfoObj<SrvModule, _Input, _Full, _Light, _Insight, _Filter, _QueryKey>>
    : Assign<
        ExtendSliceInfoObj<SrvModule, LibSlices>,
        Assign<ReturnType<BuildSlice>, RootSliceInfoObj<SrvModule, _Input, _Full, _Light, _Insight, _Filter, _QueryKey>>
      >
> {
  if (!srv.cnst || !srv.db) throw new Error("cnst and db are required");
  const filterRef = srv.db.filter;
  const init = buildSlice(srv.srv.refName, srv.cnst.input, srv.cnst.full, srv.cnst.light, srv.cnst.insight, filterRef);
  const toGuards = (guard?: GuardCls | GuardCls[]) => (guard ? (Array.isArray(guard) ? guard : [guard]) : []);
  const rootGuards = toGuards(option.guards?.root);
  const getGuards = toGuards(option.guards?.get);
  const cruGuards = toGuards(option.guards?.cru);
  // An omitted override keeps the same `cruGuards` reference: serialization detects "not overridden" by identity.
  const createGuards = option.guards?.create ? toGuards(option.guards.create) : cruGuards;
  const updateGuards = option.guards?.update ? toGuards(option.guards.update) : cruGuards;
  const removeGuards = option.guards?.remove ? toGuards(option.guards.remove) : cruGuards;
  const mcpOption =
    typeof option.mcp === "boolean" ? { root: option.mcp, get: option.mcp, cru: option.mcp } : option.mcp;
  const cruMcp = mcpOption?.cru !== false;
  const mcp: ResolvedSliceMcp = {
    get: mcpOption?.get !== false,
    create: mcpOption?.create ?? cruMcp,
    update: mcpOption?.update ?? cruMcp,
    remove: mcpOption?.remove ?? cruMcp,
  };
  const srvKeys = [
    ...new Set([...Object.keys(srv.srvMap), ...libSlices.flatMap((libSlice) => Object.keys(libSlice.srv.srvMap))]),
  ];
  const sliceCls = class Slice extends dangerouslyAdapt(`${srv.srv.refName}Slice`, ({ service }) => ({
    ...Object.fromEntries(srvKeys.map((srvRefName) => [srvRefName, service()])),
  })) {
    static baseName = srv.srv.refName;
    static srv = srv;
    static getGuards = getGuards;
    static cruGuards = cruGuards;
    static createGuards = createGuards;
    static updateGuards = updateGuards;
    static removeGuards = removeGuards;
    static mcp = mcp;
    // The app's own slices go last: its root slice resolves its own filter, which already includes the lib's filters.
    static [SLICE_META] = Object.assign(
      {},
      ...libSlices.map((libSlice) => libSlice[SLICE_META]),
      {
        // Names one of the model's filters rather than taking a raw query, which would let a caller compose any query.
        [""]: init({ guards: rootGuards, ...(mcpOption?.root === false ? { mcp: false } : {}) })
          .search<"queryKey", string>("queryKey", String)
          .search<"args", unknown[]>("args", Any)
          .exec((queryKey, args) => {
            try {
              return resolveFilterQuery(filterRef, queryKey, args);
            } catch (error) {
              // The schema already names every filter and argument, so saying which one is wrong leaks nothing.
              if (error instanceof FilterQueryError) throw new Exception.BadRequest(error.message);
              throw error;
            }
          }),
      },
      sliceBuilder(init as Parameters<BuildSlice>[0]),
    );
  };
  Object.assign(srv.srvMap, Object.assign({}, ...libSlices.map((libSlice) => libSlice.srv.srvMap), srv.srvMap));
  applyMixins(sliceCls, libSlices);
  return sliceCls as any; // the declared return is a generic instantiation built from this call's own type arguments, so there is no `T` to name
}
