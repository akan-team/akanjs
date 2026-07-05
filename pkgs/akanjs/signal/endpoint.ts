import type { Assign } from "akanjs/base";
import { ENDPOINT_DICT_SHAPE, ENDPOINT_META } from "akanjs/base";
import { applyMixins } from "akanjs/common";
import { type Adaptor, type AdaptorCls, dangerouslyAdapt, type ServiceModel } from "akanjs/service";
import { buildEndpoint, type EndpInfoArgNames, type EndpointBuilder, type EndpointInfo } from "./endpointInfo";
import type { SrvRefName } from "./types";

export type EndpointDictArgShape = { [key: string]: readonly string[] };
export type EndpointDictShape<EndpointInfoObj extends { [key: string]: EndpointInfo }> = {
  [K in keyof EndpointInfoObj]: EndpInfoArgNames<EndpointInfoObj[K]>;
};

export interface Endpoint<DictShape extends EndpointDictArgShape = Record<never, never>> extends Adaptor {
  readonly [ENDPOINT_DICT_SHAPE]: DictShape;
}

export type EndpointCls<
  SrvModule extends ServiceModel = ServiceModel,
  EndpointInfoObj extends { [key: string]: EndpointInfo } = { [key: string]: EndpointInfo },
> = AdaptorCls<Endpoint<EndpointDictShape<EndpointInfoObj>>> & {
  baseName: SrvRefName<SrvModule>;
  srv: SrvModule;
  prototype: Endpoint<EndpointDictShape<EndpointInfoObj>>;
  [ENDPOINT_META]: EndpointInfoObj;
};

type EndpointMetaOf<EndpCls> = EndpCls extends EndpointCls<any, infer EndpointInfoObj> ? EndpointInfoObj : never;

type MergeEndpointMetas<EndpClses extends readonly EndpointCls[], Acc = unknown> = EndpClses extends readonly [
  infer First extends EndpointCls,
  ...infer Rest extends readonly EndpointCls[],
]
  ? MergeEndpointMetas<Rest, Assign<Acc, EndpointMetaOf<First>>>
  : Acc;

/** Builds a typed endpoint adaptor from a service module and endpoint builder. */
export function endpoint<
  SrvModule extends ServiceModel,
  Builder extends EndpointBuilder<SrvModule>,
  LibEndpoints extends readonly EndpointCls[],
>(
  srv: SrvModule,
  builder: Builder,
  ...libEndpoints: LibEndpoints
): EndpointCls<
  SrvModule,
  LibEndpoints extends readonly [] ? ReturnType<Builder> : Assign<ReturnType<Builder>, MergeEndpointMetas<LibEndpoints>>
> {
  const srvKeys = [
    ...new Set([
      ...Object.keys(srv.srvMap),
      ...libEndpoints.flatMap((libEndpoint) => Object.keys(libEndpoint.srv.srvMap)),
    ]),
  ];
  const endpointCls = class Endpoint extends dangerouslyAdapt(`${srv.srv.refName}Endpoint`, ({ service }) => ({
    ...Object.fromEntries(srvKeys.map((srvRefName) => [srvRefName, service()])),
  })) {
    static baseName = srv.srv.refName;
    static srv = srv;
    static [ENDPOINT_META] = builder(buildEndpoint);
  };
  libEndpoints.forEach((libEndpoint) => {
    Object.assign(endpointCls[ENDPOINT_META], libEndpoint[ENDPOINT_META]);
    Object.assign(endpointCls.srv.srvMap, libEndpoint.srv.srvMap);
  });
  applyMixins(endpointCls, [...libEndpoints]);
  return endpointCls as any;
}

export function sliceEndpoint<SrvModule extends ServiceModel, Builder extends EndpointBuilder<SrvModule>>(
  srv: SrvModule,
  builder: Builder,
): EndpointCls<SrvModule, ReturnType<Builder>> {
  const sigRef = class SliceEndpoint extends dangerouslyAdapt(`${srv.srv.refName}SliceEndpoint`, ({ service }) => ({
    ...Object.fromEntries(Object.keys(srv.srvMap).map((srvRefName) => [srvRefName, service()])),
  })) {
    static baseName = srv.srv.refName;
    static srv = srv;
    static [ENDPOINT_META] = {};
  };
  Object.assign(sigRef[ENDPOINT_META], builder(buildEndpoint));
  Object.assign(sigRef.srv.srvMap, srv.srvMap);
  return sigRef as any;
}
