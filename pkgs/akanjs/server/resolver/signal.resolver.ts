import {
  Any,
  type BackendEnv,
  Binary,
  type Cls,
  ENDPOINT_META,
  FIELD_META,
  Float,
  getEnv,
  ID,
  INTERNAL_META,
  Int,
  PrimitiveRegistry,
  type PromiseOrObject,
  SLICE_META,
} from "akanjs/base";
import { capitalize, cookieHeaderHasAuthToken, Logger } from "akanjs/common";
import { type ConstantField, deserialize, resolvePageLimit, resolvePageSkip, serialize } from "akanjs/constant";
import { baseDocumentColumns, documentQueryHelper, getFilterSortByKey, type QueryFieldMap } from "akanjs/document";
import {
  type AkanJob,
  type AkanJobOptions,
  type DocumentStore,
  type InjectRegistry,
  type LiveChange,
  type LiveRegistry,
  type WebsocketAdaptor,
  WebsocketAdaptorRole,
} from "akanjs/service";
import { websocketRoomContract } from "../../common/websocketContract";
import { type Endpoint, type EndpointCls, sliceEndpoint } from "../../signal/endpoint";
import type { EndpointInfo } from "../../signal/endpointInfo";
import type { Internal, InternalCls } from "../../signal/internal";
import type { InternalInfo } from "../../signal/internalInfo";
import type { MiddlewareCls } from "../../signal/middleware";
import type { ServerSignal, ServerSignalCls } from "../../signal/serverSignal";
import { SignalContext, type WebSocketExecutionContext } from "../../signal/signalContext";
import type { SliceCls } from "../../signal/slice";
import type { SliceInfo } from "../../signal/sliceInfo";
import { runTraced, SignalTrace } from "../../signal/trace";
import type {
  LiveEndpointOption,
  LiveEventPayload,
  WebsocketMessageData,
  WebsocketSubscribeAck,
} from "../../signal/types";
import type { HttpRoutes, LocalPublish, SignalRoutes, WebsocketRoutes } from "../types";

type LiveChangeListener = (doc: unknown, type: unknown, previous?: unknown) => void;
type LiveRoute = (next: Record<string, unknown>, previous?: Record<string, unknown>) => Promise<LiveDelivery[]>;
interface LiveDelivery {
  roomId: string;
  payload: LiveEventPayload;
}
type HttpMethodRoutes = Record<string, (req: Bun.BunRequest) => Response | Promise<Response | undefined> | undefined>;

export class SignalResolver {
  static logger = new Logger("SignalResolver");

  static makeRoomId(key: string, args: unknown[]) {
    return websocketRoomContract.idOf(key, args);
  }
  static #localPublish: LocalPublish = () => {
    SignalResolver.logger.verbose(`Local publish is not initialized yet`);
  };
  static readonly #coalescingRooms = new Set<string>();
  static readonly #liveRoutes = new Map<string, { store: DocumentStore; route: LiveRoute }>();

  static coalescesRoom(roomId: string): boolean {
    const separator = roomId.indexOf("-");
    return SignalResolver.#coalescingRooms.has(separator >= 0 ? roomId.slice(0, separator) : roomId);
  }
  static setLocalPublish(localPublish: LocalPublish, websocket: WebsocketAdaptor, live?: LiveRegistry) {
    SignalResolver.#localPublish = localPublish;
    websocket.setEventHandler((roomId, data) => localPublish(roomId, data as object | object[] | Uint8Array));
    // A room that missed events cannot tell which ones, so every live room is invalidated and its subscribers refetch.
    websocket.onRecovered?.(() => {
      for (const roomId of live?.syncHub.roomIds() ?? []) {
        const payload: LiveEventPayload = { op: "invalidate", id: "" };
        localPublish(roomId, payload);
      }
    });
    websocket.onChange?.((change) => {
      void SignalResolver.#routeChange(change, live).catch((error: unknown) =>
        SignalResolver.logger.warn(`Live routing failed for ${change.refName}: ${String(error)}`),
      );
    });
  }
  static async #routeChange({ refName, next, previous }: LiveChange, live?: LiveRegistry) {
    const target = SignalResolver.#liveRoutes.get(refName);
    if (!target || !live?.syncHub.roomCountOf(refName)) return;
    await target.route(
      target.store.deserialize(next) as Record<string, unknown>,
      previous ? (target.store.deserialize(previous) as Record<string, unknown>) : undefined,
    );
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
      const isBinaryFrame = endpointInfo.returns.returnRef === Binary && !endpointInfo.returns.arrDepth;
      if (isBinaryFrame && endpointInfo.signalOption.backpressure !== "queue") SignalResolver.#coalescingRooms.add(key);
      let warnedRawBytes = false;
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
          const roomId = SignalResolver.makeRoomId(key, roomArgs);
          if (isBinaryFrame) {
            const bytes = Binary._parse(resolvedData as Uint8Array) as Uint8Array;
            websocket.publish(roomId, bytes, { coalesce: SignalResolver.coalescesRoom(roomId) });
            SignalResolver.#localPublish(roomId, bytes);
            return;
          }
          const serializedData = serializeFn(resolvedData) as object | object[] | null;
          if (!serializedData) {
            this.logger.warn(`Failed to serialize data for ${key}`);
            return;
          }
          if (!warnedRawBytes && ArrayBuffer.isView(serializedData)) {
            warnedRawBytes = true;
            this.logger.warn(`${key} publishes bytes but does not return Binary; declare pubsub(Binary) instead.`);
          }
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
  // Query-level writes (update<Filter>, updateById, …) fire no document hooks, so they never reach a live room.
  // Each server routes its own rooms; publishChange ships whole docs (secret fields too) over the app's own channel.
  static registerLiveSync(
    sliceCls: SliceCls,
    { registry, live }: { registry: InjectRegistry; live: LiveRegistry },
  ): string[] {
    const sliceMeta = sliceCls[SLICE_META] as { [key: string]: SliceInfo };
    const cnst = sliceCls.srv.cnst;
    if (!cnst) return [];
    const refName = cnst.refName;
    const liveKeys = Object.entries(sliceMeta)
      .filter(([, sliceInfo]) => sliceInfo.liveOption && sliceInfo.execFn)
      .map(([key]) => `${refName}Live${capitalize(key)}`);
    if (!liveKeys.length) return [];
    const service = live.service.get(refName) as
      | {
          listenPost: (type: "create" | "update" | "remove", listener: LiveChangeListener) => unknown;
          __databaseModel: { __store: DocumentStore };
        }
      | undefined;
    if (!service) throw new Error(`Live slice on "${refName}" has no service to listen to`);
    const store = service.__databaseModel.__store;
    const websocket = SignalResolver.#getWebsocket(registry);
    const route: LiveRoute = async (next, previous) => {
      const targets = live.syncHub.route(refName, next, previous);
      if (!targets.length) return [];
      const id = String(next.id);
      const needsLight = targets.some((target) => !target.invalidate && target.payload === "light");
      // `resolveReturn`, not `mask`: a page renders this, and `mask` would also drop `visual` fields.
      const light = needsLight
        ? ((await SignalContext.resolveReturn(next, {
            signalContext: null,
            returnRef: cnst.light,
            arrDepth: 0,
            registry,
            live,
          })) as object)
        : null;
      const lightData = light ? (serialize(cnst.light, 0, light, "object", {}) as object | null) : null;
      return targets.map((target) => {
        const payload: LiveEventPayload = target.invalidate
          ? { op: "invalidate", id }
          : { op: target.op, id, light: target.payload === "light" ? lightData : null };
        SignalResolver.#localPublish(target.roomId, payload);
        return { roomId: target.roomId, payload };
      });
    };
    SignalResolver.#liveRoutes.set(refName, { store, route });
    const publish = async (next: Record<string, unknown>, previous?: Record<string, unknown>) => {
      websocket.publishChange?.({
        refName,
        next: store.serialize(next),
        previous: previous ? store.serialize(previous) : undefined,
      });
      const delivered = await route(next, previous);
      // Without publishChange, per-room events reach another server only for rooms this server also holds.
      if (!websocket.publishChange) for (const { roomId, payload } of delivered) websocket.publish(roomId, payload);
    };
    // Fire and forget: the write has already committed, and an unreachable subscriber must not fail it.
    const listener: LiveChangeListener = (doc, _type, previous) => {
      void publish(doc as Record<string, unknown>, previous as Record<string, unknown> | undefined).catch(
        (error: unknown) => SignalResolver.logger.warn(`Live publish failed for ${refName}: ${String(error)}`),
      );
    };
    service.listenPost("create", listener);
    service.listenPost("update", listener);
    service.listenPost("remove", listener);
    return liveKeys;
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
          // Queue adaptors pass only the job; spread `job.data` back onto the msg args so exec(...msgArgs, job) holds.
          internal.queue.registerProcessWorker(
            key,
            SignalResolver.#traced(
              key,
              async (job) => await execFn(...SignalResolver.#getJobArgs(key, internalInfo, job), job),
            ),
          );
          break;
        }
        case "init":
          internal.schedule.registerInit(
            key,
            SignalResolver.#traced(key, () => internalInfo.execFn?.bind(internal)()),
            { once: internalInfo.signalOption.once },
          );
          break;
        case "destroy":
          internal.schedule.registerDestroy(
            key,
            SignalResolver.#traced(key, () => internalInfo.execFn?.bind(internal)()),
          );
          break;
        case "interval":
          if (!internalInfo.signalOption.scheduleTime) throw new Error(`Schedule time is not set for ${key}`);
          if (!internalInfo.execFn) throw new Error(`Exec function is not set for ${key}`);
          internal.schedule.registerInterval(
            key,
            internalInfo.signalOption.scheduleTime,
            SignalResolver.#traced(key, internalInfo.execFn.bind(internal)),
            { lock: internalInfo.signalOption.lock },
          );
          break;
        case "timeout":
          if (!internalInfo.signalOption.scheduleTime) throw new Error(`Schedule time is not set for ${key}`);
          if (!internalInfo.execFn) throw new Error(`Exec function is not set for ${key}`);
          internal.schedule.registerTimeout(
            key,
            internalInfo.signalOption.scheduleTime,
            SignalResolver.#traced(key, internalInfo.execFn.bind(internal)),
          );
          break;
        case "cron":
          if (!internalInfo.signalOption.scheduleCron) throw new Error(`Schedule cron is not set for ${key}`);
          if (!internalInfo.execFn) throw new Error(`Exec function is not set for ${key}`);
          internal.schedule.registerCron(
            key,
            internalInfo.signalOption.scheduleCron,
            SignalResolver.#traced(key, internalInfo.execFn.bind(internal)),
            { lock: internalInfo.signalOption.lock },
          );
          break;
      }
    });
  }
  static #traced<A extends unknown[], R>(key: string, fn: (...args: A) => R) {
    return async (...args: A) =>
      await runTraced(SignalTrace.create(key, "internal", "internal"), async () => await fn(...args));
  }
  // `placement`: the skip is a deliberate role split (operationMode/serverMode), not a disabled internal.
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

    // Unchecked, an array fails deep in query compilation as the opaque "Unknown document field path: 0".
    const assertSliceQuery = (query: unknown, key: string) => {
      if (Array.isArray(query))
        throw new Error(
          `Slice "${refName}.${key}" exec returned an array instead of a query descriptor. ` +
            `Return a query from the slice's service (e.g. this.${refName}Service.queryBy...(...)), ` +
            `not an executed list (listBy.../findMany...), which resolves to an array.`,
        );
      return query;
    };

    // `builder as any` on purpose: its type derives from per-slice literal type args held here only at runtime.
    class SliceEndpoint extends sliceEndpoint(sliceCls.srv, (builder) => {
      const endpointObj: { [key: string]: EndpointInfo } = {};
      Object.entries(sliceMeta).forEach(([key, sliceInfo]) => {
        if (!sliceInfo.execFn) return;
        const capitalizedKey = capitalize(key);
        const argLength = sliceInfo.args.length;

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
            const skip = resolvePageSkip(requestArgs[argLength]);
            const limit = resolvePageLimit(requestArgs[argLength + 1]);
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

        // The live exec returns the query itself: the router tests each write against it for room membership.
        if (sliceInfo.liveOption) {
          if (!key)
            throw new Error(
              `The root slice of "${refName}" cannot declare .live(): it is the admin CRUD API, guarded by Admin, ` +
                `and opening it would put every model on a live socket by default.`,
            );
          SignalResolver.#assertLiveSort(refName, key, sliceInfo);
          SignalResolver.#assertLivePauseOn(refName, key, sliceInfo);
          const liveKey = `${refName}Live${capitalizedKey}`;
          // The list's own guards (a room delivers its rows); `getGuards` would fail closed: rooms carry no doc id.
          const liveBuilder = (builder as any).pubsub(Any, {
            ...sliceInfo.signalOption,
            mcp: false,
            live: {
              refName,
              sliceKey: key,
              sort: sliceInfo.liveOption.sort,
              fallback: sliceInfo.liveOption.fallback,
              payload: sliceInfo.liveOption.payload,
              pauseOn: sliceInfo.liveOption.pauseOn,
            } satisfies LiveEndpointOption,
          });
          endpointObj[liveKey] = liveBuilder
            ._addRoomArgs(sliceInfo.args)
            ._addInternalArgs(sliceInfo.internalArgs)
            .exec(async function (this: any, ...requestArgs: any) {
              const args = requestArgs.slice(0, argLength);
              const internalArgs = requestArgs.slice(argLength);
              return assertSliceQuery(
                await sliceInfo.execFn?.apply(this, [...args, ...internalArgs, documentQueryHelper]),
                key,
              );
            });
        }

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

      endpointObj[refName] = (builder as any)
        .query(cnst.full, { guards: sliceCls.getGuards })
        .param(`${refName}Id`, ID)
        .exec(async function (this: any, id: string) {
          return await this[serviceName][`get${capitalizedRefName}`](id);
        });

      endpointObj[`light${capitalizedRefName}`] = (builder as any)
        .query(cnst.light, { guards: sliceCls.getGuards })
        .param(`${refName}Id`, ID)
        .exec(async function (this: any, id: string) {
          return await this[serviceName][`get${capitalizedRefName}`](id);
        });

      endpointObj[`create${capitalizedRefName}`] = (builder as any)
        .mutation(cnst.full, { guards: sliceCls.createGuards })
        .body("data", cnst.input)
        .exec(async function (this: any, data: any) {
          return await this[serviceName].__create(data);
        });

      endpointObj[`update${capitalizedRefName}`] = (builder as any)
        .mutation(cnst.full, { guards: sliceCls.updateGuards })
        .param(`${refName}Id`, ID)
        .body("data", cnst.input)
        .exec(async function (this: any, id: string, data: any) {
          return await this[serviceName].__update(id, data);
        });

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
  // A client places a row as SQLite and Postgres order these, NULL included; any other value is ordered by each
  // dialect's own JSON rules. That only warns, since whether it matters is the author's call.
  static readonly #clientOrderableTypes = new Set<unknown>([Int, Float, String, ID, Boolean, Date]);
  static #assertLiveSort(refName: string, key: string, sliceInfo: SliceInfo) {
    const lightFields =
      (sliceInfo.light as unknown as { [FIELD_META]?: Record<string, ConstantField> })[FIELD_META] ?? {};
    for (const sortKey of sliceInfo.liveOption?.sort ?? []) {
      const sort = getFilterSortByKey(sliceInfo.filter, sortKey);
      if (!sort)
        throw new Error(`Live slice "${refName}.${key}" declares sort "${sortKey}", which the model does not have.`);
      for (const path of Object.keys(sort)) {
        if (baseDocumentColumns.has(path)) continue;
        if (!(path in lightFields))
          throw new Error(
            `Live slice "${refName}.${key}" declares sort "${sortKey}" on "${path}", which is not in ` +
              `Light${capitalize(refName)}. A subscriber cannot order by a field it never receives.`,
          );
        const { modelRef, isArray, isMap } = lightFields[path].getProps();
        if (!isArray && !isMap && SignalResolver.#clientOrderableTypes.has(modelRef)) continue;
        SignalResolver.logger.warn(
          `Live slice "${refName}.${key}" sorts "${sortKey}" by "${path}", which is not an Int, Float, String, ID, ` +
            `Boolean or Date field, so a client placing a new row may disagree with the server. Sort by one of ` +
            `those, or leave "${sortKey}" out of .live({ sort }) so the list refetches when a row arrives.`,
        );
      }
    }
  }
  static #assertNotPaused(
    key: string,
    liveOption: LiveEndpointOption,
    endpointInfo: EndpointInfo,
    context: SignalContext,
  ) {
    for (const name of liveOption.pauseOn) {
      const idx = endpointInfo.args.findIndex((arg) => arg.name === name);
      if (idx < 0 || context.args[idx] == null) continue;
      throw new Error(
        `Live room "${key}" is paused while "${name}" carries a value: the slice declared it in ` +
          `.live({ pauseOn }), so this window updates by refetching instead of subscribing.`,
      );
    }
  }
  static #assertLivePauseOn(refName: string, key: string, sliceInfo: SliceInfo) {
    for (const name of sliceInfo.liveOption?.pauseOn ?? []) {
      const arg = sliceInfo.args.find((candidate) => candidate.name === name);
      if (!arg)
        throw new Error(
          `Live slice "${refName}.${key}" declares pauseOn "${name}", which is not one of its arguments ` +
            `(${sliceInfo.args.map((candidate) => candidate.name).join(", ") || "none"}).`,
        );
      if (!arg.option?.nullable)
        throw new Error(
          `Live slice "${refName}.${key}" declares pauseOn "${name}", which is a required ${arg.type} and is ` +
            `therefore always present — the room would never open. Only a nullable argument can pause live sync.`,
        );
    }
  }
  // Routing reads it only for array paths: a bare value on an array field means membership, not equality.
  static #queryFieldsOf(live: LiveRegistry, refName: string): QueryFieldMap {
    const sliceCls = live.sliceCls.get(refName);
    const doc = sliceCls?.srv.db?.doc as { [FIELD_META]?: QueryFieldMap } | undefined;
    return doc?.[FIELD_META] ?? {};
  }
  static #liveWsPubsubRoomCtx = new WeakMap<
    Bun.ServerWebSocket<unknown>,
    Map<string, SignalContext<WebSocketExecutionContext>>
  >();
  // A message context is dropped once it answers, so one that registered `ws.on(...)` is kept here or never runs it.
  static #liveWsMessageCtx = new WeakMap<Bun.ServerWebSocket<unknown>, Set<SignalContext<WebSocketExecutionContext>>>();
  static #retainWsContext(ws: Bun.ServerWebSocket<unknown>, context: SignalContext<WebSocketExecutionContext>) {
    const wsCtx = context.getWebSocketContext();
    if (!wsCtx.onDisconnect.size && !wsCtx.onUnsubscribe.size) return;
    const contexts = SignalResolver.#liveWsMessageCtx.get(ws) ?? new Set<SignalContext<WebSocketExecutionContext>>();
    contexts.add(context);
    SignalResolver.#liveWsMessageCtx.set(ws, contexts);
  }
  // allSettled: a throwing app handler must not skip `unregisterSocket`, which would leak Redis room membership.
  // A Set, so a handler registered for both unsubscribe and disconnect runs once on close.
  static async #runLifecycleHandlers(
    contexts: Iterable<SignalContext<WebSocketExecutionContext>>,
    events: ("unsubscribe" | "disconnect")[],
  ) {
    const handlers = new Set<() => PromiseOrObject<void>>();
    for (const event of events)
      for (const context of contexts) {
        const wsCtx = context.getWebSocketContext();
        for (const handler of event === "disconnect" ? wsCtx.onDisconnect : wsCtx.onUnsubscribe) handlers.add(handler);
      }
    if (!handlers.size) return;
    const results = await Promise.allSettled([...handlers].map(async (handler) => await handler()));
    for (const result of results)
      if (result.status === "rejected")
        SignalResolver.logger.error(`WebSocket cleanup handler failed: ${result.reason}`);
  }
  // Methods on one path merge; the same method twice fails boot, as the silently shadowed one may be the guarded one.
  static #mountHttpRoute(routes: HttpRoutes, path: string, handlers: HttpMethodRoutes, owner?: string) {
    const table = routes as Record<string, HttpMethodRoutes | undefined>;
    const existing = table[path];
    const conflict = Object.keys(handlers).find((method) => !!existing?.[method]);
    if (conflict)
      throw new Error(
        `Route conflict: ${conflict} ${path} is declared more than once${owner ? ` (by "${owner}")` : ""}.`,
      );
    table[path] = { ...existing, ...handlers };
  }

  static mergeHttpRoutes(target: HttpRoutes, source: HttpRoutes) {
    for (const [path, handlers] of Object.entries((source ?? {}) as Record<string, HttpMethodRoutes>))
      SignalResolver.#mountHttpRoute(target, path, handlers);
  }

  static resolveEndpoint(
    endpointCls: EndpointCls,
    endpoint: Endpoint,
    {
      registry,
      env,
      live,
      middleware,
    }: { registry: InjectRegistry; env: BackendEnv; live: LiveRegistry; middleware: Map<string, MiddlewareCls> },
  ): SignalRoutes {
    const endpointMeta = endpointCls[ENDPOINT_META] as { [key: string]: EndpointInfo };
    const routes: HttpRoutes = {};
    const routeOptions: NonNullable<SignalRoutes["routeOptions"]> = {};
    const wsRoutes: WebsocketRoutes = {};
    const defaultPrefix = endpointCls.srv.cnst?.refName;
    Object.entries(endpointMeta).forEach(([key, endpointInfo]) => {
      const path = endpointInfo.getRoutePath(key, defaultPrefix);
      if (endpointInfo.signalOption.globalPrefix !== undefined) {
        routeOptions[path] = { globalPrefix: endpointInfo.signalOption.globalPrefix };
      }
      const normalHttpHandler = async (req: Bun.BunRequest): Promise<Response | undefined> =>
        await SignalContext.try(endpoint, endpointInfo, key, async () => {
          const context = await new SignalContext(key, req, {
            endpointInfo,
            adaptor: endpoint,
            registry,
            env,
            live,
            middleware,
          }).init();
          // `exec` widened its return for the pubsub branch, which no HTTP route takes.
          return (await context.exec()) as Response | undefined;
        });
      if (endpointInfo.signalOption.method && endpointInfo.type !== "mutation")
        SignalResolver.logger.warn(
          `"${key}" declares method ${endpointInfo.signalOption.method} on a ${endpointInfo.type}, which is ignored.`,
        );
      switch (endpointInfo.type) {
        case "query":
          SignalResolver.#mountHttpRoute(
            routes,
            path,
            SignalResolver.#canUsePrimitiveQueryFastPath(endpointInfo, middleware)
              ? {
                  GET: async (req) => {
                    if (req.headers.get("authorization") || cookieHeaderHasAuthToken(req.headers.get("cookie")))
                      return await normalHttpHandler(req);
                    // No trace by design: this fast path exists to skip per-request work.
                    return await SignalContext.try(
                      endpoint,
                      endpointInfo,
                      key,
                      async () => {
                        const result = await endpointInfo.execFn?.call(endpoint);
                        return result instanceof Response ? result : Response.json(result);
                      },
                      { trace: false },
                    );
                  },
                }
              : {
                  GET: normalHttpHandler,
                },
            key,
          );
          break;
        case "mutation":
          SignalResolver.#mountHttpRoute(
            routes,
            path,
            { [endpointInfo.signalOption.method ?? "POST"]: normalHttpHandler },
            key,
          );
          break;
        case "pubsub":
          wsRoutes[key] = async (ws, message, event) =>
            await SignalContext.run(endpoint, endpointInfo, key, "websocket", async () => {
              const websocket = SignalResolver.#getWebsocket(registry);
              const context = await new SignalContext(
                key,
                { ws, data: message, eventType: event ?? "unsubscribe" },
                { endpointInfo, adaptor: endpoint, registry, env, live, middleware },
              ).init();
              const subscribe = event === "subscribe";
              const liveOption = endpointInfo.signalOption.live;
              // The client-built id the ack is matched against; for every room but a live one it is also the room.
              const requestRoomId = context.getRoomId(key);
              if (subscribe) {
                // Checked here too: a client bundle older than the pauseOn declaration would still subscribe.
                if (liveOption) SignalResolver.#assertNotPaused(key, liveOption, endpointInfo, context);
                const query = await context.exec();
                const roomId = liveOption ? context.getLiveRoomId(key) : requestRoomId;
                const roomCtxMap = SignalResolver.#liveWsPubsubRoomCtx.get(ws) ?? new Map();
                if (liveOption && !roomCtxMap.has(roomId))
                  live.syncHub.join({
                    refName: liveOption.refName,
                    roomId,
                    query: query as never,
                    fallback: liveOption.fallback,
                    fields: SignalResolver.#queryFieldsOf(live, liveOption.refName),
                  });
                ws.subscribe(roomId);
                roomCtxMap.set(roomId, context);
                SignalResolver.#liveWsPubsubRoomCtx.set(ws, roomCtxMap);
                websocket.joinRoom(ws, roomId);
                SignalResolver.logger.verbose(`WebSocket subscribed to room ${roomId}`);
                const ack: WebsocketSubscribeAck = { type: "sub", roomId, requestRoomId, subscribe };
                return ack;
              }
              if (liveOption) await context.resolveInternalArgs();
              const roomId = liveOption ? context.getLiveRoomId(key) : requestRoomId;
              ws.unsubscribe(roomId);
              const roomCtxMap = SignalResolver.#liveWsPubsubRoomCtx.get(ws);
              const roomCtx = roomCtxMap?.get(roomId);
              if (roomCtxMap && roomCtx) {
                await SignalResolver.#runLifecycleHandlers([roomCtx], ["unsubscribe"]);
                roomCtxMap.delete(roomId);
                if (roomCtxMap.size === 0) SignalResolver.#liveWsPubsubRoomCtx.delete(ws);
                if (liveOption) live.syncHub.leave(roomId);
                websocket.leaveRoom(ws, roomId);
                SignalResolver.logger.verbose(`WebSocket unsubscribed from room ${roomId}`);
              }
              const ack: WebsocketSubscribeAck = { type: "sub", roomId, requestRoomId, subscribe };
              return ack;
            });
          break;
        case "message":
          wsRoutes[key] = async (ws, message) =>
            await SignalContext.run(endpoint, endpointInfo, key, "websocket", async () => {
              const context = await new SignalContext(
                key,
                { ws, data: message, eventType: "message" },
                { endpointInfo, adaptor: endpoint, registry, env, live, middleware },
              ).init();
              const result = (await context.exec()) as object | object[];
              SignalResolver.#retainWsContext(ws, context as SignalContext<WebSocketExecutionContext>);
              const messageData: WebsocketMessageData = { type: "msg", key, data: result };
              return messageData;
            });
          break;
        default:
          throw new Error(`Endpoint ${key} is not a valid endpoint type`);
      }
      SignalResolver.logger.verbose(`Resolved endpoint ${endpointInfo.type} ${path} for ${key}`);
    });
    return { routes, wsRoutes, routeOptions };
  }

  static #selectCache = new WeakMap<Cls, Record<string, true>>();
  static #selectForConstant(constant: Cls): Record<string, true> | undefined {
    const cached = SignalResolver.#selectCache.get(constant);
    if (cached) return cached;
    const fields = (constant as { [FIELD_META]?: Record<string, unknown> })[FIELD_META];
    if (!fields) return undefined;
    const select = Object.fromEntries(Object.keys(fields).map((field) => [field, true] as const));
    SignalResolver.#selectCache.set(constant, select);
    return select;
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

  // Rooms are authorized once at subscribe; without this re-check a signed-out socket would keep its old rooms.
  static async revalidateWsRooms(
    ws: Bun.ServerWebSocket<any>,
    registry: InjectRegistry,
    live?: LiveRegistry,
  ): Promise<string[]> {
    const roomCtxMap = SignalResolver.#liveWsPubsubRoomCtx.get(ws);
    if (!roomCtxMap?.size) return [];
    const websocket = SignalResolver.#getWebsocket(registry);
    const revokedRooms: string[] = [];
    for (const [roomId, roomCtx] of [...roomCtxMap]) {
      if (await roomCtx.authorize()) continue;
      ws.unsubscribe(roomId);
      await SignalResolver.#runLifecycleHandlers([roomCtx], ["unsubscribe"]);
      roomCtxMap.delete(roomId);
      live?.syncHub.leave(roomId);
      websocket.leaveRoom(ws, roomId);
      revokedRooms.push(roomId);
      SignalResolver.logger.verbose(`WebSocket lost access to room ${roomId}; unsubscribed`);
    }
    if (roomCtxMap.size === 0) SignalResolver.#liveWsPubsubRoomCtx.delete(ws);
    return revokedRooms;
  }

  static async handleWsOpen(ws: Bun.ServerWebSocket<any>, registry: InjectRegistry) {
    await SignalResolver.#getWebsocket(registry).registerSocket(ws);
  }

  static async handleWsClose(ws: Bun.ServerWebSocket<any>, registry: InjectRegistry, live?: LiveRegistry) {
    const roomCtxMap = SignalResolver.#liveWsPubsubRoomCtx.get(ws);
    const contexts = [...(roomCtxMap?.values() ?? []), ...(SignalResolver.#liveWsMessageCtx.get(ws) ?? [])];
    await SignalResolver.#runLifecycleHandlers(contexts, ["unsubscribe", "disconnect"]);
    // The routing table must hear about a close too: a room nobody is in still costs an evaluation on every write.
    for (const roomId of roomCtxMap?.keys() ?? []) live?.syncHub.leave(roomId);
    SignalResolver.#liveWsPubsubRoomCtx.delete(ws);
    SignalResolver.#liveWsMessageCtx.delete(ws);

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
