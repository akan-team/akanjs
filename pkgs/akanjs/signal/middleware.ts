import type { BackendEnv, Cls, PromiseOrObject } from "akanjs/base";
import { Logger } from "akanjs/common";
import { ByIdRead } from "./byIdRead";
import { EndpointErrorContract } from "./endpointErrorContract";
import { Exception, isExceptionLike } from "./exception";
import { SignalFailure } from "./SignalFailure";
import type { SignalContext } from "./signalContext";

export interface Middleware<Env extends BackendEnv = BackendEnv> {
  use(env: Env): PromiseOrObject<(context: SignalContext, next: () => Promise<unknown>) => PromiseOrObject<unknown>>;
}

export type MiddlewareCls = Cls<Middleware, { readonly refName: string }>;

export const middleware = (refName: string) => {
  return class Middleware {
    static refName = refName;
    async use(env: BackendEnv) {
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
      // Registered by default, so the messages are only built when `debug` is on; re-read per call for `setLevel`.
      const debug = Logger.shouldLog("debug");
      if (debug) context.adaptor.logger.debug(`Before ${context.endpointInfo.type}-${context.key} / ${start}`);
      try {
        const result = await next();
        if (debug) {
          context.adaptor.logger.debug(`After ${context.endpointInfo.type}-${context.key} / ${Date.now() - start}ms`);
        }
        return result;
      } catch (error) {
        //? A body the caller could not deliver is its own 400, unlogged as when the body was read before the chain.
        if (context.isBodyReadFailure(error)) throw error;
        const cause = error instanceof Error && error.cause !== undefined ? ` (cause: ${String(error.cause)})` : "";
        const line = `Error ${context.endpointInfo.type}-${context.key} / ${Date.now() - start}ms: ${String(error)}${cause}`;
        const status = isExceptionLike(error) ? error.statusCode : SignalFailure.generalized(error).statusCode;
        // A refused flood would write a line per call; `EndpointRateLimit` already warned once for the endpoint.
        //? A declared error is an answer the endpoint documents, so probes of a public one must not reach error alerts.
        if (
          status === 429 ||
          ByIdRead.missed(context.endpointInfo, error) ||
          (isExceptionLike(error) && EndpointErrorContract.promised(context.endpointInfo, error))
        ) {
          if (debug) context.adaptor.logger.debug(line);
        } else context.adaptor.logger.error(line);
        throw error;
      }
    };
  }
}

// Registered by default, so only an endpoint that declared a `timeout` is bounded.
// XXX losing the race does not cancel the work: `next()` keeps running, so a handler that writes still writes.
export class Timeout extends middleware("timeout") {
  override async use() {
    return async (context: SignalContext, next: () => Promise<unknown>) => {
      const timeout = context.endpointInfo.signalOption.timeout;
      if (!timeout || !Number.isFinite(timeout) || timeout <= 0) return await next();
      const start = performance.now();
      let timer: ReturnType<typeof setTimeout> | undefined;
      let settled = false;
      try {
        return await Promise.race([
          next(),
          // A dictionary key, the same answer the client gives when its own budget runs out.
          new Promise((_, reject) => {
            //? Off the clock while a deferred body uploads: that runs at the caller's pace, not the handler's.
            const expire = () => {
              if (settled) return;
              const { ms, pending } = context.bodyReadTime;
              if (pending) return void pending.then(expire);
              const left = start + timeout + ms - performance.now();
              if (left > 0) timer = setTimeout(expire, left);
              else reject(new Exception(504, "base.error.gatewayTimeout"));
            };
            timer = setTimeout(expire, timeout);
          }),
        ]);
      } finally {
        settled = true;
        clearTimeout(timer);
      }
    };
  }
}
