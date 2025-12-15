import { Logger } from "@akanjs/common";
import { getGqlMeta, signalInfo } from "@akanjs/signal";
import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  NestInterceptor,
  RequestTimeoutException,
} from "@nestjs/common";
import { GqlExecutionContext } from "@nestjs/graphql";
import type { RedisClientType } from "redis";
import { Observable, throwError, TimeoutError } from "rxjs";
import { catchError, map, tap, timeout } from "rxjs/operators";

import { getArgs, getRequest, type GqlReqType, type ReqType } from "./authorization";

interface CacheResult<T> {
  data: T;
  timestamp: number;
}

@Injectable()
export class CacheInterceptor implements NestInterceptor {
  #logger = new Logger("CacheInterceptor");
  #CACHE_PREFIX = "signal:";

  constructor(
    @Inject("REDIS_CLIENT")
    private readonly redis: RedisClientType<any, any, any>
  ) {}

  async intercept<T>(context: ExecutionContext, next: CallHandler): Promise<Observable<T>> {
    const key = signalInfo.getHandlerKey(context.getHandler() as (...args: any) => any);
    const gqlMeta = getGqlMeta(context.getClass(), key);

    // Early return if not a Query or no cache configured
    if (gqlMeta.type !== "Query" || !gqlMeta.signalOption.cache) {
      if (gqlMeta.signalOption.cache)
        this.#logger.warn(`CacheInterceptor: ${key} is not Query endpoint or cache is not set`);
      return next.handle();
    }

    const args = getArgs(context);
    const cacheKey = this.#generateCacheKey(key, args);

    const cachedData = await this.#getCache<T>(cacheKey);
    if (cachedData) {
      this.#logger.debug(`Cache hit for key: ${cacheKey}`);
      return next.handle().pipe(
        map(() => cachedData),
        catchError((error: Error) => {
          const errorMessage = error instanceof Error ? error.message : "Unknown error";
          this.#logger.error(`Error in cache interceptor for ${cacheKey}: ${errorMessage}`);
          return throwError(() => error);
        })
      );
    }

    return next.handle().pipe(
      map((data: T) => {
        const cacheDuration = gqlMeta.signalOption.cache;
        if (typeof cacheDuration === "number") {
          void this.#setCache(cacheKey, data, cacheDuration);
          this.#logger.debug(`Cache set for key: ${cacheKey}`);
        }
        return data;
      }),
      catchError((error: Error) => {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        this.#logger.error(`Error in cache interceptor for ${cacheKey}: ${errorMessage}`);
        return throwError(() => error);
      })
    );
  }

  #generateCacheKey(signalKey: string, args: Record<string, unknown>): string {
    return `${this.#CACHE_PREFIX}${signalKey}:${JSON.stringify(args)}`;
  }

  async #getCache<T>(key: string): Promise<T | null> {
    try {
      const cached = await this.redis.get(key);
      if (!cached) return null;
      const { data } = JSON.parse(cached) as CacheResult<T>;
      return data;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      this.#logger.error(`Error retrieving cache for key ${key}: ${errorMessage}`);
      return null;
    }
  }

  async #setCache(key: string, data: unknown, ttlMs: number): Promise<void> {
    try {
      const cacheData: CacheResult<unknown> = { data, timestamp: Date.now() };
      await this.redis.set(key, JSON.stringify(cacheData), { PX: ttlMs });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      this.#logger.error(`Error setting cache for key ${key}: ${errorMessage}`);
    }
  }
}

@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const key = signalInfo.getHandlerKey(context.getHandler() as (...args: any) => any);
    const gqlMeta = getGqlMeta(context.getClass(), key);
    const timeoutMs = gqlMeta.signalOption.timeout ?? 30000;
    if (timeoutMs === 0) return next.handle();
    return next.handle().pipe(
      timeout(timeoutMs),
      catchError((err) => {
        if (err instanceof TimeoutError) return throwError(() => new RequestTimeoutException());
        return throwError(() => err as Error);
      })
    );
  }
}

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  logger = new Logger("IO");
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const gqlReq: GqlReqType | undefined = context.getArgByIndex(3);
    const req = getRequest(context) as ReqType;
    const reqType = gqlReq?.parentType?.name ?? req.method;
    const reqName = gqlReq?.fieldName ?? req.url;
    const before = Date.now();
    const ip = GqlExecutionContext.create(context).getContext<{ req: { ip?: string } }>().req.ip;
    this.logger.debug(`Before ${reqType}-${reqName} / ${ip} / ${before}`);
    return next.handle().pipe(
      tap(() => {
        const after = Date.now();
        this.logger.debug(`After  ${reqType}-${reqName} / ${ip} / ${after} (${after - before}ms)`);
      })
    );
  }
}
