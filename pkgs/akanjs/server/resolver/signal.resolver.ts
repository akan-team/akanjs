import {
  type BaseEnv,
  type Cls,
  ENDPOINT_META,
  FIELD_META,
  getEnv,
  ID,
  INTERNAL_META,
  Int,
  PrimitiveRegistry,
  SLICE_META,
} from "akanjs/base";
import { capitalize, Logger } from "akanjs/common";
import { deserialize, serialize } from "akanjs/constant";
import { documentQueryHelper } from "akanjs/document";
import {
  type AkanJob,
  type AkanJobOptions,
  type InjectRegistry,
  type LiveRegistry,
  type WebsocketAdaptor,
  WebsocketAdaptorRole,
} from "akanjs/service";
import { type Endpoint, type EndpointCls, sliceEndpoint } from "../../signal/endpoint";
import type { EndpointInfo } from "../../signal/endpointInfo";
import type { Internal, InternalCls } from "../../signal/internal";
import type { InternalInfo } from "../../signal/internalInfo";
import type { MiddlewareCls } from "../../signal/middleware";
import type { ServerSignal, ServerSignalCls } from "../../signal/serverSignal";
import { SignalContext, type WebSocketExecutionContext } from "../../signal/signalContext";
import type { SliceCls } from "../../signal/slice";
import type { SliceInfo } from "../../signal/sliceInfo";
import type { WebsocketMessageData, WebsocketSubscribeAck } from "../../signal/types";
import type { HttpRoutes, SignalRoutes, WebsocketRoutes } from "../types";

export class SignalResolver {
  static logger = new Logger("SignalResolver");

  static makeRoomId(key: string, args: unknown[]) {
    return `${key}${args.length ? "-" : ""}${args.join("-")}`;
  }
  static #localPublish: (roomId: string, data: object | object[]) => void = () => {
    SignalResolver.logger.warn(`Local publish is not initialized yet`);
  };
  static setLocalPublish(localPublish: (roomId: string, data: object | object[]) => void, websocket: WebsocketAdaptor) {
    SignalResolver.#localPublish = localPublish;
    websocket.setEventHandler((roomId, data) => localPublish(roomId, data as object | object[]));
  }
  static resolveServerSignal(
    serverSignalCls: ServerSignalCls,
    { registry, live }: { registry: InjectRegistry; live: LiveRegistry },
  ): ServerSignalCls {
    const endpointMeta = serverSignalCls[ENDPOINT_META] as { [key: string]: EndpointInfo };
    const internalMeta = serverSignalCls[INTERNAL_META] as { [key: string]: InternalInfo };
    const websocket = SignalResolver.#getWebsocket(registry);
    Object.entries(endpointMeta).forEach(([key, endpointInfo]) => {
      if (endpointInfo.type !== "pubsub") throw new Error(`Endpoint ${key} is not a pubsub endpoint`);
      websocket.registerEndpoint(key, endpointInfo.returns.returnRef as Cls, endpointInfo.returns.arrDepth);
      const serializeFn = (data: unknown) =>
        serialize(endpointInfo.returns.returnRef, endpointInfo.returns.arrDepth, data, "object", {
          nullable: endpointInfo.returns.nullable,
        });
      Object.assign(serverSignalCls.prototype, {
        [key]: async function (this: ServerSignal, ...args: any) {
          const roomArgs = args.slice(0, -1);
          const data = args.at(-1);
          const resolvedData = await SignalContext.resolveReturn(data, {
            signalContext: null,
            returnRef: endpointInfo.returns.returnRef,
            arrDepth: endpointInfo.returns.arrDepth,
            registry,
            live,
          });
          const serializedData = serializeFn(resolvedData) as object | object[] | null;
          if (!serializedData) {
            this.logger.warn(`Failed to serialize data for ${key}`);
            return;
          }
          const roomId = SignalResolver.makeRoomId(key, roomArgs);
          websocket.publish(roomId, serializedData);
          SignalResolver.#localPublish(roomId, serializedData);
        },
      });
    });
    Object.entries(internalMeta).forEach(([key, internalInfo]) => {
      if (internalInfo.type !== "process") throw new Error(`Internal ${key} is not a process internal`);
      const argLength = internalInfo.args.length;
      Object.assign(serverSignalCls.prototype, {
        [key]: async function (this: ServerSignal, ...args: [...args: any, jobOptions?: AkanJobOptions]) {
          const serverArgs = args.slice(0, argLength);
          const jobOptions = args.at(argLength) as AkanJobOptions | undefined;
          return await this.queue.registerProcessQueue(key, serverArgs, jobOptions);
        },
      });
    });
    return serverSignalCls;
  }
  static resolveSchedule(internalCls: InternalCls, internal: Internal, serverMode: "federation" | "batch" | "all") {
    const internalMeta = internalCls[INTERNAL_META] as { [key: string]: InternalInfo };
    Object.entries(internalMeta).forEach(([key, internalInfo]) => {
      const skip = SignalResolver.getScheduleSkipReason(internalInfo, serverMode);
      if (skip) {
        SignalResolver.#warnMissingProcessWorker(key, internalInfo, skip);
        return;
      }
      switch (internalInfo.type) {
        case "process": {
          if (!internalInfo.execFn) throw new Error(`Exec function is not set for ${key}`);
          const execFn = internalInfo.execFn.bind(internal);
          // Queue adaptors invoke the handler with the job only; the declared payload lives in `job.data`.
          // Spread it back onto the `msg` args so the `exec` signature (...msgArgs, job) holds at runtime.
          internal.queue.registerProcessWorker(
            key,
            async (job) => await execFn(...SignalResolver.#getJobArgs(key, internalInfo, job), job),
          );
          break;
        }
        case "init":
          internal.schedule.registerInit(key, () => internalInfo.execFn?.bind(internal)());
          break;
        case "destroy":
          internal.schedule.registerDestroy(key, () => internalInfo.execFn?.bind(internal)());
          break;
        case "interval":
          if (!internalInfo.signalOption.scheduleTime) throw new Error(`Schedule time is not set for ${key}`);
          if (!internalInfo.execFn) throw new Error(`Exec function is not set for ${key}`);
          internal.schedule.registerInterval(
            key,
            internalInfo.signalOption.scheduleTime,
            internalInfo.execFn.bind(internal),
            { lock: internalInfo.signalOption.lock },
          );
          break;
        case "timeout":
          if (!internalInfo.signalOption.scheduleTime) throw new Error(`Schedule time is not set for ${key}`);
          if (!internalInfo.execFn) throw new Error(`Exec function is not set for ${key}`);
          internal.schedule.registerTimeout(
            key,
            internalInfo.signalOption.scheduleTime,
            internalInfo.execFn.bind(internal),
          );
          break;
        case "cron":
          if (!internalInfo.signalOption.scheduleCron) throw new Error(`Schedule cron is not set for ${key}`);
          if (!internalInfo.execFn) throw new Error(`Exec function is not set for ${key}`);
          internal.schedule.registerCron(
            key,
            internalInfo.signalOption.scheduleCron,
            internalInfo.execFn.bind(internal),
            { lock: internalInfo.signalOption.lock },
          );
          break;
      }
    });
  }
  /** Why an internal is not scheduled on this server, or null when it is. `placement` marks a deliberate role split. */
  static getScheduleSkipReason(
    internalInfo: InternalInfo,
    serverMode: "federation" | "batch" | "all",
  ): { reason: string; placement: boolean } | null {
    const { enabled, operationMode, serverMode: targetServerMode } = internalInfo.signalOption;
    if (!enabled) return { reason: "the internal is disabled (`enabled: false`)", placement: false };
    if (operationMode && !operationMode.includes(getEnv().operationMode))
      return {
        reason: `operationMode "${getEnv().operationMode}" is not in [${operationMode.join(", ")}]`,
        placement: true,
      };
    if (targetServerMode && targetServerMode !== "all" && serverMode !== "all" && targetServerMode !== serverMode)
      return {
        reason: `serverMode is "${serverMode}" but the internal declares "${targetServerMode}"`,
        placement: true,
      };
    return null;
  }

  /**
   * A `process` producer is installed on every server regardless of placement, so a skipped worker means this
   * server can enqueue jobs that nothing here consumes. Surface that asymmetry instead of failing silently.
   */
  static #warnMissingProcessWorker(
    key: string,
    internalInfo: InternalInfo,
    { reason, placement }: { reason: string; placement: boolean },
  ) {
    if (internalInfo.type !== "process") return;
    const message = `No worker registered for process internal "${key}" because ${reason}. Jobs enqueued here stay pending unless another server consumes them.`;
    if (placement) SignalResolver.logger.verbose(message);
    else SignalResolver.logger.warn(message);
  }

  /** Maps a job payload back onto the internal's declared `msg` args, deserializing each to its declared type. */
  static #getJobArgs(key: string, internalInfo: InternalInfo, job: AkanJob): unknown[] {
    const data = Array.isArray(job.data) ? (job.data as unknown[]) : job.data === undefined ? [] : [job.data];
    return internalInfo.args.map((arg, idx) =>
      deserialize(arg.argRef, arg.arrDepth, data[idx], {
        key: `${key}.${arg.name}`,
        nullable: arg.option?.nullable,
      }),
    );
  }

  static resolveSlice(sliceCls: SliceCls): EndpointCls {
    const sliceMeta = sliceCls[SLICE_META] as { [key: string]: SliceInfo };
    const cnst = sliceCls.srv.cnst;
    if (!cnst) throw new Error("Constant is not set for slice");
    const refName = cnst.refName;
    const serviceName = `${refName}Service`;
    const capitalizedRefName = capitalize(refName);

    // A slice `exec` must return a query descriptor, not an executed list. Returning an array
    // (e.g. `this.xService.listBy...(...)`) otherwise fails deep in query compilation with the
    // opaque "Unknown document field path: 0" — surface the real cause here instead.
    const assertSliceQuery = (query: unknown, key: string) => {
      if (Array.isArray(query))
        throw new Error(
          `Slice "${refName}.${key}" exec returned an array instead of a query descriptor. ` +
            `Return a query from the slice's service (e.g. this.${refName}Service.queryBy...(...)), ` +
            `not an executed list (listBy.../findMany...), which resolves to an array.`,
        );
      return query;
    };

    class SliceEndpoint extends sliceEndpoint(sliceCls.srv, (builder) => {
      const endpointObj: { [key: string]: EndpointInfo } = {};
      Object.entries(sliceMeta).forEach(([key, sliceInfo]) => {
        if (!sliceInfo.execFn) return;
        const capitalizedKey = capitalize(key);
        const argLength = sliceInfo.args.length;

        // List endpoint: ${refName}List${Capitalize<key>}
        const listKey = `${refName}List${capitalizedKey}`;
        endpointObj[listKey] = (builder as any)
          .query([sliceInfo.light], sliceInfo.signalOption)
          ._addArgs(sliceInfo.args)
          .search("skip", Int)
          .search("limit", Int)
          .search("sort", String)
          ._addInternalArgs(sliceInfo.internalArgs)
          .exec(async function (this: any, ...requestArgs: any) {
            const args = requestArgs.slice(0, argLength);
            const skip = Number(requestArgs[argLength] ?? 0);
            const limit = Number(requestArgs[argLength + 1] ?? 20);
            const sort = requestArgs[argLength + 2] ?? "latest";
            const internalArgs = requestArgs.slice(argLength + 3);
            const query = assertSliceQuery(
              await sliceInfo.execFn?.apply(this, [...args, ...internalArgs, documentQueryHelper]),
              key,
            );
            return (await this[serviceName].__list(query, {
              skip,
              limit,
              sort,
              select: SignalResolver.#selectForConstant(sliceInfo.light),
            })) as any;
          });

        // Insight endpoint: ${refName}Insight${Capitalize<key>}
        const insightKey = `${refName}Insight${capitalizedKey}`;
        endpointObj[insightKey] = (builder as any)
          .query(sliceInfo.insight, sliceInfo.signalOption)
          ._addArgs(sliceInfo.args)
          ._addInternalArgs(sliceInfo.internalArgs)
          .exec(async function (this: any, ...requestArgs: any) {
            const args = requestArgs.slice(0, argLength);
            const internalArgs = requestArgs.slice(argLength);
            const query = assertSliceQuery(
              await sliceInfo.execFn?.apply(this, [...args, ...internalArgs, documentQueryHelper]),
              key,
            );
            return await this[serviceName].__insight(query);
          });
      });

      // model endpoint: ${refName}
      endpointObj[refName] = (builder as any)
        .query(cnst.full, { guards: sliceCls.getGuards })
        .param(`${refName}Id`, ID)
        .exec(async function (this: any, id: string) {
          return await this[serviceName][`get${capitalizedRefName}`](id);
        });

      // lightModel endpoint: light${Capitalize<refName>}
      endpointObj[`light${capitalizedRefName}`] = (builder as any)
        .query(cnst.light, { guards: sliceCls.getGuards })
        .param(`${refName}Id`, ID)
        .exec(async function (this: any, id: string) {
          return await this[serviceName][`get${capitalizedRefName}`](id);
        });

      // createModel endpoint: create${Capitalize<refName>}
      endpointObj[`create${capitalizedRefName}`] = (builder as any)
        .mutation(cnst.full, { guards: sliceCls.createGuards })
        .body("data", cnst.input)
        .exec(async function (this: any, data: any) {
          return await this[serviceName].__create(data);
        });

      // updateModel endpoint: update${Capitalize<refName>}${Capitalize<key>}
      endpointObj[`update${capitalizedRefName}`] = (builder as any)
        .mutation(cnst.full, { guards: sliceCls.updateGuards })
        .param(`${refName}Id`, ID)
        .body("data", cnst.input)
        .exec(async function (this: any, id: string, data: any) {
          return await this[serviceName].__update(id, data);
        });

      // removeModel endpoint: remove${Capitalize<refName>}${Capitalize<key>}
      endpointObj[`remove${capitalizedRefName}`] = (builder as any)
        .mutation(cnst.full, { guards: sliceCls.removeGuards })
        .param(`${refName}Id`, ID)
        .exec(async function (this: any, id: string) {
          return await this[serviceName].__remove(id);
        });
      return endpointObj;
    }) {}
    return SliceEndpoint;
  }
  static #liveWsPubsubRoomCtx = new WeakMap<
    Bun.ServerWebSocket<unknown>,
    Map<string, SignalContext<WebSocketExecutionContext>>
  >();
  static resolveEndpoint(
    endpointCls: EndpointCls,
    endpoint: Endpoint,
    {
      registry,
      env,
      live,
      middleware,
    }: { registry: InjectRegistry; env: BaseEnv; live: LiveRegistry; middleware: Map<string, MiddlewareCls> },
  ): SignalRoutes {
    const endpointMeta = endpointCls[ENDPOINT_META] as { [key: string]: EndpointInfo };
    const routes: HttpRoutes = {};
    const routeOptions: NonNullable<SignalRoutes["routeOptions"]> = {};
    const wsRoutes: WebsocketRoutes = {};
    const defaultPrefix = endpointCls.srv.cnst?.refName;
    Object.entries(endpointMeta).forEach(([key, endpointInfo]) => {
      const servicePrefix = SignalResolver.#resolveServicePrefix(endpointInfo.signalOption.prefix, defaultPrefix);
      const path = `${servicePrefix}${endpointInfo.getPath(key)}`;
      if (endpointInfo.signalOption.globalPrefix !== undefined) {
        routeOptions[path] = { globalPrefix: endpointInfo.signalOption.globalPrefix };
      }
      const normalHttpHandler = async (req: Bun.BunRequest) =>
        await SignalContext.try(endpoint, endpointInfo, key, async () => {
          const context = await new SignalContext(key, req, {
            endpointInfo,
            adaptor: endpoint,
            registry,
            env,
            live,
            middleware,
          }).init();
          return await context.exec();
        });
      switch (endpointInfo.type) {
        case "query":
          routes[path] = SignalResolver.#canUsePrimitiveQueryFastPath(endpointInfo, middleware)
            ? {
                GET: async (req) => {
                  if (SignalResolver.#hasAuthCredential(req)) return await normalHttpHandler(req);
                  return await SignalContext.try(endpoint, endpointInfo, key, async () => {
                    const result = await endpointInfo.execFn?.call(endpoint);
                    return result instanceof Response ? result : Response.json(result);
                  });
                },
              }
            : {
                GET: normalHttpHandler,
              };
          break;
        case "mutation":
          routes[path] = {
            POST: normalHttpHandler,
          };
          break;
        case "pubsub":
          wsRoutes[key] = async (ws, message, event) => {
            const websocket = SignalResolver.#getWebsocket(registry);
            const context = await new SignalContext(
              key,
              { ws, data: message, eventType: event ?? "unsubscribe" },
              { endpointInfo, adaptor: endpoint, registry, env, live, middleware },
            ).init();
            const subscribe = event === "subscribe";
            const roomId = context.getRoomId(key);
            if (subscribe) {
              await context.exec();
              ws.subscribe(roomId);
              const roomCtxMap = SignalResolver.#liveWsPubsubRoomCtx.get(ws) ?? new Map();
              roomCtxMap.set(roomId, context);
              SignalResolver.#liveWsPubsubRoomCtx.set(ws, roomCtxMap);
              // Track room membership in Redis for cross-server awareness
              websocket.joinRoom(ws, roomId);
              SignalResolver.logger.verbose(`WebSocket subscribed to room ${roomId}`);
            } else {
              ws.unsubscribe(roomId);
              const roomCtxMap = SignalResolver.#liveWsPubsubRoomCtx.get(ws);
              if (roomCtxMap) {
                const roomCtx = roomCtxMap.get(roomId);
                if (roomCtx) {
                  const unsubscribeHandlers = [...roomCtx.getWebSocketContext().onUnsubscribe.values()];
                  await Promise.all(unsubscribeHandlers.map((handler) => handler()));
                }
                roomCtxMap.delete(roomId);
                if (roomCtxMap.size === 0) SignalResolver.#liveWsPubsubRoomCtx.delete(ws);
                // Remove room membership from Redis
                websocket.leaveRoom(ws, roomId);
                SignalResolver.logger.verbose(`WebSocket unsubscribed from room ${roomId}`);
              }
            }
            const subscribeAck: WebsocketSubscribeAck = { type: "sub", roomId, subscribe };
            return subscribeAck;
          };
          break;
        case "message":
          wsRoutes[key] = async (ws, message) => {
            const context = await new SignalContext(
              key,
              { ws, data: message, eventType: "message" },
              { endpointInfo, adaptor: endpoint, registry, env, live, middleware },
            ).init();
            const result = (await context.exec()) as object | object[];
            const messageData: WebsocketMessageData = { type: "msg", key, data: result };
            return messageData;
          };
          break;
        default:
          throw new Error(`Endpoint ${key} is not a valid endpoint type`);
      }
      SignalResolver.logger.verbose(`Resolved endpoint ${endpointInfo.type} ${path} for ${key}`);
    });
    return { routes, wsRoutes, routeOptions };
  }

  static #resolveServicePrefix(prefix: false | string | undefined, defaultPrefix?: string): string {
    if (prefix === false || prefix === "") return "";
    const resolved = prefix ?? defaultPrefix;
    if (!resolved) return "";
    const trimmed = resolved.trim().replace(/^\/+|\/+$/g, "");
    return trimmed ? `/${trimmed}` : "";
  }

  static #selectForConstant(constant: Cls): Record<string, true> | undefined {
    const fields = (constant as { [FIELD_META]?: Record<string, unknown> })[FIELD_META];
    if (!fields) return undefined;
    return Object.fromEntries(Object.keys(fields).map((field) => [field, true]));
  }

  static #canUsePrimitiveQueryFastPath(endpointInfo: EndpointInfo, middleware: Map<string, MiddlewareCls>) {
    return (
      process.env.AKAN_TRACE !== "1" &&
      endpointInfo.args.length === 0 &&
      endpointInfo.internalArgs.length === 0 &&
      (endpointInfo.signalOption.guards?.length ?? 0) === 0 &&
      (endpointInfo.signalOption.middlewares?.length ?? 0) === 0 &&
      [...middleware.values()].every((MiddlewareCls) => MiddlewareCls.refName === "AccountMiddleware") &&
      endpointInfo.returns.arrDepth === 0 &&
      PrimitiveRegistry.has(endpointInfo.returns.returnRef as Cls)
    );
  }

  static #hasAuthCredential(req: Request) {
    return Boolean(req.headers.get("authorization") || req.headers.get("cookie")?.includes("jwt="));
  }

  static async handleWsOpen(ws: Bun.ServerWebSocket<any>, registry: InjectRegistry) {
    await SignalResolver.#getWebsocket(registry).registerSocket(ws);
  }

  static async handleWsClose(ws: Bun.ServerWebSocket<any>, registry: InjectRegistry) {
    const roomCtxMap = SignalResolver.#liveWsPubsubRoomCtx.get(ws);
    if (roomCtxMap) {
      const unsubscribeHandlers = [...roomCtxMap.values()].flatMap((roomCtx) => [
        ...roomCtx.getWebSocketContext().onUnsubscribe.values(),
      ]);
      await Promise.all(unsubscribeHandlers.map((handler) => handler()));
      const disconnectHandlers = [...roomCtxMap.values()].flatMap((roomCtx) => [
        ...roomCtx.getWebSocketContext().onDisconnect.values(),
      ]);
      await Promise.all(disconnectHandlers.map((handler) => handler()));
    }
    SignalResolver.#liveWsPubsubRoomCtx.delete(ws);

    // Clean up socket from Redis
    await SignalResolver.#getWebsocket(registry).unregisterSocket(ws);
    SignalResolver.logger.verbose(`WebSocket disconnected from all rooms`);
  }
  static #getWebsocket(registry: InjectRegistry): WebsocketAdaptor {
    const roleProvider = [...registry.adaptorRole.entries()].find(
      ([role]) => role.refName === WebsocketAdaptorRole.refName,
    )?.[1];
    const websocket =
      (registry.adaptor.get(WebsocketAdaptorRole) as WebsocketAdaptor | undefined) ??
      (roleProvider ? (registry.adaptor.get(roleProvider) as WebsocketAdaptor | undefined) : undefined) ??
      ([...registry.adaptor.entries()].find(([adaptorCls]) =>
        ["solidPubsub", "wsRedis"].includes(adaptorCls.refName),
      )?.[1] as WebsocketAdaptor | undefined);
    if (!websocket) throw new Error("WebSocket adaptor is not registered");
    return websocket;
  }
}
