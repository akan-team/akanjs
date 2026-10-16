import {
  Any,
  type BackendEnv,
  Binary,
  type Cls,
  type FIELD_META,
  ID,
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
  FieldPlan,
  InputParser,
  InvalidInputError,
  serialize,
} from "akanjs/constant";
import { Err } from "akanjs/dictionary";
import type { Adaptor, AdaptorCls, DatabaseService, InjectRegistry, LiveRegistry } from "akanjs/service";
import type { Internal, InternalCls, InternalInfo, MiddlewareCls } from ".";
import { CrossSiteGuard } from "./CrossSiteGuard";
import { EndpointCache } from "./endpointCache";
import { EndpointErrorContract } from "./endpointErrorContract";
import { EndpointIdempotency } from "./endpointIdempotency";
import type { ArgInfo, EndpointInfo, EndpointType } from "./endpointInfo";
import { EndpointRateLimit } from "./endpointRateLimit";
import { Exception, isExceptionLike } from "./exception";
import { type GuardCls, type GuardScope, guardOf } from "./guard";
import { MiddlewareChain } from "./middlewareChain";
import { SignalFailure } from "./SignalFailure";
import { getCurrentTrace, runTraced, SignalTrace, type TraceOrigin, traceSpan } from "./trace";

export type SignalTransportType = "http" | "websocket";

/** What `Bun.Server.requestIP` reports for the socket a request arrived on. */
export type HttpPeerResolver = (req: Request) => { address: string; port: number } | null;

const httpEndpointTypes = new Set<EndpointType>(["query", "mutation"]);

const deserializeArg = (arg: ArgInfo, value: unknown) => {
  try {
    return InputParser.parse(arg.argRef, arg.arrDepth, value, {
      key: arg.name,
      nullable: arg.option?.nullable,
      enum: arg.enum,
    });
  } catch (error) {
    //? The parsers throw a plain `Error`, which `SignalFailure` would answer as a 500 for the caller's own input.
    if (isExceptionLike(error)) throw error;
    if (!(error instanceof InvalidInputError))
      throw new Err.BadRequest("base.error.invalidArgument", { name: arg.name });
    if (error.reason === "missing") throw new Err.BadRequest("base.error.requiredArgument", { name: error.path });
    throw new Err.BadRequest("base.error.invalidArgument", { name: error.path, expected: error.expected });
  }
};

interface WebSocketRequest {
  ws: Bun.ServerWebSocket<unknown>;
  data: unknown[];
  eventType: WebSocketEventType;
}
type RuntimeRecord = Record<string, unknown>;
/** Request-scoped: the outermost `resolveReturn` starts one and every recursion threads it down. */
type ResolveCache = Map<ConstantFieldTypeInput, Map<string, Promise<unknown>>>;

interface SignalContextOption<Ctx, Env extends BackendEnv> {
  endpointInfo: EndpointInfo;
  adaptor: Adaptor;
  registry: InjectRegistry;
  env: Env;
  live: LiveRegistry;
  middleware: Map<string, MiddlewareCls>;
  /** A caller-built context: MCP's arguments arrive as one named object, not in a URL. */
  ctx?: Ctx;
  /** Defaults to the transport. */
  origin?: TraceOrigin;
  /** Unset, the context joins the current trace or opens one that `exec()` closes. */
  trace?: SignalTrace | null;
}

export class SignalContext<
  Ctx extends HttpExecutionContext | WebSocketExecutionContext = HttpExecutionContext | WebSocketExecutionContext,
  Env extends BackendEnv = BackendEnv,
> {
  key: string;
  transport: SignalTransportType;
  ctx: Ctx;
  endpointInfo: EndpointInfo;
  adaptor: Adaptor;
  /** `mcp` for a call through the MCP endpoint. Held here, not on the trace: a null trace would let a guard fail open. */
  readonly origin: TraceOrigin;
  internalArgs: unknown[] = [];
  trace: SignalTrace | null = null;
  readonly #request: Bun.BunRequest | WebSocketRequest;
  readonly #option: SignalContextOption<Ctx, Env>;
  #rawArgs: unknown[] | null = null;
  #args: unknown[] | null = null;
  #registry: InjectRegistry;
  #env: Env;
  #live: LiveRegistry;
  #middleware: Map<string, MiddlewareCls>;
  static #reported = new WeakSet<object>();
  constructor(key: string, reqOrWsReq: Bun.BunRequest | WebSocketRequest, option: SignalContextOption<Ctx, Env>) {
    const { endpointInfo, adaptor, registry, env, live, middleware, ctx, origin, trace } = option;
    this.key = key;
    this.#request = reqOrWsReq;
    this.#option = option;
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
    // A trace already open (`SignalContext.run`) is its opener's to close; one started here is closed by `exec()`.
    this.trace =
      trace !== undefined
        ? trace
        : (getCurrentTrace() ?? SignalTrace.create(key, endpointInfo.type, origin ?? this.transport));
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
  /** Reads the request but parses no argument: that waits for the account guards in `exec()`. */
  async init() {
    // Before the body is read. Only a mutation: a cross-origin caller cannot read a GET's response, and a websocket
    // frame rides a socket whose upgrade route already refused a cross-site Origin (ApiRouter).
    if (this.endpointInfo.type === "mutation" && this.transport === "http") {
      const httpCtx = this.getHttpContext();
      CrossSiteGuard.assertOrigin(httpCtx.req, httpCtx.url, this.key);
    }
    // Leaving a room is never refused: a client held there could not get out.
    const admitting = this.#isLeavingRoom() ? undefined : EndpointRateLimit.admit(this, "ip");
    if (admitting) await admitting;
    const start = this.#spanned ? performance.now() : 0;
    this.#rawArgs = await this.ctx.readArgs(this.endpointInfo);
    if (this.#spanned) this.trace?.recordSpan("argRead", performance.now() - start);
    return this;
  }
  /** Parsed on first read, so a guard or middleware that reads one still gets it; a parser runs at most once per call. */
  get args(): unknown[] {
    this.#args ??= this.#parseArgs();
    return this.#args;
  }
  set args(args: unknown[]) {
    this.#args = args;
  }
  #parseArgs(): unknown[] {
    const raw = this.#rawArgs;
    if (!raw) return [];
    const start = this.#spanned ? performance.now() : 0;
    const args = this.endpointInfo.args.map((arg, idx) => this.ctx.parseArg(arg, raw[idx]));
    if (this.#spanned) this.trace?.recordSpan("argParse", performance.now() - start);
    return args;
  }
  #isLeavingRoom() {
    return this.transport === "websocket" && this.getWebSocketContext().eventType === "unsubscribe";
  }
  // Sequential, not parallel: a call refused by two guards names the same one every time and stops at the first.
  async #checkGuards(scope?: GuardScope) {
    for (const GuardCls of this.endpointInfo.signalOption.guards ?? []) {
      if (scope && (GuardCls.scope === "account" ? "account" : "resource") !== scope) continue;
      if (!(await guardOf(GuardCls).canPass(this)))
        throw new Exception.Forbidden(`Access denied by guard: ${GuardCls.name}`);
    }
  }
  /**
   * Re-checks the guards of a subscribed room outside a request; only global middlewares (account resolution) run. On
   * a fresh context, so a guard that memoizes per context cannot replay the verdict it gave at subscribe.
   */
  async authorize(): Promise<boolean> {
    const fresh = new SignalContext<Ctx, Env>(this.key, this.#request, {
      ...this.#option,
      ctx: undefined,
      trace: null,
    });
    fresh.#rawArgs = this.#rawArgs;
    fresh.#args = this.#args;
    try {
      await fresh.#withMiddleware(async () => await fresh.#checkGuards(), { endpointMiddlewares: false })();
      return true;
    } catch {
      return false;
    }
  }
  /**
   * Evaluates only `scope = "account"` guards, to hide listing entries. Never an access gate: a resource guard fails
   * closed without arguments, so it is left to `#checkGuards` at call time.
   */
  async canListForAccount(): Promise<boolean> {
    const guards = (this.endpointInfo.signalOption.guards ?? []).filter((GuardCls) => GuardCls.scope === "account");
    if (guards.length === 0) return true;
    try {
      // Without logging: a refusal is the expected answer for most of a catalogue, not an `Error …` line per listing.
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
  // An account guard that throws anything but a refusal reached for arguments: a mismarked resource guard.
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
    const chain = MiddlewareChain.of(
      this.#middleware,
      this.getEnv(),
      endpointMiddlewares ? this.endpointInfo : null,
      skip,
    );
    return () => chain.run(this, coreExec);
  }
  static #httpPeer: HttpPeerResolver | null = null;
  /** Registered by the listening `Bun.serve`, the only thing that can answer `requestIP`; unused behind the gateway. */
  static setHttpPeerResolver(resolve: HttpPeerResolver | null) {
    SignalContext.#httpPeer = resolve;
  }
  async exec() {
    if (!this.trace || getCurrentTrace() === this.trace) return await this.#exec();
    return await runTraced(this.trace, async () => await this.#exec());
  }
  // Spans are recorded only in full mode; a context-mode trace carries attrs and the log context, not timings.
  get #spanned() {
    return this.trace?.mode === "full";
  }
  async #exec() {
    if (!this.endpointInfo.execFn) throw new Exception.Error("Exec function is not set");
    const coreExec = async () => {
      if (!this.endpointInfo.execFn) throw new Exception.Error("Exec function is not set");
      const admitting = EndpointRateLimit.admit(this, "account");
      if (admitting) await admitting;
      if (this.#spanned) await traceSpan("guards", () => this.#checkGuards("account"));
      else await this.#checkGuards("account");
      if (this.trace) {
        const account = this.get<{ id?: unknown }>("account");
        if (typeof account?.id === "string") this.trace.setAttr("userId", account.id);
      }
      // Parsed only now: a caller the account guards refused never reaches an argument parser.
      this.#args ??= this.#parseArgs();
      if (this.#spanned) await traceSpan("resourceGuards", () => this.#checkGuards("resource"));
      else await this.#checkGuards("resource");
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
      const traced = this.#spanned ? () => traceSpan("handler", handle) : handle;
      const run = EndpointCache.declares(this.endpointInfo) ? () => EndpointCache.through(this, traced) : traced;
      if (!EndpointIdempotency.applies(this)) return await run();
      return await EndpointIdempotency.through(this, run, async (result) => {
        const resolved = await this.#resolve(result);
        return await traceSpan("serialize", async () => HttpExecutionContext.wireOf(resolved, this.endpointInfo));
      });
    };
    const next = this.#withMiddleware(coreExec);
    const result = this.#spanned ? await traceSpan("execChain", () => next()) : await next();
    // A pubsub's return is not sent; a live slice's exec returns the resolved query its room is routed by.
    if (this.endpointInfo.type === "pubsub") return result;
    if (result instanceof Response) return result;
    const resolved = await this.#resolve(result);
    if (!this.#spanned) return this.ctx.makeResponse(resolved, this.endpointInfo);
    return await traceSpan("serialize", async () => this.ctx.makeResponse(resolved, this.endpointInfo));
  }
  async #resolve(result: unknown) {
    const resolveOption = {
      signalContext: this,
      returnRef: this.endpointInfo.returns.returnRef,
      arrDepth: this.endpointInfo.returns.arrDepth,
      registry: this.#registry,
      live: this.#live,
    };
    const resolved = this.#spanned
      ? await traceSpan("resolveReturn", () => SignalContext.resolveReturn(result, resolveOption))
      : await SignalContext.resolveReturn(result, resolveOption);
    return this.#settle(resolved);
  }
  #settle(resolved: unknown) {
    this.#refuseBytesThroughAny(resolved);
    return this.#settleUndefined(resolved);
  }
  //? JSON has no bytes: `Response.json` turns an ArrayBuffer into `{}` and a typed array into an index map.
  #refuseBytesThroughAny(resolved: unknown) {
    if (this.endpointInfo.returns.returnRef !== Any) return;
    if (!(resolved instanceof ArrayBuffer) && !ArrayBuffer.isView(resolved)) return;
    throw new Error(
      `${this.endpointInfo.type} ${this.key} returns bytes through Any, which JSON cannot carry: declare Binary as its return`,
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
  /** The 500 log is written in here, not in the transport, so it carries the call's traceId; rethrows after. */
  static async run<T>(
    endpoint: Adaptor,
    endpointInfo: EndpointInfo,
    key: string,
    origin: TraceOrigin,
    fn: () => Promise<T>,
  ): Promise<T> {
    return await runTraced(SignalTrace.create(key, endpointInfo.type, origin), async () => {
      try {
        return await fn();
      } catch (error) {
        if (isExceptionLike(error))
          EndpointErrorContract.checkThrown(endpoint, endpointInfo, key, (error as unknown as Error).message);
        else {
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
  ): Promise<Response | undefined> {
    try {
      return await SignalContext.run(endpoint, endpointInfo, key, "http", fn);
    } catch (error) {
      if (endpointInfo.type === "message" || endpointInfo.type === "pubsub") throw error;
      if (isExceptionLike(error)) {
        return new Response(
          JSON.stringify({
            ...error.toJSON(),
            path: endpointInfo.getPath(key),
            timestamp: new Date().toISOString(),
          }),
          { status: error.statusCode, headers: SignalContext.#exceptionHeaders(error) },
        );
      }
      return SignalFailure.response(error, { path: endpointInfo.getPath(key) });
    }
  }
  static #exceptionHeaders(error: { statusCode: number }): Record<string, string> {
    const seconds = (error as { data?: { seconds?: unknown } }).data?.seconds;
    if (error.statusCode !== 429 || typeof seconds !== "number") return { "Content-Type": "application/json" };
    return { "Content-Type": "application/json", "Retry-After": String(Math.max(1, Math.ceil(seconds))) };
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
      path = "",
    }: {
      signalContext: SignalContext | null;
      returnRef: ConstantFieldTypeInput;
      arrDepth: number;
      registry: InjectRegistry;
      live: LiveRegistry;
      cache?: ResolveCache;
      /** The field path from the endpoint's return to `value`, named by a relation that cannot load. */
      path?: string;
    },
  ): Promise<unknown> {
    if (value === null || value === undefined) return value;
    if (PrimitiveRegistry.has(returnRef as Cls)) return value;
    const plan = FieldPlan.of(returnRef as ConstantCls);
    if (!plan.resolvesAsync) return SignalContext.#resolveSync(value, plan, arrDepth);
    else if (arrDepth)
      return await Promise.all(
        (value as unknown[]).map((v) =>
          SignalContext.resolveReturn(v, {
            signalContext,
            returnRef,
            arrDepth: arrDepth - 1,
            registry,
            live,
            cache,
            path,
          }),
        ),
      );
    const valueRecord = value as RuntimeRecord;
    const resolvedValue = {} as RuntimeRecord;
    // Only a field that loads or computes gets a promise: awaiting every field cost a microtask hop per field.
    const pending: Promise<void>[] = [];
    const assign = (key: string, resolved: Promise<unknown>) =>
      pending.push(
        resolved.then((v) => {
          resolvedValue[key] = v;
        }),
      );
    for (const { key, field, kind } of plan.entries) {
      if (kind === "masked") continue;
      if (kind === "value") {
        resolvedValue[key] = valueRecord[key];
        continue;
      }
      const fieldPath = path ? `${path}.${key}` : key;
      if (kind === "computed")
        assign(
          key,
          SignalContext.#resolveComputed(key, valueRecord, {
            signalContext,
            returnRef,
            field,
            registry,
            live,
            cache,
            path: fieldPath,
          }),
        );
      else if (kind === "scalar") {
        const scalarPlan = FieldPlan.of(field.modelRef as unknown as ConstantCls);
        if (!scalarPlan.resolvesAsync)
          resolvedValue[key] = SignalContext.#resolveSync(valueRecord[key], scalarPlan, field.arrDepth);
        else
          assign(
            key,
            SignalContext.resolveReturn(valueRecord[key], {
              signalContext,
              returnRef: field.modelRef,
              arrDepth: field.arrDepth,
              registry,
              live,
              cache,
              path: fieldPath,
            }),
          );
      } else
        assign(
          key,
          SignalContext.#resolveRelation(valueRecord[key], {
            signalContext,
            modelRef: field.modelRef,
            arrDepth: field.arrDepth,
            nullable: field.nullable,
            path: fieldPath,
            registry,
            live,
            cache,
          }),
        );
    }
    if (pending.length) await Promise.all(pending);
    return resolvedValue;
  }
  // The same walk as `resolveReturn` for a class whose plan holds no relation or resolve field, in one pass.
  static #resolveSync(value: unknown, plan: FieldPlan, arrDepth: number): unknown {
    if (value === null || value === undefined) return value;
    if (arrDepth) return (value as unknown[]).map((item) => SignalContext.#resolveSync(item, plan, arrDepth - 1));
    const valueRecord = value as RuntimeRecord;
    const resolvedValue = {} as RuntimeRecord;
    for (const { key, field, kind } of plan.entries) {
      if (kind === "value") resolvedValue[key] = valueRecord[key];
      else if (kind === "scalar")
        resolvedValue[key] = SignalContext.#resolveSync(
          valueRecord[key],
          FieldPlan.of(field.modelRef as unknown as ConstantCls),
          field.arrDepth,
        );
    }
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
      path,
    }: {
      signalContext: SignalContext | null;
      returnRef: ConstantFieldTypeInput;
      field: ConstantCls[typeof FIELD_META][string];
      registry: InjectRegistry;
      live: LiveRegistry;
      cache: ResolveCache;
      path: string;
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
      path,
    });
  }
  static async #resolveRelation(
    value: unknown,
    {
      signalContext,
      modelRef,
      arrDepth,
      nullable,
      path,
      registry,
      live,
      cache,
    }: {
      signalContext: SignalContext | null;
      modelRef: ConstantFieldTypeInput;
      arrDepth: number;
      nullable: boolean;
      path: string;
      registry: InjectRegistry;
      live: LiveRegistry;
      cache: ResolveCache;
    },
  ): Promise<unknown> {
    if (arrDepth) {
      if (value === null || value === undefined) return nullable ? null : [];
      const items = await Promise.all(
        (value as unknown[]).map((item) =>
          SignalContext.#resolveRelation(item, {
            signalContext,
            modelRef,
            arrDepth: arrDepth - 1,
            nullable: true,
            path,
            registry,
            live,
            cache,
          }),
        ),
      );
      // A removed or missing document drops out of the list, so a `T[]` never carries a `null` it does not declare.
      return items.filter((item) => item !== null);
    }
    const refName = ConstantRegistry.getRefName(modelRef as ConstantCls);
    const isEmpty = value === null || value === undefined;
    const service = isEmpty ? null : (live.service.get(refName) as unknown as DatabaseService | undefined);
    if (!isEmpty && !service) throw new Error(`Service ${refName} is not registered`);
    // Cached as nullable so one entry serves every reference to the document; the refusal below is each field's own.
    const resolved =
      isEmpty || !service
        ? null
        : await SignalContext.#resolveOnce(cache, modelRef, String(value), async () => {
            const loaded = await SignalContext.loadNested(value, service, { arrDepth: 0 });
            return await SignalContext.resolveReturn(loaded, {
              signalContext,
              returnRef: modelRef,
              arrDepth: 0,
              registry,
              live,
              cache,
              path,
            });
          });
    if (resolved === null && !nullable)
      throw new Err.NotFound(
        "base.error.relationNotFound",
        { model: refName, field: path },
        { details: { id: value ?? null } },
      );
    return resolved;
  }
  // Once per response per document; the promise is stored so rows asking together coalesce onto the first load.
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
  /** What `value` references: `null` for a document that is gone or soft-removed, which an array leaves out. */
  static async loadNested(
    value: unknown,
    service: DatabaseService,
    { arrDepth }: { arrDepth: number },
  ): Promise<unknown> {
    if (value === null || value === undefined) return null;
    if (arrDepth > 0 && Array.isArray(value) && value.length === 0) return [];
    if (arrDepth === 0) return (await service.__load(String(value)))?.toJSON() ?? null;
    if (arrDepth === 1)
      return (await service.__loadMany(value as string[])).filter((doc) => doc !== null).map((doc) => doc.toJSON());
    const items = await Promise.all(
      (value as unknown[]).map(async (v) => await SignalContext.loadNested(v, service, { arrDepth: arrDepth - 1 })),
    );
    return items.filter((item) => item !== null);
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
   * What a proxy recorded before the socket peer (behind the gateway every peer is the gateway), IPv4 unwrapped from
   * `::ffff:`; `null`, never a placeholder, when neither is known.
   */
  getClientIp(): string | null {
    if (this.transport === "http") return SignalContext.clientIpOf(this.getHttpContext().req);
    const { ws } = this.getWebSocketContext<{ headers?: Headers }>();
    if (!ws.data.headers) return ws.remoteAddress ? normalizeIpAddress(ws.remoteAddress) : null;
    return TrustedProxy.clientAddress(ws.data.headers, ws.remoteAddress);
  }
  static #carriedIps = new WeakMap<Request, string | null>();
  /** A request a proxy rebuilt has no socket behind it for `requestIP`, so it keeps the address its original resolved. */
  static carryClientIp(target: Request, source: Request) {
    if (target !== source) SignalContext.#carriedIps.set(target, SignalContext.clientIpOf(source));
  }
  /** `getClientIp` for a request no context wraps, as the MCP router and the page renderer hold one. */
  static clientIpOf(req: Request): string | null {
    const carried = SignalContext.#carriedIps.get(req);
    if (carried !== undefined) return carried;
    // A resolver answering `null` is an addressless unix socket (a local hop); no resolver is an unknown peer.
    const peer = SignalContext.#httpPeer?.(req);
    return TrustedProxy.clientAddress(req.headers, peer === undefined ? undefined : (peer?.address ?? null));
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
   * Appends the caller's internal arguments so subscribers of an `inSelf` slice do not share a room — only for live
   * rooms, whose sole publisher holds this id. A non-id token is digested so no credential is spelled out in a log.
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
  /** Without guards or the handler: an unsubscribe needs the room id, and leaving a room authorizes nothing. */
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
    const raw = await this.readArgs(endpointInfo);
    return endpointInfo.args.map((arg, idx) => this.parseArg(arg, raw[idx]));
  }
  /** Each argument as the request carries it; `parseArg` turns one into its declared type. */
  async readArgs(endpointInfo: EndpointInfo): Promise<unknown[]> {
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
            this.body[key] = argInfo ? HttpExecutionContext.#multipartValue(argInfo, value as string) : value;
          }
        }
      } else {
        CrossSiteGuard.assertJsonBody(this.req.headers.get("content-type"));
        this.body = (await this.req.json()) as RuntimeRecord;
      }
    }

    return endpointInfo.args.map((arg) => {
      switch (arg.type) {
        case "param":
          return this.params[arg.name];
        case "body":
          return this.body[arg.name];
        case "search":
          return arg.arrDepth ? this.url.searchParams.getAll(arg.name) : this.url.searchParams.get(arg.name);
        default:
          return undefined;
      }
    });
  }
  //? A multipart field is text: the client sends a String or ID argument as it is and every other value as JSON, so a
  //? Date arrives as `"2026-…Z"` with its quotes. Parsed back unless the argument is a plain string, which a JSON parse
  //? could turn into a number; text that is not JSON (an enum value, an older client's) stays as it came.
  static #multipartValue(arg: ArgInfo, text: string): unknown {
    if (arg.arrDepth === 0 && (arg.argRef === String || arg.argRef === ID)) return text;
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return text;
    }
  }
  parseArg(arg: ArgInfo, raw: unknown): unknown {
    switch (arg.type) {
      case "param":
        return deserializeArg(arg, raw);
      case "body":
        return arg.argRef === Upload ? raw : deserializeArg(arg, raw);
      case "search": {
        const value =
          arg.argRef === Any ? HttpExecutionContext.#parseAny(arg.name, raw as string | string[] | null) : raw;
        const result = deserializeArg(arg, value);
        this.searchParams[arg.name] = result;
        return result;
      }
      default:
        return undefined;
    }
  }
  makeResponse(result: unknown, endpointInfo: EndpointInfo) {
    if (result instanceof Response) return result;
    return this.res.json(HttpExecutionContext.wireOf(result, endpointInfo));
  }
  static wireOf(result: unknown, endpointInfo: EndpointInfo): unknown {
    if (endpointInfo.returns.arrDepth === 0 && PrimitiveRegistry.has(endpointInfo.returns.returnRef as Cls)) {
      // A JSON body carries Binary as base64, which the client's `Binary` parser turns back into bytes.
      if (endpointInfo.returns.returnRef === Binary && result instanceof Uint8Array)
        return Binary.serializeValue(result);
      return result;
    }
    return serialize(endpointInfo.returns.returnRef, endpointInfo.returns.arrDepth, result, "object", {
      nullable: endpointInfo.returns.nullable,
    });
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
    const raw = await this.readArgs(endpointInfo);
    return endpointInfo.args.map((arg, idx) => this.parseArg(arg, raw[idx]));
  }
  async readArgs(endpointInfo: EndpointInfo): Promise<unknown[]> {
    return endpointInfo.args.map((arg, idx) =>
      arg.type === "msg" || arg.type === "room" ? this.data[idx] : undefined,
    );
  }
  parseArg(arg: ArgInfo, raw: unknown): unknown {
    return arg.type === "msg" || arg.type === "room" ? deserializeArg(arg, raw) : undefined;
  }
  makeResponse(result: unknown, endpointInfo: EndpointInfo) {
    return serialize(endpointInfo.returns.returnRef, endpointInfo.returns.arrDepth, result, "object", {
      nullable: endpointInfo.returns.nullable,
    }) as unknown as Response;
  }
  // Arrows, not methods: `Ws` hands these out detached, and a method would register into its wrapper object.
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
