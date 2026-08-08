import type { PromiseOrObject } from "akanjs/base";
import { capitalize } from "akanjs/common";
import type { QueryOf } from "akanjs/constant";
import {
  assertFilterFitsCrud,
  type CRUDEventType,
  type DatabaseModel,
  type DataInputOf,
  type Doc,
  type DocumentUpdateInput,
  documentQueryHelper,
  type FindQueryOption,
  fillMissingFilterArgs,
  getFilterInfoByKey,
  getFilterMeta,
  type ListQueryOption,
  type SaveEventType,
  type UpdateChain,
} from "akanjs/document";
import type { DatabaseService, ServiceCls } from "akanjs/service";
import type { CascadeRunner } from "./CascadeRunner";

export class ServiceResolver {
  static #getDefaultDbServiceMethods(refName: string, className: string, cascade: CascadeRunner) {
    const dbServiceMethods = {
      async __get(this: DatabaseService, id: string) {
        return await this.__databaseModel.__get(id);
      },
      async [`get${className}`](this: DatabaseService, id: string) {
        return this.__get(id);
      },
      async __load(this: DatabaseService, id?: string) {
        return await this.__databaseModel.__load(id);
      },
      async [`load${className}`](this: DatabaseService, id?: string) {
        return this.__load(id);
      },
      async __loadMany(this: DatabaseService, ids: string[]) {
        return await this.__databaseModel.__loadMany(ids);
      },
      async [`load${className}Many`](this: DatabaseService, ids: string[]) {
        return this.__loadMany(ids);
      },
      async __list(this: DatabaseService, query: QueryOf<any>, queryOption?: ListQueryOption) {
        return await this.__databaseModel.__list(query, queryOption);
      },
      async __listIds(this: DatabaseService, query: QueryOf<any>, queryOption?: ListQueryOption) {
        return await this.__databaseModel.__listIds(query, queryOption);
      },
      async __find(this: DatabaseService, query: QueryOf<any>, queryOption?: FindQueryOption) {
        return await this.__databaseModel.__find(query, queryOption);
      },
      async __findId(this: DatabaseService, query: QueryOf<any>, queryOption?: FindQueryOption) {
        return await this.__databaseModel.__findId(query, queryOption);
      },
      async __pick(this: DatabaseService, query: QueryOf<any>, queryOption?: FindQueryOption) {
        return await this.__databaseModel.__pick(query, queryOption);
      },
      async __pickId(this: DatabaseService, query: QueryOf<any>, queryOption?: FindQueryOption) {
        return await this.__databaseModel.__pickId(query, queryOption);
      },
      async __exists(this: DatabaseService, query: QueryOf<any>) {
        return await this.__databaseModel.__exists(query);
      },
      async __count(this: DatabaseService, query: QueryOf<any>) {
        return await this.__databaseModel.__count(query);
      },
      async __insight(this: DatabaseService, query: QueryOf<any>) {
        return await this.__databaseModel.__insight(query);
      },
      listenPre(
        this: DatabaseService,
        type: SaveEventType,
        listener: (doc: Doc, type: CRUDEventType) => PromiseOrObject<void>,
      ) {
        return this.__databaseModel.listenPre(type, listener);
      },
      listenPost(
        this: DatabaseService,
        type: SaveEventType,
        listener: (doc: Doc, type: CRUDEventType) => PromiseOrObject<void>,
      ) {
        return this.__databaseModel.listenPost(type, listener);
      },
      async __create(this: DatabaseService, data: DataInputOf) {
        const input = await this.__libsPreCreate(data);
        const doc = await this.__databaseModel.__create(input);
        return await this.__libsPostCreate(doc);
      },
      async [`create${className}`](this: DatabaseService, data: DataInputOf) {
        return this.__create(data);
      },
      async __update(this: DatabaseService, id: string, data: DataInputOf) {
        const input = await this.__libsPreUpdate(id, data);
        const doc = await this.__databaseModel.__update(id, input);
        return await this.__libsPostUpdate(doc);
      },
      async [`update${className}`](this: DatabaseService, id: string, data: DataInputOf) {
        return this.__update(id, data);
      },
      async __remove(this: DatabaseService, id: string): Promise<Doc> {
        await this.__libsPreRemove(id);
        const doc = await this.__databaseModel.__remove(id);
        const removed = await this.__libsPostRemove(doc);
        await cascade.run(refName, removed as Record<string, unknown>);
        return removed;
      },
      async [`remove${className}`](this: DatabaseService, id: string): Promise<Doc> {
        return this.__remove(id);
      },
      async __removeMany(this: DatabaseService, query: QueryOf<any>) {
        return await this.__databaseModel.__removeMany(query);
      },
      async __removeOne(this: DatabaseService, query: QueryOf<any>) {
        return await this.__databaseModel.__removeOne(query);
      },
      async __updateMany(this: DatabaseService, query: QueryOf<any>, update: DocumentUpdateInput) {
        return await this.__databaseModel.__updateMany(query, update);
      },
      async __updateOne(this: DatabaseService, query: QueryOf<any>, update: DocumentUpdateInput) {
        return await this.__databaseModel.__updateOne(query, update);
      },
    };
    return dbServiceMethods;
  }
  static resolveDatabaseService(database: DatabaseModel, srvRef: ServiceCls, cascade: CascadeRunner): ServiceCls {
    const className = capitalize(database.refName);
    Object.assign(srvRef.prototype, ServiceResolver.#getDefaultDbServiceMethods(database.refName, className, cascade));
    const getQueryDataFromKey = (queryKey: string, args: any): { query: any; queryOption: any } => {
      const lastArg = args.at(-1);
      const hasQueryOption =
        lastArg &&
        typeof lastArg === "object" &&
        (typeof lastArg.select === "object" ||
          typeof lastArg.skip === "number" ||
          typeof lastArg.limit === "number" ||
          typeof lastArg.sort === "string");
      const filterInfo = getFilterInfoByKey(database.filter, queryKey);
      const queryFn = filterInfo.queryFn;
      if (!queryFn) throw new Error(`No query function for key: ${queryKey}`);
      const queryArgs = fillMissingFilterArgs(filterInfo, hasQueryOption ? args.slice(0, -1) : args);
      const query = queryFn(...queryArgs, documentQueryHelper);
      const queryOption = hasQueryOption ? lastArg : {};
      return { query, queryOption };
    };
    const filterMeta = getFilterMeta(database.filter);
    const queryKeys = Object.keys(filterMeta.query);
    queryKeys.forEach((queryKey) => {
      const filterInfo = getFilterInfoByKey(database.filter, queryKey);
      const queryFn = filterInfo.queryFn;
      if (!queryFn) throw new Error(`No query function for key: ${queryKey}`);
      const capitalizedQueryKey = capitalize(queryKey);
      assertFilterFitsCrud(database.refName, queryKey, className);
      Object.assign(srvRef.prototype, {
        [`list${capitalizedQueryKey}`]: async function (this: DatabaseService, ...args: any) {
          const { query, queryOption } = getQueryDataFromKey(queryKey, args);
          return this.__list(query, queryOption);
        },
        [`listIds${capitalizedQueryKey}`]: async function (this: DatabaseService, ...args: any) {
          const { query, queryOption } = getQueryDataFromKey(queryKey, args);
          return this.__listIds(query, queryOption);
        },
        [`find${capitalizedQueryKey}`]: async function (this: DatabaseService, ...args: any) {
          const { query, queryOption } = getQueryDataFromKey(queryKey, args);
          return this.__find(query, queryOption);
        },
        [`findId${capitalizedQueryKey}`]: async function (this: DatabaseService, ...args: any) {
          const { query, queryOption } = getQueryDataFromKey(queryKey, args);
          return this.__findId(query, queryOption);
        },
        [`pick${capitalizedQueryKey}`]: async function (this: DatabaseService, ...args: any) {
          const { query, queryOption } = getQueryDataFromKey(queryKey, args);
          return this.__pick(query, queryOption);
        },
        [`pickId${capitalizedQueryKey}`]: async function (this: DatabaseService, ...args: any) {
          const { query, queryOption } = getQueryDataFromKey(queryKey, args);
          return this.__pickId(query, queryOption);
        },
        [`exists${capitalizedQueryKey}`]: async function (this: DatabaseService, ...args: any) {
          const { query } = getQueryDataFromKey(queryKey, args);
          return this.__exists(query);
        },
        [`count${capitalizedQueryKey}`]: async function (this: DatabaseService, ...args: any) {
          const { query } = getQueryDataFromKey(queryKey, args);
          return this.__count(query);
        },
        [`insight${capitalize(queryKey)}`]: async function (this: DatabaseService, ...args: any) {
          const { query } = getQueryDataFromKey(queryKey, args);
          return this.__insight(query);
        },
        [`query${capitalize(queryKey)}`]: function (this: DatabaseService, ...args: any) {
          return queryFn(...fillMissingFilterArgs(filterInfo, args), documentQueryHelper);
        },
        [`remove${capitalizedQueryKey}`]: async function (this: DatabaseService, ...args: any) {
          const { query } = getQueryDataFromKey(queryKey, args);
          return this.__removeMany(query);
        },
        [`removeOne${capitalizedQueryKey}`]: async function (this: DatabaseService, ...args: any) {
          const { query } = getQueryDataFromKey(queryKey, args);
          return this.__removeOne(query);
        },
        [`update${capitalizedQueryKey}`]: function (this: DatabaseService, ...args: any): UpdateChain {
          const { query } = getQueryDataFromKey(queryKey, args);
          return { set: (update) => this.__updateMany(query, update) };
        },
        [`updateOne${capitalizedQueryKey}`]: function (this: DatabaseService, ...args: any): UpdateChain {
          const { query } = getQueryDataFromKey(queryKey, args);
          return { set: (update) => this.__updateOne(query, update) };
        },
      });
    });
    return srvRef;
  }
}
