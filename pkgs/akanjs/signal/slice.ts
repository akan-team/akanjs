import { Any, type Assign, type Cls, type MergeAllKeyOfObjects, SLICE_DICT_SHAPE, SLICE_META } from "akanjs/base";
import { applyMixins } from "akanjs/common";
import type { DocumentModel, QueryOf } from "akanjs/constant";
import type { FilterInstance } from "akanjs/document";
import { type Adaptor, type AdaptorCls, dangerouslyAdapt, type ServiceModel } from "akanjs/service";
import type { Guard, GuardCls } from "./guard";
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
};

interface RootSliceOption {
  guards?: {
    root?: Cls<Guard> | Cls<Guard>[];
    get?: Cls<Guard> | Cls<Guard>[];
    cru?: Cls<Guard> | Cls<Guard>[];
    create?: Cls<Guard> | Cls<Guard>[];
    update?: Cls<Guard> | Cls<Guard>[];
    remove?: Cls<Guard> | Cls<Guard>[];
  };
  prefix?: string;
}

type RootSliceQuery<SrvModule extends ServiceModel, Full = CnstFull<SrvModule>> = QueryOf<DocumentModel<Full>>;

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

/** Builds database-backed slice APIs for list, insight, init, view, edit, create, update, and remove flows. */
export function slice<
  SrvModule extends ServiceModel,
  BuildSlice extends SliceBuilder<SrvModule>,
  LibSlices extends SliceCls[],
  _Input = CnstInput<SrvModule>,
  _Full = CnstFull<SrvModule>,
  _Light = CnstLight<SrvModule>,
  _Insight = CnstInsight<SrvModule>,
  _Filter extends FilterInstance = DbFilter<SrvModule>,
  _Query = RootSliceQuery<SrvModule, _Full>,
>(
  srv: SrvModule,
  option: RootSliceOption,
  sliceBuilder: BuildSlice,
  ...libSlices: LibSlices
): SliceCls<
  SrvModule,
  Assign<
    ReturnType<BuildSlice>,
    LibSlices extends []
      ? {
          [""]: SliceInfo<
            SrvRefName<SrvModule>,
            _Input,
            _Full,
            _Light,
            _Insight,
            _Filter,
            SrvMap<SrvModule>,
            ["query"],
            [query?: _Query | null],
            [],
            [_Query]
          >;
        }
      : ExtendSliceInfoObj<SrvModule, LibSlices>
  >
> {
  if (!srv.cnst || !srv.db) throw new Error("cnst and db are required");
  const init = buildSlice(
    srv.srv.refName,
    srv.cnst.input,
    srv.cnst.full,
    srv.cnst.light,
    srv.cnst.insight,
    srv.db.filter,
  );
  const toGuards = (guard?: Cls<Guard> | Cls<Guard>[]) => (guard ? (Array.isArray(guard) ? guard : [guard]) : []);
  const rootGuards = toGuards(option.guards?.root);
  const getGuards = toGuards(option.guards?.get);
  const cruGuards = toGuards(option.guards?.cru);
  // create/update/remove override the shared cru guard for their own endpoint; when omitted they
  // fall back to the same cruGuards reference so serialization can detect "not overridden" by identity.
  const createGuards = option.guards?.create ? toGuards(option.guards.create) : cruGuards;
  const updateGuards = option.guards?.update ? toGuards(option.guards.update) : cruGuards;
  const removeGuards = option.guards?.remove ? toGuards(option.guards.remove) : cruGuards;
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
    static [SLICE_META] = Object.assign(
      {
        [""]: init({ guards: rootGuards })
          .search<"query", object>("query", Any)
          .exec((query) => query ?? {}),
      },
      sliceBuilder(init as Parameters<BuildSlice>[0]),
    );
  };
  libSlices.forEach((libSlice) => {
    Object.assign(sliceCls[SLICE_META], libSlice[SLICE_META]);
    Object.assign(sliceCls.srv.srvMap, libSlice.srv.srvMap);
  });
  applyMixins(sliceCls, libSlices);
  return sliceCls as any;
}
