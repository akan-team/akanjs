import type { BaseEnv, Dayjs, SshOptions } from "akanjs/base";
import type { Redis } from "ioredis";
import { adapt } from "../adapt";

export interface CacheSetOptions {
  expireAt?: Dayjs;
}

export interface CacheAdaptor {
  set(topic: string, key: string, value: string | number | Buffer, option?: CacheSetOptions): Promise<void>;
  get<T extends string | number | Buffer>(topic: string, key: string): Promise<T | undefined>;
  delete(topic: string, key: string): Promise<void>;
  getClient?(): Redis;
  hset(
    topic: string,
    key: string,
    subKey: string,
    value: string | number | Buffer,
    option?: CacheSetOptions,
  ): Promise<void>;
  hget<T extends string | number | Buffer>(topic: string, key: string, subKey: string): Promise<T | undefined>;
  hdelete(topic: string, key: string, subKey: string): Promise<void>;
  hkeys(topic: string, key: string): Promise<string[]>;
  hentries<T extends string | number | Buffer>(topic: string, key: string): Promise<[string, T][]>;
  hclear(topic: string, key: string): Promise<void>;
}

interface RedisEnv extends BaseEnv {
  redis?: { username?: string; password?: string; sshOptions?: SshOptions };
}

export class RedisCache
  extends adapt("redisCache", ({ env }) => ({
    redis: env(
      async ({
        appName,
        environment,
        serveDomain,
        operationMode,
        repoName,
        redis = {
          // username, // TODO: Implement username and password
          // password, // TODO: Implement username and password
          sshOptions: {
            host: `${appName}-${environment}.${serveDomain}`,
            port: 32767,
            username: process.env.TUNNEL_USERNAME ?? "root",
            password: process.env.TUNNEL_PASSWORD ?? repoName,
            dstPort: 6379,
          },
        },
      }: RedisEnv) => {
        const createRedis = async (url: string) => {
          const { Redis } = await import("ioredis");
          const redis = new Redis(url, { lazyConnect: true });
          await redis.connect();
          return redis;
        };
        if (process.env.REDIS_URI) return await createRedis(process.env.REDIS_URI);
        else if (environment === "local") return await createRedis("redis://localhost:6379");
        if (operationMode === "cloud")
          return await createRedis(`redis://redis-svc.${appName}-${environment}.svc.cluster.local`);
        else if (operationMode === "local")
          return await createRedis(`redis://${process.env.REDIS_HOST ?? "localhost"}`);
        else return await createRedis(`redis://localhost:6379`);
      },
    ),
  }))
  implements CacheAdaptor
{
  async set(topic: string, key: string, value: string | number | Buffer, option: CacheSetOptions = {}): Promise<void> {
    const expireTime = option.expireAt?.toDate().getTime();
    if (expireTime) await this.redis.set(`${topic}:${key}`, value, "PXAT", expireTime);
    else await this.redis.set(`${topic}:${key}`, value);
  }
  async get<T extends string | number | Buffer>(topic: string, key: string): Promise<T | undefined> {
    const value = await this.redis.get(`${topic}:${key}`);
    return value as T | undefined;
  }
  async delete(topic: string, key: string) {
    await this.redis.del(`${topic}:${key}`);
  }
  async hset(
    topic: string,
    key: string,
    subKey: string,
    value: string | number | Buffer,
    option?: CacheSetOptions,
  ): Promise<void> {
    const expireTime = option?.expireAt?.toDate().getTime();
    const redisKey = `${topic}:${key}`;
    await this.redis.hset(redisKey, subKey, value);
    if (expireTime) await this.redis.pexpireat(redisKey, expireTime);
  }
  async hget<T extends string | number | Buffer>(topic: string, key: string, subKey: string): Promise<T | undefined> {
    const value = await this.redis.hget(`${topic}:${key}`, subKey);
    return value as T | undefined;
  }
  async hdelete(topic: string, key: string, subKey: string): Promise<void> {
    await this.redis.hdel(`${topic}:${key}`, subKey);
  }
  async hkeys(topic: string, key: string): Promise<string[]> {
    return await this.redis.hkeys(`${topic}:${key}`);
  }
  async hentries<T extends string | number | Buffer>(topic: string, key: string): Promise<[string, T][]> {
    const values = await this.redis.hgetall(`${topic}:${key}`);
    return Object.entries(values) as [string, T][];
  }
  async hclear(topic: string, key: string): Promise<void> {
    await this.redis.del(`${topic}:${key}`);
  }
  getClient(): Redis {
    return this.redis;
  }
  override async onDestroy() {
    this.redis.disconnect();
  }
}
