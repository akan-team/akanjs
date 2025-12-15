/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/require-await */
import "reflect-metadata";

import type { BackendEnv, MergeAllTypes, Prettify, PromiseOrObject, Type, UnType } from "@akanjs/base";
import { applyMixins, capitalize, Logger, lowerlize } from "@akanjs/common";
import { type DocumentModel, QueryOf } from "@akanjs/constant";
import {
  BaseMiddleware,
  CRUDEventType,
  Database,
  DatabaseModel,
  DataInputOf,
  Doc as DbDoc,
  ExtractQuery,
  ExtractSort,
  FilterInstance,
  FindQueryOption,
  GetDocObject,
  getFilterKeyMetaMapOnPrototype,
  getFilterQuery,
  ListQueryOption,
  QueryMethodPart,
  SaveEventType,
} from "@akanjs/document";
import { Inject, Injectable, type Provider } from "@nestjs/common";
import { InjectConnection, InjectModel } from "@nestjs/mongoose";
import type { Job, Queue as BullQueue } from "bull";
import type { HydratedDocument } from "mongoose";
import type { Server } from "socket.io";

import { ExtractInjectInfoObject, InjectBuilder, makeInjectBuilder } from "./injectInfo";

export type GetServices<AllSrvs extends { [key: string]: Type | undefined }> = {
  [K in keyof AllSrvs]: UnType<NonNullable<AllSrvs[K]>>;
};

export class ServiceStorage {}

interface ServiceMeta {
  refName: string;
  name: string;
  enabled: boolean;
}

export const getServiceRefs = (refName: string) => {
  return (Reflect.getMetadata(refName, ServiceStorage.prototype) ?? []) as Type[];
};
export const getAllServiceRefs = (): Type[] => {
  const keys = Reflect.getMetadataKeys(ServiceStorage.prototype);
  return keys.map((key) => getServiceRefs(key)[0]);
};
export const setServiceRefs = (refName: string, services: Type[]) => {
  Reflect.defineMetadata(refName, services, ServiceStorage.prototype);
};
const setServiceMeta = (srvRef: Type, meta: ServiceMeta) => {
  Reflect.defineMetadata("akan:service", meta, srvRef.prototype as object);
};
export const getServiceMeta = (srvRef: Type) => {
  return Reflect.getMetadata("akan:service", srvRef.prototype as object) as ServiceMeta | undefined;
};
export const isServiceEnabled = (srvRef: Type) => {
  const meta = getServiceMeta(srvRef);
  return meta?.enabled ?? false;
};
export interface ServiceInjectMeta {
  type: "Db" | "Srv" | "Use" | "Env" | "Gen" | "Sig" | (string & {});
  name: string;
  key: string;
  generateFactory?: (...args: any[]) => any;
}
const getServiceInjectMetaMapOnPrototype = (prototype: object) => {
  return (
    (Reflect.getMetadata("inject", prototype) as Map<string, ServiceInjectMeta> | undefined) ??
    new Map<string, ServiceInjectMeta>()
  );
};
const setServiceInjectMetaMapOnPrototype = (prototype: object, injectMetaMap: Map<string, ServiceInjectMeta>) => {
  Reflect.defineMetadata("inject", injectMetaMap, prototype);
};

interface ServiceOptions {
  enabled?: boolean;
  serverMode?: "batch" | "federation";
}

export function Srv(name?: string): PropertyDecorator {
  return function (prototype: object, key: string) {
    const metadataMap = getServiceInjectMetaMapOnPrototype(prototype);
    metadataMap.set(key, { type: "Srv", key, name: name ?? capitalize(key) });
    setServiceInjectMetaMapOnPrototype(prototype, metadataMap);
  };
}
export function Use(name?: string): PropertyDecorator {
  return function (prototype: object, key: string) {
    const metadataMap = getServiceInjectMetaMapOnPrototype(prototype);
    metadataMap.set(key, { type: "Use", key, name: name ?? capitalize(key) });
    setServiceInjectMetaMapOnPrototype(prototype, metadataMap);
  };
}
export function Env(envKey: string, generateFactory?: (envValue: string, options: any) => any): PropertyDecorator {
  return function (prototype: object, key: string) {
    const metadataMap = getServiceInjectMetaMapOnPrototype(prototype);
    metadataMap.set(key, { type: "Env", key, name: envKey, generateFactory });
    setServiceInjectMetaMapOnPrototype(prototype, metadataMap);
  };
}
export function Gen(generateFactory: (options: any) => any): PropertyDecorator {
  return function (prototype: object, key: string) {
    const metadataMap = getServiceInjectMetaMapOnPrototype(prototype);
    metadataMap.set(key, { type: "Gen", key, name: capitalize(key), generateFactory });
    setServiceInjectMetaMapOnPrototype(prototype, metadataMap);
  };
}

export function Sig(name?: string): PropertyDecorator {
  return function (prototype: object, key: string) {
    const metadataMap = getServiceInjectMetaMapOnPrototype(prototype);
    metadataMap.set(key, { type: "Sig", key, name: name ?? capitalize(key) });
    setServiceInjectMetaMapOnPrototype(prototype, metadataMap);
  };
}

type ServiceSignalReturnType = { __Returns__: "Done" } | { __Returns__: "Subscribe" };
// type FilterServiceKeys<keys > = { [K in keys]: Signal[K] };

// export type Sig<Signal> = Signal extends object
//   ? { queue: BullQueue; websocket: Server } & { keys: keyof Signal }
//   : never;
export type Sig<Signal> = {
  [K in keyof Signal as Signal[K] extends (...args: any) => PromiseOrObject<ServiceSignalReturnType>
    ? K
    : never]: Signal[K] extends (...args: infer Args) => PromiseOrObject<{ __Returns__: "Done" }>
    ? (...args: Args) => Promise<Job>
    : Signal[K] extends (...args: infer Args) => PromiseOrObject<{ __Returns__: "Subscribe" } & infer Return>
      ? (...args: [...Args, data: DocumentModel<Return>]) => void
      : never;
} & { queue: BullQueue; websocket: Server };

export function Db(name: string): PropertyDecorator {
  return function (prototype: object, key: string) {
    const metadataMap = getServiceInjectMetaMapOnPrototype(prototype);
    metadataMap.set(key, { type: "Db", key, name });
    setServiceInjectMetaMapOnPrototype(prototype, metadataMap);
  };
}
export const serviceOf = (target: Type) => {
  const serviceMeta = getServiceMeta(target);
  if (!serviceMeta) throw new Error(`Service Meta of ${target.name} not found`);
  const srvRefs = getServiceRefs(serviceMeta.name);
  const srvRef = srvRefs.length === 1 ? srvRefs[0] : ExtSrvs(srvRefs[0], [target]);
  const injectMetaMap = getServiceInjectMetaMapOnPrototype(srvRef.prototype);
  for (const injectMeta of [...injectMetaMap.values()]) {
    if (injectMeta.type === "Db") InjectModel(injectMeta.name)(srvRef.prototype as object, injectMeta.key);
    else if (injectMeta.type === "Use") Inject(injectMeta.name)(srvRef.prototype as object, injectMeta.key);
    else if (injectMeta.type === "Srv") {
      const services = getServiceRefs(injectMeta.name);
      if (!services.length) throw new Error(`Service ${injectMeta.name} not found`);
      Inject(services.at(0))(srvRef.prototype as object, injectMeta.key);
    } else if (injectMeta.type === "Env") Inject(injectMeta.name)(srvRef.prototype as object, injectMeta.key);
    else if (injectMeta.type === "Gen") Inject(injectMeta.name)(srvRef.prototype as object, injectMeta.key);
    else if (injectMeta.type === "Sig") Inject(injectMeta.name)(srvRef.prototype as object, injectMeta.key);
  }
  InjectConnection()(srvRef.prototype as object, "connection"); // only for internal use
  Injectable()(srvRef);
  return srvRef;
};

export function MixSrvs<T extends Type[]>(...services: [...T]): Type<MergeAllTypes<T>> {
  if (services.length === 0) throw new Error("MixSrvs requires at least one service");

  const [baseService, ...restServices] = services;
  class Mix extends (baseService as any) {}

  const injectMetadataMap = new Map(
    restServices.reduce((acc, srvRef) => {
      const injectMetadataMap = getServiceInjectMetaMapOnPrototype(srvRef);
      applyMixins(Mix, [srvRef]);
      return [...acc, ...injectMetadataMap];
    }, [])
  );

  setServiceInjectMetaMapOnPrototype(Mix.prototype, injectMetadataMap);
  return Mix as Type<MergeAllTypes<T>>;
}

function ExtSrvs(baseSrv: Type, extSrvs: Type[]): Type {
  const injectMetadataMap = new Map(
    [baseSrv, ...extSrvs].reduce((acc, srvRef: Type) => {
      const injectMetadataMap = getServiceInjectMetaMapOnPrototype(srvRef.prototype);
      return [...acc, ...injectMetadataMap];
    }, [])
  );
  setServiceInjectMetaMapOnPrototype(baseSrv.prototype, injectMetadataMap);
  return applyMixins(baseSrv, extSrvs);
}

export const LogService = <T extends string>(name: T) => {
  class LogService {
    logger = new Logger(name);
  }
  return LogService;
};

export type DatabaseService<
  T extends string,
  Input,
  Doc,
  Obj,
  Model,
  Insight,
  Filter extends FilterInstance,
  LibSrvs extends Type[] = [],
  _Query extends ExtractQuery<Filter> = ExtractQuery<Filter>,
  _Sort extends ExtractSort<Filter> = ExtractSort<Filter>,
  _CapitalizedT extends Capitalize<T> = Capitalize<T>,
  _DataInputOfDoc extends DataInputOf<Input, Doc> = DataInputOf<Input, Doc>,
  _QueryOfDoc extends QueryOf<Doc> = QueryOf<Doc>,
  _FindQueryOption extends FindQueryOption<_Sort, Obj> = FindQueryOption<_Sort, Obj>,
  _ListQueryOption extends ListQueryOption<_Sort, Obj> = ListQueryOption<_Sort, Obj>,
  _DocObjectOfDoc = GetDocObject<Doc>,
  _MixedLibSrv = MergeAllTypes<LibSrvs>,
> = {
  logger: Logger;
  __databaseModel: Model;
  __list(query?: _QueryOfDoc, queryOption?: _ListQueryOption): Promise<Doc[]>;
  __listIds(query?: _QueryOfDoc, queryOption?: _ListQueryOption): Promise<string[]>;
  __find(query?: _QueryOfDoc, queryOption?: _FindQueryOption): Promise<Doc | null>;
  __findId(query?: _QueryOfDoc, queryOption?: _FindQueryOption): Promise<string | null>;
  __pick(query?: _QueryOfDoc, queryOption?: _FindQueryOption): Promise<Doc>;
  __pickId(query?: _QueryOfDoc, queryOption?: _FindQueryOption): Promise<string>;
  __exists(query?: _QueryOfDoc): Promise<string | null>;
  __count(query?: _QueryOfDoc): Promise<number>;
  __insight(query?: _QueryOfDoc): Promise<Insight>;
  __search(query: _QueryOfDoc, queryOption?: _ListQueryOption): Promise<{ docs: Doc[]; count: number }>;
  __searchDocs(query: _QueryOfDoc, queryOption?: _ListQueryOption): Promise<Doc[]>;
  __searchCount(query: _QueryOfDoc): Promise<number>;
  _preCreate(data: _DataInputOfDoc): PromiseOrObject<_DataInputOfDoc>;
  _postCreate(doc: Doc): Promise<Doc> | Doc;
  _preUpdate(id: string, data: Partial<Doc>): PromiseOrObject<Partial<Doc>>;
  _postUpdate(doc: Doc): Promise<Doc> | Doc;
  _preRemove(id: string): Promise<void> | void;
  _postRemove(doc: Doc): Promise<Doc> | Doc;
  listenPre: (type: SaveEventType, listener: (doc: Doc, type: CRUDEventType) => PromiseOrObject<void>) => () => void;
  listenPost: (type: SaveEventType, listener: (doc: Doc, type: CRUDEventType) => PromiseOrObject<void>) => () => void;
} & Prettify<
  { [key in `${T}Model`]: Model } & {
    [K in `get${_CapitalizedT}`]: (id: string) => Promise<Doc>;
  } & {
    [K in `load${_CapitalizedT}`]: (id?: string) => Promise<Doc | null>;
  } & {
    [K in `load${_CapitalizedT}Many`]: (ids: string[]) => Promise<Doc[]>;
  } & {
    [K in `create${_CapitalizedT}`]: (data: _DataInputOfDoc) => Promise<Doc>;
  } & {
    [K in `update${_CapitalizedT}`]: (id: string, data: Partial<Doc>) => Promise<Doc>;
  } & {
    [K in `remove${_CapitalizedT}`]: (id: string) => Promise<Doc>;
  } & {
    [K in `search${_CapitalizedT}`]: (
      searchText: string,
      queryOption?: _ListQueryOption
    ) => Promise<{ docs: Doc[]; count: number }>;
  } & {
    [K in `searchDocs${_CapitalizedT}`]: (searchText: string, queryOption?: _ListQueryOption) => Promise<Doc[]>;
  } & {
    [K in `searchCount${_CapitalizedT}`]: (searchText: string) => Promise<number>;
  } & QueryMethodPart<_Query, _Sort, Obj, Doc, Insight, _FindQueryOption, _ListQueryOption, _QueryOfDoc> & {
      [K in keyof _MixedLibSrv]: _MixedLibSrv[K] extends (...args: infer Args) => Promise<infer Value>
        ? Value extends (infer SingleValue)[]
          ? SingleValue extends DbDoc<any>
            ? _DocObjectOfDoc extends GetDocObject<SingleValue>
              ? (...args: Args) => Promise<Doc[]>
              : _MixedLibSrv[K]
            : _MixedLibSrv[K]
          : Value extends DbDoc<any>
            ? _DocObjectOfDoc extends GetDocObject<Value>
              ? (...args: Args) => Promise<Doc>
              : _MixedLibSrv[K]
            : _MixedLibSrv[K]
        : _MixedLibSrv[K];
    }
>;

export const DbService = <
  T extends string,
  Input,
  Doc extends HydratedDocument<any>,
  Model extends DatabaseModel<
    T,
    Input,
    Doc,
    Obj,
    Insight,
    Filter,
    _CapitalizedT,
    _QueryOfDoc,
    _Query,
    _Sort,
    _DataInputOfDoc,
    _FindQueryOption,
    _ListQueryOption
  >,
  Middleware extends BaseMiddleware,
  Obj,
  Insight,
  Filter extends FilterInstance,
  LibSrvs extends Type[],
  _CapitalizedT extends string = Capitalize<T>,
  _QueryOfDoc extends QueryOf<Doc> = QueryOf<Doc>,
  _Query extends ExtractQuery<Filter> = ExtractQuery<Filter>,
  _Sort extends ExtractSort<Filter> = ExtractSort<Filter>,
  _DataInputOfDoc extends DataInputOf<Input, Doc> = DataInputOf<Input, Doc>,
  _FindQueryOption extends FindQueryOption<_Sort, Obj> = FindQueryOption<_Sort, Obj>,
  _ListQueryOption extends ListQueryOption<_Sort, Obj> = ListQueryOption<_Sort, Obj>,
>(
  database: Database<T, Input, Doc, Model, Middleware, Obj, Insight, Filter>,
  ...libSrvRefs: LibSrvs
): Type<DatabaseService<T, Input, Doc, Obj, Model, Insight, Filter, LibSrvs>> => {
  const [modelName, className]: [string, string] = [database.refName, capitalize(database.refName)];
  const getDefaultDbService = () => {
    class DbService {
      logger = new Logger(`${capitalize(modelName)}Service`);
      @Use(`${modelName}Model`) __databaseModel: Model;

      async __list(query: _QueryOfDoc, queryOption?: _ListQueryOption): Promise<Doc[]> {
        return await this.__databaseModel.__list(query, queryOption);
      }
      async __listIds(query: _QueryOfDoc, queryOption?: _ListQueryOption): Promise<string[]> {
        return await this.__databaseModel.__listIds(query, queryOption);
      }
      async __find(query: _QueryOfDoc, queryOption?: _FindQueryOption): Promise<Doc | null> {
        return await this.__databaseModel.__find(query, queryOption);
      }
      async __findId(query: _QueryOfDoc, queryOption?: _FindQueryOption): Promise<string | null> {
        return await this.__databaseModel.__findId(query, queryOption);
      }
      async __pick(query: _QueryOfDoc, queryOption?: _FindQueryOption): Promise<Doc> {
        return await this.__databaseModel.__pick(query, queryOption);
      }
      async __pickId(query: _QueryOfDoc, queryOption?: _FindQueryOption): Promise<string> {
        return await this.__databaseModel.__pickId(query, queryOption);
      }
      async __exists(query: _QueryOfDoc): Promise<string | null> {
        return await this.__databaseModel.__exists(query);
      }
      async __count(query: _QueryOfDoc): Promise<number> {
        return await this.__databaseModel.__count(query);
      }
      async __insight(query: _QueryOfDoc): Promise<Insight> {
        return await this.__databaseModel.__insight(query);
      }
      async __search(searchText: string, queryOption?: _ListQueryOption): Promise<{ docs: Doc[]; count: number }> {
        return await this.__databaseModel[`search${className}`](searchText, queryOption);
      }
      async __searchDocs(searchText: string, queryOption?: _ListQueryOption): Promise<Doc[]> {
        return await this.__databaseModel[`searchDocs${className}`](searchText, queryOption);
      }
      async __searchCount(searchText: string): Promise<number> {
        return await this.__databaseModel[`searchCount${className}`](searchText);
      }

      async _preCreate(data: _DataInputOfDoc): Promise<_DataInputOfDoc> {
        return data;
      }
      async _postCreate(doc: Doc): Promise<Doc> {
        return doc;
      }
      async _preUpdate(id: string, data: Partial<Doc>): Promise<Partial<Doc>> {
        return data;
      }
      async _postUpdate(doc: Doc): Promise<Doc> {
        return doc;
      }
      async _preRemove(id: string) {
        return;
      }
      async _postRemove(doc: Doc): Promise<Doc> {
        return doc;
      }
      listenPre(type: SaveEventType, listener: (doc: Doc, type: CRUDEventType) => PromiseOrObject<void>) {
        return this.__databaseModel.listenPre(type, listener);
      }
      listenPost(type: SaveEventType, listener: (doc: Doc, type: CRUDEventType) => PromiseOrObject<void>) {
        return this.__databaseModel.listenPost(type, listener);
      }
      async [`get${className}`](id: string) {
        return await this.__databaseModel[`get${className}`](id);
      }
      async [`load${className}`](id?: string) {
        return await this.__databaseModel[`load${className}`](id);
      }
      async [`load${className}Many`](ids: string[]) {
        return await this.__databaseModel[`load${className}Many`](ids);
      }
      async [`create${className}`](data: _DataInputOfDoc): Promise<Doc> {
        const input = await this._preCreate(data);
        const doc = await this.__databaseModel[`create${className}`](input);
        return await this._postCreate(doc);
      }
      async [`update${className}`](id: string, data: _DataInputOfDoc): Promise<Doc> {
        const input = await this._preUpdate(id, data as unknown as Partial<Doc>);
        const doc = await this.__databaseModel[`update${className}`](id, input);
        return await this._postUpdate(doc);
      }
      async [`remove${className}`](id: string): Promise<Doc> {
        await this._preRemove(id);
        const doc = await this.__databaseModel[`remove${className}`](id);
        return await this._postRemove(doc);
      }
      async [`search${className}`](query: _QueryOfDoc, queryOption?: _ListQueryOption) {
        return await this.__databaseModel[`search${className}`](query, queryOption);
      }
      async [`searchDocs${className}`](query: _QueryOfDoc, queryOption?: _ListQueryOption) {
        return await this.__databaseModel[`searchDocs${className}`](query, queryOption);
      }
      async [`searchCount${className}`](query: _QueryOfDoc) {
        return await this.__databaseModel[`searchCount${className}`](query);
      }
    }
    Use(`${modelName}Model`)(DbService.prototype, `${modelName}Model`);
    return DbService;
  };
  const getQueryDataFromKey = (queryKey: string, args: any): { query: any; queryOption: any } => {
    const lastArg = args.at(-1);
    const hasQueryOption =
      lastArg &&
      typeof lastArg === "object" &&
      (typeof lastArg.select === "object" ||
        typeof lastArg.skip === "number" ||
        typeof lastArg.limit === "number" ||
        typeof lastArg.sort === "string");
    const queryFn = getFilterQuery(database.Filter, queryKey);
    const query = queryFn(...(hasQueryOption ? args.slice(0, -1) : args));
    const queryOption = hasQueryOption ? lastArg : {};
    return { query, queryOption };
  };
  const DbService = libSrvRefs.length > 0 ? MixSrvs(...libSrvRefs) : getDefaultDbService();
  const filterKeyMetaMap = getFilterKeyMetaMapOnPrototype(database.Filter.prototype);
  const queryKeys = [...filterKeyMetaMap.keys()];
  queryKeys.forEach((queryKey) => {
    const queryFn = getFilterQuery(database.Filter, queryKey);
    DbService.prototype[`list${capitalize(queryKey)}`] = async function (...args: any) {
      const { query, queryOption } = getQueryDataFromKey(queryKey, args);
      return this.__list(query, queryOption);
    };
    DbService.prototype[`listIds${capitalize(queryKey)}`] = async function (...args: any) {
      const { query, queryOption } = getQueryDataFromKey(queryKey, args);
      return this.__listIds(query, queryOption);
    };
    DbService.prototype[`find${capitalize(queryKey)}`] = async function (...args: any) {
      const { query, queryOption } = getQueryDataFromKey(queryKey, args);
      return this.__find(query, queryOption);
    };
    DbService.prototype[`findId${capitalize(queryKey)}`] = async function (...args: any) {
      const { query, queryOption } = getQueryDataFromKey(queryKey, args);
      return this.__findId(query, queryOption);
    };
    DbService.prototype[`pick${capitalize(queryKey)}`] = async function (...args: any) {
      const { query, queryOption } = getQueryDataFromKey(queryKey, args);
      return this.__pick(query, queryOption);
    };
    DbService.prototype[`pickId${capitalize(queryKey)}`] = async function (...args: any) {
      const { query, queryOption } = getQueryDataFromKey(queryKey, args);
      return this.__pickId(query, queryOption);
    };
    DbService.prototype[`exists${capitalize(queryKey)}`] = async function (...args: any) {
      const query = queryFn(...args);
      return this.__exists(query);
    };
    DbService.prototype[`count${capitalize(queryKey)}`] = async function (...args: any) {
      const query = queryFn(...args);
      return this.__count(query);
    };
    DbService.prototype[`insight${capitalize(queryKey)}`] = async function (...args: any) {
      const query = queryFn(...args);
      return this.__insight(query);
    };
    DbService.prototype[`query${capitalize(queryKey)}`] = function (...args: any) {
      return queryFn(...args);
    };
  });

  return DbService as any;
};

export function serve<Injection extends InjectBuilder>(
  refName: string,
  injectBuilder: Injection,
  ...extendSrvs: Type[]
): Type<{ logger: Logger } & ExtractInjectInfoObject<ReturnType<Injection>>>;
export function serve<Injection extends InjectBuilder>(
  refName: string,
  option: ServiceOptions,
  injectBuilder: Injection,
  ...extendSrvs: Type[]
): Type<{ logger: Logger } & ExtractInjectInfoObject<ReturnType<Injection>>>;
export function serve<
  T extends string,
  Input,
  Doc,
  Model,
  Middleware extends BaseMiddleware,
  Obj,
  Insight,
  Filter extends FilterInstance,
  Injection extends InjectBuilder,
  LibSrvs extends Type[] = [],
>(
  db: Database<T, Input, Doc, Model, Middleware, Obj, Insight, Filter>,
  injectBuilder: Injection,
  ...extendSrvs: LibSrvs
): Type<
  DatabaseService<T, Input, Doc, Obj, Model, Insight, Filter, LibSrvs> & ExtractInjectInfoObject<ReturnType<Injection>>
>;
export function serve<
  T extends string,
  Input,
  Doc,
  Model,
  Middleware extends BaseMiddleware,
  Obj,
  Insight,
  Filter extends FilterInstance,
  Injection extends InjectBuilder,
  LibSrvs extends Type[] = [],
>(
  db: Database<T, Input, Doc, Model, Middleware, Obj, Insight, Filter>,
  injectBuilder: Injection,
  ...extendSrvs: LibSrvs
): Type<
  DatabaseService<T, Input, Doc, Obj, Model, Insight, Filter, LibSrvs> & ExtractInjectInfoObject<ReturnType<Injection>>
>;

export function serve<
  T extends string,
  Input,
  Doc,
  Model,
  Middleware extends BaseMiddleware,
  Obj,
  Insight,
  Filter extends FilterInstance,
  Injection extends InjectBuilder,
  LibSrvs extends Type[] = [],
>(
  db: Database<T, Input, Doc, Model, Middleware, Obj, Insight, Filter>,
  option: ServiceOptions,
  injectBuilder: Injection,
  ...extendSrvs: LibSrvs
): Type<
  DatabaseService<T, Input, Doc, Obj, Model, Insight, Filter, LibSrvs> & ExtractInjectInfoObject<ReturnType<Injection>>
>;

export function serve(
  refNameOrDb: string | Database<any, any, any, any, any, any, any, any>,
  optionOrInjectBuilder: ServiceOptions | InjectBuilder,
  injectBuilderOrExtendSrv?: InjectBuilder | Type,
  ...extendSrvs: Type[]
) {
  const refName = typeof refNameOrDb === "string" ? lowerlize(refNameOrDb) : refNameOrDb.refName;
  const option = typeof optionOrInjectBuilder === "object" ? optionOrInjectBuilder : { enabled: true };
  const injectBuilder =
    typeof optionOrInjectBuilder === "function" ? optionOrInjectBuilder : (injectBuilderOrExtendSrv as InjectBuilder);
  const extSrvs = [
    ...(typeof optionOrInjectBuilder === "function" && injectBuilderOrExtendSrv ? [injectBuilderOrExtendSrv] : []),
    ...extendSrvs,
  ] as Type[];
  const srvRef = typeof refNameOrDb === "string" ? LogService(refNameOrDb) : DbService(refNameOrDb, ...extSrvs);
  const isEnabled =
    option.enabled ??
    (!option.serverMode || process.env.SERVER_MODE === option.serverMode || process.env.SERVER_MODE === "all");
  const serviceMeta: ServiceMeta = { refName, name: `${capitalize(refName)}Service`, enabled: isEnabled };
  setServiceMeta(srvRef, serviceMeta);
  Object.entries(injectBuilder(makeInjectBuilder())).forEach(([key, injectInfo]) => {
    injectInfo.applyInjectInfo(srvRef, key);
  });
  return srvRef as Type;
}

export const makeProvidersForSrv = (srvRef: Type): Provider[] => {
  const injectMetaMap = getServiceInjectMetaMapOnPrototype(srvRef.prototype);
  const providers: Provider[] = [];
  [...injectMetaMap.values()].forEach((injectMeta) => {
    if (injectMeta.type === "Env") {
      const envValue = process.env[injectMeta.name];
      const generateFactory = injectMeta.generateFactory;
      if (envValue === undefined) throw new Error(`Environment variable ${injectMeta.name} not found`);
      providers.push({
        provide: injectMeta.name,
        useFactory: (env: BackendEnv) => (generateFactory ? generateFactory(envValue, env) : envValue),
        inject: ["GLOBAL_ENV"],
      });
    } else if (injectMeta.type === "Gen") {
      const generateFactory = injectMeta.generateFactory;
      if (!generateFactory) throw new Error(`Generate factory not found for ${injectMeta.key}`);
      providers.push({ provide: injectMeta.name, useFactory: generateFactory, inject: ["GLOBAL_ENV"] });
    }
  });
  return providers;
};
