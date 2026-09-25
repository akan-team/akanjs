import type { PromiseOrObject } from "akanjs/base";
import { applyMixins, capitalize } from "akanjs/common";
import { type ConstantModel, DEFAULT_PAGE_SIZE, type QueryOf } from "akanjs/constant";
import {
  CacheDatabase,
  type CRUDEventType,
  type DatabaseInstance,
  type DatabaseModel,
  type DataInputOf,
  DataLoader,
  DocumentSchema,
  type DocumentUpdateInput,
  documentQueryHelper,
  type FindQueryOption,
  fillMissingFilterArgs,
  getFilterInfoByKey,
  getFilterMeta,
  getFilterSortByKey,
  getLoaderInfos,
  type ListQueryOption,
  type Mdl,
  type SaveEventType,
} from "akanjs/document";
import {
  type AdaptorCls,
  adapt,
  CacheAdaptorRole,
  type DatabaseAdaptor,
  DatabaseAdaptorRole,
  type DocumentStore,
} from "akanjs/service";
import { getCurrentTrace, traceDataLoaderBatch } from "akanjs/signal";

/**
 * Times a store query and records it against the active request trace (no-op when
 * tracing is disabled). Used to surface "queries per request" and DB latency share.
 */
const timedQuery = async <T>(fn: () => Promise<T>): Promise<T> => {
  const trace = getCurrentTrace();
  if (!trace) return await fn();
  const start = performance.now();
  try {
    return await fn();
  } finally {
    trace.countDbQuery(performance.now() - start);
  }
};

export class DatabaseResolver {
  static resolveDatabase(constant: ConstantModel, database: DatabaseModel): AdaptorCls<DatabaseInstance> {
    const [modelName, className]: [string, string] = [database.refName, capitalize(database.refName)];
    // `sort` stays null when the caller named none, so the store can pick relevance order for a text search and
    // its own default otherwise. Defaulting to "latest" here would make every search look explicitly sorted.
    const resolveSort = (sortKey?: string | null) =>
      sortKey ? (getFilterSortByKey(database.filter, sortKey) as { [key: string]: 1 | -1 }) : null;
    const getListQuery = (query?: QueryOf<any>, queryOption?: ListQueryOption) => {
      const find = query ?? {};
      const sort = resolveSort(queryOption?.sort);
      const skip = Number(queryOption?.skip ?? 0);
      const limit = queryOption?.limit === null ? DEFAULT_PAGE_SIZE : Number(queryOption?.limit ?? 0);
      const select = queryOption?.select;
      const sample = queryOption?.sample;
      return { find, sort, skip, limit, select, sample };
    };
    const getFindQuery = (query?: QueryOf<any>, queryOption?: FindQueryOption) => {
      const find = query ?? {};
      const sort = resolveSort(queryOption?.sort);
      const skip = Number(queryOption?.skip ?? 0);
      const select = queryOption?.select;
      const sample = queryOption?.sample ?? false;
      return { find, sort, skip, select, sample };
    };
    const schema = new DocumentSchema();
    database.model._onSchema(schema as any);
    database.model._libsOnSchema(schema as any);
    const filterMeta = getFilterMeta(database.filter);
    const indexedSortFieldKeys = new Set<string>();
    for (const sort of Object.values(filterMeta.sort)) {
      if (!sort || typeof sort !== "object") continue;
      const sortFields = Object.entries(sort as Record<string, 1 | -1>);
      if (!sortFields.length) continue;
      const fields = Object.fromEntries([["removedAt", 1] as const, ...sortFields]);
      const key = Object.keys(fields).join(",");
      if (indexedSortFieldKeys.has(key)) continue;
      indexedSortFieldKeys.add(key);
      schema.index(fields);
    }

    class DatabaseModelInstance extends adapt(`${modelName}Model`, ({ plug }) => ({
      __database: plug(DatabaseAdaptorRole, (database) => database),
      __cache: plug(CacheAdaptorRole, (cache) => new CacheDatabase(modelName, cache)),
      [`${modelName}Cache` as never]: plug(CacheAdaptorRole, (cache) => new CacheDatabase(modelName, cache)),
    })) {
      declare readonly __database: DatabaseAdaptor;
      __store!: DocumentStore;
      __model!: Mdl<any, any>;
      __loader!: DataLoader<string, any, string>;

      override async onInit() {
        this.__store = this.__database.getStore(constant, database, schema);
        await this.__store.ensure();
        this.__model = this.#createModelFacade() as unknown as Mdl<any, any>;
        this.__loader = new DataLoader<string, any>(
          async (ids) => {
            traceDataLoaderBatch(ids.length);
            const docs = await timedQuery(() => this.__store.find({ id: documentQueryHelper.oneOf([...ids]) }));
            const byId = new Map(docs.map((doc) => [String(doc.id), doc]));
            return ids.map((id) => byId.get(String(id)) ?? null);
          },
          { name: `${modelName}Loader`, cache: false },
        );
        Object.assign(this, {
          [className]: this.__model,
          [`${modelName}Loader`]: this.__loader,
        });
        Object.entries(getLoaderInfos(database.model)).forEach(([key, loaderInfo]) => {
          Object.assign(this, {
            [key]: new DataLoader<any, any>(async (keys) => {
              traceDataLoaderBatch(keys.length);
              if (loaderInfo.type === "query") {
                const fields = loaderInfo.field as string[];
                const query = { kind: "any", queries: keys } as QueryOf<unknown>;
                const docs = await timedQuery(() =>
                  this.__store.find(documentQueryHelper.all(loaderInfo.defaultQuery, query)),
                );
                const byKey = new Map(docs.map((doc) => [fields.map((field) => String(doc[field])).join(""), doc]));
                return keys.map(
                  (queryKey) => byKey.get(fields.map((field) => String(queryKey[field])).join("")) ?? null,
                );
              }
              const field = loaderInfo.field as string;
              const query = {
                [field]: documentQueryHelper.oneOf([...keys]),
              };
              const docs = await timedQuery(() =>
                this.__store.find(documentQueryHelper.all(loaderInfo.defaultQuery, query)),
              );
              if (loaderInfo.type === "arrayField") {
                const byKey = new Map<string, unknown>();
                for (const doc of docs) {
                  const values = Array.isArray(doc[field]) ? doc[field] : [];
                  for (const value of values) if (!byKey.has(String(value))) byKey.set(String(value), doc);
                }
                return keys.map((key) => byKey.get(String(key)) ?? null);
              }
              const byKey = new Map(docs.map((doc) => [String(doc[field]), doc]));
              return keys.map((key) => byKey.get(String(key)) ?? null);
            }),
          });
        });
      }

      #createModelFacade() {
        const store = this.__store;
        function Model(this: any, data: Record<string, unknown>) {
          return store.hydrate(data);
        }
        const createFindManyChain = (
          query: QueryOf<any>,
          options: { sort?: any; skip?: number; limit?: number; select?: any } = {},
        ) => {
          const chain: any = {
            sort(sort: any) {
              return createFindManyChain(query, { ...options, sort });
            },
            skip(skip: number) {
              return createFindManyChain(query, { ...options, skip });
            },
            limit(limit: number) {
              return createFindManyChain(query, { ...options, limit });
            },
            select(select?: any) {
              return createFindManyChain(query, { ...options, select });
            },
            // biome-ignore lint/suspicious/noThenProperty: model facade intentionally supports Mongoose-style awaitable queries.
            then(resolve: (value: any[]) => void, reject: (reason: unknown) => void) {
              return store.find(query, options).then(resolve, reject);
            },
            catch(reject: (reason: unknown) => void) {
              return store.find(query, options).catch(reject);
            },
          };
          return chain;
        };
        const createFindOneChain = (query: QueryOf<any>, options: { sort?: any; skip?: number; select?: any } = {}) => {
          const chain: any = {
            sort(sort: any) {
              return createFindOneChain(query, { ...options, sort });
            },
            skip(skip: number) {
              return createFindOneChain(query, { ...options, skip });
            },
            select(select?: any) {
              return createFindOneChain(query, { ...options, select });
            },
            // biome-ignore lint/suspicious/noThenProperty: model facade intentionally supports Mongoose-style awaitable queries.
            then(resolve: (value: any | null) => void, reject: (reason: unknown) => void) {
              return store.findOne(query, options).then(resolve, reject);
            },
            catch(reject: (reason: unknown) => void) {
              return store.findOne(query, options).catch(reject);
            },
          };
          return chain;
        };
        return Object.assign(Model, {
          refName: modelName,
          pickOne: (query: QueryOf<any>, projection?: any) => store.pickOne(query, { select: projection }),
          pickById: (id: string | undefined, projection?: any) => {
            if (!id) throw new Error("No Document ID");
            return store.findOne({ id }, { select: projection }).then((doc) => {
              if (!doc) throw new Error(`No Document (${modelName}): ${id}`);
              return doc;
            });
          },
          exists: async (query: QueryOf<any>) => await store.exists(query),
          sample: (query: QueryOf<any>, size = 1) => store.find(query, { sample: size, limit: size }),
          sampleOne: (query: QueryOf<any>) => store.findOne(query, { sample: true }),
          find: (query: QueryOf<any>) => createFindManyChain(query),
          findOne: (query: QueryOf<any>) => createFindOneChain(query),
          findById: (id: string | undefined) => (id ? store.findOne({ id }) : Promise.resolve(null)),
          countDocuments: (query: QueryOf<any>) => store.count(query),
          updateOne: (query: QueryOf<any>, update: DocumentUpdateInput, options?: { upsert?: boolean }) =>
            store.updateOneByQuery(query, update, options),
          updateMany: (query: QueryOf<any>, update: DocumentUpdateInput) => store.updateManyByQuery(query, update),
          deleteMany: (query: QueryOf<any>) => store.deleteManyByQuery(query),
          bulkWrite: (
            operations: { updateOne: { filter: QueryOf<any>; update: DocumentUpdateInput; upsert?: boolean } }[],
          ) => store.bulkWrite(operations),
          listenPre: (type: SaveEventType, listener: (doc: any, type: CRUDEventType) => PromiseOrObject<void>) =>
            schema.pre(type, function (this: any, _next, crudType) {
              return listener(this, crudType ?? "update");
            }),
          listenPost: (type: SaveEventType, listener: (doc: any, type: CRUDEventType) => PromiseOrObject<void>) =>
            schema.post(type, function (this: any, _next, crudType) {
              return listener(this, crudType ?? "update");
            }),
        });
      }

      async __list(query?: QueryOf<any>, queryOption?: ListQueryOption): Promise<any[]> {
        const { find, sort, skip, limit, sample, select } = getListQuery(query, queryOption);
        return await timedQuery(() => this.__store.find(find, { sort, skip, limit, sample, select }));
      }
      async __listIds(query?: QueryOf<any>, queryOption?: ListQueryOption): Promise<string[]> {
        const { find, sort, skip, limit, sample } = getListQuery(query, queryOption);
        return await timedQuery(() => this.__store.findIds(find, { sort, skip, limit, sample }));
      }
      async __find(query?: QueryOf<any>, queryOption?: FindQueryOption): Promise<any | null> {
        const { find, sort, skip, sample, select } = getFindQuery(query, queryOption);
        return await timedQuery(() => this.__store.findOne(find, { sort, skip, sample, select }));
      }
      async __findId(query?: QueryOf<any>, queryOption?: FindQueryOption): Promise<string | null> {
        const { find, sort, skip, sample } = getFindQuery(query, queryOption);
        return await timedQuery(() => this.__store.findId(find, { sort, skip, sample }));
      }
      async __pick(query?: QueryOf<any>, queryOption?: FindQueryOption): Promise<any> {
        const { find, sort, skip, sample, select } = getFindQuery(query, queryOption);
        return await this.__store.pickOne(find, { sort, skip, sample, select });
      }
      async __pickId(query?: QueryOf<any>, queryOption?: FindQueryOption): Promise<string> {
        const { find, sort, skip, sample } = getFindQuery(query, queryOption);
        const id = await this.__store.findId(find, { sort, skip, sample });
        if (!id) throw new Error(`No Document (${database.refName}): ${JSON.stringify(query)}`);
        return id;
      }
      async __exists(query?: QueryOf<any>): Promise<string | null> {
        return await this.__store.exists(query);
      }
      async __count(query?: QueryOf<any>): Promise<number> {
        return await timedQuery(() => this.__store.count(query));
      }
      async __insight(query?: QueryOf<any>): Promise<any> {
        return await this.__store.insight(query);
      }
      listenPre(type: SaveEventType, listener: (doc: any, type: CRUDEventType) => PromiseOrObject<void>) {
        schema.pre(type, function (this: any, _next, crudType) {
          return listener(this, crudType ?? "update");
        });
        return () => undefined;
      }
      listenPost(type: SaveEventType, listener: (doc: any, type: CRUDEventType) => PromiseOrObject<void>) {
        schema.post(type, function (this: any, _next, crudType) {
          return listener(this, crudType ?? "update");
        });
        return () => undefined;
      }
      async __get(id: string) {
        const doc = await this.__loader.load(id);
        if (!doc) throw new Error(`No Document (${database.refName}): ${id}`);
        return doc;
      }
      async [`get${className}`](id: string) {
        return this.__get(id);
      }
      async __load(id?: string) {
        return (id ? await this.__loader.load(id) : null) as any | null;
      }
      async [`load${className}`](id?: string) {
        return this.__load(id);
      }
      async __loadMany(ids: string[]) {
        return await this.__loader.loadMany(ids);
      }
      async [`load${className}Many`](ids: string[]) {
        return this.__loadMany(ids);
      }
      async clone(data: DataInputOf<any, any> & { id: string }) {
        return await this.__store.clone(data);
      }
      async __create(data: DataInputOf<any, any>) {
        return await timedQuery(() => this.__store.create(data));
      }
      async [`create${className}`](data: DataInputOf<any, any>) {
        return this.__create(data);
      }
      async __update(id: string, data: DataInputOf<any, any>) {
        return await timedQuery(() => this.__store.update(id, data));
      }
      async [`update${className}`](id: string, data: DataInputOf<any, any>) {
        return this.__update(id, data);
      }
      async __remove(id: string) {
        return await this.__store.remove(id);
      }
      async [`remove${className}`](id: string) {
        return this.__remove(id);
      }
    }

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
    Object.entries(filterMeta.query).forEach(([queryKey, filterInfo]) => {
      const queryFn = filterInfo.queryFn;
      if (!queryFn) throw new Error(`No query function for key: ${queryKey}`);
      Object.assign(DatabaseModelInstance.prototype, {
        [`list${capitalize(queryKey)}`]: async function (...args: any) {
          const { query, queryOption } = getQueryDataFromKey(queryKey, args);
          return (this as unknown as DatabaseInstance).__list(query, queryOption);
        },
        [`listIds${capitalize(queryKey)}`]: async function (...args: any) {
          const { query, queryOption } = getQueryDataFromKey(queryKey, args);
          return (this as unknown as DatabaseInstance).__listIds(query, queryOption);
        },
        [`find${capitalize(queryKey)}`]: async function (...args: any) {
          const { query, queryOption } = getQueryDataFromKey(queryKey, args);
          return (this as unknown as DatabaseInstance).__find(query, queryOption);
        },
        [`findId${capitalize(queryKey)}`]: async function (...args: any) {
          const { query, queryOption } = getQueryDataFromKey(queryKey, args);
          return (this as unknown as DatabaseInstance).__findId(query, queryOption);
        },
        [`pick${capitalize(queryKey)}`]: async function (...args: any) {
          const { query, queryOption } = getQueryDataFromKey(queryKey, args);
          return (this as unknown as DatabaseInstance).__pick(query, queryOption);
        },
        [`pickId${capitalize(queryKey)}`]: async function (...args: any) {
          const { query, queryOption } = getQueryDataFromKey(queryKey, args);
          return (this as unknown as DatabaseInstance).__pickId(query, queryOption);
        },
        [`exists${capitalize(queryKey)}`]: async function (...args: any) {
          const query = queryFn(...fillMissingFilterArgs(filterInfo, args), documentQueryHelper);
          return (this as unknown as DatabaseInstance).__exists(query);
        },
        [`count${capitalize(queryKey)}`]: async function (...args: any) {
          const query = queryFn(...fillMissingFilterArgs(filterInfo, args), documentQueryHelper);
          return (this as unknown as DatabaseInstance).__count(query);
        },
        [`insight${capitalize(queryKey)}`]: async function (...args: any) {
          const query = queryFn(...fillMissingFilterArgs(filterInfo, args), documentQueryHelper);
          return (this as unknown as DatabaseInstance).__insight(query);
        },
        [`query${capitalize(queryKey)}`]: (...args: any) =>
          queryFn(...fillMissingFilterArgs(filterInfo, args), documentQueryHelper),
      });
    });
    applyMixins(DatabaseModelInstance, [database.model]);
    return DatabaseModelInstance as unknown as AdaptorCls<DatabaseInstance<any, any, any, any, any, any>>;
  }
}
