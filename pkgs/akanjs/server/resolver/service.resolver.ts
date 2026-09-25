import type { PromiseOrObject } from "akanjs/base";
import { capitalize } from "akanjs/common";
import { type ConstantModel, ConstantRegistry, type QueryOf } from "akanjs/constant";
import {
  type CRUDEventType,
  type DatabaseModel,
  type DataInputOf,
  type Doc,
  documentQueryHelper,
  type FindQueryOption,
  fillMissingFilterArgs,
  getFilterInfoByKey,
  getFilterMeta,
  type ListQueryOption,
  type SaveEventType,
} from "akanjs/document";
import type { DatabaseService, ServiceCls } from "akanjs/service";

export class ServiceResolver {
  static #getDefaultDbServiceMethods(
    className: string,
    cascades: [string, string][],
    getService: (refName: string) => DatabaseService,
  ) {
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
        // Resolved before anything is mutated: a model cascading into a module the app never mounted is a
        // misconfiguration, and failing after the parent is already gone would leave it half-removed.
        const targets = cascades.map(([key, refName]) => [key, getService(refName)] as const);
        await this.__libsPreRemove(id);
        const doc = await this.__databaseModel.__remove(id);
        const removed = await this.__libsPostRemove(doc);
        for (const [key, target] of targets) {
          const value = (removed as Record<string, unknown>)[key];
          const ids = (Array.isArray(value) ? value : [value]).filter((v): v is string => typeof v === "string");
          // Through the target's own service, never its model: that is what runs its `_postRemove`, which is where
          // a module puts the side effect that has to accompany the removal — deleting the stored object, say.
          for (const targetId of ids) await target.__remove(targetId);
        }
        return removed;
      },
      async [`remove${className}`](this: DatabaseService, id: string): Promise<Doc> {
        return this.__remove(id);
      },
    };
    return dbServiceMethods;
  }
  static resolveDatabaseService(
    constant: ConstantModel,
    database: DatabaseModel,
    srvRef: ServiceCls,
    getService: (refName: string) => DatabaseService,
  ): ServiceCls {
    const className = capitalize(database.refName);
    // Resolved here rather than in the constant: a target model is registered after the class that references it,
    // so its refName is not knowable at the point the field is declared.
    const cascades = [...constant.full.cascade.remove].map(
      ([key, modelRef]) => [key, ConstantRegistry.getRefName(modelRef)] as [string, string],
    );
    Object.assign(srvRef.prototype, ServiceResolver.#getDefaultDbServiceMethods(className, cascades, getService));
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
      });
    });
    return srvRef;
  }
}
