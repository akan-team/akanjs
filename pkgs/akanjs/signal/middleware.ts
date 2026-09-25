import type { BaseEnv, Cls, PromiseOrObject } from "akanjs/base";
import { type CacheAdaptor, CacheAdaptorRole } from "akanjs/service";
import dayjs from "dayjs";
import type { SignalContext } from "./signalContext";
import { traceCache } from "./trace";

export interface Middleware<Env extends BaseEnv = BaseEnv> {
  use(env: Env): PromiseOrObject<(context: SignalContext, next: () => Promise<unknown>) => PromiseOrObject<unknown>>;
}

export type MiddlewareCls = Cls<Middleware, { readonly refName: string }>;

export const middleware = (refName: string) => {
  return class Middleware {
    static refName = refName;
    async use(env: BaseEnv) {
      return async (context: SignalContext, next: () => Promise<unknown>) => {
        return await next();
      };
    }
  };
};

export class Logging extends middleware("logging") {
  override async use() {
    return async (context: SignalContext, next: () => Promise<unknown>) => {
      const start = Date.now();
      context.adaptor.logger.debug(`Before ${context.endpointInfo.type}-${context.key} / ${start}`);
      try {
        const result = await next();
        const duration = Date.now() - start;
        context.adaptor.logger.debug(`After ${context.endpointInfo.type}-${context.key} / ${duration}ms`);
        return result;
      } catch (error) {
        const duration = Date.now() - start;
        context.adaptor.logger.error(
          `Error ${context.endpointInfo.type}-${context.key} / ${duration}ms: ${String(error)}`,
        );
        throw error;
      }
    };
  }
}

export class Cache extends middleware("cache") {
  override async use() {
    return async (context: SignalContext, next: () => Promise<unknown>) => {
      const cache = context.getAdaptor(CacheAdaptorRole) as unknown as CacheAdaptor;
      const topic = "cache";
      const key = `${context.key}:${JSON.stringify(context.args)}`;

      const cached = await cache.get<string>(topic, key);
      if (cached) {
        context.adaptor.logger.debug(`Cache hit ${context.key}`);
        try {
          const parsed = JSON.parse(cached);
          traceCache(true);
          return parsed;
        } catch (parseError) {
          context.adaptor.logger.warn(`Cache parse error ${context.key}: ${String(parseError)}`);
          await cache.delete(topic, key);
        }
      }
      traceCache(false);

      // Execute - middleware는 makeResponse 이전에 실행됨
      const result = await next();

      context.adaptor.logger.debug(`Caching result type ${context.key}: ${typeof result} / ${Array.isArray(result)}`);

      const serialized = JSON.stringify(result);
      await cache.set(topic, key, serialized, { expireAt: dayjs().add(60, "second") });

      return result;
    };
  }
}

export class Timeout extends middleware("timeout") {
  override async use() {
    return async (context: SignalContext, next: () => Promise<unknown>) => {
      const timeout = context.endpointInfo.signalOption.timeout ?? 5000;
      return Promise.race([
        next(),
        new Promise((_, reject) => setTimeout(() => reject(new Error(`Request timeout after ${timeout}ms`)), timeout)),
      ]);
    };
  }
}

export class Retry extends middleware("retry") {
  override async use() {
    return async (context: SignalContext, next: () => Promise<unknown>) => {
      const maxRetries = 3;
      let lastError: Error | null = null;

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          return await next();
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          console.warn(`[${context.key}] Retry ${attempt + 1}/${maxRetries}:`, lastError.message);

          if (attempt < maxRetries - 1) {
            // Exponential backoff
            await new Promise((resolve) => setTimeout(resolve, 2 ** attempt * 100));
          }
        }
      }
      throw lastError;
    };
  }
}
