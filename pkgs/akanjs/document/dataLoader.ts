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
  /** How many keys `cache: true` keeps (10,000 by default): past it, the key used longest ago leaves first. */
  maxCacheSize?: number;
  cacheKeyFn?: (key: Key) => CacheKey;
  /** What a caller gets in place of a value another caller already holds: a repeated key's, or a kept key's. */
  copy?: (value: Value) => Value;
  batch?: boolean;
  /** Must run the callback in its caller's async context, as `queueMicrotask` and `setImmediate` do. */
  batchScheduleFn?: (callback: () => void) => void;
  /** What a load belongs to, such as its open transaction: a scope's loads batch apart and never touch the cache. */
  scopeFn?: () => object | undefined;
  /** How many distinct keys one call of the batch function takes (500 by default); a larger queue goes out as several. */
  maxBatchSize?: number;
  name?: string;
}

interface BatchItem<Key, Value, CacheKey> {
  key: Key;
  cacheKey: CacheKey;
  slot: number;
  resolve: (value: Value) => void;
  reject: (reason: unknown) => void;
}

interface Batch<Key, Value, CacheKey> {
  keys: Key[];
  items: BatchItem<Key, Value, CacheKey>[];
}

export class DataLoader<Key, Value, CacheKey = Key> {
  static readonly #minSweepSize = 1024;
  static readonly #defaultMaxCacheSize = 10_000;
  // SQLite refuses a query of about 1,000 OR-ed composite keys (expression depth 1000); a list page holds 500 rows.
  static readonly #defaultMaxBatchSize = 500;
  readonly name?: string;
  readonly #batchLoadFn: BatchLoadFn<Key, Value>;
  readonly #ttl: number;
  readonly #maxCacheSize: number;
  readonly #cacheKeyFn: (key: Key) => CacheKey;
  readonly #batch: boolean;
  readonly #batchScheduleFn: (callback: () => void) => void;
  readonly #maxBatchSize: number;
  readonly #copy: ((value: Value) => Value) | null;
  readonly #scopeFn: (() => object | undefined) | null;
  readonly #promiseCache = new Map<CacheKey, { promise: Promise<Value>; expiresAt: number }>();
  #sweepAt = DataLoader.#minSweepSize;
  readonly #queues = new Map<object | undefined, BatchItem<Key, Value, CacheKey>[]>();

  constructor(batchLoadFn: BatchLoadFn<Key, Value>, options: DataLoaderOptions<Key, Value, CacheKey> = {}) {
    this.#batchLoadFn = batchLoadFn;
    this.#ttl =
      options.cache === true
        ? Number.POSITIVE_INFINITY
        : typeof options.cache === "number" && options.cache > 0
          ? options.cache
          : 0;
    this.#maxCacheSize = Math.max(1, options.maxCacheSize ?? DataLoader.#defaultMaxCacheSize);
    this.#cacheKeyFn = options.cacheKeyFn ?? ((key) => key as unknown as CacheKey);
    this.#batch = options.batch !== false;
    this.#batchScheduleFn = options.batchScheduleFn ?? ((callback) => queueMicrotask(callback));
    this.#maxBatchSize = Math.max(1, Math.floor(options.maxBatchSize ?? DataLoader.#defaultMaxBatchSize));
    this.#copy = options.copy ?? null;
    this.#scopeFn = options.scopeFn ?? null;
    this.name = options.name;
  }

  load(key: Key): Promise<Value> {
    const scope = this.#scopeFn?.();
    const cacheKey = this.#cacheKeyFn(key);
    const cached = scope ? undefined : this.#cached(cacheKey);
    if (cached) return this.#copy ? cached.then(this.#copy) : cached;

    const promise = new Promise<Value>((resolve, reject) => {
      const item = { key, cacheKey, slot: 0, resolve, reject };
      const queue = this.#queues.get(scope);
      if (!this.#batch) this.#run({ keys: [key], items: [item] });
      else if (queue) queue.push(item);
      else {
        this.#queues.set(scope, [item]);
        this.#batchScheduleFn(() => this.#dispatch(scope));
      }
    });
    if (this.#ttl > 0 && !scope) {
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
    if (this.#ttl <= 0 || this.#scopeFn?.()) return this;
    const cacheKey = this.#cacheKeyFn(key);
    if (this.#cached(cacheKey)) return this;
    this.#remember(cacheKey, value instanceof Error ? Promise.reject(value) : Promise.resolve(value));
    return this;
  }

  #cached(cacheKey: CacheKey): Promise<Value> | undefined {
    if (this.#ttl <= 0) return undefined;
    const entry = this.#promiseCache.get(cacheKey);
    if (!entry) return undefined;
    this.#promiseCache.delete(cacheKey);
    if (entry.expiresAt <= Date.now()) return undefined;
    this.#promiseCache.set(cacheKey, entry);
    return entry.promise;
  }

  // Swept whenever the map doubles, so a process-long loader holds about one TTL window of keys, not every key seen.
  // A key that never expires has no window: the map is kept in order of use, and its oldest key leaves past the bound.
  #remember(cacheKey: CacheKey, promise: Promise<Value>) {
    this.#promiseCache.set(cacheKey, { promise, expiresAt: Date.now() + this.#ttl });
    if (this.#ttl === Number.POSITIVE_INFINITY) {
      if (this.#promiseCache.size > this.#maxCacheSize)
        this.#promiseCache.delete(this.#promiseCache.keys().next().value as CacheKey);
      return;
    }
    if (this.#promiseCache.size < this.#sweepAt) return;
    const now = Date.now();
    for (const [key, entry] of this.#promiseCache) if (entry.expiresAt <= now) this.#promiseCache.delete(key);
    this.#sweepAt = Math.max(DataLoader.#minSweepSize, this.#promiseCache.size * 2);
  }

  #dispatch(scope: object | undefined) {
    const queue = this.#queues.get(scope);
    if (!queue) return;
    this.#queues.delete(scope);
    const batches: Batch<Key, Value, CacheKey>[] = [];
    const slots = new Map<CacheKey, number>();
    for (const item of queue) {
      const known = slots.get(item.cacheKey);
      const slot = known ?? slots.size;
      const index = Math.floor(slot / this.#maxBatchSize);
      const batch = batches[index] ?? { keys: [], items: [] };
      batches[index] = batch;
      if (known === undefined) {
        slots.set(item.cacheKey, slot);
        batch.keys.push(item.key);
      }
      item.slot = slot % this.#maxBatchSize;
      batch.items.push(item);
    }
    for (const batch of batches) this.#run(batch);
  }

  #run({ keys, items }: Batch<Key, Value, CacheKey>) {
    let loading: PromiseLike<ReadonlyArray<Value | Error>>;
    try {
      loading = Promise.resolve(this.#batchLoadFn(keys));
    } catch (error) {
      loading = Promise.reject(error);
    }
    loading.then(
      (values) => {
        const received = Array.isArray(values) ? values.length : "no array";
        if (received !== keys.length) {
          const error = new Error(`DataLoader expected ${keys.length} values, received ${received}`);
          for (const { reject } of items) reject(error);
          return;
        }
        const handedOut = new Set<Value | Error>();
        for (const item of items) {
          const value = values[item.slot];
          if (value instanceof Error) item.reject(value);
          else if (this.#copy && handedOut.has(value as Value)) {
            try {
              item.resolve(this.#copy(value as Value));
            } catch (error) {
              item.reject(error);
            }
          } else {
            handedOut.add(value as Value);
            item.resolve(value as Value);
          }
        }
      },
      (error) => {
        for (const { reject } of items) reject(error);
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
    { copy: (list) => (Array.isArray(list) ? ([...list] as V) : list) },
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
