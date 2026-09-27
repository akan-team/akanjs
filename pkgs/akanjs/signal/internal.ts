import { INTERNAL_META, type MergeAllKeyOfObjects } from "akanjs/base";
import { applyMixins } from "akanjs/common";
import {
  type Adaptor,
  type AdaptorCls,
  dangerouslyAdapt,
  type QueueAdaptor,
  QueueAdaptorRole,
  type ScheduleAdaptor,
  ScheduleAdaptorRole,
  type ServiceModel,
} from "akanjs/service";
import { type BuildInternal, buildInternal, type InternalBuilder, type InternalInfo } from "./internalInfo";
import type { SrvRefName } from "./types";

export interface Internal extends Adaptor {
  schedule: ScheduleAdaptor;
  queue: QueueAdaptor;
}

export type InternalCls<
  SrvModule extends ServiceModel = ServiceModel,
  InternalInfoMap extends { [key: string]: InternalInfo } = { [key: string]: InternalInfo },
> = AdaptorCls & {
  /** The suffixed adaptor name the DI container keys `live.internal` by. */
  refName: `${SrvRefName<SrvModule>}Internal`;
  srv: SrvModule;
  [INTERNAL_META]: InternalInfoMap;
};

export function internal<
  SrvModule extends ServiceModel,
  InternalInfoMap extends ReturnType<InternalBuilder<SrvModule>>,
  LibInternals extends InternalCls[],
>(
  srv: SrvModule,
  internalBuilder: (builder: BuildInternal<SrvModule>) => InternalInfoMap,
  ...libInternals: LibInternals
): InternalCls<SrvModule, MergeAllKeyOfObjects<LibInternals, typeof INTERNAL_META> & InternalInfoMap> {
  const refName = srv.srv.refName;
  const srvKeys = [
    ...new Set([
      ...Object.keys(srv.srvMap),
      ...libInternals.flatMap((libInternal) => Object.keys(libInternal.srv.srvMap)),
    ]),
  ];
  const internalCls = class Internal extends dangerouslyAdapt(`${refName}Internal`, ({ plug, service }) => ({
    schedule: plug(ScheduleAdaptorRole),
    queue: plug(QueueAdaptorRole),
    ...Object.fromEntries(srvKeys.map((srvRefName) => [srvRefName, service()])),
  })) {
    static srv = srv;
    static [INTERNAL_META] = Object.assign(
      {},
      ...libInternals.map((libInternal) => libInternal[INTERNAL_META]),
      internalBuilder(buildInternal as any),
    );
  };
  Object.assign(
    srv.srvMap,
    Object.assign({}, ...libInternals.map((libInternal) => libInternal.srv.srvMap), srv.srvMap),
  );
  applyMixins(internalCls, libInternals);
  return internalCls as any; // the declared return is a generic instantiation built from this call's own type arguments, so there is no `T` to name
}
