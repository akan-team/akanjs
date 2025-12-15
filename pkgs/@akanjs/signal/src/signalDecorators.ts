/* eslint-disable @typescript-eslint/no-unsafe-return */
import "reflect-metadata";

import {
  Assign,
  baseEnv,
  BaseInsight,
  BaseObject,
  Dayjs,
  EnumInstance,
  Environment,
  getNonArrayModel,
  ID,
  JSON,
  MergeAllTypes,
  scalarArgMap,
  Type,
  UnType,
} from "@akanjs/base";
import { applyMixins, capitalize } from "@akanjs/common";
import { constantInfo, DocumentModel, GqlReturn, PurifiedModel, QueryOf } from "@akanjs/constant";
import type { Doc, ExtractSort, FilterInstance } from "@akanjs/document";
import type { Guard, InternalParam } from "@akanjs/nest";
import type { ServiceModule, Sig } from "@akanjs/service";

import { BuildSliceSignal, SliceApiBuilder, SliceInfo, sliceInit } from ".";
import { type ApiBuilder, ApiInfo, BuildApiSignal, makeApiBuilder } from "./apiInfo";
import { BuildInternalApiSignal, InternalApiBuilder, makeInternalApiBuilder } from "./internalApiInfo";
import { signalInfo } from "./signalInfo";

export class SignalStorage {}

export const getAllSignalRefs = () => {
  const signalNames = Reflect.getOwnMetadataKeys(SignalStorage.prototype) as string[] | undefined;
  const sigRefs =
    signalNames?.reduce<Type[]>((acc, signalName) => [...acc, ...getSignalRefsOnStorage(signalName)], []) ?? [];
  return sigRefs;
};
export const getSignalRefsOnStorage = (refName: string) => {
  const sigRefs = Reflect.getMetadata(refName, SignalStorage.prototype) as Type[] | undefined;
  return sigRefs ?? [];
};

export const setSignalRefOnStorage = (refName: string, signalRef: Type) => {
  Reflect.defineMetadata(refName, [...getSignalRefsOnStorage(refName), signalRef], SignalStorage.prototype);
};

export type Resolve<T> = T;
export const resolve = <T>(data: any): Resolve<T> => data as Resolve<T>;
export const emit = <T>(data: any): Resolve<T> & { __Returns__: "Emit" } =>
  data as Resolve<T> & { __Returns__: "Emit" };
export const done = <T>(data: any): Resolve<T> & { __Returns__: "Done" } =>
  data as Resolve<T> & { __Returns__: "Done" };
export const subscribe = <T>(): Resolve<T> & { __Returns__: "Subscribe" } =>
  undefined as unknown as Resolve<T> & { __Returns__: "Subscribe" };

interface InitOption {
  serverMode?: "federation" | "batch" | "all";
  operationMode?: ("cloud" | "edge" | "local" | (string & {}))[];
  enabled?: boolean;
}

interface TimerOption {
  serverMode?: "federation" | "batch" | "all";
  operationMode?: ("cloud" | "edge" | "local" | (string & {}))[];
  lock?: boolean;
  enabled?: boolean;
}

export interface SignalOption<Response = any, Nullable extends boolean = false, _Key = keyof UnType<Response>>
  extends InitOption,
    TimerOption {
  nullable?: Nullable;
  name?: string;
  default?: boolean;
  path?: string;
  onlyFor?: "graphql" | "restapi";
  serverMode?: "federation" | "batch" | "all";
  timeout?: number;
  partial?: _Key[] | readonly _Key[];
  cache?: number;
  guards?: Type<Guard>[];

  // * ==================== Schedule ==================== * //
  scheduleType?: "init" | "destroy" | "cron" | "interval" | "timeout";
  scheduleCron?: string;
  scheduleTime?: number;
  lock?: boolean;
  enabled?: boolean;
  // * ==================== Schedule ==================== * //
}

export interface ResolveFieldMeta {
  returns: GqlReturn;
  argsOption: ArgsOption;
  key: string;
  descriptor: PropertyDescriptor;
}

export const signalTypes = ["graphql", "restapi"] as const;
export type SignalType = (typeof signalTypes)[number];

export const endpointTypes = ["Query", "Mutation", "Message", "Pubsub", "Process", "Schedule", "ResolveField"] as const;
export type EndpointType = (typeof endpointTypes)[number];

export const argTypes = ["Body", "Param", "Query", "Upload", "Msg", "Room"] as const;
export type ArgType = (typeof argTypes)[number];

export interface GqlMeta {
  returns: (of?: any) => Type;
  signalOption: SignalOption<any, boolean, any>;
  key: string;
  descriptor: PropertyDescriptor;
  type: EndpointType;
}
export interface ArgsOption {
  nullable?: boolean;
  example?: string | number | boolean | Dayjs;
  enum?: EnumInstance;
}
export interface ArgMeta {
  name: string;
  returns: GqlReturn;
  argsOption: ArgsOption;
  key: string;
  idx: number;
  type: ArgType;
}
export interface InternalArgMeta {
  key: string;
  idx: number;
  type: InternalParam;
  option?: { nullable?: boolean };
}
export interface SliceMeta {
  refName: string;
  sliceName: string;
  argLength: number;
  defaultArgs: any[];
}

export const getDefaultArg = (argRef: Type | Type[]) => {
  const [modelRef, arrDepth] = getNonArrayModel(argRef);
  if (arrDepth) return [];
  const scalarArg = scalarArgMap.get(modelRef) as object | undefined;
  if (scalarArg) return scalarArg;
  else return {};
};
export interface SignalMeta {
  refName: string;
  slices: SliceMeta[];
  returns?: (of?) => Type;
  prefix?: string;
  enabled: boolean;
}

export type Account<AddData = unknown> = {
  appName: string;
  environment: Environment;
} & AddData;
export const defaultAccount: Account = {
  appName: baseEnv.appName,
  environment: baseEnv.environment,
};

interface SliceOption {
  guards?: { root?: Type<Guard> | Type<Guard>[]; get?: Type<Guard> | Type<Guard>[]; cru?: Type<Guard> | Type<Guard>[] };
  prefix?: string;
}

type ExtendedGqlReturn<Return, Full, Light, Insight, _UnTypeReturn = UnType<Return>> = Return extends (infer R)[]
  ? ExtendedGqlReturn<R, Full, Light, Insight>[]
  : Full extends _UnTypeReturn
    ? Type<Full>
    : Light extends _UnTypeReturn
      ? Type<Light>
      : Insight extends _UnTypeReturn
        ? Type<Insight>
        : Return;

type ExtendSlices<
  T extends string,
  Full extends BaseObject,
  Light extends BaseObject,
  Insight extends BaseInsight,
  LibSlices extends Type[],
  _Slices = MergeAllTypes<LibSlices>,
> = {
  [K in keyof _Slices]: _Slices[K] extends SliceInfo<
    T,
    any,
    any,
    any,
    infer Srvs,
    infer ArgNames,
    infer Args,
    infer InternalArgs,
    infer ServerArgs
  >
    ? SliceInfo<T, Full, Light, Insight, Srvs, ArgNames, Args, InternalArgs, ServerArgs>
    : never;
};

type ExtendEndpoints<
  Full extends BaseObject,
  Light extends BaseObject,
  Insight extends BaseInsight,
  LibEndpoints extends Type[],
  _Endpoints = MergeAllTypes<LibEndpoints>,
> = {
  [K in keyof _Endpoints]: _Endpoints[K] extends ApiInfo<
    infer ReqType,
    infer Srvs,
    infer ArgNames,
    infer Args,
    infer InternalArgs,
    infer ServerArgs,
    infer Returns,
    infer ServerReturns,
    infer Nullable
  >
    ? ApiInfo<
        ReqType,
        Srvs,
        ArgNames,
        Args,
        InternalArgs,
        ServerArgs,
        ExtendedGqlReturn<Returns, Full, Light, Insight>,
        ServerReturns,
        Nullable
      >
    : never;
};

export function internal<
  Srv extends { [key: string]: any },
  Full,
  InternalBuilder extends InternalApiBuilder<Srv, Doc<Full>>,
  LibInternals extends Type[],
>(
  srv: ServiceModule<string, Srv, any, any, Full, any, any>,
  internalBuilder: InternalBuilder,
  ...libInternals: LibInternals
): Type<ReturnType<InternalBuilder> & MergeAllTypes<LibInternals>> {
  const sigRef = libInternals.at(0) ?? class Internal {};
  signalInfo.setRefNameTemp(sigRef, srv.refName);
  const buildInternal = internalBuilder(makeInternalApiBuilder());
  Object.entries(buildInternal).forEach(([key, internal]) => {
    internal.applyApiMeta(sigRef, key);
  });
  return sigRef as any;
}

export function slice<
  T extends string,
  Input,
  Full extends BaseObject,
  Object extends BaseObject,
  Light extends BaseObject,
  Insight extends BaseInsight,
  Srv extends { [key: string]: any },
  SliceBuilder extends SliceApiBuilder<T, Full, Light, Insight, Srv>,
  LibSlices extends Type[],
  _Query = QueryOf<DocumentModel<Full>>,
>(
  srv: ServiceModule<T, Srv, Input, Object, Full, Light, Insight>,
  option: SliceOption,
  sliceBuilder: SliceBuilder,
  ...libSlices: LibSlices
): Type<
  ReturnType<SliceBuilder> & {
    [""]: SliceInfo<T, Full, Light, Insight, Srv, ["query"], [_Query], [], [_Query]>;
  } & ExtendSlices<T, Full, Light, Insight, LibSlices>
> {
  if (!srv.cnst) throw new Error("cnst is required");
  const sigRef = libSlices.at(0) ?? class Slice {};
  signalInfo.setRefNameTemp(sigRef, srv.refName);
  const [modelName, className] = [srv.cnst.refName, capitalize(srv.cnst.refName)];
  const names = {
    modelId: `${modelName}Id`,
    model: modelName,
    lightModel: `light${className}`,
    modelService: `${modelName}Service`,
    getModel: `get${className}`,
    createModel: `create${className}`,
    updateModel: `update${className}`,
    removeModel: `remove${className}`,
  };
  const rootGuards = option.guards?.root
    ? Array.isArray(option.guards.root)
      ? option.guards.root
      : [option.guards.root]
    : [];
  const getGuards = option.guards?.get
    ? Array.isArray(option.guards.get)
      ? option.guards.get
      : [option.guards.get]
    : [];
  const cruGuards = option.guards?.cru
    ? Array.isArray(option.guards.cru)
      ? option.guards.cru
      : [option.guards.cru]
    : [];
  const init = sliceInit(modelName as T, srv.cnst.full, srv.cnst.light, srv.cnst.insight);
  const { query, mutation } = makeApiBuilder();
  const buildSlice: { [key: string]: SliceInfo<any, any, any, any, any, any, any, any> } = {
    ...(rootGuards.length > 0
      ? {
          [""]: init({ guards: rootGuards })
            .search<"query", object>("query", JSON)
            .exec(function (query) {
              return query ?? {};
            }),
        }
      : {}),
    ...sliceBuilder(init),
  };
  const buildEndpoint = {
    ...(getGuards.length > 0
      ? {
          [names.model]: query(srv.cnst.full, { guards: getGuards })
            .param(names.modelId, ID)
            .exec(async function (modelId) {
              const service = this[names.modelService] as object;
              return await (service[names.getModel] as (id: string) => Promise<any>)(modelId);
            }),
          [names.lightModel]: query(srv.cnst.light, { guards: getGuards })
            .param(names.modelId, ID)
            .exec(async function (modelId) {
              const service = this[names.modelService] as object;
              return await (service[names.getModel] as (id: string) => Promise<any>)(modelId);
            }),
        }
      : {}),
    ...(cruGuards.length > 0
      ? {
          [names.createModel]: mutation(srv.cnst.full, { guards: cruGuards })
            .body("data", srv.cnst.input)
            .exec(async function (data) {
              const service = this[names.modelService] as object;
              return await (service[names.createModel] as (data: any) => Promise<any>)(data);
            }),
          [names.updateModel]: mutation(srv.cnst.full, { guards: cruGuards })
            .param(names.modelId, ID)
            .body("data", srv.cnst.input)
            .exec(async function (modelId, data) {
              const service = this[names.modelService] as object;
              return await (service[names.updateModel] as (id: string, data: any) => Promise<any>)(modelId, data);
            }),
          [names.removeModel]: mutation(srv.cnst.full, { partial: ["removedAt"], guards: cruGuards })
            .param(names.modelId, ID)
            .exec(async function (modelId) {
              const service = this[names.modelService] as object;
              return await (service[names.removeModel] as (id: string) => Promise<any>)(modelId);
            }),
        }
      : {}),
  };
  Object.entries(buildSlice).forEach(([key, slice]) => {
    if (!srv.cnst) return;
    slice.applySliceMeta(srv.cnst.refName, sigRef, key);
  });
  Object.entries(buildEndpoint).forEach(([key, endpoint]) => {
    endpoint.applyApiMeta(sigRef, key);
  });
  return sigRef as any;
}

export function endpoint<
  Input,
  Object extends BaseObject,
  Full extends BaseObject,
  Light extends BaseObject,
  Insight extends BaseInsight,
  Srv extends { [key: string]: any },
  Builder extends ApiBuilder<Srv>,
  LibEndpoints extends Type[],
>(
  srv: ServiceModule<string, Srv, Input, Object, Full, Light, Insight>,
  builder: Builder,
  ...libEndpoints: LibEndpoints
): Type<Assign<ReturnType<Builder>, ExtendEndpoints<Full, Light, Insight, LibEndpoints>>> {
  const sigRef = libEndpoints.at(0) ?? class Signal {};

  signalInfo.setRefNameTemp(sigRef, srv.refName);
  // signalInfo.setPrefixTemp(Signal, refName);
  const apiInfoMap = builder(makeApiBuilder());
  Object.entries(apiInfoMap).forEach(([key, apiInfo]) => {
    apiInfo.applyApiMeta(sigRef, key);
  });
  return sigRef as any;
}

export const mergeSignals = <Endpoint, Internal, Slice>(
  endpointRef: Type<Endpoint>,
  internalRef: Type<Internal>,
  sliceRef?: Type<Slice>
): Type<BuildApiSignal<Endpoint> & BuildInternalApiSignal<Internal> & BuildSliceSignal<Slice>> => {
  applyMixins(endpointRef, [internalRef]);
  const gqlMetaMap = getGqlMetaMapOnPrototype(endpointRef.prototype as object);
  const resolveFieldMetaMap = getResolveFieldMetaMapOnPrototype(endpointRef.prototype as object);
  setResolveFieldMetaMapOnPrototype(endpointRef.prototype as object, resolveFieldMetaMap);

  const internalGqlMetaMap = getGqlMetaMapOnPrototype(internalRef.prototype as object);
  const internalResolveFieldMetaMap = getResolveFieldMetaMapOnPrototype(internalRef.prototype as object);
  internalGqlMetaMap.forEach((value, key) => {
    gqlMetaMap.set(key, value);
    const [argMetas, internalArgMetas] = getArgMetas(internalRef, key);
    setArgMetas(endpointRef, key, argMetas, internalArgMetas);
  });
  internalResolveFieldMetaMap.forEach((value, key) => {
    resolveFieldMetaMap.set(key, value);
    const [argMetas, internalArgMetas] = getArgMetas(internalRef, key);
    setArgMetas(endpointRef, key, argMetas, internalArgMetas);
  });
  if (sliceRef) {
    const sliceGqlMetaMap = getGqlMetaMapOnPrototype(sliceRef.prototype as object);
    applyMixins(endpointRef, [sliceRef], new Set([...gqlMetaMap.keys()])); // avoid redefined in signal
    sliceGqlMetaMap.forEach((value, key) => {
      if (gqlMetaMap.has(key)) return; // redefined in signal
      gqlMetaMap.set(key, value);
      const [argMetas, internalArgMetas] = getArgMetas(sliceRef, key);
      setArgMetas(endpointRef, key, argMetas, internalArgMetas);
    });
  }
  setGqlMetaMapOnPrototype(endpointRef.prototype as object, gqlMetaMap);
  return endpointRef as any;
};

export const serverSignalOf = <Signal>(sigRef: Type<Signal>): Type<Sig<Signal>> => {
  return sigRef as any;
};

export type DefaultSignal<
  T extends string,
  Input,
  Full,
  Light,
  Insight,
  Filter extends FilterInstance,
  _CapitalizedT extends string = Capitalize<T>,
  _PurifiedInput = PurifiedModel<Input>,
  _QueryOfDoc = QueryOf<DocumentModel<Full>>,
  _Sort = ExtractSort<Filter>,
> = {
  [K in T]: (id: string) => Promise<Full>;
} & {
  [K in `light${_CapitalizedT}`]: (id: string) => Promise<Light>;
} & {
  [K in `${T}List`]: (
    ...args: [query: _QueryOfDoc, skip: number | null, limit: number | null, sort: _Sort | null]
  ) => Promise<Full[]>;
} & {
  [K in `${T}Insight`]: (query: _QueryOfDoc) => Promise<Insight>;
} & {
  [K in `create${_CapitalizedT}`]: (data: _PurifiedInput) => Promise<Full>;
} & {
  [K in `update${_CapitalizedT}`]: (id: string, data: _PurifiedInput) => Promise<Full>;
} & {
  [K in `remove${_CapitalizedT}`]: (id: string) => Promise<Full>;
};

export const getSigMeta = (sigRef: Type): SignalMeta => {
  const sigMeta = Reflect.getMetadata("signal", sigRef.prototype as object) as SignalMeta | undefined;
  if (!sigMeta) throw new Error(`No SignalMeta found for ${sigRef.name}`);
  return sigMeta;
};
export const setSigMeta = (sigRef: Type, sigMeta: SignalMeta) => {
  Reflect.defineMetadata("signal", sigMeta, sigRef.prototype as object);
};

export const getGqlMeta = (sigRef: Type, key: string): GqlMeta => {
  const gqlMetaMap = Reflect.getMetadata("gql", sigRef.prototype as object) as Map<string, GqlMeta> | undefined;
  if (!gqlMetaMap) throw new Error(`No GqlMeta found for ${sigRef.name}`);
  const gqlMeta = gqlMetaMap.get(key);
  if (!gqlMeta) throw new Error(`No GqlMeta found for ${key}`);
  return gqlMeta;
};
export const getGqlMetaMapOnPrototype = (prototype: object): Map<string, GqlMeta> => {
  const gqlMetaMap = Reflect.getMetadata("gql", prototype) as Map<string, GqlMeta> | undefined;
  return gqlMetaMap ?? new Map<string, GqlMeta>();
};
export const getGqlMetas = (sigRef: Type): GqlMeta[] => {
  const gqlMetaMap = Reflect.getMetadata("gql", sigRef.prototype as object) as Map<string, GqlMeta> | undefined;
  return gqlMetaMap ? [...gqlMetaMap.values()] : [];
};
export const setGqlMetaMapOnPrototype = (prototype: object, gqlMetaMap: Map<string, GqlMeta>) => {
  Reflect.defineMetadata("gql", gqlMetaMap, prototype);
};
export const getArgMetas = (sigRef: Type, key: string): [ArgMeta[], InternalArgMeta[]] => {
  const metas =
    (Reflect.getMetadata("args", sigRef.prototype as object, key) as (ArgMeta | InternalArgMeta)[] | undefined) ?? [];
  const argMetas = metas.filter((meta) => !!(meta as unknown as { returns?: any }).returns) as ArgMeta[];
  const internalArgMetas = metas.filter((meta) => !(meta as unknown as { returns?: any }).returns) as InternalArgMeta[];
  return [argMetas, internalArgMetas];
};
const getArgMetasOnPrototype = (prototype: object, key: string): (ArgMeta | InternalArgMeta)[] => {
  return (Reflect.getMetadata("args", prototype, key) as (ArgMeta | InternalArgMeta)[] | undefined) ?? [];
};
export const setArgMetas = (sigRef: Type, key: string, argMetas: ArgMeta[], internalArgMetas: InternalArgMeta[]) => {
  Reflect.defineMetadata("args", [...argMetas, ...internalArgMetas], sigRef.prototype as object, key);
};
const setArgMetasOnPrototype = (prototype: object, key: string, argMetas: (ArgMeta | InternalArgMeta)[]) => {
  Reflect.defineMetadata("args", argMetas, prototype, key);
};
export const getResolveFieldMetaMapOnPrototype = (prototype: object): Map<string, ResolveFieldMeta> => {
  const resolveFieldMetaMap = Reflect.getMetadata("resolveField", prototype) as
    | Map<string, ResolveFieldMeta>
    | undefined;
  return resolveFieldMetaMap ?? new Map<string, ResolveFieldMeta>();
};
export const getResolveFieldMetas = (sigRef: Type): ResolveFieldMeta[] => {
  const resolveFieldMetaMap = Reflect.getMetadata("resolveField", sigRef.prototype as object) as
    | Map<string, ResolveFieldMeta>
    | undefined;
  return resolveFieldMetaMap ? [...resolveFieldMetaMap.values()] : [];
};
const setResolveFieldMetaMapOnPrototype = (prototype: object, resolveFieldMetaMap: Map<string, ResolveFieldMeta>) => {
  Reflect.defineMetadata("resolveField", resolveFieldMetaMap, prototype);
};

export const getControllerPrefix = (sigMeta: SignalMeta) => {
  return sigMeta.returns ? constantInfo.getRefName(sigMeta.returns()) : sigMeta.prefix;
};

export const getControllerPath = (gqlMeta: GqlMeta, paramArgMetas: ArgMeta[]) => {
  return (
    gqlMeta.signalOption.path ??
    [gqlMeta.signalOption.name ?? gqlMeta.key, ...paramArgMetas.map((argMeta) => `:${argMeta.name}`)].join("/")
  );
};

export const copySignal = (sigRef: Type) => {
  class CopiedSignal {}
  applyMixins(CopiedSignal, [sigRef]);

  const sigMeta = getSigMeta(sigRef);
  setSigMeta(CopiedSignal, sigMeta);

  const gqlMetaMap = getGqlMetaMapOnPrototype(sigRef.prototype as object);
  setGqlMetaMapOnPrototype(CopiedSignal.prototype, new Map(gqlMetaMap));

  const resolveFieldMetaMap = getResolveFieldMetaMapOnPrototype(sigRef.prototype as object);
  setResolveFieldMetaMapOnPrototype(CopiedSignal.prototype, new Map(resolveFieldMetaMap));
  for (const endpointMeta of [...gqlMetaMap.values(), ...resolveFieldMetaMap.values()]) {
    const argMetas = getArgMetasOnPrototype(sigRef.prototype as object, endpointMeta.key);
    setArgMetasOnPrototype(CopiedSignal.prototype, endpointMeta.key, [...argMetas]);

    const paramtypes = Reflect.getMetadata("design:paramtypes", sigRef.prototype as object, endpointMeta.key) as
      | object[]
      | undefined;
    //! 임시 적용 테스트
    const argParamtypes = argMetas
      .filter((argMeta) => !!(argMeta as unknown as { returns: any }).returns)
      .map((argMeta: ArgMeta) => Object);
    Reflect.defineMetadata("design:paramtypes", paramtypes ?? argParamtypes, CopiedSignal.prototype, endpointMeta.key);
    Reflect.defineMetadata("design:paramtypes", paramtypes ?? argParamtypes, CopiedSignal.prototype, endpointMeta.key);
  }

  return CopiedSignal;
};
