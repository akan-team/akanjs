import type { QueryOf } from "akanjs/constant";
import {
  type DocumentScopeOptions,
  type DocumentTouchOptions,
  type DocumentUpdateInput,
  type DocumentUpdateOptions,
  type Mdl,
  NoDocumentError,
} from "akanjs/document";
import type { DocumentStore, UpsertByIdOptions } from "akanjs/service";
import type { SchemaListener } from "./modelSchema";
import { timedQuery, touchArgs, touchOf } from "./timedQuery";

export const missedById = (refName: string, id: string) =>
  new NoDocumentError(`No Document (${refName}): ${id}`, { lookup: { refName, id } });

export const modelFacadeOf = (
  store: DocumentStore,
  modelName: string,
  listenPreHook: SchemaListener,
  listenPostHook: SchemaListener,
): Mdl<any, any> => {
  function Model(this: any, data: Record<string, unknown>) {
    return store.hydrate(data);
  }
  // Off, the flag is left out entirely, so a call without it reaches the store exactly as before.
  const scopeOf = (options?: DocumentScopeOptions) => (options?.withRemoved ? { withRemoved: true } : {});
  const scopeArgs = (options?: DocumentScopeOptions): [] | [DocumentScopeOptions] =>
    options?.withRemoved ? [{ withRemoved: true }] : [];
  const updateManyArgs = (
    options?: DocumentScopeOptions & DocumentTouchOptions,
  ): [] | [DocumentScopeOptions & DocumentTouchOptions] => {
    const narrowed = { ...scopeOf(options), ...touchOf(options) };
    return Object.keys(narrowed).length ? [narrowed] : [];
  };
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
    if (!doc) throw missedById(modelName, id);
    return doc;
  };
  return Object.assign(Model, {
    refName: modelName,
    pickOne: (query: QueryOf<any>, projection?: any) => timedQuery(() => store.pickOne(query, { select: projection })),
    pickById,
    // `AndWrite` saves through the document so save hooks run; `updateById` is the hookless query-level write.
    pickAndWrite: async (id: string, rawData: any, options?: DocumentTouchOptions) =>
      await (await pickById(id)).set(rawData).save(...touchArgs(options)),
    pickOneAndWrite: async (query: QueryOf<any>, rawData: any, options?: DocumentTouchOptions) =>
      await (await timedQuery(() => store.pickOne(query))).set(rawData).save(...touchArgs(options)),
    exists: async (query: QueryOf<any>, options?: DocumentScopeOptions) =>
      await timedQuery(() => store.exists(query, ...scopeArgs(options))),
    sample: (query: QueryOf<any>, size = 1) => timedQuery(() => store.find(query, { sample: size, limit: size })),
    sampleOne: (query: QueryOf<any>) => timedQuery(() => store.findOne(query, { sample: true })),
    find: (query: QueryOf<any>, projection?: any, options?: DocumentScopeOptions) =>
      createFindManyChain(query, { select: projection, ...scopeOf(options) }),
    findOne: (query: QueryOf<any>, projection?: any, options?: DocumentScopeOptions) =>
      createFindOneChain(query, { select: projection, ...scopeOf(options) }),
    findById: (id: string | undefined, projection?: any, options?: DocumentScopeOptions) =>
      id ? timedQuery(() => store.findOne({ id }, { select: projection, ...scopeOf(options) })) : Promise.resolve(null),
    count: (query: QueryOf<any>, options?: DocumentScopeOptions) =>
      timedQuery(() => store.count(query, ...scopeArgs(options))),
    updateOne: (query: QueryOf<any>, update: DocumentUpdateInput, options?: DocumentUpdateOptions) =>
      timedQuery(() => store.updateOneByQuery(query, update, options)),
    updateMany: (
      query: QueryOf<any>,
      update: DocumentUpdateInput,
      options?: DocumentScopeOptions & DocumentTouchOptions,
    ) => timedQuery(() => store.updateManyByQuery(query, update, ...updateManyArgs(options))),
    removeOne: (query: QueryOf<any>) => timedQuery(() => store.removeOneByQuery(query)),
    removeMany: (query: QueryOf<any>) => timedQuery(() => store.removeManyByQuery(query)),
    purgeMany: (query: QueryOf<any>) => timedQuery(() => store.purgeManyByQuery(query)),
    updateById: (id: string, update: DocumentUpdateInput, options?: DocumentUpdateOptions) =>
      timedQuery(() => store.updateOneByQuery({ id }, update, options)),
    removeById: (id: string) => timedQuery(() => store.removeOneByQuery({ id })),
    upsertById: (data: Record<string, unknown> & { id: string }, options?: UpsertByIdOptions) =>
      timedQuery(() => store.upsertById(data, options)),
    // Kept so existing call sites keep working; `@deprecated` on the `Mdl` type is what points them onward.
    countDocuments: (query: QueryOf<any>) => timedQuery(() => store.count(query)),
    bulkWrite: (operations: { updateOne: { filter: QueryOf<any>; update: DocumentUpdateInput; upsert?: boolean } }[]) =>
      timedQuery(() => store.bulkWrite(operations)),
    listenPre: listenPreHook,
    listenPost: listenPostHook,
  }) as unknown as Mdl<any, any>;
};
