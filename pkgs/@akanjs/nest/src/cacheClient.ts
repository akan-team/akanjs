import { Inject, Injectable } from "@nestjs/common";
import type { RedisClientType } from "redis";

@Injectable()
export class CacheClient {
  @Inject("REDIS_CLIENT") redis: RedisClientType;
}
