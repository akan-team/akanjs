import type { BaseEnv, PromiseOrObject } from "akanjs/base";
import type { MiddlewareCls } from "akanjs/signal";
import type { WebProxyRegistration } from "./proxy";
import { HostBasePathWebProxy, LocaleWebProxy } from "./proxy";

/** App/library server option builder for use objects, signal middleware, and web proxies. */
export class AkanOption<Env extends BaseEnv = BaseEnv> {
  readonly #getUses: ((env: Env) => Record<string, PromiseOrObject<unknown>>)[];
  readonly #middlewares: MiddlewareCls[] = [];
  readonly #webProxies: WebProxyRegistration[] = [];
  constructor() {
    this.#getUses = [];
  }
  use(fnOrObject: ((env: Env) => Record<string, PromiseOrObject<unknown>>) | Record<string, PromiseOrObject<unknown>>) {
    if (typeof fnOrObject === "function")
      this.#getUses.push(fnOrObject as (env: Env) => Record<string, PromiseOrObject<unknown>>);
    else this.#getUses.push(() => fnOrObject);
    return this;
  }
  applyMiddleware(...middlewares: MiddlewareCls[]) {
    this.#middlewares.push(...middlewares);
    return this;
  }
  applyWebProxy(...proxies: WebProxyRegistration[]) {
    this.#webProxies.push(...proxies);
    return this;
  }
  getUses(env: Env): Record<string, PromiseOrObject<unknown>> {
    const uses = this.#getUses.map((fn) => fn(env));
    return Object.assign({}, ...uses);
  }
  getMiddlewares(): MiddlewareCls[] {
    return this.#middlewares;
  }
  getWebProxies(): WebProxyRegistration[] {
    return this.#webProxies;
  }
}

export function createDefaultAkanOption() {
  return new AkanOption<BaseEnv>().applyWebProxy(LocaleWebProxy, HostBasePathWebProxy);
}
