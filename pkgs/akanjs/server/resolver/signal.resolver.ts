import {
  Any,
  type BackendEnv,
  Binary,
  type Cls,
  ENDPOINT_META,
  FIELD_META,
  getEnv,
  ID,
  INTERNAL_META,
  Int,
  PrimitiveRegistry,
  type PromiseOrObject,
  SLICE_META,
} from "akanjs/base";
import { capitalize, cookieHeaderHasAuthToken, Logger } from "akanjs/common";
import { deserialize, resolvePageLimit, resolvePageSkip, serialize } from "akanjs/constant";
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

type HttpRouteHandler = (req: Bun.BunRequest) => Response | Promise<Response | undefined> | undefined;
type LiveChangeListener = (doc: unknown, type: unknown, previous?: unknown) => void;
type LiveRoute = (next: Record<string, unknown>, previous?: Record<string, unknown>) => Promise<LiveDelivery[]>;
interface LiveDelivery {
  roomId: string;
  payload: LiveEventPayload;
}
type HttpMethodRoutes = Record<string, HttpRouteHandler>;

export class SignalResolver {
  static logger = new Logger("SignalResolver");

  static makeRoomId(key: string, args: unknown[]) {
    return `${key}${args.length ? "-" : ""}${args.join("-")}`;
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
    // A live room that missed events cannot tell which ones, so it says only that it is behind and every
    // subscriber refetches. Overshooting costs a query; staying quiet leaves a list wrong with no symptom.
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
  /**
   * Attaches the change listeners that feed live rooms, once per model that declares a `.live()` slice.
   *
   * Only the document write paths reach here. A query-level write — `updateManyByQuery`, the generated
   * `update<Filter>` / `remove<Filter>`, `updateById` / `removeById` — is one atomic statement that fires no
   * document hooks at all, exactly as it fires no cascade, so a model whose fields move that way will not push
   * those moves to a live list. It is the same blind spot cascade has and it cannot be closed from here.
   *
   * A write is routed where each room is held: the writer routes its own rooms and hands the write itself to every
   * other server (`publishChange`), which routes the rooms it holds. A room lives only on the server its socket is
   * on, so a writer routing for everyone would miss them — and a batch process holds no room at all. The documents
   * cross whole, hidden and secret fields included, over the app's own channel.
   */
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
      // `resolveReturn` rather than `mask`: this value is rendered by a page, and `mask` also drops `visual`
      // fields, which exist to be rendered and to be kept away from an AI caller only.
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
      // An adaptor that cannot carry the write carries each room's event instead, which reaches another server's
      // sockets only in a room this one holds too.
      if (!websocket.publishChange) for (const { roomId, payload } of delivered) websocket.publish(roomId, payload);
    };
    // Fire and forget: a live room is a courtesy on top of a write that has already committed, so a subscriber
    // that cannot be reached must not fail the write that reached everyone else.
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
          // Queue adaptors invoke the handler with the job only; the declared payload lives in `job.data`.
          // Spread it back onto the `msg` args so the `exec` signature (...msgArgs, job) holds at runtime.
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
  /**
   * Every run of an internal is one `internal:<key>` trace, so the handler's own logs carry a traceId. The
   * schedule adaptor's started/finished/error lines wrap this call from outside and stay uncorrelated.
   */
  static #traced<A extends unknown[], R>(key: string, fn: (...args: A) => R) {
    return async (...args: A) =>
      await runTraced(SignalTrace.create(key, "internal", "internal"), async () => await fn(...args));
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

    // Every `(builder as any)` below is deliberate and there is no `as unknown as T` for it: the builder's type
    // is derived per slice from literal type arguments — the model's own `light`/`insight` classes and each
    // arg's name — and this resolver holds those only as runtime values. Naming the chain's type would mean
    // reconstructing the generic instantiation the declaration site already did.
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

        // Live room: ${refName}Live${Capitalize<key>}. Subscribing is the whole behaviour — the exec hands the
        // resolved query back so the router can decide, per write, whether it belongs to this room.
        if (sliceInfo.liveOption) {
          if (!key)
            throw new Error(
              `The root slice of "${refName}" cannot declare .live(): it is the admin CRUD API, guarded by Admin, ` +
                `and opening it would put every model on a live socket by default.`,
            );
          SignalResolver.#assertLiveSort(refName, key, sliceInfo);
          SignalResolver.#assertLivePauseOn(refName, key, sliceInfo);
          const liveKey = `${refName}Live${capitalizedKey}`;
          // The slice's own option, exactly as the list and insight endpoints beside it take — a room delivers the
          // rows that list would, so it has to be gated by the same guards. `getGuards` is the single-document read
          // (`bizDoc(bizDocId)`), and a resource guard of that shape looks for an id the room's arguments do not
          // carry, so it fails closed on every subscribe.
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
  /**
   * The three things about a declared live sort that can be known without a request.
   *
   * A client places a new row itself only for a sort it can reproduce, so a sort key naming a field the row does
   * not carry produces a list that is quietly in the wrong order — the one failure mode with no symptom. The
   * `_doc` case is a warning rather than a refusal because it is the slice author's call: the two dialects order
   * a JSON field differently from each other, so there is no single server answer to match.
   */
  static #assertLiveSort(refName: string, key: string, sliceInfo: SliceInfo) {
    const lightFields = (sliceInfo.light as unknown as { [FIELD_META]?: Record<string, unknown> })[FIELD_META] ?? {};
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
        SignalResolver.logger.warn(
          `Live slice "${refName}.${key}" sorts by "${path}", which is stored inside the document rather than in a ` +
            `column. SQLite and Postgres order those differently, so a client placing a row may disagree with the server.`,
        );
      }
    }
  }
  /** Refuses a subscribe carrying an argument the slice named in `pauseOn`, naming the argument it refused on. */
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
  /**
   * That every argument `pauseOn` names is one this slice has, and one that can actually be empty.
   *
   * A name that is not an argument would do nothing at all, and a `param` — which is never nullable, so it is
   * present on every call — would switch the room off for good rather than while a box is filled. Both are the
   * kind of mistake whose only symptom is a list that never updates, so neither is allowed to boot.
   */
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
  /**
   * The model's field metadata, which membership routing reads for one thing: whether a path is an array, because
   * a bare value on an array field means membership rather than equality.
   */
  static #queryFieldsOf(live: LiveRegistry, refName: string): QueryFieldMap {
    const sliceCls = live.sliceCls.get(refName);
    const doc = sliceCls?.srv.db?.doc as { [FIELD_META]?: QueryFieldMap } | undefined;
    return doc?.[FIELD_META] ?? {};
  }
  static #liveWsPubsubRoomCtx = new WeakMap<
    Bun.ServerWebSocket<unknown>,
    Map<string, SignalContext<WebSocketExecutionContext>>
  >();
  /**
   * Message contexts that registered a lifecycle handler. A message context is otherwise dropped the moment it
   * answers, so `ws.on("disconnect", …)` from one would land in an object nothing reads again — a silent
   * no-op beside the same call working from a pubsub subscribe.
   */
  static #liveWsMessageCtx = new WeakMap<Bun.ServerWebSocket<unknown>, Set<SignalContext<WebSocketExecutionContext>>>();
  static #retainWsContext(ws: Bun.ServerWebSocket<unknown>, context: SignalContext<WebSocketExecutionContext>) {
    const wsCtx = context.getWebSocketContext();
    if (!wsCtx.onDisconnect.size && !wsCtx.onUnsubscribe.size) return;
    const contexts = SignalResolver.#liveWsMessageCtx.get(ws) ?? new Set<SignalContext<WebSocketExecutionContext>>();
    contexts.add(context);
    SignalResolver.#liveWsMessageCtx.set(ws, contexts);
  }
  /**
   * Cleanup handlers belong to the app, so one that throws must not take the rest of the teardown with it: a
   * rejection here would skip `unregisterSocket` and leak the socket's room membership in Redis for good.
   *
   * A close ends both the subscription and the connection, so it passes both events — and a handler registered
   * for both, the way a cleanup that must happen either way is written, runs once rather than twice.
   */
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
  /**
   * A path may legitimately carry several methods — a `query` GET and a `mutation` POST sharing a custom `path` —
   * so methods merge rather than replace. The same method twice leaves one of the two endpoints unreachable with
   * nothing said about it, and the shadowed half is as easily the guarded one, so it fails the boot instead.
   */
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

  /** Same rule across endpoint classes, which are resolved one at a time and then folded into one table. */
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
      const servicePrefix = SignalResolver.#resolveServicePrefix(endpointInfo.signalOption.prefix, defaultPrefix);
      const path = `${servicePrefix}${endpointInfo.getPath(key)}`;
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
          // A response on every path that reaches here: `exec` widened its return for the pubsub branch, which
          // no HTTP route ever takes.
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
                    if (SignalResolver.#hasAuthCredential(req)) return await normalHttpHandler(req);
                    // No trace on this path by design: it exists to skip per-request work, and its logs
                    // carry no traceId or endpoint as a result.
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
              // The id the client built from the arguments it sent. It is what the ack is matched against, and for
              // every room but a live one it is also the room itself.
              const requestRoomId = context.getRoomId(key);
              if (subscribe) {
                // Before the handler runs: the slice said a room must not exist while this argument is filled, and
                // a client bundle from before that declaration would otherwise still open one.
                if (liveOption) SignalResolver.#assertNotPaused(key, liveOption, endpointInfo, context);
                const query = await context.exec();
                const roomId = liveOption ? context.getLiveRoomId(key) : requestRoomId;
                if (liveOption)
                  live.syncHub.join({
                    refName: liveOption.refName,
                    roomId,
                    query: query as never,
                    fallback: liveOption.fallback,
                    fields: SignalResolver.#queryFieldsOf(live, liveOption.refName),
                  });
                ws.subscribe(roomId);
                const roomCtxMap = SignalResolver.#liveWsPubsubRoomCtx.get(ws) ?? new Map();
                roomCtxMap.set(roomId, context);
                SignalResolver.#liveWsPubsubRoomCtx.set(ws, roomCtxMap);
                // Track room membership in Redis for cross-server awareness
                websocket.joinRoom(ws, roomId);
                SignalResolver.logger.verbose(`WebSocket subscribed to room ${roomId}`);
                const ack: WebsocketSubscribeAck = { type: "sub", roomId, requestRoomId, subscribe };
                return ack;
              }
              if (liveOption) await context.resolveInternalArgs();
              const roomId = liveOption ? context.getLiveRoomId(key) : requestRoomId;
              ws.unsubscribe(roomId);
              const roomCtxMap = SignalResolver.#liveWsPubsubRoomCtx.get(ws);
              if (roomCtxMap) {
                const roomCtx = roomCtxMap.get(roomId);
                if (roomCtx) await SignalResolver.#runLifecycleHandlers([roomCtx], ["unsubscribe"]);
                roomCtxMap.delete(roomId);
                if (roomCtxMap.size === 0) SignalResolver.#liveWsPubsubRoomCtx.delete(ws);
                if (liveOption) live.syncHub.leave(roomId);
                // Remove room membership from Redis
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

  static #resolveServicePrefix(prefix: false | string | undefined, defaultPrefix?: string): string {
    if (prefix === false || prefix === "") return "";
    const resolved = prefix ?? defaultPrefix;
    if (!resolved) return "";
    const trimmed = resolved.trim().replace(/^\/+|\/+$/g, "");
    return trimmed ? `/${trimmed}` : "";
  }

  // Rebuilt per slice list request before this cache: the projection is a pure function of the Light class, and
  // every `${refName}List${Key}` endpoint asks for it on the way to `__list`.
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

  static #hasAuthCredential(req: Request) {
    return Boolean(req.headers.get("authorization") || cookieHeaderHasAuthToken(req.headers.get("cookie")));
  }

  /**
   * Re-checks the guards of every room this socket is subscribed to and drops the ones that no
   * longer pass. Called when the socket's credential changes: a pubsub room is authorized once at
   * subscribe time, so without this a signed-out socket would keep receiving its old rooms.
   */
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
    // A room outlives the socket that opened it only for as long as another socket is in it, so the routing table
    // has to hear about a close as well — a room nobody is in still costs an evaluation on every write.
    for (const roomId of roomCtxMap?.keys() ?? []) live?.syncHub.leave(roomId);
    SignalResolver.#liveWsPubsubRoomCtx.delete(ws);
    SignalResolver.#liveWsMessageCtx.delete(ws);

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
