import { type BaseEnv, type Cls, INJECT_META } from "akanjs/base";
import {
  type ConstantFieldTypeInput,
  ConstantRegistry,
  type FieldToValue,
  type PlainTypeToFieldType,
} from "akanjs/constant";
import type { DatabaseModel } from "akanjs/document";
import type {
  Endpoint,
  EndpointCls,
  Internal,
  InternalCls,
  ServerSignal,
  ServerSignalCls,
  SliceCls,
} from "akanjs/signal";
import type { Adaptor, AdaptorCls, Service, ServiceCls } from ".";
import type { CacheAdaptor, CacheSetOptions } from "./predefinedAdaptor";

export type InjectType = "database" | "service" | "use" | "signal" | "plug" | "env" | "memory";

interface InjectBuilderOptions<ReturnType> {
  generateFactory?: (options: any) => ReturnType;
  adaptor?: AdaptorCls;
  additionalPropKeys?: string[];
  get?: (value: never) => unknown;
  set?: (value: never) => unknown;
  local?: boolean;
  default?: unknown;
  isMap?: boolean;
  cacheOption?: CacheSetOptions;
  parentRefName: string;
}

export interface InjectRegistry {
  uses: Map<string, unknown>;
  adaptorCls: Map<string, AdaptorCls>;
  adaptor: Map<AdaptorCls, Adaptor>;
  adaptorRole: Map<AdaptorCls, AdaptorCls>;
  databaseAdaptorCls: Map<string, AdaptorCls>;
  databaseAdapor: Map<AdaptorCls, DatabaseModel>;
  serverSignalCls: Map<string, ServerSignalCls>;
  serverSignal: Map<ServerSignalCls, ServerSignal>;
  signalAdaptorCls: Map<string, AdaptorCls>;
  signalAdapor: Map<AdaptorCls, ServerSignal>;
  serviceCls: Map<string, ServiceCls>;
  service: Map<ServiceCls, Service>;
  internalCls: Map<string, InternalCls>;
  internal: Map<InternalCls, Internal>;
  endpointCls: Map<string, EndpointCls>;
  endpoint: Map<EndpointCls, Endpoint>;
}
export const getDefaultInjectRegistry = (): InjectRegistry => ({
  uses: new Map<string, unknown>(),
  adaptorCls: new Map<string, AdaptorCls>(),
  adaptor: new Map<AdaptorCls, Adaptor>(),
  adaptorRole: new Map<AdaptorCls, AdaptorCls>(),
  databaseAdaptorCls: new Map<string, AdaptorCls>(),
  databaseAdapor: new Map<AdaptorCls, DatabaseModel>(),
  serverSignalCls: new Map<string, ServerSignalCls>(),
  serverSignal: new Map<ServerSignalCls, ServerSignal>(),
  signalAdaptorCls: new Map<string, AdaptorCls>(),
  signalAdapor: new Map<AdaptorCls, ServerSignal>(),
  serviceCls: new Map<string, ServiceCls>(),
  service: new Map<ServiceCls, Service>(),
  internalCls: new Map<string, InternalCls>(),
  internal: new Map<InternalCls, Internal>(),
  endpointCls: new Map<string, EndpointCls>(),
  endpoint: new Map<EndpointCls, Endpoint>(),
});

export interface LiveRegistry {
  adaptor: Map<string, Adaptor>;
  service: Map<string, Service>;
  internal: Map<string, Internal>;
  sliceCls: Map<string, SliceCls>;
  endpointCls: Map<string, EndpointCls>;
}
export const getDefaultLiveRegistry = (): LiveRegistry => ({
  adaptor: new Map<string, Adaptor>(),
  service: new Map<string, Service>(),
  internal: new Map<string, Internal>(),
  sliceCls: new Map<string, SliceCls>(),
  endpointCls: new Map<string, EndpointCls>(),
});

export class InjectInfo<
  Type extends InjectType = any,
  ReturnType = any,
  Env extends { [key: string]: any } = never,
  FieldValue = never,
> {
  readonly type: Type;
  readonly generateFactory: (options: any) => ReturnType;
  readonly get?: (value: never) => unknown;
  readonly set?: (value: never) => unknown;
  readonly additionalPropKeys: string[];
  readonly local: boolean;
  readonly adaptor?: AdaptorCls;
  readonly default?: unknown;
  readonly isMap?: boolean;
  readonly cacheOption?: CacheSetOptions;
  readonly parentRefName: string;
  constructor(type: Type, options: InjectBuilderOptions<ReturnType>) {
    this.type = type;
    this.generateFactory = options.generateFactory ?? (() => undefined as ReturnType);
    this.additionalPropKeys = options.additionalPropKeys ?? [];
    this.local = options.local ?? false;
    this.adaptor = options.adaptor;
    this.get = options.get;
    this.set = options.set;
    this.default = options.default;
    this.isMap = options.isMap ?? false;
    this.cacheOption = options.cacheOption;
    this.parentRefName = options.parentRefName;
  }
  static async resolveInjection(
    instance: Adaptor | Service,
    applyCls: AdaptorCls | ServiceCls,
    registry: InjectRegistry,
    env: BaseEnv,
  ) {
    const injectMap = applyCls[INJECT_META] as Record<string, InjectInfo>;
    await Promise.all(
      Object.entries(injectMap).map(async ([propKey, injectInfo]) => {
        switch (injectInfo.type) {
          case "database":
            await InjectInfo.#injectDatabase(
              instance,
              propKey,
              injectInfo as InjectInfo<"database">,
              registry.adaptorCls,
              registry.adaptor,
            );
            break;
          case "service":
            await InjectInfo.#injectService(instance, propKey, injectInfo as InjectInfo<"service">, registry);
            break;
          case "use":
            await InjectInfo.#injectUse(instance, propKey, registry.uses);
            break;
          case "signal":
            await InjectInfo.#injectSignal(instance, propKey, injectInfo as InjectInfo<"signal">, registry);
            break;
          case "plug":
            await InjectInfo.#injectPlug(instance, propKey, injectInfo as InjectInfo<"plug">, registry);
            break;
          case "env":
            await InjectInfo.#injectEnv(instance, propKey, injectInfo as InjectInfo<"env">, env);
            break;
          case "memory": {
            const cacheAdaptorCls =
              [...registry.adaptorRole.entries()].find(([role]) => role.refName === "cacheAdaptorRole")?.[1] ??
              registry.adaptorCls.get("solidCache") ??
              registry.adaptorCls.get("redisCache");
            if (!cacheAdaptorCls) throw new Error("Cache adaptor role is not registered");
            const cacheAdaptor = registry.adaptor.get(cacheAdaptorCls) as unknown as CacheAdaptor;
            if (!cacheAdaptor) throw new Error("Cache adaptor is not initialized");
            await InjectInfo.#injectMemory(instance, propKey, injectInfo as InjectInfo<"memory">, cacheAdaptor);
            break;
          }
          default:
            throw new Error(`Unknown inject type: ${injectInfo.type}`);
        }
      }),
    );
  }
  static async #injectDatabase(
    instance: Adaptor | Service,
    propKey: string,
    injectInfo: InjectInfo<"database">,
    adaptorClsRegistry: Map<string, AdaptorCls>,
    adaptorRegistry: Map<AdaptorCls, Adaptor>,
  ) {
    const databaseAdaptorRefName = `${injectInfo.parentRefName}Model`;
    const databaseAdaptorCls = adaptorClsRegistry.get(databaseAdaptorRefName);
    if (!databaseAdaptorCls) throw new Error(`Database adaptor "${databaseAdaptorRefName}" is not registered`);
    const databaseAdaptor = adaptorRegistry.get(databaseAdaptorCls);
    if (!databaseAdaptor) throw new Error(`Database adaptor "${databaseAdaptorRefName}" is not initialized`);
    Object.defineProperty(instance, propKey, { value: databaseAdaptor, writable: false, enumerable: true });
  }
  static async #injectService(
    instance: Adaptor | Service,
    propKey: string,
    injectInfo: InjectInfo<"service">,
    registry: InjectRegistry,
  ) {
    if (!propKey.endsWith("Service"))
      throw new Error(
        `Service inject key must end with "***Service", current key is "${propKey} on ${injectInfo.parentRefName}"`,
      );
    const injectServiceRefName = propKey.slice(0, -7);
    const injectServiceCls = registry.serviceCls.get(injectServiceRefName);
    if (!injectServiceCls) throw new Error(`Service "${injectServiceRefName}" is not registered`);
    const injectService = registry.service.get(injectServiceCls);
    if (!injectService) throw new Error(`Service "${injectServiceRefName}" is not initialized`);
    Object.defineProperty(instance, propKey, { value: injectService, writable: false, enumerable: true });
  }
  static async #injectUse(instance: Adaptor | Service, propKey: string, uses: Map<string, unknown>) {
    if (!uses.has(propKey))
      throw new Error(
        `Cannot inject "${propKey}" into adaptor "${(instance.constructor as AdaptorCls).refName}": ` +
          `use "${propKey}" has not been initialized yet.`,
      );
    const useValue = uses.get(propKey);
    Object.defineProperty(instance, propKey, { value: useValue, writable: false, enumerable: true });
  }
  static async #injectSignal(
    instance: Adaptor | Service,
    propKey: string,
    injectInfo: InjectInfo<"signal">,
    registry: InjectRegistry,
  ) {
    if (!propKey.endsWith("Signal"))
      throw new Error(
        `Signal inject key must end with "***Signal", current key is "${propKey} on ${injectInfo.parentRefName}"`,
      );
    const injectSignalRefName = propKey;
    const serverSignalCls = registry.serverSignalCls.get(injectSignalRefName);
    if (!serverSignalCls) throw new Error(`Server signal "${injectSignalRefName}" is not registered`);
    const serverSignal = registry.serverSignal.get(serverSignalCls);
    if (!serverSignal) throw new Error(`Server signal "${injectSignalRefName}" is not initialized`);
    Object.defineProperty(instance, propKey, { value: serverSignal, writable: false, enumerable: true });
  }
  static async #injectPlug(
    instance: Adaptor | Service,
    propKey: string,
    injectInfo: InjectInfo<"plug">,
    registry: InjectRegistry,
  ) {
    if (!injectInfo.adaptor) throw new Error("InjectInfo is not a plug or adaptor is not provided");
    const adaptorCls = registry.adaptorRole.get(injectInfo.adaptor) ?? injectInfo.adaptor;
    const depInstance = registry.adaptor.get(adaptorCls);
    if (!depInstance)
      throw new Error(
        `Cannot inject "${propKey}" into adaptor "${adaptorCls.refName}": ` +
          `dependency "${injectInfo.adaptor.refName}" has not been initialized yet.`,
      );
    const value = await injectInfo.generateFactory(depInstance);
    Object.defineProperty(instance, propKey, { value, writable: false, enumerable: true });
  }
  static async #injectEnv(instance: Adaptor | Service, propKey: string, injectInfo: InjectInfo<"env">, env: BaseEnv) {
    const value = await injectInfo.generateFactory(env);
    Object.defineProperty(instance, propKey, { value, writable: false, enumerable: true });
  }
  static async #injectMemory(
    instance: Adaptor | Service,
    propKey: string,
    injectInfo: InjectInfo<"memory">,
    cacheAdaptor: CacheAdaptor,
  ) {
    if (injectInfo.local) {
      Object.defineProperty(instance, propKey, {
        value: injectInfo.default ?? null,
        writable: true,
        enumerable: true,
      });
    } else if (injectInfo.isMap) {
      const topic = `akan:memory:${injectInfo.parentRefName}`;
      const getter = injectInfo.get as unknown as (value: unknown) => unknown;
      const setter = injectInfo.set as unknown as (value: unknown) => string | number | Buffer;
      const get = async (key: string) => {
        const value = await cacheAdaptor.hget(topic, propKey, key);
        return value === undefined || value === null ? undefined : getter(value);
      };
      const set = async (key: string, value: unknown, option?: CacheSetOptions) => {
        const setValue = setter(value);
        await cacheAdaptor.hset(topic, propKey, key, setValue, option ?? injectInfo.cacheOption);
      };
      Object.defineProperty(instance, propKey, {
        value: {
          get,
          set,
          delete: async (key: string) => {
            await cacheAdaptor.hdelete(topic, propKey, key);
          },
          getOrInsert: async (key: string, value: unknown, option?: CacheSetOptions) => {
            const existingValue = await get(key);
            if (existingValue !== undefined) return existingValue;
            await set(key, value, option);
            return value;
          },
          getOrInsertComputed: async (
            key: string,
            compute: (key: string) => unknown | Promise<unknown>,
            option?: CacheSetOptions,
          ) => {
            const existingValue = await get(key);
            if (existingValue !== undefined) return existingValue;
            const value = await compute(key);
            await set(key, value, option);
            return value;
          },
          keys: async () => await cacheAdaptor.hkeys(topic, propKey),
          entries: async () => {
            const entries = await cacheAdaptor.hentries(topic, propKey);
            return entries.map(([key, value]) => [key, getter(value)]);
          },
          forEach: async (callback: (value: unknown, key: string) => void | Promise<void>) => {
            for (const [key, value] of await cacheAdaptor.hentries(topic, propKey)) await callback(getter(value), key);
          },
          clear: async () => {
            await cacheAdaptor.hclear(topic, propKey);
          },
        },
      });
    } else {
      Object.defineProperty(instance, propKey, {
        value: {
          get: async () => {
            const getter = injectInfo.get as unknown as (value: unknown) => unknown;
            const value = await cacheAdaptor.get("akan:memory", propKey);
            return value === null ? value : getter(value);
          },
          set: async (value: unknown, option?: CacheSetOptions) => {
            const setter = injectInfo.set as unknown as (value: unknown) => string | number | Buffer;
            const setValue = setter(value);
            await cacheAdaptor.set("akan:memory", propKey, setValue, option ?? injectInfo.cacheOption);
          },
          delete: async () => {
            await cacheAdaptor.delete("akan:memory", propKey);
          },
        },
        writable: false,
        enumerable: true,
      });
    }
  }
}

type GetFieldValue<ValueRef, ExplicitType, MapValue = never> = unknown extends ExplicitType
  ? FieldToValue<ValueRef, MapValue>
  : ExplicitType;
export const injectionBuilder = (parentRefName: string) => ({
  database: <ReturnType>(additionalPropKeys: string[] = []) =>
    new InjectInfo<"database", ReturnType>("database", { additionalPropKeys, parentRefName }),
  service: <ReturnType extends Service>() => new InjectInfo<"service", ReturnType>("service", { parentRefName }),
  use: <ReturnType>() => new InjectInfo<"use", ReturnType>("use", { parentRefName }),
  signal: <Signal>() => new InjectInfo<"signal", Signal>("signal", { parentRefName }),
  plug: <Adaptor, GenFactory extends (adaptor: Adaptor) => unknown = (adaptor: Adaptor) => Adaptor>(
    adaptor: AdaptorCls<Adaptor>,
    generateFactory?: GenFactory,
  ) =>
    new InjectInfo<"plug", ReturnType<GenFactory>>("plug", {
      adaptor,
      generateFactory: (generateFactory ?? ((adaptor) => adaptor)) as (options: any) => ReturnType<GenFactory>,
      parentRefName,
    }),
  env: <GenFactory extends (arg: never) => unknown>(generateFactory: GenFactory) =>
    new InjectInfo<
      "env",
      Awaited<ReturnType<GenFactory>>,
      GenFactory extends (arg: infer Env extends { [key: string]: any }) => unknown ? Env : never
    >("env", {
      generateFactory: generateFactory as unknown as (options: any) => Awaited<ReturnType<GenFactory>>,
      parentRefName,
    }),
  memory: <
    ExplicitType = unknown,
    ValueRef extends ConstantFieldTypeInput = PlainTypeToFieldType<ExplicitType>,
    MapValue = never,
    DefaultValue extends GetFieldValue<ValueRef, ExplicitType> = never,
    GetFn extends (value: GetFieldValue<ValueRef, ExplicitType>) => unknown = never,
    Local extends boolean = false,
  >(
    modelRef: ValueRef,
    opts: {
      local?: Local;
      default?: DefaultValue;
      of?: MapValue;
      expireAt?: CacheSetOptions["expireAt"];
      get?: GetFn;
      set?: (value: ReturnType<GetFn>) => GetFieldValue<ValueRef, ExplicitType>;
    } = {},
  ) => {
    if (opts.local && (!!opts.get || !!opts.set))
      throw new Error("get and set should not be provided when local is true");
    if ((opts.get && !opts.set) || (!opts.get && opts.set))
      throw new Error("get and set should be both provided or not provided");
    const isMap = modelRef === Map;
    if (isMap && !opts.of) throw new Error("of should be provided when modelRef is Map");
    type FieldValue = never extends GetFn ? GetFieldValue<ValueRef, ExplicitType, MapValue> : ReturnType<GetFn>;
    type MapFieldValue = never extends GetFn ? FieldToValue<MapValue> : ReturnType<GetFn>;
    type IsNullable = DefaultValue extends never ? true : false;
    type UseValue = IsNullable extends true ? FieldValue | null : FieldValue;
    return new InjectInfo<
      "memory",
      Local extends true
        ? MapConstructor extends ValueRef
          ? Map<string, FieldToValue<MapValue>>
          : UseValue
        : MapConstructor extends ValueRef
          ? {
              get: (key: string) => Promise<MapFieldValue | undefined>;
              set: (key: string, value: MapFieldValue, option?: CacheSetOptions) => Promise<void>;
              delete: (key: string) => Promise<void>;
              getOrInsert: (key: string, value: MapFieldValue, option?: CacheSetOptions) => Promise<MapFieldValue>;
              getOrInsertComputed: (
                key: string,
                compute: (key: string) => MapFieldValue | Promise<MapFieldValue>,
                option?: CacheSetOptions,
              ) => Promise<MapFieldValue>;
              keys: () => Promise<string[]>;
              entries: () => Promise<[string, MapFieldValue][]>;
              forEach: (callback: (value: MapFieldValue, key: string) => void | Promise<void>) => Promise<void>;
              clear: () => Promise<void>;
            }
          : {
              get: () => Promise<UseValue>;
              set: (value: UseValue, option?: CacheSetOptions) => Promise<void>;
              delete: () => Promise<void>;
            },
      never,
      ValueRef
    >("memory", {
      local: opts.local,
      get: (serializedValue: never) => {
        const rawValue = serializedValue as object | null;
        return (
          ConstantRegistry.deserialize(isMap ? (opts.of as Cls) : (modelRef as Cls), rawValue ?? opts.default, true) ??
          null
        );
      },
      set: (value: never) => {
        return (
          ConstantRegistry.serialize(isMap ? (opts.of as Cls) : (modelRef as Cls), value, true) ?? opts.default ?? null
        );
      },
      default: opts.default as unknown,
      isMap,
      cacheOption: opts.expireAt ? { expireAt: opts.expireAt } : undefined,
      parentRefName,
    });
  },
});

export type InjectBuilder<BuildType extends InjectType = InjectType> = (
  builder: Pick<ReturnType<typeof injectionBuilder>, BuildType>,
) => { [key: string]: InjectInfo };

export type ExtractInjectInfoObject<InjectInfoMap extends { [key: string]: InjectInfo }> = {
  [K in keyof InjectInfoMap]: ReturnType<InjectInfoMap[K]["generateFactory"]>;
};
