import { type BaseEnv, type Dayjs, getEnv } from "akanjs/base";
import type { Redis } from "ioredis";
import { adapt } from "../adapt";

export interface CacheSetOptions {
  expireAt?: Dayjs;
}

/** An object, an array or a boolean is stored as JSON and read back parsed, so a class instance returns as its JSON. */
export type CacheValue = string | number | boolean | Uint8Array | object;

export interface CacheAdaptor {
  set(topic: string, key: string, value: CacheValue, option?: CacheSetOptions): Promise<void>;
  get<T extends CacheValue = CacheValue>(topic: string, key: string): Promise<T | undefined>;
  delete(topic: string, key: string): Promise<void>;
  /** Reads and removes in one step: of two callers racing for a one-time value, one gets it and the other nothing. */
  getDel<T extends CacheValue = CacheValue>(topic: string, key: string): Promise<T | undefined>;
  /** Writes only where nothing live is stored, and answers whether this call wrote. */
  setIfAbsent(topic: string, key: string, value: CacheValue, option?: CacheSetOptions): Promise<boolean>;
  /** Adds `by` and answers the sum. A counter this call creates takes `expireAt`; a live one keeps its own. */
  incr(topic: string, key: string, by?: number, option?: CacheSetOptions): Promise<number>;
  /** Takes the lease for `owner` when nobody else holds a live one; the holder calling again renews it. */
  acquireLease(topic: string, key: string, owner: string, ttlMs: number): Promise<boolean>;
  /** Extends a lease `owner` still holds, and answers false once it lapsed or passed to someone else. */
  renewLease(topic: string, key: string, owner: string, ttlMs: number): Promise<boolean>;
  releaseLease(topic: string, key: string, owner: string): Promise<void>;
  getClient?(): Redis;
  hset(topic: string, key: string, subKey: string, value: CacheValue, option?: CacheSetOptions): Promise<void>;
  hget<T extends CacheValue = CacheValue>(topic: string, key: string, subKey: string): Promise<T | undefined>;
  hdelete(topic: string, key: string, subKey: string): Promise<void>;
  hkeys(topic: string, key: string): Promise<string[]>;
  hentries<T extends CacheValue = CacheValue>(topic: string, key: string): Promise<[string, T][]>;
  hclear(topic: string, key: string): Promise<void>;
  hgetDel<T extends CacheValue = CacheValue>(topic: string, key: string, subKey: string): Promise<T | undefined>;
  hsetIfAbsent(
    topic: string,
    key: string,
    subKey: string,
    value: CacheValue,
    option?: CacheSetOptions,
  ): Promise<boolean>;
  hincr(topic: string, key: string, subKey: string, by?: number, option?: CacheSetOptions): Promise<number>;
}

interface RedisEnv extends BaseEnv {
  redis?: { username?: string; password?: string };
}

export class RedisCache
  extends adapt("redisCache", ({ env }) => ({
    redis: env(async ({ redis = {} }: RedisEnv): Promise<Redis> => {
      const { Redis } = await import("ioredis");
      // Credentials the app named in `option.ts` win over anything embedded in the URL, and are simply
      // absent when it named none — an unauthenticated Redis is the local and in-cluster shape. They used
      // to be declared on the env and read by nothing, so a password set here silently did not apply.
      const client = new Redis(RedisCache.resolveUrl(), {
        lazyConnect: true,
        ...(redis.username ? { username: redis.username } : {}),
        ...(redis.password ? { password: redis.password } : {}),
      });
      await client.connect();
      return client;
    }),
    // Every key, and the pubsub channels that read this, sit under the app and environment: one Redis shared by
    // two apps, or by an app's debug and main, would otherwise hand each other sessions and room events.
    keyPrefix: env(() => {
      const { repoName, appName, environment } = getEnv();
      return `${repoName}:${appName}:${environment}:`;
    }),
  }))
  implements CacheAdaptor
{
  /**
   * `REDIS_URI` names the server — `rediss://` for TLS, the account and the database number ride the URL. Only a
   * development machine may go without: every instance of a deployed app must reach the same Redis, and a guessed
   * host is a split brain that boots.
   */
  static resolveUrl() {
    if (process.env.REDIS_URI) return process.env.REDIS_URI;
    const { environment, operationMode, databaseMode } = getEnv();
    if (environment === "local") return "redis://localhost:6379";
    // `akan start` against a remote environment tunnels its Redis and names the local end here.
    if (operationMode === "local") return `redis://${process.env.REDIS_HOST ?? "localhost"}`;
    throw new Error(
      `REDIS_URI is not set. The ${databaseMode ?? "multiple"} database mode keeps its cache, queue and pubsub in Redis, and every instance has to reach the same one.`,
    );
  }

  //* Redis keeps bytes, so a value's type rides in front of it: `\0` and a type letter. A string that does not start
  //* with `\0` is stored as itself — the common case, and the one anything else reading the key understands.
  static #encode(value: CacheValue): string | Buffer {
    if (typeof value === "string") return value.startsWith("\0") ? `\0s${value}` : value;
    if (typeof value === "number") return `\0n${value}`;
    if (value instanceof Uint8Array)
      return Buffer.concat([RedisCache.#bufferTag, Buffer.from(value.buffer, value.byteOffset, value.byteLength)]);
    return `\0j${JSON.stringify(value ?? null)}`;
  }
  static readonly #bufferTag = Buffer.from([0, 0x62]);
  static #decode<T>(raw: Buffer | null | undefined): T | undefined {
    if (raw === null || raw === undefined) return undefined;
    if (raw[0] !== 0 || raw.length < 2) return raw.toString() as T;
    const body = raw.subarray(2);
    switch (raw[1]) {
      case 0x6e:
        return Number(body.toString()) as T;
      case 0x62:
        return Buffer.from(body) as T;
      case 0x6a:
        return JSON.parse(body.toString()) as T;
      default:
        return body.toString() as T;
    }
  }

  // `%.17g` spells every integer a double holds exactly without an exponent; Lua's own `tostring` rounds to 14 digits.
  static readonly #incrScript = `
local raw = redis.call("GET", KEYS[1])
local current = 0
if raw then
  if string.byte(raw, 1) == 0 then
    if string.sub(raw, 2, 2) ~= "n" then return redis.error_reply("ERR cached value is not a number") end
    current = tonumber(string.sub(raw, 3))
  else
    current = tonumber(raw)
  end
  if not current then return redis.error_reply("ERR cached value is not a number") end
end
local sum = string.format("%.17g", current + tonumber(ARGV[1]))
if raw then
  redis.call("SET", KEYS[1], "\\0n" .. sum, "KEEPTTL")
elseif ARGV[2] ~= "" then
  redis.call("SET", KEYS[1], "\\0n" .. sum, "PXAT", ARGV[2])
else
  redis.call("SET", KEYS[1], "\\0n" .. sum)
end
return sum`;
  static readonly #acquireScript = `
local holder = redis.call("GET", KEYS[1])
if holder and holder ~= ARGV[1] then return 0 end
redis.call("SET", KEYS[1], ARGV[1], "PX", ARGV[2])
return 1`;
  static readonly #renewScript = `
if redis.call("GET", KEYS[1]) ~= ARGV[1] then return 0 end
redis.call("PEXPIRE", KEYS[1], ARGV[2])
return 1`;
  static readonly #releaseScript = `
if redis.call("GET", KEYS[1]) == ARGV[1] then redis.call("DEL", KEYS[1]) end
return 0`;

  #key(topic: string, key: string) {
    return `${this.keyPrefix}${topic}:${key}`;
  }
  async set(topic: string, key: string, value: CacheValue, option: CacheSetOptions = {}): Promise<void> {
    const expireTime = option.expireAt?.toDate().getTime();
    if (expireTime) await this.redis.set(this.#key(topic, key), RedisCache.#encode(value), "PXAT", expireTime);
    else await this.redis.set(this.#key(topic, key), RedisCache.#encode(value));
  }
  async get<T extends CacheValue = CacheValue>(topic: string, key: string): Promise<T | undefined> {
    return RedisCache.#decode<T>(await this.redis.getBuffer(this.#key(topic, key)));
  }
  async delete(topic: string, key: string) {
    await this.redis.del(this.#key(topic, key));
  }
  async getDel<T extends CacheValue = CacheValue>(topic: string, key: string): Promise<T | undefined> {
    return RedisCache.#decode<T>(await this.redis.getdelBuffer(this.#key(topic, key)));
  }
  async setIfAbsent(topic: string, key: string, value: CacheValue, option: CacheSetOptions = {}): Promise<boolean> {
    const expireTime = option.expireAt?.toDate().getTime();
    const written = expireTime
      ? await this.redis.set(this.#key(topic, key), RedisCache.#encode(value), "PXAT", expireTime, "NX")
      : await this.redis.set(this.#key(topic, key), RedisCache.#encode(value), "NX");
    return written === "OK";
  }
  async incr(topic: string, key: string, by = 1, option: CacheSetOptions = {}): Promise<number> {
    const expireTime = option.expireAt?.toDate().getTime();
    const sum = await this.redis.eval(RedisCache.#incrScript, 1, this.#key(topic, key), by, expireTime ?? "");
    return Number(sum);
  }
  async acquireLease(topic: string, key: string, owner: string, ttlMs: number): Promise<boolean> {
    return Number(await this.redis.eval(RedisCache.#acquireScript, 1, this.#key(topic, key), owner, ttlMs)) === 1;
  }
  async renewLease(topic: string, key: string, owner: string, ttlMs: number): Promise<boolean> {
    return Number(await this.redis.eval(RedisCache.#renewScript, 1, this.#key(topic, key), owner, ttlMs)) === 1;
  }
  async releaseLease(topic: string, key: string, owner: string): Promise<void> {
    await this.redis.eval(RedisCache.#releaseScript, 1, this.#key(topic, key), owner);
  }

  //* A hash field's expiry is a score in a sorted set beside the hash: `PEXPIREAT` on the hash would expire every
  //* entry with the last one written, and per-field `HPEXPIREAT` needs Redis 7.4. Expired fields are dropped by
  //* the script below on every write and every listing, and read as missing until then.
  static readonly #purgeScript = `
local expired = redis.call("ZRANGEBYSCORE", KEYS[2], "-inf", ARGV[1], "LIMIT", 0, 500)
if #expired > 0 then
  redis.call("HDEL", KEYS[1], unpack(expired))
  redis.call("ZREM", KEYS[2], unpack(expired))
end
return #expired`;
  static readonly #hgetDelScript = `
local value = redis.call("HGET", KEYS[1], ARGV[1])
if not value then return false end
local expireAt = redis.call("ZSCORE", KEYS[2], ARGV[1])
redis.call("HDEL", KEYS[1], ARGV[1])
redis.call("ZREM", KEYS[2], ARGV[1])
if expireAt and tonumber(expireAt) <= tonumber(ARGV[2]) then return false end
return value`;
  static readonly #hsetIfAbsentScript = `
if redis.call("HEXISTS", KEYS[1], ARGV[1]) == 1 then
  local expireAt = redis.call("ZSCORE", KEYS[2], ARGV[1])
  if not expireAt or tonumber(expireAt) > tonumber(ARGV[3]) then return 0 end
end
redis.call("HSET", KEYS[1], ARGV[1], ARGV[2])
if ARGV[4] ~= "" then redis.call("ZADD", KEYS[2], ARGV[4], ARGV[1]) else redis.call("ZREM", KEYS[2], ARGV[1]) end
return 1`;
  static readonly #hincrScript = `
local raw = redis.call("HGET", KEYS[1], ARGV[1])
local expireAt = redis.call("ZSCORE", KEYS[2], ARGV[1])
local live = raw and (not expireAt or tonumber(expireAt) > tonumber(ARGV[3]))
local current = 0
if live then
  if string.byte(raw, 1) == 0 then
    if string.sub(raw, 2, 2) ~= "n" then return redis.error_reply("ERR cached value is not a number") end
    current = tonumber(string.sub(raw, 3))
  else
    current = tonumber(raw)
  end
  if not current then return redis.error_reply("ERR cached value is not a number") end
end
local sum = string.format("%.17g", current + tonumber(ARGV[2]))
redis.call("HSET", KEYS[1], ARGV[1], "\\0n" .. sum)
if not live then
  if ARGV[4] ~= "" then redis.call("ZADD", KEYS[2], ARGV[4], ARGV[1]) else redis.call("ZREM", KEYS[2], ARGV[1]) end
end
return sum`;
  // The scripts touch a hash and its expiry set together, so both keys share a hash tag and would land on one slot of
  // a Redis Cluster.
  #hashKeys(topic: string, key: string) {
    const hashKey = `${this.keyPrefix}{${topic}:${key}}`;
    return { hashKey, ttlKey: `${hashKey}:__ttl` };
  }
  async #purgeExpired(topic: string, key: string) {
    const { hashKey, ttlKey } = this.#hashKeys(topic, key);
    while (Number(await this.redis.eval(RedisCache.#purgeScript, 2, hashKey, ttlKey, Date.now())) >= 500);
  }
  async hset(topic: string, key: string, subKey: string, value: CacheValue, option?: CacheSetOptions): Promise<void> {
    const expireTime = option?.expireAt?.toDate().getTime();
    const { hashKey, ttlKey } = this.#hashKeys(topic, key);
    const write = this.redis.multi().hset(hashKey, subKey, RedisCache.#encode(value));
    if (expireTime) write.zadd(ttlKey, expireTime, subKey);
    else write.zrem(ttlKey, subKey);
    await write.exec();
    await this.#purgeExpired(topic, key);
  }
  async hget<T extends CacheValue = CacheValue>(topic: string, key: string, subKey: string): Promise<T | undefined> {
    const { hashKey, ttlKey } = this.#hashKeys(topic, key);
    const replies = await this.redis.multi().hgetBuffer(hashKey, subKey).zscore(ttlKey, subKey).exec();
    const value = replies?.[0]?.[1] as Buffer | null | undefined;
    const expireAt = replies?.[1]?.[1] as string | null | undefined;
    if (expireAt !== null && expireAt !== undefined && Number(expireAt) <= Date.now()) return undefined;
    return RedisCache.#decode<T>(value);
  }
  async hdelete(topic: string, key: string, subKey: string): Promise<void> {
    const { hashKey, ttlKey } = this.#hashKeys(topic, key);
    await this.redis.multi().hdel(hashKey, subKey).zrem(ttlKey, subKey).exec();
  }
  async hkeys(topic: string, key: string): Promise<string[]> {
    await this.#purgeExpired(topic, key);
    return await this.redis.hkeys(this.#hashKeys(topic, key).hashKey);
  }
  async hentries<T extends CacheValue = CacheValue>(topic: string, key: string): Promise<[string, T][]> {
    await this.#purgeExpired(topic, key);
    const values = await this.redis.hgetallBuffer(this.#hashKeys(topic, key).hashKey);
    return Object.entries(values).map(([subKey, value]) => [subKey, RedisCache.#decode<T>(value) as T]);
  }
  async hclear(topic: string, key: string): Promise<void> {
    const { hashKey, ttlKey } = this.#hashKeys(topic, key);
    await this.redis.del(hashKey, ttlKey);
  }
  async hgetDel<T extends CacheValue = CacheValue>(topic: string, key: string, subKey: string): Promise<T | undefined> {
    const { hashKey, ttlKey } = this.#hashKeys(topic, key);
    const value = await this.redis.callBuffer(
      "EVAL",
      RedisCache.#hgetDelScript,
      2,
      hashKey,
      ttlKey,
      subKey,
      Date.now(),
    );
    return RedisCache.#decode<T>(value as Buffer | null);
  }
  async hsetIfAbsent(
    topic: string,
    key: string,
    subKey: string,
    value: CacheValue,
    option: CacheSetOptions = {},
  ): Promise<boolean> {
    const { hashKey, ttlKey } = this.#hashKeys(topic, key);
    const expireTime = option.expireAt?.toDate().getTime() ?? "";
    const args = [subKey, RedisCache.#encode(value), Date.now(), expireTime];
    const written = await this.redis.eval(RedisCache.#hsetIfAbsentScript, 2, hashKey, ttlKey, ...args);
    return Number(written) === 1;
  }
  async hincr(topic: string, key: string, subKey: string, by = 1, option: CacheSetOptions = {}): Promise<number> {
    const { hashKey, ttlKey } = this.#hashKeys(topic, key);
    const expireTime = option.expireAt?.toDate().getTime() ?? "";
    const args = [subKey, by, Date.now(), expireTime];
    return Number(await this.redis.eval(RedisCache.#hincrScript, 2, hashKey, ttlKey, ...args));
  }
  getClient(): Redis {
    return this.redis;
  }
  override async onDestroy() {
    this.redis.disconnect();
  }
}
