import { capitalize, modelNames } from "akanjs/common";
import { type ConstantModel, type QueryOf, resolvePageLimit, resolvePageSkip } from "akanjs/constant";
import {
  CacheDatabase,
  type DatabaseInstance,
  type DatabaseModel,
  type DataInputOf,
  type DataLoader,
  type DocumentSchema,
  type DocumentTouchOptions,
  type DocumentUpdateInput,
  type FindQueryOption,
  getFilterSortByKey,
  getLoaderInfos,
  type ListQueryOption,
  type Mdl,
  NoDocumentError,
  type SaveEventListener,
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
import { Exception } from "akanjs/signal";
import { missedById, modelFacadeOf } from "./modelFacade";
import { declaredLoaderOf, forgetWrittenKeys, idLoaderOf } from "./modelLoaders";
import { schemaListenerOf } from "./modelSchema";
import { timedQuery, touchArgs } from "./timedQuery";

const modelQueryOptionsOf = (database: DatabaseModel) => {
  const modelName = database.refName;
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
  return { getListQuery, getFindQuery };
};

export const databaseModelInstanceOf = (
  constant: ConstantModel,
  database: DatabaseModel,
  schema: DocumentSchema,
): AdaptorCls<DatabaseInstance<any, any, any, any, any, any>> => {
  const [modelName, className]: [string, string] = [database.refName, capitalize(database.refName)];
  const names = modelNames(modelName);
  const { getListQuery, getFindQuery } = modelQueryOptionsOf(database);
  const listenPreHook = schemaListenerOf(schema, "pre");
  const listenPostHook = schemaListenerOf(schema, "post");

  class DatabaseModelInstance extends adapt(names.modelModel, ({ plug }) => ({
    __database: plug(DatabaseAdaptorRole, (database) => database),
    __cache: plug(CacheAdaptorRole, (cache) => new CacheDatabase(modelName, cache)),
    [names.modelCache as never]: plug(CacheAdaptorRole, (cache) => new CacheDatabase(modelName, cache)),
  })) {
    declare readonly __database: DatabaseAdaptor;
    __store!: DocumentStore;
    __model!: Mdl<any, any>;
    __loader!: DataLoader<string, any, string>;
    #stopForgetting = () => {};

    override async onInit() {
      this.__store = this.__database.getStore(constant, database, schema);
      await this.__store.ensure();
      this.__model = modelFacadeOf(this.__store, modelName, listenPreHook, listenPostHook);
      // One instance shared by two callers would carry one's unsaved edits into the other's save.
      const copy = (doc: Record<string, unknown> | null) => (doc ? this.__store.rehydrate(doc) : doc);
      this.__loader = idLoaderOf(this, names.modelLoader, copy);
      Object.assign(this, { [className]: this.__model, [names.modelLoader]: this.__loader });
      const declared = Object.entries(getLoaderInfos(database.model)).map(([key, loaderInfo]) => {
        const loader = declaredLoaderOf(this, key, loaderInfo, copy);
        Object.assign(this, { [key]: loader });
        return { loaderInfo, loader };
      });
      const kept = declared.filter(({ loaderInfo }) => loaderInfo.cache);
      if (kept.length) this.#stopForgetting = forgetWrittenKeys(schema, kept);
    }

    override onDestroy() {
      this.#stopForgetting();
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
    listenPre(type: SaveEventType, listener: SaveEventListener<any>) {
      return listenPreHook(type, listener);
    }
    listenPost(type: SaveEventType, listener: SaveEventListener<any>) {
      return listenPostHook(type, listener);
    }
    async __get(id: string) {
      const doc = await this.__loader.load(id);
      if (!doc) throw missedById(database.refName, id);
      return doc;
    }
    async [names.getModel](id: string) {
      return this.__get(id);
    }
    async __load(id?: string) {
      return (id ? await this.__loader.load(id) : null) as unknown;
    }
    async [names.loadModel](id?: string) {
      return this.__load(id);
    }
    async __loadMany(ids: string[]) {
      return await this.__loader.loadMany(ids);
    }
    async [names.loadModelMany](ids: string[]) {
      return this.__loadMany(ids);
    }
    async clone(data: DataInputOf<any, any> & { id: string }) {
      return await timedQuery(() => this.__store.clone(data));
    }
    async __create(data: DataInputOf<any, any>) {
      return await timedQuery(() => this.__store.create(data));
    }
    async [names.createModel](data: DataInputOf<any, any>) {
      return this.__create(data);
    }
    async __createMany(data: DataInputOf<any, any>[]) {
      return await timedQuery(() => this.__store.createMany(data));
    }
    async __update(id: string, data: DataInputOf<any, any>) {
      return await timedQuery(() => this.__store.update(id, data));
    }
    async [names.updateModel](id: string, data: DataInputOf<any, any>) {
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
    async __purgeMany(query: QueryOf<any>) {
      return await timedQuery(() => this.__store.purgeManyByQuery(query));
    }
    async __updateMany(query: QueryOf<any>, update: DocumentUpdateInput, options?: DocumentTouchOptions) {
      return await timedQuery(() => this.__store.updateManyByQuery(query, update, ...touchArgs(options)));
    }
    async __updateOne(query: QueryOf<any>, update: DocumentUpdateInput, options?: DocumentTouchOptions) {
      return await timedQuery(() => this.__store.updateOneByQuery(query, update, ...touchArgs(options)));
    }
    async [names.removeModel](id: string) {
      return this.__remove(id);
    }
  }

  return DatabaseModelInstance as unknown as AdaptorCls<DatabaseInstance<any, any, any, any, any, any>>;
};
