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
import { clientAddressFromHeaders, clientPortFromHeaders, normalizeIpAddress } from "akanjs/common";
import {
  type ConstantCls,
  type ConstantFieldTypeInput,
  ConstantRegistry,
  deserialize,
  serialize,
} from "akanjs/constant";
import type { Adaptor, AdaptorCls, DatabaseService, InjectRegistry, LiveRegistry } from "akanjs/service";
import type { Internal, InternalCls, InternalInfo, MiddlewareCls } from ".";
import type { EndpointInfo, EndpointType } from "./endpointInfo";
import { Exception } from "./exception";
import { guardOf } from "./guard";
// Deliberately past the barrel: `./mcp` re-exports `McpDocument`, which would drag `akanjs/fetch` into the
// signal graph. `Msg` itself imports nothing.
import { Msg } from "./mcp/Msg";
import { isTraceEnabled, runWithTrace, SignalTrace, traceSpan } from "./trace";

export type SignalTransportType = "http" | "websocket";

/** What `Bun.Server.requestIP` reports for the socket a request arrived on. */
export type HttpPeerResolver = (req: Request) => { address: string; port: number } | null;

const httpEndpointTypes = new Set<EndpointType>(["query", "mutation", "prompt"]);

interface WebSocketRequest {
  ws: Bun.ServerWebSocket<unknown>;
  data: unknown[];
  eventType: WebSocketEventType;
}
type RuntimeRecord = Record<string, unknown>;
type MiddlewareHandler = (context: SignalContext, next: () => Promise<unknown>) => PromiseOrObject<unknown>;

interface ExceptionLike {
  statusCode: number;
  toJSON(): object;
}

const isExceptionLike = (error: unknown): error is ExceptionLike => {
  return (
    error instanceof Exception ||
    (error instanceof Error &&
      "statusCode" in error &&
      typeof (error as { statusCode?: unknown }).statusCode === "number" &&
      typeof (error as { toJSON?: unknown }).toJSON === "function")
  );
};

export class SignalContext<
  Ctx extends HttpExecutionContext | WebSocketExecutionContext = HttpExecutionContext | WebSocketExecutionContext,
  Env extends BackendEnv = BackendEnv,
> {
  key: string;
  transport: SignalTransportType;
  ctx: Ctx;
  endpointInfo: EndpointInfo;
  adaptor: Adaptor;
  args: unknown[] = [];
  internalArgs: unknown[] = [];
  trace: SignalTrace | null = null;
  #registry: InjectRegistry;
  #env: Env;
  #live: LiveRegistry;
  #middleware: Map<string, MiddlewareCls>;
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
    },
  ) {
    this.key = key;
    this.transport = httpEndpointTypes.has(endpointInfo.type) ? "http" : "websocket";
    this.endpointInfo = endpointInfo;
    if (ctx) this.ctx = ctx;
    else if (this.transport === "http") this.ctx = new HttpExecutionContext(reqOrWsReq as Bun.BunRequest) as Ctx;
    else this.ctx = new WebSocketExecutionContext(reqOrWsReq as WebSocketRequest) as Ctx;
    this.adaptor = adaptor;
    this.#registry = registry;
    this.#env = env;
    this.#live = live;
    this.#middleware = middleware;
    if (isTraceEnabled()) this.trace = new SignalTrace(key, endpointInfo.type);
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
    if (this.trace) {
      const start = performance.now();
      this.args = await this.ctx.getArgs(this.endpointInfo);
      this.trace.recordSpan("argParse", performance.now() - start);
    } else {
      this.args = await this.ctx.getArgs(this.endpointInfo);
    }
    return this;
  }
  async #checkGuards() {
    const guards = this.endpointInfo.signalOption.guards ?? [];
    if (guards.length === 0) return;
    await Promise.all(
      guards.map(async (GuardCls) => {
        const canPass = await guardOf(GuardCls).canPass(this);
        if (!canPass) throw new Exception.Forbidden(`Access denied by guard: ${GuardCls.name}`);
      }),
    );
  }
  /**
   * Re-checks this context's guards outside of a request, for a websocket room that is already
   * subscribed. Only global middlewares run: they carry the account resolution this depends on,
   * while endpoint middlewares (cache/timeout/retry) would observe a call that never executes.
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
      await this.#withMiddleware(
        async () => {
          for (const GuardCls of guards) {
            if (!(await guardOf(GuardCls).canPass(this)))
              throw new Exception.Forbidden(`Access denied by guard: ${GuardCls.name}`);
          }
        },
        { endpointMiddlewares: false },
      )();
      return true;
    } catch {
      return false;
    }
  }
  #withMiddleware(
    coreExec: () => Promise<unknown>,
    { endpointMiddlewares = true }: { endpointMiddlewares?: boolean } = {},
  ): () => Promise<unknown> {
    const middlewares = [
      ...this.#middleware.values(),
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
    if (!this.trace) return await this.#exec();
    return await runWithTrace(this.trace, async () => {
      try {
        return await this.#exec();
      } finally {
        this.trace?.finalize();
      }
    });
  }
  async #exec() {
    if (!this.endpointInfo.execFn) throw new Exception.Error("Exec function is not set");
    const coreExec = async () => {
      if (!this.endpointInfo.execFn) throw new Exception.Error("Exec function is not set");
      if (this.trace) await traceSpan("guards", () => this.#checkGuards());
      else await this.#checkGuards();
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
      if (!this.trace) return await this.endpointInfo.execFn.call(this.adaptor, ...this.args, ...this.internalArgs);
      return await traceSpan(
        "handler",
        async () => await this.endpointInfo.execFn?.call(this.adaptor, ...this.args, ...this.internalArgs),
      );
    };
    const next = this.#withMiddleware(coreExec);
    const raw = this.trace ? await traceSpan("execChain", () => next()) : await next();
    if (this.endpointInfo.type === "pubsub") return;
    if (raw instanceof Response) return raw;
    // A prompt declares `PromptMessage[]` but rides the `Any` carrier, so `resolveReturn` and `makeResponse` both
    // hand the value straight back and nothing downstream would notice a malformed one. Normalizing here rather
    // than in the MCP dispatcher is what makes the HTTP route and `prompts/get` return the same shape — the web
    // preview is only a preview if it is.
    const result = this.endpointInfo.type === "prompt" ? Msg.normalize(raw) : raw;
    if (!this.trace) {
      const resolved = await SignalContext.resolveReturn(result, {
        signalContext: this,
        returnRef: this.endpointInfo.returns.returnRef,
        arrDepth: this.endpointInfo.returns.arrDepth,
        registry: this.#registry,
        live: this.#live,
      });
      return this.ctx.makeResponse(resolved, this.endpointInfo);
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
    return await traceSpan("serialize", async () => this.ctx.makeResponse(resolved, this.endpointInfo));
  }
  static async try(
    endpoint: Adaptor,
    endpointInfo: EndpointInfo,
    key: string,
    fn: () => Promise<Response | undefined>,
  ): Promise<Response | undefined> {
    try {
      return await fn();
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
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      endpoint.logger.error(`Error ${endpointInfo.type}-${key}:\n${stack ?? message}`);
      return new Response(
        JSON.stringify({
          error: message,
          statusCode: 500,
          path: endpointInfo.getPath(key),
          timestamp: new Date().toISOString(),
          stack: error instanceof Error ? error.stack : undefined,
        }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
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
    }: {
      signalContext: SignalContext | null;
      returnRef: ConstantFieldTypeInput;
      arrDepth: number;
      registry: InjectRegistry;
      live: LiveRegistry;
    },
  ): Promise<unknown> {
    if (value === null || value === undefined) return value;
    if (PrimitiveRegistry.has(returnRef as Cls)) return value;
    else if (arrDepth)
      return await Promise.all(
        (value as unknown[]).map((v) =>
          SignalContext.resolveReturn(v, { signalContext, returnRef, arrDepth: arrDepth - 1, registry, live }),
        ),
      );
    const valueRecord = value as RuntimeRecord;
    const resolvedValue = {} as RuntimeRecord;
    await Promise.all(
      Object.entries((returnRef as ConstantCls)[FIELD_META]).map(async ([key, field]) => {
        if (field.fieldType === "hidden" || field.fieldType === "secret") return;
        else if (field.fieldType === "resolve") {
          const refName = ConstantRegistry.getRefName(returnRef as ConstantCls);
          const internal = live.internal.get(`${refName}Internal`);
          if (!internal) throw new Error(`Internal ${refName} is not registered`);
          const internalCls = internal.constructor as InternalCls;
          const internalInfo = internalCls[INTERNAL_META][key] as InternalInfo<"resolveField"> | undefined;
          if (!internalInfo) throw new Error(`Internal info ${key} is not found`);
          const resolveFieldContext = new ResolveFieldContext(valueRecord, { signalContext, internalInfo, internal });
          const resolved = await resolveFieldContext.exec();
          resolvedValue[key] = await SignalContext.resolveReturn(resolved, {
            signalContext,
            returnRef: field.modelRef,
            arrDepth: field.arrDepth,
            registry,
            live,
          });
        } else if (!field.isClass) resolvedValue[key] = valueRecord[key];
        else if (field.isScalar) {
          resolvedValue[key] = await SignalContext.resolveReturn(valueRecord[key], {
            signalContext,
            returnRef: field.modelRef,
            arrDepth: field.arrDepth,
            registry,
            live,
          });
        } else {
          const refName = ConstantRegistry.getRefName(field.modelRef);
          const service = live.service.get(refName) as unknown as DatabaseService;
          if (!service) throw new Error(`Service ${refName} is not registered`);
          const loaded = await SignalContext.loadNested(valueRecord[key], service, field);
          const resolved = await SignalContext.resolveReturn(loaded, {
            signalContext,
            returnRef: field.modelRef,
            arrDepth: field.arrDepth,
            registry,
            live,
          });
          resolvedValue[key] = resolved;
        }
      }),
    );
    return resolvedValue;
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
      const forwarded = clientAddressFromHeaders(req.headers);
      if (forwarded) return forwarded;
      const peer = SignalContext.#httpPeer?.(req);
      return peer ? normalizeIpAddress(peer.address) : null;
    }
    const { ws } = this.getWebSocketContext<{ headers?: Headers }>();
    const forwarded = ws.data.headers ? clientAddressFromHeaders(ws.data.headers) : null;
    return forwarded ?? (ws.remoteAddress ? normalizeIpAddress(ws.remoteAddress) : null);
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
    // TODO: Optimize the efficiency of this code
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
      } else this.body = (await this.req.json()) as RuntimeRecord;
    }

    const args = endpointInfo.args.map((arg) => {
      switch (arg.type) {
        case "param":
          return deserialize(arg.argRef, arg.arrDepth, this.params[arg.name], {
            key: arg.name,
            nullable: arg.option?.nullable,
          });
        case "body":
          if (arg.argRef === Upload) return this.body[arg.name];
          return deserialize(arg.argRef, arg.arrDepth, this.body[arg.name], {
            key: arg.name,
            nullable: arg.option?.nullable,
          });
        case "search": {
          const raw = arg.arrDepth ? this.url.searchParams.getAll(arg.name) : this.url.searchParams.get(arg.name);
          const value = arg.argRef === Any ? HttpExecutionContext.#parseAny(arg.name, raw) : raw;
          const result = deserialize(arg.argRef, arg.arrDepth, value, {
            key: arg.name,
            nullable: arg.option?.nullable,
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
          });
        case "room":
          return deserialize(arg.argRef, arg.arrDepth, this.data[idx], {
            key: arg.name,
            nullable: arg.option?.nullable,
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
