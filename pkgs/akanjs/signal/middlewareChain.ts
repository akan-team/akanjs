import type { BackendEnv, PromiseOrObject } from "akanjs/base";

import type { EndpointInfo } from "./endpointInfo";
import type { MiddlewareCls } from "./middleware";
import type { SignalContext } from "./signalContext";

type MiddlewareHandler = (context: SignalContext, next: () => Promise<unknown>) => PromiseOrObject<unknown>;
type ChainRun = (context: SignalContext, core: () => Promise<unknown>) => Promise<unknown>;

// The middlewares around one kind of call, composed once per (global set, env, scope) instead of on every call.
export class MiddlewareChain {
  // `use(env)` takes no context, so a handler is a function of (class, env) and is built once per process.
  static readonly #handlers = new WeakMap<MiddlewareCls, WeakMap<object, Promise<MiddlewareHandler>>>();
  //? A list, not one slot: MCP calls an endpoint with its own copy of the global map, beside HTTP's.
  static readonly #byEndpoint = new WeakMap<EndpointInfo, MiddlewareChain[]>();
  static readonly #byGlobal = new WeakMap<Map<string, MiddlewareCls>, Map<string, MiddlewareChain[]>>();

  /** An endpoint's whole chain with `endpointInfo`; with `null`, the global middlewares less those named in `skip`. */
  static of(
    global: Map<string, MiddlewareCls>,
    env: BackendEnv,
    endpointInfo: EndpointInfo | null,
    skip: readonly string[] = [],
  ): MiddlewareChain {
    const chains = endpointInfo
      ? MiddlewareChain.#endpointChains(endpointInfo)
      : MiddlewareChain.#globalChains(global, skip);
    for (const chain of chains) if (chain.#serves(global, env)) return chain;
    const classes = [
      ...[...global.entries()].filter(([name]) => !skip.includes(name)).map(([, cls]) => cls),
      ...(endpointInfo?.signalOption.middlewares ?? []),
    ];
    const chain = new MiddlewareChain(classes, global, env);
    chains.push(chain);
    return chain;
  }

  static #endpointChains(endpointInfo: EndpointInfo): MiddlewareChain[] {
    const chains = MiddlewareChain.#byEndpoint.get(endpointInfo) ?? [];
    if (!chains.length) MiddlewareChain.#byEndpoint.set(endpointInfo, chains);
    return chains;
  }
  static #globalChains(global: Map<string, MiddlewareCls>, skip: readonly string[]): MiddlewareChain[] {
    const bySkip = MiddlewareChain.#byGlobal.get(global) ?? new Map<string, MiddlewareChain[]>();
    if (!bySkip.size) MiddlewareChain.#byGlobal.set(global, bySkip);
    const skipKey = skip.join(",");
    const chains = bySkip.get(skipKey) ?? [];
    if (!chains.length) bySkip.set(skipKey, chains);
    return chains;
  }

  readonly #classes: MiddlewareCls[];
  readonly #global: Map<string, MiddlewareCls>;
  readonly #globalSize: number;
  readonly #env: BackendEnv;
  #run: ChainRun | null = null;
  #composing: Promise<ChainRun> | null = null;
  constructor(classes: MiddlewareCls[], global: Map<string, MiddlewareCls>, env: BackendEnv) {
    this.#classes = classes;
    this.#global = global;
    this.#globalSize = global.size;
    this.#env = env;
  }

  //? The global map is filled while DiLifecycle registers modules; a size it has since changed to is a new chain.
  #serves(global: Map<string, MiddlewareCls>, env: BackendEnv) {
    return this.#global === global && this.#env === env && this.#globalSize === global.size;
  }

  run(context: SignalContext, core: () => Promise<unknown>): Promise<unknown> {
    if (this.#run) return this.#run(context, core);
    return this.#compose().then((run) => run(context, core));
  }

  // Every handler resolves before the first call runs; one whose setup failed leaves nothing cached, so the next retries.
  #compose(): Promise<ChainRun> {
    this.#composing ??= Promise.all(this.#classes.map((cls) => MiddlewareChain.#handlerOf(cls, this.#env))).then(
      (handlers) => {
        this.#run = handlers.reduceRight<ChainRun>(
          (next, handler) => async (context, core) => await handler(context, () => next(context, core)),
          (_context, core) => core(),
        );
        return this.#run;
      },
      (error: unknown) => {
        this.#composing = null;
        throw error;
      },
    );
    return this.#composing;
  }

  static #handlerOf(MiddlewareCls: MiddlewareCls, env: BackendEnv): Promise<MiddlewareHandler> {
    const byEnv = MiddlewareChain.#handlers.get(MiddlewareCls) ?? new WeakMap<object, Promise<MiddlewareHandler>>();
    MiddlewareChain.#handlers.set(MiddlewareCls, byEnv);
    const cached = byEnv.get(env);
    if (cached) return cached;
    // A rejected setup is evicted, not cached, so the next request retries instead of the endpoint staying poisoned.
    const handler = Promise.resolve(new MiddlewareCls().use(env) as PromiseOrObject<MiddlewareHandler>).catch(
      (error: unknown) => {
        byEnv.delete(env);
        throw error;
      },
    );
    byEnv.set(env, handler);
    return handler;
  }
}
