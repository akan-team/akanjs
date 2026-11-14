import type { QueryOf } from "akanjs/constant";
import {
  DataLoader,
  type DocumentSaveHook,
  type DocumentSchema,
  documentQueryHelper,
  type LoaderInfo,
} from "akanjs/document";
import type { DatabaseAdaptor, DocumentStore } from "akanjs/service";
import { traceDataLoaderBatch } from "akanjs/signal";
import { timedQuery } from "./timedQuery";

interface StoreHost {
  readonly __database: DatabaseAdaptor;
  readonly __store: DocumentStore;
}
type DocumentCopy = (doc: Record<string, unknown> | null) => unknown;
type StoredFields = Record<string, unknown>;

const queryKeyOf = (fields: string[], row: StoredFields) => JSON.stringify(fields.map((field) => String(row[field])));

const answeredKeysOf = ({ type, field }: LoaderInfo, doc: StoredFields): unknown[] => {
  if (type === "query") return [doc];
  const value = doc[field as string];
  return type === "arrayField" && Array.isArray(value) ? value : [value];
};

export const idLoaderOf = (host: StoreHost, name: string, copy: DocumentCopy) =>
  new DataLoader<string, any>(
    async (ids) => {
      traceDataLoaderBatch(ids.length);
      const docs = await timedQuery(() => host.__store.find({ id: documentQueryHelper.oneOf([...ids]) }));
      const byId = new Map(docs.map((doc) => [String(doc.id), doc]));
      return ids.map((id) => byId.get(String(id)) ?? null);
    },
    { name, cache: false, copy, scopeFn: () => host.__database.transactionKey?.() },
  );

export const declaredLoaderOf = (host: StoreHost, key: string, loaderInfo: LoaderInfo, copy: DocumentCopy) =>
  new DataLoader<any, any, string>(
    async (keys) => {
      traceDataLoaderBatch(keys.length);
      if (loaderInfo.type === "query") {
        const fields = loaderInfo.field as string[];
        const query = { kind: "any", queries: keys } as QueryOf<unknown>;
        const docs = await timedQuery(() => host.__store.find(documentQueryHelper.all(loaderInfo.defaultQuery, query)));
        const byKey = new Map(docs.map((doc) => [queryKeyOf(fields, doc), doc]));
        return keys.map((queryKey) => byKey.get(queryKeyOf(fields, queryKey)) ?? null);
      }
      const field = loaderInfo.field as string;
      const query = {
        [field]: documentQueryHelper.oneOf([...keys]),
      };
      const docs = await timedQuery(() => host.__store.find(documentQueryHelper.all(loaderInfo.defaultQuery, query)));
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
    {
      name: key,
      cache: loaderInfo.cache,
      cacheKeyFn:
        loaderInfo.type === "query" ? (queryKey) => queryKeyOf(loaderInfo.field as string[], queryKey) : String,
      copy,
      scopeFn: () => host.__database.transactionKey?.(),
    },
  );

interface KeptLoader {
  loaderInfo: LoaderInfo;
  loader: DataLoader<any, any, string>;
}

// Post hooks run after the commit, so a rolled-back write drops no key. A query write (`updateMany`) runs no hook,
// and another process keeps its own keys until they expire.
export const forgetWrittenKeys = (schema: DocumentSchema, kept: KeptLoader[]) => {
  const hook: DocumentSaveHook = function (_next, _type, previous) {
    for (const { loaderInfo, loader } of kept)
      for (const doc of previous ? [this, previous] : [this])
        for (const answered of answeredKeysOf(loaderInfo, doc as StoredFields)) loader.clear(answered);
  };
  const types = ["create", "update", "remove"] as const;
  // Ahead of the model's own post hooks: one of them may load through a loader this write just outdated.
  for (const type of types) schema.postHooks.set(type, [hook, ...(schema.postHooks.get(type) ?? [])]);
  return () => {
    for (const type of types) schema.removePost(type, hook);
  };
};
