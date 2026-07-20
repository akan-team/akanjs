import { DataList, getEnv, PrimitiveRegistry, type PromiseOrObject } from "akanjs/base";
import { capitalize, type FetchPolicy, fileUploadContract, Logger, resolveFileUploadCapability } from "akanjs/common";
import { type BaseInsight, type BaseObject, ConstantRegistry, deserialize, serialize } from "akanjs/constant";
import type {
  DatabaseSignal,
  SerializedArg,
  SerializedEndpoint,
  SerializedReturns,
  SerializedSignal,
  SerializedSlice,
  ServiceSignal,
} from "akanjs/signal";
import type { ClientSignal, FetchClientType, FetchSignalInput, MergeAllFetchTypes, SliceMeta } from "../fetchType";
import { memoizeRequestQuery, cookies as requestCookies, headers as requestHeaders } from "../requestStorage";
import type { GetSliceMetaObjFromDatabaseSignals } from "../types";
import { type ErrorConstructor, HttpClient } from "./httpClient";
import { WsClient } from "./wsClient";

type FetchHandler = (...args: unknown[]) => PromiseOrObject<unknown>;
type FetchHandlerFactory = () => FetchHandler;
type UnknownRecord = Record<string, unknown>;

const isNullableArg = (arg: SerializedArg) => arg.nullable ?? arg.type === "search";

const normalizeQueryArgs = (queryArgs: unknown[], args: SerializedArg[]) => {
  let length = Math.min(queryArgs.length, args.length);
  while (length > 0 && isNullableArg(args[length - 1]) && queryArgs[length - 1] == null) length--;
  return queryArgs.slice(0, length);
};

const expandQueryArgs = (queryArgs: unknown[], args: SerializedArg[]) => args.map((_, idx) => queryArgs[idx]);

export type FetchProxy<
  FetchType = unknown,
  SliceMetaObj extends Record<string, SliceMeta> = Record<never, never>,
> = typeof global.fetch &
  FetchClient &
  FetchType & { slice: SliceMetaObj; instance: FetchClient; _FetchType: FetchType; _SliceMetaObj: SliceMetaObj };

type ClientSignalMap<SigType extends { fetch: any }> = {
  [K in keyof SigType as SigType[K] extends DatabaseSignal<any, any, any, any>
    ? K
    : never]: SigType[K] extends DatabaseSignal<any, any, infer SlceCls, any>
    ? ClientSignal<SlceCls["baseName"], SlceCls, SlceCls["srv"]["cnst"]>
    : never;
};

/** Runtime fetch client that registers serialized Akan signals as HTTP/WebSocket methods. */
export class FetchClient {
  static #sharedSerializedSignal: { [key: string]: SerializedSignal } = {};
  static #sharedRegistryVersion = 0;
  readonly logger = new Logger("FetchClient");
  readonly origin: string;
  readonly http: HttpClient;
  readonly ws: WsClient;
  readonly handler: Record<string, FetchHandler>;
  readonly slice: Record<string, SliceMeta> = {};
  readonly sortKeyMap = new Map<string, string[]>();
  readonly #handlerStore: Record<string, FetchHandler> = {};
  readonly #handlerFactory = new Map<string, FetchHandlerFactory>();
  #sharedRegistryAppliedVersion = 0;
  serializedSignal: { [key: string]: SerializedSignal } = {};
  jwt: string | null = null;

  constructor(
    origin: string,
    handler: Record<string, FetchHandler> = {},
    serializedSignal: { [key: string]: SerializedSignal } = {},
    private ErrorCls?: ErrorConstructor,
  ) {
    this.origin = origin;
    this.http = new HttpClient(origin, ErrorCls);
    const wsUri = `${origin.replace("http://", "ws://").replace("https://", "wss://")}/ws`;
    this.ws = new WsClient(wsUri, ErrorCls);
    Object.assign(this.#handlerStore, handler);
    this.handler = this.#makeHandlerProxy();
    this.applySignal(serializedSignal);
  }
  static resetSharedRegistry() {
    FetchClient.#sharedSerializedSignal = {};
    FetchClient.#sharedRegistryVersion++;
  }
  static #mergeSerializedSignalInto(
    serializedSignal: { [key: string]: SerializedSignal },
    refName: string,
    signal: SerializedSignal,
  ) {
    const current = serializedSignal[refName];
    serializedSignal[refName] = current
      ? {
          ...current,
          ...signal,
          endpoint: { ...current.endpoint, ...signal.endpoint },
          slice: current.slice || signal.slice ? { ...current.slice, ...signal.slice } : undefined,
          filter:
            current.filter || signal.filter
              ? {
                  filter: { ...current.filter?.filter, ...signal.filter?.filter },
                  sortKeys: [...new Set([...(current.filter?.sortKeys ?? []), ...(signal.filter?.sortKeys ?? [])])],
                }
              : undefined,
          getGuards: signal.getGuards ?? current.getGuards,
          cruGuards: signal.cruGuards ?? current.cruGuards,
          createGuards: signal.createGuards ?? current.createGuards,
          updateGuards: signal.updateGuards ?? current.updateGuards,
          removeGuards: signal.removeGuards ?? current.removeGuards,
        }
      : signal;
  }
  setErrorConstructor(ErrorCls?: ErrorConstructor) {
    this.ErrorCls = ErrorCls;
    this.http.setErrorConstructor(ErrorCls);
    this.ws.setErrorConstructor(ErrorCls);
  }
  applySignal(serializedSignal: { [key: string]: SerializedSignal }, { share = true }: { share?: boolean } = {}) {
    if (share && Object.keys(serializedSignal).length > 0) {
      for (const [refName, signal] of Object.entries(serializedSignal))
        FetchClient.#mergeSerializedSignalInto(FetchClient.#sharedSerializedSignal, refName, signal);
      FetchClient.#sharedRegistryVersion++;
      this.#sharedRegistryAppliedVersion = FetchClient.#sharedRegistryVersion;
    }
    for (const [refName, signal] of Object.entries(serializedSignal))
      FetchClient.#mergeSerializedSignalInto(this.serializedSignal, refName, signal);
    for (const [refName, signal] of Object.entries(serializedSignal)) {
      for (const [key, endpoint] of Object.entries(signal.endpoint))
        this.#registerEndpoint(key, endpoint, signal.prefix);
      if (signal.slice) {
        this.#registerModelBaseEndpoint(refName, signal);
        for (const [suffix, slice] of Object.entries(signal.slice ?? {}))
          this.#registerSlice(refName, suffix, slice, signal.prefix);
      }
      if (signal.filter) {
        this.#registerFilterSortKey(refName, signal.filter.sortKeys);
        for (const [suffix, args] of Object.entries(signal.filter.filter)) {
          this.#registerFilterQuery(suffix, args);
        }
      }
    }
    return this;
  }
  #makeHandlerProxy() {
    return new Proxy(this.#handlerStore, {
      get: (target, prop) => {
        if (typeof prop !== "string") return undefined;
        return target[prop] ?? this.#getOrCreateHandler(prop);
      },
      has: (target, prop) => {
        if (typeof prop !== "string") return prop in target;
        return prop in target || this.#handlerFactory.has(prop);
      },
    });
  }
  #syncSharedRegistry() {
    if (this.#sharedRegistryAppliedVersion === FetchClient.#sharedRegistryVersion) return;
    this.applySignal(FetchClient.#sharedSerializedSignal, { share: false });
    this.#sharedRegistryAppliedVersion = FetchClient.#sharedRegistryVersion;
  }
  #getOrCreateHandler(key: string): FetchHandler | undefined {
    const current = this.#handlerStore[key];
    if (current) return current;
    const factory = this.#handlerFactory.get(key);
    if (factory) {
      const handler = factory();
      this.#handlerStore[key] = handler;
      return handler;
    }
    this.#syncSharedRegistry();
    const syncedFactory = this.#handlerFactory.get(key);
    if (!syncedFactory) return undefined;
    const handler = syncedFactory();
    this.#handlerStore[key] = handler;
    return handler;
  }
  #requireHandler<T extends FetchHandler = FetchHandler>(key: string, owner: string): T {
    const handler = this.#getOrCreateHandler(key);
    if (!handler) throw new Error(`${owner} requires fetch handler "${key}", but it is not registered`);
    return handler as T;
  }
  #setHandlerFactory(key: string, factory: FetchHandlerFactory) {
    this.#handlerFactory.set(key, factory);
    delete this.#handlerStore[key];
  }
  connect() {
    this.ws.connect();
  }
  disconnect() {
    this.ws.destroy();
  }
  clone({ origin, connect = true, jwt }: { origin?: string; connect?: boolean; jwt?: string } = {}) {
    const instance = new FetchClient(origin ?? this.origin, {}, this.serializedSignal, this.ErrorCls);
    Object.entries(this.handler).forEach(([key, handler]) => {
      if (!(key in instance.handler)) instance.handler[key] = handler;
    });
    instance.setJwt(jwt ?? this.jwt);
    if (connect) instance.connect();
    return FetchClient.#makeProxy(instance);
  }
  setJwt(jwt: string | null) {
    this.jwt = jwt;
  }
  #makeAuthHeaders(option?: FetchPolicy): Record<string, string> {
    if (option?.token) return { Authorization: `Bearer ${option.token}` };
    try {
      if (getEnv().side === "server") {
        const authorization = requestHeaders().get("authorization");
        if (authorization) return { Authorization: authorization };
        const token = requestCookies().get("jwt")?.value;
        if (token) return { Authorization: `Bearer ${token}` };
      }
    } catch {
      // Tests and standalone clients can run without Akan public env. Fall back to instance JWT.
    }
    return this.jwt ? { Authorization: `Bearer ${this.jwt}` } : {};
  }
  #registerFilterSortKey(refName: string, sortKeys: string[]) {
    this.sortKeyMap.set(refName, sortKeys);
  }
  #registerFilterQuery(suffix: string, args: SerializedArg[]) {
    // TODO: Implement
  }
  #makeHttpFn(key: string, endpoint: SerializedEndpoint, prefix?: string) {
    const argLength = endpoint.args.length;
    const serializerMap = this.#makeArgSerializer(endpoint.args);
    const parseReturn = this.#makeReturnParser(endpoint.returns);
    const { bodyArgs, uploadArgs } = FetchClient.classifyHttpArgs(endpoint.args);
    switch (endpoint.type) {
      case "query": {
        const queryFn = async (...argData: unknown[]) => {
          const args = argData.slice(0, argLength);
          const option = argData[argLength] as FetchPolicy | undefined;
          const argMap = new Map(serializerMap.entries().map(([key, serializer], idx) => [key, serializer(args[idx])]));
          const url = FetchClient.makeHttpUrl(key, endpoint, prefix, argMap);
          const headers = this.#makeAuthHeaders(option);
          const baseUrl = option?.origin;
          // A per-request origin override targets an arbitrary server, so the shared
          // request-query cache (keyed by the client origin) must be bypassed.
          const requestQuery = () => this.http.get(url, { headers, baseUrl });
          const response = baseUrl
            ? await requestQuery()
            : await memoizeRequestQuery(FetchClient.#makeRequestQueryCacheKey(this.origin, url, headers), requestQuery);
          const parsedReturn = parseReturn(FetchClient.#deepCopy(response), { crystalize: option?.crystalize ?? true });
          return parsedReturn;
        };
        return queryFn;
      }
      case "mutation": {
        const mutationFn = async (...argData: unknown[]) => {
          const args = argData.slice(0, argLength);
          const option = argData[argLength] as FetchPolicy | undefined;
          const argMap = new Map(serializerMap.entries().map(([key, serializer], idx) => [key, serializer(args[idx])]));
          const url = FetchClient.makeHttpUrl(key, endpoint, prefix, argMap);
          const body = HttpClient.makeBody(bodyArgs, uploadArgs, argMap);
          const response = await this.http.post(url, body, {
            headers: this.#makeAuthHeaders(option),
            baseUrl: option?.origin,
          });
          const parsedReturn = parseReturn(response, { crystalize: option?.crystalize ?? true });
          return parsedReturn;
        };
        return mutationFn;
      }
      default:
        throw new Error(`Unsupported endpoint type: ${endpoint.type}`);
    }
  }
  #registerEndpoint(key: string, endpoint: SerializedEndpoint, prefix?: string) {
    switch (endpoint.type) {
      case "query": {
        this.#setHandlerFactory(key, () => this.#makeHttpFn(key, endpoint, prefix));
        return;
      }
      case "mutation": {
        this.#setHandlerFactory(key, () => this.#makeHttpFn(key, endpoint, prefix));
        return;
      }
      case "pubsub": {
        this.#setHandlerFactory(`subscribe${capitalize(key)}`, () => {
          const roomArgs = endpoint.args.filter((arg) => arg.type === "room");
          const roomArgLength = roomArgs.length;
          const serializerMap = this.#makeArgSerializer(endpoint.args);
          const parseReturn = this.#makeReturnParser(endpoint.returns);
          const wrappedListeners = new WeakMap<(data: unknown) => void, (data: unknown) => void>();
          return (...argData: unknown[]) => {
            const args = argData.slice(0, roomArgLength);
            const handleEvent = argData[roomArgLength] as (data: unknown) => void;
            const fetchPolicy = argData[roomArgLength + 1] as FetchPolicy | undefined;
            const data = roomArgs.map((arg, idx) => serializerMap.get(arg.name)?.(args[idx]) ?? null);
            const wrapped = (data: unknown) => {
              const parsedReturn = parseReturn(data, { crystalize: fetchPolicy?.crystalize ?? true });
              handleEvent(parsedReturn);
            };
            wrappedListeners.set(handleEvent, wrapped);
            this.ws.subscribe({
              key,
              data,
              handleEvent: wrapped,
            });
            return () =>
              this.ws.unsubscribe({ key, data, handleEvent: wrappedListeners.get(handleEvent) ?? handleEvent });
          };
        });
        return;
      }
      case "message": {
        this.#setHandlerFactory(key, () => {
          const msgArgs = endpoint.args.filter((arg) => arg.type === "msg");
          const msgArgLength = msgArgs.length;
          const serializerMap = this.#makeArgSerializer(endpoint.args);
          return (...argData: unknown[]) => {
            const args = argData.slice(0, msgArgLength);
            const data = msgArgs.map((arg, idx) => serializerMap.get(arg.name)?.(args[idx]) ?? null);
            this.ws.emit(key, data);
          };
        });
        this.#setHandlerFactory(`listen${capitalize(key)}`, () => {
          const parseReturn = this.#makeReturnParser(endpoint.returns);
          const wrappedListeners = new WeakMap<(data: unknown) => void, (data: unknown) => void>();
          return ((handleEvent: (data: unknown) => void, fetchPolicy: FetchPolicy = {}) => {
            const wrapped = (data: unknown) => {
              const parsedReturn = parseReturn(data, { crystalize: fetchPolicy?.crystalize ?? true });
              handleEvent(parsedReturn);
            };
            wrappedListeners.set(handleEvent, wrapped);
            this.ws.on(key, wrapped);
            return () => this.ws.off(key, wrappedListeners.get(handleEvent) ?? handleEvent);
          }) as FetchHandler;
        });
        return;
      }
      default:
        this.logger.error(`Unsupported endpoint type: ${endpoint.type}`);
        break;
    }
  }
  static paginationArgs: SerializedArg[] = [
    { type: "search", name: "skip", refName: "Int" },
    { type: "search", name: "limit", refName: "Int" },
    { type: "search", name: "sort", refName: "String" },
  ];

  static makeHttpUrl(
    key: string,
    endpoint: SerializedEndpoint,
    prefix: string | undefined,
    argMap: Map<string, unknown>,
  ) {
    const { paramArgs, searchArgs } = FetchClient.classifyHttpArgs(endpoint.args);
    const path = endpoint.path ?? HttpClient.makePath(key, paramArgs, prefix);
    return HttpClient.makeUrl(path, searchArgs, argMap);
  }

  static getBaseEndpoint(refName: string, signal: SerializedSignal) {
    const capRefName = capitalize(refName);
    const names = {
      createModel: `create${capRefName}`,
      updateModel: `update${capRefName}`,
      removeModel: `remove${capRefName}`,
      model: refName,
      modelId: `${refName}Id`,
      lightModel: `light${capRefName}`,
    };
    // create/update/remove fall back to the shared cruGuards when they don't override it.
    const createGuards = signal.createGuards ?? signal.cruGuards;
    const updateGuards = signal.updateGuards ?? signal.cruGuards;
    const removeGuards = signal.removeGuards ?? signal.cruGuards;
    const endpoint: { [key: string]: SerializedEndpoint } = {};
    if (signal.getGuards) {
      endpoint[names.model] = {
        type: "query",
        args: [{ type: "param", name: names.modelId, refName: "ID" }],
        returns: { refName, modelType: "full" },
        guards: signal.getGuards,
      };
      endpoint[names.lightModel] = {
        type: "query",
        args: [{ type: "param", name: names.modelId, refName: "ID" }],
        returns: { refName, modelType: "light" },
        guards: signal.getGuards,
      };
    }
    if (createGuards) {
      endpoint[names.createModel] = {
        type: "mutation",
        args: [{ type: "body", name: "data", refName, modelType: "input" }],
        returns: { refName, modelType: "full" },
        guards: createGuards,
      };
    }
    if (updateGuards) {
      endpoint[names.updateModel] = {
        type: "mutation",
        args: [
          { type: "param", name: names.modelId, refName: "ID" },
          { type: "body", name: "data", refName, modelType: "input" },
        ],
        returns: { refName, modelType: "full" },
        guards: updateGuards,
      };
    }
    if (removeGuards) {
      endpoint[names.removeModel] = {
        type: "mutation",
        args: [{ type: "param", name: names.modelId, refName: "ID" }],
        returns: { refName, modelType: "full" },
        guards: removeGuards,
      };
    }
    return endpoint;
  }
  #registerModelBaseEndpoint(refName: string, signal: SerializedSignal) {
    const capRefName = capitalize(refName);
    const names = {
      createModel: `create${capRefName}`,
      updateModel: `update${capRefName}`,
      removeModel: `remove${capRefName}`,
      model: refName,
      modelId: `${refName}Id`,
      lightModel: `light${capRefName}`,
      viewModel: `view${capRefName}`,
      getModelView: `get${capRefName}View`,
      editModel: `edit${capRefName}`,
      getModelEdit: `get${capRefName}Edit`,
      addModelFiles: `add${capRefName}Files`,
      mergeModel: `merge${capRefName}`,
    };
    const endpoint = FetchClient.getBaseEndpoint(refName, signal);
    Object.entries(endpoint).forEach(([key, value]) => {
      this.#setHandlerFactory(key, () => this.#makeHttpFn(key, value, signal.prefix));
    });

    // view/edit helpers are available whenever any create/update/remove endpoint is exposed;
    // merge wraps updateModel, so it additionally requires update to be exposed.
    const anyCruGuards = signal.cruGuards ?? signal.createGuards ?? signal.updateGuards ?? signal.removeGuards;
    const updateGuards = signal.updateGuards ?? signal.cruGuards;
    if (anyCruGuards) {
      this.#setHandlerFactory(
        names.viewModel,
        () =>
          (async (id: string, option?: FetchPolicy) => {
            const cnst = ConstantRegistry.getDatabase(refName);
            const modelFn = this.#requireHandler(names.model, names.viewModel);
            const modelObj = await modelFn(id, { ...option, crystalize: false });
            const model = new cnst.full(modelObj as object);
            return {
              [refName]: model,
              [`${refName}View`]: { refName, [`${refName}Obj`]: modelObj, [`${refName}ViewAt`]: new Date() },
            };
          }) as FetchHandler,
      );
      this.#setHandlerFactory(
        names.getModelView,
        () =>
          (async (id: string, option?: FetchPolicy) => {
            const modelFn = this.#requireHandler(names.model, names.getModelView);
            const modelObj = await modelFn(id, { ...option, crystalize: false });
            return { refName, [`${refName}Obj`]: modelObj, [`${refName}ViewAt`]: new Date() };
          }) as FetchHandler,
      );
      this.#setHandlerFactory(
        names.editModel,
        () =>
          (async (id: string, option?: FetchPolicy) => {
            const cnst = ConstantRegistry.getDatabase(refName);
            const modelFn = this.#requireHandler(names.model, names.editModel);
            const modelObj = await modelFn(id, { ...option, crystalize: false });
            const model = new cnst.full(modelObj as object);
            return {
              [refName]: model,
              [`${refName}Edit`]: { refName, [`${refName}Obj`]: modelObj, [`${refName}ViewAt`]: new Date() },
            };
          }) as FetchHandler,
      );
      this.#setHandlerFactory(
        names.getModelEdit,
        () =>
          (async (id: string, option?: FetchPolicy) => {
            const modelFn = this.#requireHandler(names.model, names.getModelEdit);
            const modelObj = await modelFn(id, { ...option, crystalize: false });
            return { refName, [`${refName}Obj`]: modelObj, [`${refName}ViewAt`]: new Date() };
          }) as FetchHandler,
      );
      if (updateGuards) {
        this.#setHandlerFactory(
          names.mergeModel,
          () =>
            (async (modelOrId: string | { id: string }, data: UnknownRecord, option?: FetchPolicy) => {
              const id = typeof modelOrId === "string" ? modelOrId : modelOrId.id;
              const updateFn = this.#requireHandler(names.updateModel, names.mergeModel);
              return await updateFn(id, data, option);
            }) as FetchHandler,
        );
      }
    }

    this.#setHandlerFactory(
      names.addModelFiles,
      () =>
        (async (fileList: FileList, parentId?: string, option?: FetchPolicy) => {
          const cap = resolveFileUploadCapability(this.serializedSignal);
          const endpoint = cap ? this.serializedSignal[cap.refName]?.endpoint[cap.endpointKey] : undefined;
          if (!cap || !endpoint)
            throw new Error(
              "File upload is not configured. Mark an upload mutation with { fileUpload: true } (e.g. shared FileEndpoint.addFiles).",
            );
          const { fields, buildMetas } = fileUploadContract;
          const formData = new FormData();
          for (let i = 0; i < fileList.length; i++) formData.append(fields.files, fileList[i]);
          formData.append(fields.metas, JSON.stringify(buildMetas(fileList)));
          formData.append(fields.type, refName);
          if (parentId) formData.append(fields.parentId, parentId);
          const url = FetchClient.makeHttpUrl(cap.endpointKey, endpoint, cap.prefix, new Map());
          return await this.http.post(url, formData, { headers: this.#makeAuthHeaders(option) });
        }) as FetchHandler,
    );
  }

  static getEndpointFromSlice(
    refName: string,
    suffix: string,
    slice: SerializedSlice,
  ): { [key: string]: SerializedEndpoint } {
    const capSuffix = capitalize(suffix);
    const names = {
      list: `${refName}List${capSuffix}`,
      insight: `${refName}Insight${capSuffix}`,
    };
    const endpoint: { [key: string]: SerializedEndpoint } = {
      [names.list]: {
        type: "query",
        args: [...slice.args, ...FetchClient.paginationArgs],
        returns: { refName, modelType: "light", arrDepth: 1 },
        guards: slice.guards,
      },
      [names.insight]: {
        type: "query",
        args: [...slice.args],
        returns: { refName, modelType: "insight" },
        guards: slice.guards,
      },
    };
    return endpoint;
  }
  #registerSlice(refName: string, suffix: string, slice: SerializedSlice, prefix?: string) {
    const capSuffix = capitalize(suffix);
    const sliceName = `${refName}${capSuffix}`;
    const capRefName = capitalize(refName);
    const names = {
      list: `${refName}List${capSuffix}`,
      insight: `${refName}Insight${capSuffix}`,
      init: `init${capRefName}${capSuffix}`,
      getInit: `get${capRefName}Init${capSuffix}`,
    };

    const endpoint = FetchClient.getEndpointFromSlice(refName, suffix, slice);
    Object.entries(endpoint).forEach(([key, value]) => {
      this.#setHandlerFactory(key, () => this.#makeHttpFn(key, value, prefix));
    });

    const argLength = slice.args.length;
    this.slice[sliceName] = { refName, sliceName, argLength };
    this.#setHandlerFactory(names.init, () => async (...argData: unknown[]) => {
      const cnst = ConstantRegistry.getDatabase(refName);
      const queryArgs = normalizeQueryArgs(
        Array.from({ length: Math.min(argData.length, argLength) }, (_, idx) => argData[idx]),
        slice.args,
      );
      const fetchQueryArgs = expandQueryArgs(queryArgs, slice.args);
      const option = (argData[argLength] ?? {}) as { page?: number; limit?: number; sort?: string; insight?: boolean };
      const { page = 1, limit = 20, sort = "latest", insight: fetchInsight = true } = option;
      const skip = (page - 1) * limit;
      const listFn = this.#requireHandler<(...args: unknown[]) => Promise<unknown[]>>(names.list, names.init);
      const insightFn = this.#requireHandler<(...args: unknown[]) => Promise<unknown>>(names.insight, names.init);

      const [modelObjList, modelObjInsight] = (await Promise.all([
        listFn(...fetchQueryArgs, skip, limit, sort, { ...option, crystalize: false }),
        fetchInsight ? insightFn(...fetchQueryArgs, { ...option, crystalize: false }) : null,
      ])) as unknown as [BaseObject[], BaseInsight];
      const modelList = new DataList(modelObjList.map((modelObj) => new cnst.light(modelObj)));
      const modelInsight = new cnst.insight(modelObjInsight);
      const lastPage = modelObjInsight?.count
        ? Math.max(Math.floor((modelObjInsight.count - 1) / (limit || 20)) + 1, 1)
        : 1;

      const serverInit = {
        refName,
        sliceName,
        argLength,
        [`${refName}ObjList`]: modelObjList,
        [`${refName}ObjInsight`]: modelObjInsight,
        [`pageOf${capRefName}`]: page,
        [`lastPageOf${capRefName}`]: lastPage,
        [`limitOf${capRefName}`]: limit,
        [`queryArgsOf${capRefName}`]: queryArgs,
        [`sortOf${capRefName}`]: sort,
        [`${refName}InitAt`]: new Date(),
      };
      return {
        [`${refName}Init${capSuffix}`]: serverInit,
        [`${refName}List${capSuffix}`]: modelList,
        [`${refName}Insight${capSuffix}`]: modelInsight,
      };
    });
    this.#setHandlerFactory(names.getInit, () => async (...args: unknown[]) => {
      const initFn = this.#requireHandler<(...args: unknown[]) => Promise<Record<string, unknown>>>(
        names.init,
        names.getInit,
      );
      const result = await initFn(...args);
      return result[`${refName}Init${capSuffix}`];
    });
  }
  #makeArgSerializer(args: SerializedArg[]) {
    const serializerMap = new Map(
      args.map((arg) => {
        const argRef = arg.modelType
          ? ConstantRegistry.getModelRef(arg.refName, arg.modelType)
          : PrimitiveRegistry.get(arg.refName);
        return [
          arg.name,
          (value: unknown) =>
            serialize(argRef, arg.arrDepth ?? 0, value, "input", {
              nullable: arg.nullable ?? arg.type === "search",
            }),
        ] as const;
      }),
    );
    return serializerMap;
  }
  #makeReturnParser(returns: SerializedReturns) {
    if (returns.modelType) {
      const returnRef = ConstantRegistry.getModelRef(returns.refName, returns.modelType);
      return (value: unknown, { crystalize = true }: { crystalize?: boolean } = {}) =>
        deserialize(returnRef, returns.arrDepth ?? 0, value, {
          key: returns.refName,
          nullable: returns.nullable,
          convertFn: crystalize
            ? (value: unknown) => new (returnRef as new (arg: unknown) => object)(value)
            : undefined,
        });
    } else {
      const returnRef = PrimitiveRegistry.get(returns.refName);
      return (value: unknown, { crystalize = true }: { crystalize?: boolean } = {}) =>
        deserialize(returnRef, returns.arrDepth ?? 0, value, { key: returns.refName, nullable: returns.nullable });
    }
  }
  static classifyHttpArgs(args: SerializedArg[]) {
    const paramArgs: SerializedArg[] = [];
    const searchArgs: SerializedArg[] = [];
    const bodyArgs: SerializedArg[] = [];
    const uploadArgs: SerializedArg[] = [];
    args.forEach((arg) => {
      if (arg.type === "param") paramArgs.push(arg);
      else if (arg.type === "search") searchArgs.push(arg);
      else if (arg.type === "body" && arg.refName === "Upload") uploadArgs.push(arg);
      else if (arg.type === "body") bodyArgs.push(arg);
      else if (arg.type === "upload") uploadArgs.push(arg);
    });
    return { paramArgs, searchArgs, bodyArgs, uploadArgs };
  }
  static #makeRequestQueryCacheKey(origin: string, url: string, headers: Record<string, string>): string {
    return JSON.stringify({
      method: "GET",
      origin,
      url,
      headers: Object.entries(headers).sort(([a], [b]) => a.localeCompare(b)),
    });
  }
  static #deepCopy<T>(value: T): T {
    if (value === null || typeof value !== "object") return value;
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value)) as T;
  }
  static from<Signals extends readonly FetchSignalInput[]>(...signals: Signals): FetchClientType<Signals> {
    const serializedSignal: { [key: string]: SerializedSignal } = {};
    const handler: Record<string, FetchHandler> = {};
    signals.forEach((signal) => {
      if ("endpoint" in signal) {
        const refName = (signal as DatabaseSignal | ServiceSignal).endpoint.baseName;
        FetchClient.#mergeSerializedSignalInto(
          serializedSignal,
          refName,
          (signal as DatabaseSignal | ServiceSignal).serializedSignal,
        );
      } else {
        Object.assign(handler, signal.handler);
        Object.entries(signal.serializedSignal).forEach(([refName, signal]) => {
          FetchClient.#mergeSerializedSignalInto(serializedSignal, refName, signal);
        });
      }
    });
    const instance = new FetchClient(getEnv().serverHttpUri, handler, serializedSignal);
    return FetchClient.#makeProxy<MergeAllFetchTypes<Signals>, GetSliceMetaObjFromDatabaseSignals<Signals>>(instance);
  }
  static build<SigType extends { fetch: any }>(
    constant: object,
    serializedSignal: { [key: string]: SerializedSignal },
    {
      origin = getEnv().serverHttpUri,
      connect = false,
      base,
      Err,
    }: { origin?: string; connect?: boolean; base?: FetchProxy; Err?: ErrorConstructor } = {},
  ): {
    sig: ClientSignalMap<SigType>;
    fetch: SigType["fetch"];
  } {
    if (base) base.instance.applySignal(serializedSignal);
    if (base && Err) base.instance.setErrorConstructor(Err);
    const proxy =
      base ??
      FetchClient.#makeProxy<unknown, Record<string, SliceMeta>>(new FetchClient(origin, {}, serializedSignal, Err));
    if (connect) proxy.instance.connect();
    const sig = {} as any;
    Object.entries(serializedSignal).forEach(([refName, serializedSignal]) => {
      if (!serializedSignal.slice) return;
      const cnst = ConstantRegistry.getDatabase(refName, { allowEmpty: true });
      if (!cnst) return;
      const slices = Object.entries(serializedSignal.slice).map(([suffix, serializedSlice]) => {
        const sliceName = `${refName}${capitalize(suffix)}`;
        proxy.slice[sliceName] = { refName, sliceName, argLength: serializedSlice.args.length };
        return { refName, sliceName, serializedSlice };
      });
      sig[refName] = { refName, _slice: null, cnst, fetch: proxy, slices, serializedSignal };
    });
    return { sig, fetch: proxy as SigType["fetch"] };
  }
  static #makeProxy<FetchType, SliceMetaObj extends Record<string, SliceMeta> = Record<never, never>>(
    instance: FetchClient,
  ): FetchProxy<FetchType, SliceMetaObj> {
    return new Proxy(fetch, {
      get(target, prop) {
        if (prop in target) return (target as any)[prop];
        else if (prop === "instance") return instance;
        else if (typeof prop === "string") {
          const handler = instance.#getOrCreateHandler(prop);
          if (handler) return handler;
        }
        return (instance as unknown as Record<PropertyKey, unknown>)[prop];
      },
    }) as FetchProxy<FetchType, SliceMetaObj>;
  }
}
