/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import type { Type } from "@akanjs/base";
import DataLoader from "dataloader";
import { flatMap, get, groupBy, keyBy } from "lodash";
import type { Document, FilterQuery, Model } from "mongoose";
import { Schema, Types } from "mongoose";

export const Id = Types.ObjectId;
export const ObjectId = Schema.Types.ObjectId;
export const Mixed = Schema.Types.Mixed;
export { DataLoader };

export const createLoader = <Key, Value>(
  model: Model<any>,
  fieldName = "_id",
  defaultQuery: FilterQuery<unknown> = {}
) => {
  return new DataLoader<Key, Value>(
    (fields) => {
      const query: FilterQuery<unknown> = { ...defaultQuery };
      query[fieldName] = { $in: fields };
      const data = model.find(query).then((list: Document[]) => {
        const listByKey = keyBy(list, fieldName);
        return fields.map((id: unknown) => get(listByKey, id as any, null));
      });
      return data as unknown as Promise<Value[]>;
    },
    { name: "dataloader", cache: false }
  );
};
export const createArrayLoader = <K, V>(
  model: Model<unknown, unknown, unknown, unknown>,
  fieldName = "_id",
  defaultQuery: FilterQuery<unknown> = {}
) => {
  return new DataLoader<K, V>((fields) => {
    const query: FilterQuery<unknown> = { ...defaultQuery };
    query[fieldName] = { $in: fields };
    const data = model.find(query).then((list) => {
      return fields.map((field) => list.filter((item) => field === item[fieldName]));
    });
    return data as unknown as Promise<V[]>;
  });
};
export const createArrayElementLoader = <K, V>(
  model: Model<unknown>,
  fieldName = "_id",
  defaultQuery: FilterQuery<unknown> = {}
) => {
  return new DataLoader<K, V>(
    (fields: any) => {
      const query: FilterQuery<unknown> = { ...defaultQuery };
      query[fieldName] = { $in: fields };
      const data = model.find(query).then((list: Document[]) => {
        const flat = flatMap(list, (dat) =>
          dat[fieldName].map((datField) => ({
            ...dat.toObject(),
            key: datField,
          }))
        );
        const listByKey = groupBy(flat, (dat) => dat.key);
        return fields.map((id: any) => get(listByKey, id, null));
      });
      return data;
    },
    { name: "dataloader", cache: false }
  );
};

export const createQueryLoader = <Key, Value>(
  model: Model<any>,
  queryKeys: string[],
  defaultQuery: FilterQuery<unknown> = {}
) => {
  return new DataLoader<Key, Value, Key>(
    (queries: any): any => {
      const query: FilterQuery<unknown> = {
        $and: [{ $or: queries }, defaultQuery],
      };
      const getQueryKey = (query) => queryKeys.map((key) => query[key].toString()).join("");
      const data = model.find(query).then((list: Document[]) => {
        const listByKey = keyBy(list, getQueryKey);
        return queries.map((query) => get(listByKey, getQueryKey(query), null));
      });
      return data;
    },
    { name: "dataloader", cache: false }
  );
};

export interface LoaderMeta {
  key: string;
  type: "Field" | "ArrayField" | "Query";
  fieldName?: string;
  queryKeys?: string[];
  defaultQuery: FilterQuery<unknown>;
}
const getLoaderMetaMapByPrototype = (prototype: object): Map<string, LoaderMeta> => {
  const loaderMetaMap = Reflect.getOwnMetadata("loaders", prototype) ?? new Map<string, LoaderMeta>();
  return loaderMetaMap;
};
export const getLoaderMetas = (target: Type): LoaderMeta[] => {
  const metas: LoaderMeta[] = [...getLoaderMetaMapByPrototype(target.prototype as object).values()];
  return metas;
};
export type Loader<Field, Value> = DataLoader<Field, Value | null>;
export const Loader = {
  ByField: (fieldName: string, defaultQuery: FilterQuery<unknown> = {}) => {
    return function (target: object, key: string) {
      const loaderMetaMap = getLoaderMetaMapByPrototype(target);
      loaderMetaMap.set(key, { key, type: "Field", fieldName, defaultQuery });
      Reflect.defineMetadata("loaders", loaderMetaMap, target);
    };
  },
  ByArrayField: (fieldName: string, defaultQuery: FilterQuery<unknown> = {}) => {
    return function (target: object, key: string) {
      const loaderMetaMap = getLoaderMetaMapByPrototype(target);
      loaderMetaMap.set(key, { key, type: "ArrayField", fieldName, defaultQuery });
      Reflect.defineMetadata("loaders", loaderMetaMap, target);
    };
  },
  ByQuery: (queryKeys: string[], defaultQuery: FilterQuery<unknown> = {}) => {
    return function (target: object, key: string) {
      const loaderMetaMap = getLoaderMetaMapByPrototype(target);
      loaderMetaMap.set(key, { key, type: "Query", queryKeys, defaultQuery });
      Reflect.defineMetadata("loaders", loaderMetaMap, target);
    };
  },
};
