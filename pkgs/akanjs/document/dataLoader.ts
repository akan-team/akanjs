import { toError } from "akanjs/common";
import type { QueryOf } from "akanjs/constant";

type LoaderItem = Record<string, unknown>;
type LoaderModel = {
  find: (query: QueryOf<unknown>) => Promise<LoaderItem[]> | { then: Promise<LoaderItem[]>["then"] };
};
type ArrayElementLoaderItem = LoaderItem & { key: unknown };
type QueryRecord = Record<string, unknown>;
type BatchLoadFn<Key, Value> = (
  keys: readonly Key[],
) => PromiseLike<ReadonlyArray<Value | Error>> | ReadonlyArray<Value | Error>;

interface DataLoaderOptions<Key, Value, CacheKey> {
  /** `false` (default) keeps nothing past its batch, a number keeps a key that many ms, `true` for its whole life. */
  cache?: boolean | number;
  cacheKeyFn?: (key: Key) => CacheKey;
  /** What a caller gets in place of a value another caller already holds: a repeated key's, or a kept key's. */
  copy?: (value: Value) => Value;
  batch?: boolean;
  batchScheduleFn?: (callback: () => void) => void;
  maxBatchSize?: number;
  name?: string;
}

interface BatchItem<Key, Value> {
  key: Key;
  resolve: (value: Value) => void;
  reject: (reason: unknown) => void;
}

export class DataLoader<Key, Value, CacheKey = Key> {
  static readonly #minSweepSize = 1024;
  readonly name?: string;
  readonly #batchLoadFn: BatchLoadFn<Key, Value>;
  readonly #ttl: number;
  readonly #cacheKeyFn: (key: Key) => CacheKey;
  readonly #batch: boolean;
  readonly #batchScheduleFn: (callback: () => void) => void;
  readonly #maxBatchSize: number;
  readonly #copy: ((value: Value) => Value) | null;
  readonly #promiseCache = new Map<CacheKey, { promise: Promise<Value>; expiresAt: number }>();
  #sweepAt = DataLoader.#minSweepSize;
  #queue: BatchItem<Key, Value>[] = [];
  #scheduled = false;

  constructor(batchLoadFn: BatchLoadFn<Key, Value>, options: DataLoaderOptions<Key, Value, CacheKey> = {}) {
    this.#batchLoadFn = batchLoadFn;
    this.#ttl =
      options.cache === true
        ? Number.POSITIVE_INFINITY
        : typeof options.cache === "number" && options.cache > 0
          ? options.cache
          : 0;
    this.#cacheKeyFn = options.cacheKeyFn ?? ((key) => key as unknown as CacheKey);
    this.#batch = options.batch !== false;
    this.#batchScheduleFn = options.batchScheduleFn ?? ((callback) => queueMicrotask(callback));
    this.#maxBatchSize = options.maxBatchSize ?? Number.POSITIVE_INFINITY;
    this.#copy = options.copy ?? null;
    this.name = options.name;
  }

  load(key: Key): Promise<Value> {
    const cacheKey = this.#cacheKeyFn(key);
    const cached = this.#cached(cacheKey);
    if (cached) return this.#copy ? cached.then(this.#copy) : cached;

    const promise = new Promise<Value>((resolve, reject) => {
      this.#queue.push({ key, resolve, reject });
      if (this.#batch) this.#schedule();
      else this.#dispatch();
    });
    if (this.#ttl > 0) {
      this.#remember(cacheKey, promise);
      // A failed load is not an answer worth keeping: the next caller asks the store again.
      promise.catch(() => {
        if (this.#promiseCache.get(cacheKey)?.promise === promise) this.#promiseCache.delete(cacheKey);
      });
    }
    return promise;
  }

  async loadMany(keys: readonly Key[]): Promise<Array<Value | Error>> {
    const results = await Promise.allSettled(keys.map((key) => this.load(key)));
    return results.map((result) => (result.status === "fulfilled" ? result.value : toError(result.reason)));
  }

  clear(key: Key): this {
    this.#promiseCache.delete(this.#cacheKeyFn(key));
    return this;
  }

  clearAll(): this {
    this.#promiseCache.clear();
    return this;
  }

  prime(key: Key, value: Value | Error): this {
    if (this.#ttl <= 0) return this;
    const cacheKey = this.#cacheKeyFn(key);
    if (this.#cached(cacheKey)) return this;
    this.#remember(cacheKey, value instanceof Error ? Promise.reject(value) : Promise.resolve(value));
    return this;
  }

  #cached(cacheKey: CacheKey): Promise<Value> | undefined {
    if (this.#ttl <= 0) return undefined;
    const entry = this.#promiseCache.get(cacheKey);
    if (!entry) return undefined;
    if (entry.expiresAt > Date.now()) return entry.promise;
    this.#promiseCache.delete(cacheKey);
    return undefined;
  }

  // Swept whenever the map doubles, so a process-long loader holds about one TTL window of keys, not every key seen.
  #remember(cacheKey: CacheKey, promise: Promise<Value>) {
    this.#promiseCache.set(cacheKey, { promise, expiresAt: Date.now() + this.#ttl });
    if (this.#promiseCache.size < this.#sweepAt) return;
    const now = Date.now();
    for (const [key, entry] of this.#promiseCache) if (entry.expiresAt <= now) this.#promiseCache.delete(key);
    this.#sweepAt = Math.max(DataLoader.#minSweepSize, this.#promiseCache.size * 2);
  }

  #schedule() {
    if (this.#scheduled) return;
    this.#scheduled = true;
    this.#batchScheduleFn(() => this.#dispatch());
  }

  #dispatch() {
    this.#scheduled = false;
    const batch = this.#queue.splice(0, this.#maxBatchSize);
    if (this.#queue.length > 0) this.#schedule();
    if (batch.length === 0) return;
    const keys = batch.map(({ key }) => key);
    Promise.resolve(this.#batchLoadFn(keys)).then(
      (values) => {
        if (values.length !== batch.length) {
          const error = new Error(`DataLoader expected ${batch.length} values, received ${values.length}`);
          for (const { reject } of batch) reject(error);
          return;
        }
        const handedOut = new Set<Value | Error>();
        values.forEach((value, index) => {
          const item = batch[index];
          if (value instanceof Error) item?.reject(value);
          else if (this.#copy && handedOut.has(value)) {
            try {
              item?.resolve(this.#copy(value as Value));
            } catch (error) {
              item?.reject(error);
            }
          } else {
            handedOut.add(value);
            item?.resolve(value as Value);
          }
        });
      },
      (error) => {
        for (const { reject } of batch) reject(error);
      },
    );
  }
}

const keyBy = <T>(items: T[], keyOrGetter: keyof T | ((item: T) => unknown)): Record<string, T> =>
  Object.fromEntries(
    items.map((item) => [String(typeof keyOrGetter === "function" ? keyOrGetter(item) : item[keyOrGetter]), item]),
  );

const groupBy = <T>(items: T[], getKey: (item: T) => unknown): Record<string, T[]> => {
  const groups: Record<string, T[]> = {};
  for (const item of items) {
    const key = String(getKey(item));
    groups[key] ??= [];
    groups[key].push(item);
  }
  return groups;
};

const findWhere = (model: LoaderModel, query: QueryOf<unknown>, field: string, op: "oneOf" | "has", value: unknown) =>
  Promise.resolve(model.find({ ...query, [field]: { kind: "op", op, value } }));

export const createLoader = <Key, Value>(model: LoaderModel, fieldName = "id", defaultQuery: QueryOf<unknown> = {}) =>
  new DataLoader<Key, Value>(
    (fields) =>
      findWhere(model, defaultQuery, fieldName, "oneOf", fields).then((list) => {
        const listByKey = keyBy(list, fieldName);
        return fields.map((id: unknown) => listByKey[String(id)] ?? null);
      }) as unknown as Promise<Value[]>,
    { name: "dataloader" },
  );
export const createArrayLoader = <K, V>(model: LoaderModel, fieldName = "id", defaultQuery: QueryOf<unknown> = {}) =>
  new DataLoader<K, V>(
    (fields) =>
      findWhere(model, defaultQuery, fieldName, "has", fields).then((list) =>
        fields.map((field) => list.filter((item) => field === item[fieldName])),
      ) as unknown as Promise<V[]>,
  );
export const createArrayElementLoader = <K, V>(
  model: LoaderModel,
  fieldName = "id",
  defaultQuery: QueryOf<unknown> = {},
) =>
  new DataLoader<K, V>(
    (fields) =>
      findWhere(model, defaultQuery, fieldName, "oneOf", fields).then((list) => {
        const flat: ArrayElementLoaderItem[] = list.flatMap((datum) => {
          const values = Array.isArray(datum[fieldName]) ? datum[fieldName] : [];
          return values.map((datField: unknown) => ({ ...datum, key: datField }));
        });
        const listByKey = groupBy(flat, (dat) => dat.key);
        return fields.map((id) => listByKey[String(id)] ?? null);
      }) as unknown as Promise<V[]>,
    { name: "dataloader" },
  );

export const createQueryLoader = <Key, Value>(
  model: LoaderModel,
  queryKeys: string[],
  defaultQuery: QueryOf<unknown> = {},
) =>
  new DataLoader<Key, Value, Key>(
    (queries) => {
      const query = { kind: "all", queries: [{ kind: "any", queries }, defaultQuery] } as QueryOf<unknown>;
      const getQueryKey = (query: QueryOf<unknown>) =>
        queryKeys.map((key) => String((query as QueryRecord)[key])).join("");
      return Promise.resolve(model.find(query)).then((list) => {
        const listByKey = keyBy(list, getQueryKey);
        return queries.map((query: QueryOf<unknown>) => listByKey[getQueryKey(query)] ?? null);
      }) as unknown as Promise<Value[]>;
    },
    { name: "dataloader" },
  );

export type Loader<Field, Value> = DataLoader<Field, Value | null>;
