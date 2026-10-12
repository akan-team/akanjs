import type { PromiseOrObject } from "akanjs/base";
import { applyMixins, capitalize } from "akanjs/common";
import { type ConstantModel, type QueryOf, resolvePageLimit, resolvePageSkip } from "akanjs/constant";
import {
  assertFilterFitsCrud,
  CacheDatabase,
  type CRUDEventType,
  type DatabaseInstance,
  type DatabaseModel,
  type DataInputOf,
  DataLoader,
  DocumentSchema,
  type DocumentScopeOptions,
  type DocumentUpdateInput,
  type DocumentUpdateOptions,
  documentQueryHelper,
  type FindQueryOption,
  getFilterMeta,
  getFilterSortByKey,
  getLoaderInfos,
  type ListQueryOption,
  type Mdl,
  NoDocumentError,
  type SaveEventType,
} from "akanjs/document";
import {
  type AdaptorCls,
  adapt,
  CacheAdaptorRole,
  type DatabaseAdaptor,
  DatabaseAdaptorRole,
  type DocumentStore,
  ServiceModel,
  type UpsertByIdOptions,
} from "akanjs/service";
import { Exception, getCurrentTrace, traceDataLoaderBatch } from "akanjs/signal";

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
  // The model adaptor and its database service expose the same filter methods over the same `__` primitives.
  static applyFilterMethods(prototype: object, database: DatabaseModel, className: string) {
    Object.entries(getFilterMeta(database.filter).query).forEach(([queryKey, filterInfo]) => {
      const filterMethods = ServiceModel.getFilterServiceMethods(queryKey, filterInfo);
      assertFilterFitsCrud(database.refName, queryKey, className);
      Object.assign(prototype, filterMethods);
    });
  }

  static resolveDatabase(
    constant: ConstantModel,
    database: DatabaseModel,
  ): { adaptor: AdaptorCls<DatabaseInstance>; schema: DocumentSchema } {
    const [modelName, className]: [string, string] = [database.refName, capitalize(database.refName)];
    // null (no sort named) lets the store pick relevance for a text search; defaulting to "latest" here would hide it.
    // An unknown key is refused, not ignored: sortKeys reach the client, and a typo must not silently reorder a list.
    const resolveSort = (sortKey?: string | null): { [key: string]: 1 | -1 } | null => {
      if (!sortKey) return null;
      const sort = getFilterSortByKey(database.filter, sortKey) as { [key: string]: 1 | -1 } | undefined;
      if (!sort) throw new Exception.BadRequest(`Unknown sort key for ${modelName}: ${sortKey}`);
      return sort;
    };
    const getListQuery = (query?: QueryOf<any>, queryOption?: ListQueryOption) => ({
      find: query ?? {},
      sort: resolveSort(queryOption?.sort),
      skip: resolvePageSkip(queryOption?.skip),
      // undefined or 0: a server caller naming no page, or asking for every row, gets no ceiling (client paths were
      // clamped by the slice endpoint). An explicit null means "page this, I have no number": the default page size.
      limit: queryOption?.limit === undefined || queryOption.limit === 0 ? 0 : resolvePageLimit(queryOption.limit),
      select: queryOption?.select,
      sample: queryOption?.sample,
    });
    const getFindQuery = (query?: QueryOf<any>, queryOption?: FindQueryOption) => ({
      find: query ?? {},
      sort: resolveSort(queryOption?.sort),
      skip: resolvePageSkip(queryOption?.skip),
      select: queryOption?.select,
      sample: queryOption?.sample ?? false,
    });
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
    // Non-base fields live in the `_doc` JSON column: without this index every cascade lookup is a table scan.
    for (const path of constant.full.cascade.removeWith.values()) {
      const fields = path.typeKey
        ? { removedAt: 1, [path.typeKey]: 1, [path.key]: 1 }
        : { removedAt: 1, [path.key]: 1 };
      const key = Object.keys(fields).join(",");
      if (indexedSortFieldKeys.has(key)) continue;
      indexedSortFieldKeys.add(key);
      schema.index(fields as { [key: string]: 1 | -1 });
    }

    const listen = (phase: "pre" | "post") => {
      return (
        type: SaveEventType,
        listener: (doc: any, type: CRUDEventType, previous?: any) => PromiseOrObject<void>,
      ) => {
        const hook = function (this: any, _next?: () => void, crudType?: CRUDEventType, previous?: any) {
          return listener(this, crudType ?? "update", previous);
        };
        if (phase === "pre") schema.pre(type, hook);
        else schema.post(type, hook);
        return () => {
          if (phase === "pre") schema.removePre(type, hook);
          else schema.removePost(type, hook);
        };
      };
    };
    const listenPreHook = listen("pre");
    const listenPostHook = listen("post");

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
            [key]: new DataLoader<any, any>(
              async (keys) => {
                traceDataLoaderBatch(keys.length);
                if (loaderInfo.type === "query") {
                  const fields = loaderInfo.field as string[];
                  const query = { kind: "any", queries: keys } as QueryOf<unknown>;
                  const docs = await timedQuery(() =>
                    this.__store.find(documentQueryHelper.all(loaderInfo.defaultQuery, query)),
                  );
                  const keyOf = (row: Record<string, unknown>) =>
                    JSON.stringify(fields.map((field) => String(row[field])));
                  const byKey = new Map(docs.map((doc) => [keyOf(doc), doc]));
                  return keys.map((queryKey) => byKey.get(keyOf(queryKey)) ?? null);
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
              },
              { name: key, cache: loaderInfo.cache },
            ),
          });
        });
      }

      #createModelFacade() {
        const store = this.__store;
        function Model(this: any, data: Record<string, unknown>) {
          return store.hydrate(data);
        }
        // Off, the flag is left out entirely, so a call without it reaches the store exactly as before.
        const scopeOf = (options?: DocumentScopeOptions) => (options?.withRemoved ? { withRemoved: true } : {});
        const scopeArgs = (options?: DocumentScopeOptions): [] | [DocumentScopeOptions] =>
          options?.withRemoved ? [{ withRemoved: true }] : [];
        const createFindManyChain = (
          query: QueryOf<any>,
          options: { sort?: any; skip?: number; limit?: number; select?: any; withRemoved?: boolean } = {},
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
        const createFindOneChain = (
          query: QueryOf<any>,
          options: { sort?: any; skip?: number; select?: any; withRemoved?: boolean } = {},
        ) => {
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
        const pickById = async (id: string | undefined, projection?: any) => {
          if (!id) throw new NoDocumentError("No Document ID");
          const doc = await timedQuery(() => store.findOne({ id }, { select: projection }));
          if (!doc) throw new NoDocumentError(`No Document (${modelName}): ${id}`);
          return doc;
        };
        return Object.assign(Model, {
          refName: modelName,
          pickOne: (query: QueryOf<any>, projection?: any) =>
            timedQuery(() => store.pickOne(query, { select: projection })),
          pickById,
          // `AndWrite` saves through the document so save hooks run; `updateById` is the hookless query-level write.
          pickAndWrite: async (id: string, rawData: any) => await (await pickById(id)).set(rawData).save(),
          pickOneAndWrite: async (query: QueryOf<any>, rawData: any) =>
            await (await timedQuery(() => store.pickOne(query))).set(rawData).save(),
          exists: async (query: QueryOf<any>, options?: DocumentScopeOptions) =>
            await timedQuery(() => store.exists(query, ...scopeArgs(options))),
          sample: (query: QueryOf<any>, size = 1) => timedQuery(() => store.find(query, { sample: size, limit: size })),
          sampleOne: (query: QueryOf<any>) => timedQuery(() => store.findOne(query, { sample: true })),
          find: (query: QueryOf<any>, projection?: any, options?: DocumentScopeOptions) =>
            createFindManyChain(query, { select: projection, ...scopeOf(options) }),
          findOne: (query: QueryOf<any>, projection?: any, options?: DocumentScopeOptions) =>
            createFindOneChain(query, { select: projection, ...scopeOf(options) }),
          findById: (id: string | undefined, projection?: any, options?: DocumentScopeOptions) =>
            id
              ? timedQuery(() => store.findOne({ id }, { select: projection, ...scopeOf(options) }))
              : Promise.resolve(null),
          count: (query: QueryOf<any>, options?: DocumentScopeOptions) =>
            timedQuery(() => store.count(query, ...scopeArgs(options))),
          updateOne: (query: QueryOf<any>, update: DocumentUpdateInput, options?: DocumentUpdateOptions) =>
            timedQuery(() => store.updateOneByQuery(query, update, options)),
          updateMany: (query: QueryOf<any>, update: DocumentUpdateInput, options?: DocumentScopeOptions) =>
            timedQuery(() => store.updateManyByQuery(query, update, ...scopeArgs(options))),
          removeOne: (query: QueryOf<any>) => timedQuery(() => store.removeOneByQuery(query)),
          removeMany: (query: QueryOf<any>) => timedQuery(() => store.removeManyByQuery(query)),
          updateById: (id: string, update: DocumentUpdateInput, options?: DocumentUpdateOptions) =>
            timedQuery(() => store.updateOneByQuery({ id }, update, options)),
          removeById: (id: string) => timedQuery(() => store.removeOneByQuery({ id })),
          upsertById: (data: Record<string, unknown> & { id: string }, options?: UpsertByIdOptions) =>
            timedQuery(() => store.upsertById(data, options)),
          // Kept so existing call sites keep working; `@deprecated` on the `Mdl` type is what points them onward.
          countDocuments: (query: QueryOf<any>) => timedQuery(() => store.count(query)),
          bulkWrite: (
            operations: { updateOne: { filter: QueryOf<any>; update: DocumentUpdateInput; upsert?: boolean } }[],
          ) => timedQuery(() => store.bulkWrite(operations)),
          listenPre: listenPreHook,
          listenPost: listenPostHook,
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
        return await timedQuery(() => this.__store.pickOne(find, { sort, skip, sample, select }));
      }
      async __pickId(query?: QueryOf<any>, queryOption?: FindQueryOption): Promise<string> {
        const { find, sort, skip, sample } = getFindQuery(query, queryOption);
        const id = await timedQuery(() => this.__store.findId(find, { sort, skip, sample }));
        if (!id) throw new NoDocumentError(`No Document (${database.refName}): ${JSON.stringify(query)}`);
        return id;
      }
      async __exists(query?: QueryOf<any>): Promise<string | null> {
        return await timedQuery(() => this.__store.exists(query));
      }
      async __count(query?: QueryOf<any>): Promise<number> {
        return await timedQuery(() => this.__store.count(query));
      }
      async __insight(query?: QueryOf<any>): Promise<any> {
        return await timedQuery(() => this.__store.insight(query));
      }
      listenPre(
        type: SaveEventType,
        listener: (doc: any, type: CRUDEventType, previous?: any) => PromiseOrObject<void>,
      ) {
        return listenPreHook(type, listener);
      }
      listenPost(
        type: SaveEventType,
        listener: (doc: any, type: CRUDEventType, previous?: any) => PromiseOrObject<void>,
      ) {
        return listenPostHook(type, listener);
      }
      async __get(id: string) {
        const doc = await this.__loader.load(id);
        if (!doc) throw new NoDocumentError(`No Document (${database.refName}): ${id}`);
        return doc;
      }
      async [`get${className}`](id: string) {
        return this.__get(id);
      }
      async __load(id?: string) {
        return (id ? await this.__loader.load(id) : null) as unknown;
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
        return await timedQuery(() => this.__store.clone(data));
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
        return await timedQuery(() => this.__store.remove(id));
      }
      async __removeMany(query: QueryOf<any>) {
        return await timedQuery(() => this.__store.removeManyByQuery(query));
      }
      async __removeOne(query: QueryOf<any>) {
        return await timedQuery(() => this.__store.removeOneByQuery(query));
      }
      async __updateMany(query: QueryOf<any>, update: DocumentUpdateInput) {
        return await timedQuery(() => this.__store.updateManyByQuery(query, update));
      }
      async __updateOne(query: QueryOf<any>, update: DocumentUpdateInput) {
        return await timedQuery(() => this.__store.updateOneByQuery(query, update));
      }
      async [`remove${className}`](id: string) {
        return this.__remove(id);
      }
    }

    DatabaseResolver.applyFilterMethods(DatabaseModelInstance.prototype, database, className);
    applyMixins(DatabaseModelInstance, [database.model]);
    return {
      adaptor: DatabaseModelInstance as unknown as AdaptorCls<DatabaseInstance<any, any, any, any, any, any>>,
      schema,
    };
  }
}
