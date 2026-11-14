import type { QueryOf } from "akanjs/constant";
import { DataLoader, documentQueryHelper, type LoaderInfo } from "akanjs/document";
import type { DatabaseAdaptor, DocumentStore } from "akanjs/service";
import { traceDataLoaderBatch } from "akanjs/signal";
import { timedQuery } from "./timedQuery";

interface StoreHost {
  readonly __database: DatabaseAdaptor;
  readonly __store: DocumentStore;
}
type DocumentCopy = (doc: Record<string, unknown> | null) => unknown;

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
  new DataLoader<any, any>(
    async (keys) => {
      traceDataLoaderBatch(keys.length);
      if (loaderInfo.type === "query") {
        const fields = loaderInfo.field as string[];
        const query = { kind: "any", queries: keys } as QueryOf<unknown>;
        const docs = await timedQuery(() => host.__store.find(documentQueryHelper.all(loaderInfo.defaultQuery, query)));
        const keyOf = (row: Record<string, unknown>) => JSON.stringify(fields.map((field) => String(row[field])));
        const byKey = new Map(docs.map((doc) => [keyOf(doc), doc]));
        return keys.map((queryKey) => byKey.get(keyOf(queryKey)) ?? null);
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
    { name: key, cache: loaderInfo.cache, copy, scopeFn: () => host.__database.transactionKey?.() },
  );
