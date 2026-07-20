import {
  type BaseEnv,
  type Cls,
  FIELD_META,
  INTERNAL_META,
  PrimitiveRegistry,
  type PromiseOrObject,
  Upload,
} from "akanjs/base";
import {
  type ConstantCls,
  type ConstantFieldTypeInput,
  ConstantRegistry,
  deserialize,
  serialize,
} from "akanjs/constant";
import type { Adaptor, AdaptorCls, DatabaseService, InjectRegistry, LiveRegistry } from "akanjs/service";
import type { Internal, InternalCls, InternalInfo, MiddlewareCls } from ".";
import type { EndpointInfo } from "./endpointInfo";
import { Exception } from "./exception";
import { isTraceEnabled, runWithTrace, SignalTrace, traceSpan } from "./trace";

export type SignalTransportType = "http" | "websocket";

interface WebSocketRequest {
  ws: Bun.ServerWebSocket<unknown>;
  data: unknown[];
  eventType: WebSocketEventType;
}
type RuntimeRecord = Record<string, unknown>;

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
  Env extends BaseEnv = BaseEnv,
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
    }: {
      endpointInfo: EndpointInfo;
      adaptor: Adaptor;
      registry: InjectRegistry;
      env: Env;
      live: LiveRegistry;
      middleware: Map<string, MiddlewareCls>;
    },
  ) {
    this.key = key;
    this.transport = endpointInfo.type === "query" || endpointInfo.type === "mutation" ? "http" : "websocket";
    this.endpointInfo = endpointInfo;
    if (this.transport === "http") this.ctx = new HttpExecutionContext(reqOrWsReq as Bun.BunRequest) as Ctx;
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
    for (const GuardCls of guards) {
      const guard = new GuardCls();
      const canPass = guard.canPass(this);
      if (!canPass) throw new Exception.Forbidden(`Access denied by guard: ${GuardCls.name}`);
    }
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
    const endpointMiddlewares = this.endpointInfo.signalOption.middlewares ?? [];
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
    let next = coreExec;
    if (this.#middleware.size > 0 || endpointMiddlewares.length > 0) {
      const middlewares = [...this.#middleware.values(), ...endpointMiddlewares];
      for (let i = middlewares.length - 1; i >= 0; i--) {
        const MiddlewareCls = middlewares[i];
        if (!MiddlewareCls) continue;
        const middleware = new MiddlewareCls();
        const currentNext = next;
        next = async () => await (await middleware.use(this.getEnv()))(this, currentNext);
      }
    }
    const result = this.trace ? await traceSpan("execChain", () => next()) : await next();
    if (this.endpointInfo.type === "pubsub") return;
    if (result instanceof Response) return result;
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
          const value = arg.arrDepth ? this.url.searchParams.getAll(arg.name) : this.url.searchParams.get(arg.name);
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
  on(event: "disconnect" | "unsubscribe", handler: () => void) {
    if (event === "disconnect") this.onDisconnect.add(handler);
    else this.onUnsubscribe.add(handler);
  }
  off(event: "disconnect" | "unsubscribe", handler: () => void) {
    if (event === "disconnect") this.onDisconnect.delete(handler);
    else this.onUnsubscribe.delete(handler);
  }
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
