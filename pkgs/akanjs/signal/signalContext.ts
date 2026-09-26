import {
  Any,
  type BackendEnv,
  type Cls,
  FIELD_META,
  INTERNAL_META,
  PrimitiveRegistry,
  type PromiseOrObject,
  Upload,
} from "akanjs/base";
import { clientPortFromHeaders, normalizeIpAddress, TrustedProxy } from "akanjs/common";
import {
  type ConstantCls,
  type ConstantFieldTypeInput,
  ConstantRegistry,
  deserialize,
  serialize,
} from "akanjs/constant";
import type { Adaptor, AdaptorCls, DatabaseService, InjectRegistry, LiveRegistry } from "akanjs/service";
import type { Internal, InternalCls, InternalInfo, MiddlewareCls } from ".";
import { CrossSiteGuard } from "./CrossSiteGuard";
import { EndpointCache } from "./endpointCache";
import type { EndpointInfo, EndpointType } from "./endpointInfo";
import { Exception, isExceptionLike } from "./exception";
import { type GuardCls, guardOf } from "./guard";
import { SignalFailure } from "./SignalFailure";
import { getCurrentTrace, runTraced, SignalTrace, type TraceOrigin, traceSpan } from "./trace";

export type SignalTransportType = "http" | "websocket";

/** What `Bun.Server.requestIP` reports for the socket a request arrived on. */
export type HttpPeerResolver = (req: Request) => { address: string; port: number } | null;

const httpEndpointTypes = new Set<EndpointType>(["query", "mutation"]);

interface WebSocketRequest {
  ws: Bun.ServerWebSocket<unknown>;
  data: unknown[];
  eventType: WebSocketEventType;
}
type RuntimeRecord = Record<string, unknown>;
type MiddlewareHandler = (context: SignalContext, next: () => Promise<unknown>) => PromiseOrObject<unknown>;
/**
 * Every relation subtree one response has resolved, by model class and then document id. Request-scoped: the
 * outermost `resolveReturn` starts it and every recursion threads it down, so nothing survives the response.
 */
type ResolveCache = Map<ConstantFieldTypeInput, Map<string, Promise<unknown>>>;

export class SignalContext<
  Ctx extends HttpExecutionContext | WebSocketExecutionContext = HttpExecutionContext | WebSocketExecutionContext,
  Env extends BackendEnv = BackendEnv,
> {
  key: string;
  transport: SignalTransportType;
  ctx: Ctx;
  endpointInfo: EndpointInfo;
  adaptor: Adaptor;
  /**
   * Which surface the call came in on. The transport for a plain request, `mcp` for one an agent made through the
   * MCP endpoint. Held on the context rather than read off the trace: `SignalTrace.create` may answer `null`, and a
   * guard that asked the trace whether a model is driving the call would fail open exactly there.
   */
  readonly origin: TraceOrigin;
  args: unknown[] = [];
  internalArgs: unknown[] = [];
  trace: SignalTrace | null = null;
  #registry: InjectRegistry;
  #env: Env;
  #live: LiveRegistry;
  #middleware: Map<string, MiddlewareCls>;
  static #reported = new WeakSet<object>();
  constructor(
    key: string,
    reqOrWsReq: Bun.BunRequest | WebSocketRequest,
    {
      endpointInfo,
      adaptor,
      registry,
      env,
      live,
      middleware,
      ctx,
      origin,
    }: {
      endpointInfo: EndpointInfo;
      adaptor: Adaptor;
      registry: InjectRegistry;
      env: Env;
      live: LiveRegistry;
      middleware: Map<string, MiddlewareCls>;
      /**
       * Runs the endpoint against a caller-built context instead of one derived from the request. MCP needs it:
       * its arguments arrive as one named object rather than in a URL, but every guard, middleware and
       * internalArg reads the request through this context, so the transport has to stay the same one.
       */
      ctx?: Ctx;
      /** Who is calling, for the log record; defaults to the transport, and MCP names itself. */
      origin?: TraceOrigin;
    },
  ) {
    this.key = key;
    this.transport = httpEndpointTypes.has(endpointInfo.type) ? "http" : "websocket";
    this.origin = origin ?? this.transport;
    this.endpointInfo = endpointInfo;
    if (ctx) this.ctx = ctx;
    else if (this.transport === "http") this.ctx = new HttpExecutionContext(reqOrWsReq as Bun.BunRequest) as Ctx;
    else this.ctx = new WebSocketExecutionContext(reqOrWsReq as WebSocketRequest) as Ctx;
    this.adaptor = adaptor;
    this.#registry = registry;
    this.#env = env;
    this.#live = live;
    this.#middleware = middleware;
    // A caller that already opened the trace (`SignalContext.run`) owns its life; only a bare construction
    // starts one here, and `exec()` then closes it.
    this.trace = getCurrentTrace() ?? SignalTrace.create(key, endpointInfo.type, origin ?? this.transport);
    if (this.trace && this.transport === "http")
      this.trace.applyDebugHeader((reqOrWsReq as { headers?: Headers }).headers?.get?.("x-akan-debug"));
  }

  getAdaptor<T extends Adaptor>(adaptorCls: AdaptorCls<T>): T {
    const instance = this.#registry.adaptor.get(adaptorCls);
    if (!instance) {
      throw new Exception.Error(`Adaptor "${adaptorCls.refName}" not found in registry`);
    }
    return instance as T;
  }
  getService<T>(refName: string): T {
    const service = this.#live.service.get(refName);
    if (!service) throw new Exception.Error(`Service "${refName}" not found in live registry`);
    return service as T;
  }
  async init() {
    // Before the body is read, because a refused request must not have its arguments parsed or its files buffered.
    // Only a mutation: a query is a GET whose response no cross-origin caller can read, and a websocket frame
    // rides a socket whose handshake already carried the check the browser makes for it.
    if (this.endpointInfo.type === "mutation" && this.transport === "http") {
      const httpCtx = this.getHttpContext();
      CrossSiteGuard.assertOrigin(httpCtx.req, httpCtx.url, this.key);
    }
    if (this.trace) {
      const start = performance.now();
      this.args = await this.ctx.getArgs(this.endpointInfo);
      this.trace.recordSpan("argParse", performance.now() - start);
    } else {
      this.args = await this.ctx.getArgs(this.endpointInfo);
    }
    return this;
  }
  /**
   * In declaration order, not in parallel. Every guard has to pass either way, so the only thing concurrency
   * bought was that a call refused by two of them named whichever lost the race — a log line that changed
   * between identical requests. Sequential also stops at the first refusal instead of running the rest.
   */
  async #checkGuards() {
    for (const GuardCls of this.endpointInfo.signalOption.guards ?? []) {
      if (!(await guardOf(GuardCls).canPass(this)))
        throw new Exception.Forbidden(`Access denied by guard: ${GuardCls.name}`);
    }
  }
  /**
   * Re-checks this context's guards outside of a request, for a websocket room that is already
   * subscribed. Only global middlewares run: they carry the account resolution this depends on,
   * while endpoint middlewares would observe a call that never executes.
   */
  async authorize(): Promise<boolean> {
    try {
      await this.#withMiddleware(async () => await this.#checkGuards(), { endpointMiddlewares: false })();
      return true;
    } catch {
      return false;
    }
  }
  /**
   * Evaluates only the guards marked `static scope = "account"` — the ones that read the caller and nothing
   * else — so a catalogue can hide entries the caller certainly cannot use.
   *
   * **Never an access gate.** An endpoint whose guards are all resource-scoped passes here and is stopped later
   * by `#checkGuards` with the arguments those guards need. Erring visible is deliberate: a resource guard fails
   * closed with no arguments, so evaluating one here would delete every legitimate entry from the listing.
   */
  async canListForAccount(): Promise<boolean> {
    const guards = (this.endpointInfo.signalOption.guards ?? []).filter((GuardCls) => GuardCls.scope === "account");
    if (guards.length === 0) return true;
    try {
      // Without the logging middleware: a refusal is the expected answer for most of a catalogue, and it would
      // otherwise be written as an `Error …` line on every listing.
      await this.#withMiddleware(
        async () => {
          for (const GuardCls of guards) {
            if (!(await this.#canListWith(GuardCls)))
              throw new Exception.Forbidden(`Access denied by guard: ${GuardCls.name}`);
          }
        },
        { endpointMiddlewares: false, skip: ["logging"] },
      )();
      return true;
    } catch {
      return false;
    }
  }
  /**
   * An account guard has no arguments here, so one that throws anything but a refusal reached for them anyway —
   * a resource guard mismarked. The entry stays hidden (fail-closed), but the guard is named once per endpoint,
   * because otherwise the only trace is a tool that is missing for everyone.
   */
  async #canListWith(GuardCls: GuardCls): Promise<boolean> {
    try {
      return await guardOf(GuardCls).canPass(this);
    } catch (error) {
      if (!isExceptionLike(error)) this.#warnMismarkedGuard(GuardCls, error);
      throw error;
    }
  }
  static #mismarkedWarned = new WeakMap<GuardCls, Set<string>>();
  #warnMismarkedGuard(GuardCls: GuardCls, error: unknown) {
    const keys = SignalContext.#mismarkedWarned.get(GuardCls) ?? new Set<string>();
    if (keys.has(this.key)) return;
    keys.add(this.key);
    SignalContext.#mismarkedWarned.set(GuardCls, keys);
    this.adaptor.logger.warn(
      `Guard ${GuardCls.name} threw while listing "${this.key}" with no arguments: ${String(error)}. A guard that reads the call's arguments is \`static scope = "resource"\`; until then the entry is hidden from every listing.`,
    );
  }
  #withMiddleware(
    coreExec: () => Promise<unknown>,
    { endpointMiddlewares = true, skip = [] as string[] }: { endpointMiddlewares?: boolean; skip?: string[] } = {},
  ): () => Promise<unknown> {
    const middlewares = [
      ...[...this.#middleware.entries()].filter(([name]) => !skip.includes(name)).map(([, cls]) => cls),
      ...(endpointMiddlewares ? (this.endpointInfo.signalOption.middlewares ?? []) : []),
    ];
    if (middlewares.length === 0) return coreExec;
    let next = coreExec;
    for (let i = middlewares.length - 1; i >= 0; i--) {
      const MiddlewareCls = middlewares[i];
      if (!MiddlewareCls) continue;
      const currentNext = next;
      next = async () =>
        await (await SignalContext.#getMiddlewareHandler(MiddlewareCls, this.getEnv()))(this, currentNext);
    }
    return next;
  }
  /**
   * `use(env)` takes no context, so the instance and the handler it returns are a function of `(class, env)` and
   * hold for the life of the process. Building both per request cost an instance, a handler and a closure on every
   * call for every registered middleware — and `Logging` is registered by default.
   */
  static #httpPeer: HttpPeerResolver | null = null;
  /**
   * Lets the http branch of `getClientIp` reach the socket the way the websocket branch already reaches
   * `ws.remoteAddress`. Registered by whichever `Bun.serve` is listening, because only the server can answer
   * `requestIP`. Behind the federation gateway this never fires — the gateway always writes `x-real-ip` —
   * so it is the answer for a process nothing is proxying.
   */
  static setHttpPeerResolver(resolve: HttpPeerResolver | null) {
    SignalContext.#httpPeer = resolve;
  }
  static #middlewareHandlers = new WeakMap<MiddlewareCls, WeakMap<object, Promise<MiddlewareHandler>>>();
  static #getMiddlewareHandler(MiddlewareCls: MiddlewareCls, env: BackendEnv): Promise<MiddlewareHandler> {
    const byEnv =
      SignalContext.#middlewareHandlers.get(MiddlewareCls) ?? new WeakMap<object, Promise<MiddlewareHandler>>();
    SignalContext.#middlewareHandlers.set(MiddlewareCls, byEnv);
    const cached = byEnv.get(env);
    if (cached) return cached;
    // A rejected setup is evicted rather than cached: a middleware that failed to initialize once should get
    // another chance on the next request instead of poisoning the endpoint for the life of the process.
    const handler = Promise.resolve(new MiddlewareCls().use(env) as PromiseOrObject<MiddlewareHandler>).catch(
      (error: unknown) => {
        byEnv.delete(env);
        throw error;
      },
    );
    byEnv.set(env, handler);
    return handler;
  }
  async exec() {
    if (!this.trace || getCurrentTrace() === this.trace) return await this.#exec();
    return await runTraced(this.trace, async () => await this.#exec());
  }
  async #exec() {
    if (!this.endpointInfo.execFn) throw new Exception.Error("Exec function is not set");
    const coreExec = async () => {
      if (!this.endpointInfo.execFn) throw new Exception.Error("Exec function is not set");
      if (this.trace) {
        await traceSpan("guards", () => this.#checkGuards());
        const account = this.get<{ id?: unknown }>("account");
        if (typeof account?.id === "string") this.trace.setAttr("userId", account.id);
      } else await this.#checkGuards();
      if (this.endpointInfo.internalArgs.length > 0) {
        this.internalArgs = await Promise.all(
          this.endpointInfo.internalArgs.map((arg) => {
            const argValue = new arg.argRef().getArg(this) ?? null;
            if (argValue === null && !arg.option?.nullable)
              throw new Exception.Unauthorized(`Internal Argument ${arg.argRef.name} is required`);
            return argValue;
          }),
        );
      }
      const handle = async () => await this.endpointInfo.execFn?.call(this.adaptor, ...this.args, ...this.internalArgs);
      return await EndpointCache.through(this, this.trace ? () => traceSpan("handler", handle) : handle);
    };
    const next = this.#withMiddleware(coreExec);
    const result = this.trace ? await traceSpan("execChain", () => next()) : await next();
    // A pubsub's return is not a response — nothing is serialized and nothing is sent. It is handed back for the
    // one caller that needs it: a live slice's exec returns the resolved query the room is then routed by.
    if (this.endpointInfo.type === "pubsub") return result;
    if (result instanceof Response) return result;
    if (!this.trace) {
      const resolved = await SignalContext.resolveReturn(result, {
        signalContext: this,
        returnRef: this.endpointInfo.returns.returnRef,
        arrDepth: this.endpointInfo.returns.arrDepth,
        registry: this.#registry,
        live: this.#live,
      });
      return this.ctx.makeResponse(this.#settleUndefined(resolved), this.endpointInfo);
    }
    const resolved = await traceSpan("resolveReturn", () =>
      SignalContext.resolveReturn(result, {
        signalContext: this,
        returnRef: this.endpointInfo.returns.returnRef,
        arrDepth: this.endpointInfo.returns.arrDepth,
        registry: this.#registry,
        live: this.#live,
      }),
    );
    return await traceSpan("serialize", async () =>
      this.ctx.makeResponse(this.#settleUndefined(resolved), this.endpointInfo),
    );
  }
  //? A handler that falls off its end returns `undefined`, which Bun's `Response.json` refuses with an error naming
  //? neither the endpoint nor its return. A nullable or `Any` return answers `null`; any other broke its contract.
  #settleUndefined(resolved: unknown) {
    if (resolved !== undefined) return resolved;
    const { nullable, returnRef } = this.endpointInfo.returns;
    if (nullable || returnRef === Any) return null;
    throw new Error(
      `${this.endpointInfo.type} ${this.key} returned undefined, but its return is not nullable: return a value, or declare { nullable: true } and return null`,
    );
  }
  /** Whether `run` already logged this failure, so a transport's catch does not log it a second time. */
  static wasReported(error: unknown) {
    return typeof error === "object" && error !== null && SignalContext.#reported.has(error);
  }
  /**
   * Runs `fn` as one traced call of `key`, so every log it writes — the 500 log included, which is why the
   * catch is in here and not in the transport — carries the same traceId. Rethrows after logging.
   */
  static async run<T>(
    endpoint: Adaptor,
    endpointInfo: EndpointInfo,
    key: string,
    origin: TraceOrigin,
    fn: () => Promise<T>,
    { trace = true }: { trace?: boolean } = {},
  ): Promise<T> {
    return await runTraced(trace ? SignalTrace.create(key, endpointInfo.type, origin) : null, async () => {
      try {
        return await fn();
      } catch (error) {
        if (!isExceptionLike(error)) {
          const message = error instanceof Error ? error.message : String(error);
          const stack = error instanceof Error ? error.stack : undefined;
          endpoint.logger.error(`Error ${endpointInfo.type}-${key}:\n${stack ?? message}`);
          if (typeof error === "object" && error !== null) SignalContext.#reported.add(error);
        }
        throw error;
      }
    });
  }
  static async try(
    endpoint: Adaptor,
    endpointInfo: EndpointInfo,
    key: string,
    fn: () => Promise<Response | undefined>,
    options: { trace?: boolean } = {},
  ): Promise<Response | undefined> {
    try {
      return await SignalContext.run(endpoint, endpointInfo, key, "http", fn, options);
    } catch (error) {
      if (endpointInfo.type === "message" || endpointInfo.type === "pubsub") throw error;
      if (isExceptionLike(error)) {
        return new Response(
          JSON.stringify({
            ...error.toJSON(),
            path: endpointInfo.getPath(key),
            timestamp: new Date().toISOString(),
          }),
          { status: error.statusCode, headers: { "Content-Type": "application/json" } },
        );
      }
      return SignalFailure.response(error, { path: endpointInfo.getPath(key) });
    }
  }
  static async resolveReturn(
    value: unknown,
    {
      signalContext,
      returnRef,
      arrDepth,
      registry,
      live,
      cache = new Map(),
    }: {
      signalContext: SignalContext | null;
      returnRef: ConstantFieldTypeInput;
      arrDepth: number;
      registry: InjectRegistry;
      live: LiveRegistry;
      /** Omitted by the outermost call, which starts an empty one; every recursion threads it down. */
      cache?: ResolveCache;
    },
  ): Promise<unknown> {
    if (value === null || value === undefined) return value;
    if (PrimitiveRegistry.has(returnRef as Cls)) return value;
    else if (arrDepth)
      return await Promise.all(
        (value as unknown[]).map((v) =>
          SignalContext.resolveReturn(v, { signalContext, returnRef, arrDepth: arrDepth - 1, registry, live, cache }),
        ),
      );
    const valueRecord = value as RuntimeRecord;
    const resolvedValue = {} as RuntimeRecord;
    // Only a field that loads or computes gets a promise. Awaiting every field cost one promise and one
    // microtask hop per field per document, and a model is mostly fields that are a plain copy.
    const pending: Promise<void>[] = [];
    const assign = (key: string, resolved: Promise<unknown>) =>
      pending.push(
        resolved.then((v) => {
          resolvedValue[key] = v;
        }),
      );
    for (const [key, field] of Object.entries((returnRef as ConstantCls)[FIELD_META])) {
      if (field.fieldType === "hidden" || field.fieldType === "secret") continue;
      else if (field.fieldType === "resolve")
        assign(
          key,
          SignalContext.#resolveComputed(key, valueRecord, {
            signalContext,
            returnRef,
            field,
            registry,
            live,
            cache,
          }),
        );
      else if (!field.isClass) resolvedValue[key] = valueRecord[key];
      else if (field.isScalar)
        assign(
          key,
          SignalContext.resolveReturn(valueRecord[key], {
            signalContext,
            returnRef: field.modelRef,
            arrDepth: field.arrDepth,
            registry,
            live,
            cache,
          }),
        );
      else
        assign(
          key,
          SignalContext.#resolveRelation(valueRecord[key], {
            signalContext,
            modelRef: field.modelRef,
            arrDepth: field.arrDepth,
            nullable: field.nullable,
            registry,
            live,
            cache,
          }),
        );
    }
    if (pending.length) await Promise.all(pending);
    return resolvedValue;
  }
  static async #resolveComputed(
    key: string,
    valueRecord: RuntimeRecord,
    {
      signalContext,
      returnRef,
      field,
      registry,
      live,
      cache,
    }: {
      signalContext: SignalContext | null;
      returnRef: ConstantFieldTypeInput;
      field: ConstantCls[typeof FIELD_META][string];
      registry: InjectRegistry;
      live: LiveRegistry;
      cache: ResolveCache;
    },
  ): Promise<unknown> {
    const refName = ConstantRegistry.getRefName(returnRef as ConstantCls);
    const internal = live.internal.get(`${refName}Internal`);
    if (!internal) throw new Error(`Internal ${refName} is not registered`);
    const internalCls = internal.constructor as InternalCls;
    const internalInfo = internalCls[INTERNAL_META][key] as InternalInfo<"resolveField"> | undefined;
    if (!internalInfo) throw new Error(`Internal info ${key} is not found`);
    const resolveFieldContext = new ResolveFieldContext(valueRecord, { signalContext, internalInfo, internal });
    const resolved = await resolveFieldContext.exec();
    return await SignalContext.resolveReturn(resolved, {
      signalContext,
      returnRef: field.modelRef,
      arrDepth: field.arrDepth,
      registry,
      live,
      cache,
    });
  }
  static async #resolveRelation(
    value: unknown,
    {
      signalContext,
      modelRef,
      arrDepth,
      nullable,
      registry,
      live,
      cache,
    }: {
      signalContext: SignalContext | null;
      modelRef: ConstantFieldTypeInput;
      arrDepth: number;
      nullable: boolean;
      registry: InjectRegistry;
      live: LiveRegistry;
      cache: ResolveCache;
    },
  ): Promise<unknown> {
    if (arrDepth) {
      if (value === null || value === undefined) {
        if (nullable) return null;
        throw new Error(`Document ${value} is not found`);
      }
      return await Promise.all(
        (value as unknown[]).map((item) =>
          SignalContext.#resolveRelation(item, {
            signalContext,
            modelRef,
            arrDepth: arrDepth - 1,
            nullable,
            registry,
            live,
            cache,
          }),
        ),
      );
    }
    const refName = ConstantRegistry.getRefName(modelRef as ConstantCls);
    const service = live.service.get(refName) as unknown as DatabaseService;
    if (!service) throw new Error(`Service ${refName} is not registered`);
    // The cached load is deliberately nullable, so one entry serves a nullable and a non-nullable reference to
    // the same document alike and the refusal below stays each field's own.
    const resolved =
      value === null || value === undefined
        ? null
        : await SignalContext.#resolveOnce(cache, modelRef, String(value), async () => {
            const loaded = await SignalContext.loadNested(value, service, { arrDepth: 0, nullable: true });
            return await SignalContext.resolveReturn(loaded, {
              signalContext,
              returnRef: modelRef,
              arrDepth: 0,
              registry,
              live,
              cache,
            });
          });
    if (resolved === null && !nullable) throw new Error(`Document ${value} is not found`);
    return resolved;
  }
  /**
   * The resolved subtree for one document, computed once per response.
   *
   * A listing whose rows share a relation — twenty users with the same avatar — otherwise loads, `toJSON`s and
   * walks that document once per row, and every copy is identical by construction. The promise is what is
   * stored, not the value, so rows that ask together coalesce onto the first load instead of racing it.
   */
  static #resolveOnce(
    cache: ResolveCache,
    modelRef: ConstantFieldTypeInput,
    id: string,
    load: () => Promise<unknown>,
  ): Promise<unknown> {
    const byId = cache.get(modelRef) ?? new Map<string, Promise<unknown>>();
    if (!cache.has(modelRef)) cache.set(modelRef, byId);
    const cached = byId.get(id);
    if (cached) return cached;
    const resolving = load();
    byId.set(id, resolving);
    return resolving;
  }
  static async loadNested(
    value: unknown,
    service: DatabaseService,
    { arrDepth, nullable }: { arrDepth: number; nullable: boolean },
  ): Promise<unknown> {
    if (value === null || value === undefined) {
      if (nullable) return null;
      throw new Error(`Document ${value} is not found`);
    }
    if (arrDepth > 0 && Array.isArray(value) && value.length === 0) return [];
    if (arrDepth === 0)
      return await service.__load(String(value)).then((doc) => {
        if (doc === null) {
          if (nullable) return null;
          else throw new Error(`Document ${value} is not found`);
        } else return doc.toJSON();
      });
    if (arrDepth === 1)
      return await service.__loadMany(value as string[]).then((docs) =>
        docs.map((doc) => {
          if (doc === null) {
            if (nullable) return null;
            else throw new Error(`Document ${value} is not found`);
          } else return doc.toJSON();
        }),
      );
    return await Promise.all(
      (value as unknown[]).map(
        async (v) => await SignalContext.loadNested(v, service, { arrDepth: arrDepth - 1, nullable }),
      ),
    );
  }
  getHttpContext<Appended = unknown>() {
    if (this.transport !== "http") throw new Error("Transport is not http");
    return this.ctx as HttpExecutionContext<Appended>;
  }
  getWebSocketContext<Appended = unknown>() {
    if (this.transport !== "websocket") throw new Error("Transport is not websocket");
    return this.ctx as WebSocketExecutionContext<Appended>;
  }
  get<T = unknown>(key: string): T | null {
    if (this.transport === "http") return this.getHttpContext<{ [key: string]: T }>().req[key] ?? null;
    return this.getWebSocketContext<{ [key: string]: T }>().ws.data[key] ?? null;
  }
  /**
   * The caller's IP, preferring what a proxy recorded over the socket peer. Behind the federation gateway the
   * peer is the gateway itself for every request and for the whole life of every socket, so `remoteAddress`
   * alone names the wrong machine — which is why nothing here reads it first. IPv4 arrives unwrapped from its
   * `::ffff:` form, so it can be used as a destination as well as an identity.
   *
   * `null` means no proxy recorded one and the transport has no peer to fall back on — never a placeholder,
   * because a loopback-looking address for an unknown caller is the failure this replaced.
   */
  getClientIp(): string | null {
    if (this.transport === "http") {
      const { req } = this.getHttpContext();
      // A registered resolver that answers `null` names an addressless socket — the unix socket a child is reached
      // over — and `TrustedProxy` reads that as a local hop; an absent resolver stays `undefined`, an unknown peer.
      const peer = SignalContext.#httpPeer?.(req);
      return TrustedProxy.clientAddress(req.headers, peer === undefined ? undefined : (peer?.address ?? null));
    }
    const { ws } = this.getWebSocketContext<{ headers?: Headers }>();
    if (!ws.data.headers) return ws.remoteAddress ? normalizeIpAddress(ws.remoteAddress) : null;
    return TrustedProxy.clientAddress(ws.data.headers, ws.remoteAddress);
  }
  /** The caller's source port as the nearest proxy recorded it, else this socket's own. */
  getClientPort(): number | null {
    if (this.transport === "http") {
      const { req } = this.getHttpContext();
      return clientPortFromHeaders(req.headers) ?? SignalContext.#httpPeer?.(req)?.port ?? null;
    }
    const { ws } = this.getWebSocketContext<{ headers?: Headers }>();
    return (ws.data.headers ? clientPortFromHeaders(ws.data.headers) : null) ?? null;
  }
  getRoomId(key: string) {
    if (this.transport !== "websocket") throw new Error("Transport is not websocket");
    else if (this.endpointInfo.type !== "pubsub") throw new Error("Endpoint is not pubsub");
    return `${key}${this.args.length ? "-" : ""}${this.args.join("-")}`;
  }
  /**
   * A live room's id, which appends the caller's resolved internal arguments to the client-visible one.
   *
   * Without them every subscriber of an `inSelf` slice shares one room and receives each other's rows. It cannot
   * be done for pubsub in general: an ordinary room's publisher computes the same id from the arguments it
   * publishes with and has no access to a subscriber's `Self`, so widening the id there would put subscriber and
   * publisher in different rooms. A live room's only publisher is the router, which holds this id already.
   *
   * The token is the argument's own id where it has one — that is what `Self` yields, and a room name never
   * leaves the server — and a digest otherwise, so a credential handed in as an internal argument is not spelled
   * out in a room name that gets logged.
   */
  getLiveRoomId(key: string) {
    const base = this.getRoomId(key);
    if (!this.internalArgs.length) return base;
    return `${base}::${this.internalArgs.map((arg) => SignalContext.#liveRoomToken(arg)).join(".")}`;
  }
  static #liveRoomToken(value: unknown): string {
    if (value === null || value === undefined) return "~";
    if (typeof value === "object") {
      const id = (value as { id?: unknown }).id;
      if (typeof id === "string") return id;
      return `h${SignalContext.#digest(JSON.stringify(value))}`;
    }
    const token = String(value);
    return /^[A-Za-z0-9_@.:+-]{1,64}$/.test(token) ? token : `h${SignalContext.#digest(token)}`;
  }
  /** FNV-1a. Not a security boundary — only a stable, short, room-safe token for a value that is not an id. */
  static #digest(value: string): string {
    let hash = 0x811c9dc5;
    for (let idx = 0; idx < value.length; idx += 1) {
      hash ^= value.charCodeAt(idx);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(36);
  }
  /**
   * Resolves the declared internal arguments without running guards or the handler.
   *
   * An unsubscribe has to name the same room the subscribe joined, and that id depends on these — but there is
   * nothing to authorize about leaving a room, and re-running the handler to compute a name would issue the
   * slice's query again for nothing.
   */
  async resolveInternalArgs() {
    if (this.internalArgs.length || !this.endpointInfo.internalArgs.length) return this.internalArgs;
    this.internalArgs = await Promise.all(
      this.endpointInfo.internalArgs.map(async (arg) => (await new arg.argRef().getArg(this)) ?? null),
    );
    return this.internalArgs;
  }
  getEnv() {
    return this.#env;
  }
  getArg<T = unknown>(argName: string): T | undefined {
    const index = this.endpointInfo.args.findIndex((arg) => arg.name === argName);
    if (index === -1) return undefined;
    return this.args[index] as T;
  }
}

export class HttpExecutionContext<Appended = unknown> {
  req: Bun.BunRequest & Appended;
  res = Response;
  #url: URL | null = null;
  params: RuntimeRecord = {};
  searchParams: RuntimeRecord = {};
  body: RuntimeRecord = {};
  constructor(req: Bun.BunRequest) {
    this.req = req as Bun.BunRequest & Appended;
  }
  get url() {
    if (!this.#url) this.#url = new URL(this.req.url);
    return this.#url;
  }
  /** The read side of `HttpClient.makeUrl`'s `Any` rule: the query string carries the value JSON-encoded. */
  static #parseAny(name: string, raw: string | string[] | null): unknown {
    if (raw === null) return null;
    if (Array.isArray(raw)) return raw.map((value) => HttpExecutionContext.#parseAny(name, value));
    try {
      return JSON.parse(raw);
    } catch {
      throw new Exception.BadRequest(`Invalid JSON in "${name}"`);
    }
  }
  async getArgs(endpointInfo: EndpointInfo): Promise<unknown[]> {
    if (endpointInfo.args.length === 0) return [];
    this.params = this.req.params;
    const hasBodyArgs = endpointInfo.args.some((arg) => arg.type === "body");
    const hasUploadArgs = hasBodyArgs && endpointInfo.args.some((arg) => arg.type === "body" && arg.argRef === Upload);
    if (endpointInfo.type === "mutation" && hasBodyArgs && this.req.body) {
      if (hasUploadArgs) {
        const formData = await this.req.formData();
        this.body = {};
        for (const [key, value] of formData.entries()) {
          const argInfo = endpointInfo.args.find((arg) => arg.name === key && arg.type === "body");
          if (argInfo && argInfo.argRef === Upload) {
            if (argInfo.arrDepth > 0) {
              const values = Array.isArray(this.body[key]) ? this.body[key] : [];
              values.push(value);
              this.body[key] = values;
            } else this.body[key] = value;
          } else {
            this.body[key] = value as string;
          }
        }
      } else {
        CrossSiteGuard.assertJsonBody(this.req.headers.get("content-type"));
        this.body = (await this.req.json()) as RuntimeRecord;
      }
    }

    const args = endpointInfo.args.map((arg) => {
      switch (arg.type) {
        case "param":
          return deserialize(arg.argRef, arg.arrDepth, this.params[arg.name], {
            key: arg.name,
            nullable: arg.option?.nullable,
            enum: arg.enum,
          });
        case "body":
          if (arg.argRef === Upload) return this.body[arg.name];
          return deserialize(arg.argRef, arg.arrDepth, this.body[arg.name], {
            key: arg.name,
            nullable: arg.option?.nullable,
            enum: arg.enum,
          });
        case "search": {
          const raw = arg.arrDepth ? this.url.searchParams.getAll(arg.name) : this.url.searchParams.get(arg.name);
          const value = arg.argRef === Any ? HttpExecutionContext.#parseAny(arg.name, raw) : raw;
          const result = deserialize(arg.argRef, arg.arrDepth, value, {
            key: arg.name,
            nullable: arg.option?.nullable,
            enum: arg.enum,
          });
          this.searchParams[arg.name] = result;
          return result;
        }
        default:
          return undefined;
      }
    });
    return args;
  }
  makeResponse(result: unknown, endpointInfo: EndpointInfo) {
    if (result instanceof Response) return result;
    if (endpointInfo.returns.arrDepth === 0 && PrimitiveRegistry.has(endpointInfo.returns.returnRef as Cls)) {
      return this.res.json(result);
    }
    const value = serialize(endpointInfo.returns.returnRef, endpointInfo.returns.arrDepth, result, "object", {
      nullable: endpointInfo.returns.nullable,
    });
    return this.res.json(value);
  }
}

export type WebSocketEventType = "open" | "subscribe" | "unsubscribe" | "message" | "close";
export class WebSocketExecutionContext<Appended = unknown> {
  ws: Bun.ServerWebSocket<Appended>;
  data: unknown[];
  roomId: string = "";
  eventType: WebSocketEventType;
  onDisconnect: Set<() => PromiseOrObject<void>> = new Set();
  onUnsubscribe: Set<() => PromiseOrObject<void>> = new Set();
  constructor(wsReq: WebSocketRequest) {
    this.ws = wsReq.ws as Bun.ServerWebSocket<Appended>;
    this.data = wsReq.data;
    this.eventType = wsReq.eventType;
  }
  async getArgs(endpointInfo: EndpointInfo): Promise<unknown[]> {
    const args = endpointInfo.args.map((arg, idx) => {
      switch (arg.type) {
        case "msg":
          return deserialize(arg.argRef, arg.arrDepth, this.data[idx], {
            key: arg.name,
            nullable: arg.option?.nullable,
            enum: arg.enum,
          });
        case "room":
          return deserialize(arg.argRef, arg.arrDepth, this.data[idx], {
            key: arg.name,
            nullable: arg.option?.nullable,
            enum: arg.enum,
          });
        default:
          return undefined;
      }
    });
    return args;
  }
  makeResponse(result: unknown, endpointInfo: EndpointInfo) {
    return serialize(endpointInfo.returns.returnRef, endpointInfo.returns.arrDepth, result, "object", {
      nullable: endpointInfo.returns.nullable,
    }) as unknown as Response;
  }
  // Arrows, not methods: `Ws` hands these to a handler detached from the context, so a method would run with
  // the wrapper object as `this` and register into nothing.
  on = (event: "disconnect" | "unsubscribe", handler: () => PromiseOrObject<void>) => {
    if (event === "disconnect") this.onDisconnect.add(handler);
    else this.onUnsubscribe.add(handler);
  };
  off = (event: "disconnect" | "unsubscribe", handler: () => PromiseOrObject<void>) => {
    if (event === "disconnect") this.onDisconnect.delete(handler);
    else this.onUnsubscribe.delete(handler);
  };
}

export class ResolveFieldContext {
  signalContext: SignalContext | null;
  internalInfo: InternalInfo<"resolveField">;
  internal: Internal;
  parent: unknown;
  constructor(
    parent: unknown,
    {
      signalContext,
      internalInfo,
      internal,
    }: { signalContext: SignalContext | null; internalInfo: InternalInfo<"resolveField">; internal: Internal },
  ) {
    this.signalContext = signalContext;
    this.internalInfo = internalInfo;
    this.internal = internal;
    this.parent = parent;
  }
  async exec() {
    if (!this.internalInfo.execFn) throw new Error("Exec function is not set");
    const internalArgs = await Promise.all(
      this.internalInfo.internalArgs.map((arg) =>
        this.signalContext ? (new arg.argRef().getArg(this.signalContext) ?? null) : null,
      ),
    );
    const result = await this.internalInfo.execFn.call(this.internal, this.parent, ...internalArgs);
    return result;
  }
}
