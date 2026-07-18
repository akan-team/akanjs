import { describe, expect, test } from "bun:test";
import { ENDPOINT_META } from "akanjs/base";
import type { SchemaOf } from "akanjs/document";
import {
  adapt,
  getDefaultInjectRegistry,
  getDefaultLiveRegistry,
  SolidPubSub,
  type WebsocketAdaptor,
} from "akanjs/service";
import { internal } from "../../signal/internal";
import { DatabaseResolver } from "./database.resolver";
import {
  makeEnv,
  resetResolverOrder,
  resolverOrder,
  ServerResolverTestEndpoint,
  ServerResolverTestLight,
  ServerResolverTestMiddleware,
  ServerResolverTestModelMixin,
  ServerResolverTestServerSignal,
  ServerResolverTestService,
  ServerResolverTestSlice,
  serverResolverTestConstant,
  serverResolverTestDatabase,
  serverResolverTestServiceModel,
  validId,
} from "./resolver.contract.fixture";
import { ServiceResolver } from "./service.resolver";
import { SignalResolver } from "./signal.resolver";

const makeHttpRequest = ({
  url = "http://localhost/test",
  params = {},
  body,
}: {
  url?: string;
  params?: Record<string, string>;
  body?: Record<string, unknown>;
} = {}) =>
  ({
    url,
    params,
    body: body ? {} : undefined,
    json: async () => body ?? {},
  }) as unknown as Bun.BunRequest;

class FakeSqliteDatabase extends adapt("fakeSqliteDatabase") {
  schema!: SchemaOf;
  store!: ReturnType<typeof makeFakeStore>;
  getStore(_constant: unknown, _database: unknown, schema: SchemaOf) {
    this.schema = schema;
    this.store = makeFakeStore();
    return this.store;
  }
}

class FakeSolidCache extends adapt("fakeSolidCache") {}

const makeFakeStore = () => {
  const calls: { method: string; args: unknown[] }[] = [];
  return {
    calls,
    async ensure() {
      calls.push({ method: "ensure", args: [] });
    },
    async find(query: unknown, options?: unknown) {
      calls.push({ method: "find", args: [query, options] });
      if (
        query &&
        typeof query === "object" &&
        "id" in query &&
        (query as { id?: { kind?: string; op?: string; value?: unknown } }).id?.op === "oneOf"
      ) {
        const ids = ((query as { id: { value: string[] } }).id.value ?? []) as string[];
        return ids
          .filter((id) => id !== "missing")
          .reverse()
          .map((id) => ({ id, category: "news", title: id === "doc-2" ? "Beta" : "Alpha" }));
      }
      return [{ id: "doc-1", category: "news", title: "Alpha" }];
    },
    async findIds(query: unknown, options?: unknown) {
      calls.push({ method: "findIds", args: [query, options] });
      return ["doc-1"];
    },
    async findOne(query: unknown, options?: unknown) {
      calls.push({ method: "findOne", args: [query, options] });
      return { id: "doc-1", category: "news", title: "Alpha", toJSON: () => ({ id: "doc-1", title: "Alpha" }) };
    },
    async findId(query: unknown, options?: unknown) {
      calls.push({ method: "findId", args: [query, options] });
      return "doc-1";
    },
    async pickOne(query: unknown, options?: unknown) {
      calls.push({ method: "pickOne", args: [query, options] });
      return { id: "doc-1", category: "news", title: "Alpha" };
    },
    async pickById(id: string) {
      calls.push({ method: "pickById", args: [id] });
      return { id, title: "Alpha" };
    },
    async exists(query: unknown) {
      calls.push({ method: "exists", args: [query] });
      return "doc-1";
    },
    async count(query: unknown) {
      calls.push({ method: "count", args: [query] });
      return 1;
    },
    async insight(query: unknown) {
      calls.push({ method: "insight", args: [query] });
      return { total: 1 };
    },
    async hydrate(data: Record<string, unknown>) {
      calls.push({ method: "hydrate", args: [data] });
      return { ...data, hydrated: true };
    },
    async clone(data: Record<string, unknown>) {
      calls.push({ method: "clone", args: [data] });
      return { ...data, id: "clone-1" };
    },
    async create(data: Record<string, unknown>) {
      calls.push({ method: "create", args: [data] });
      return { ...data, id: "created-1" };
    },
    async update(id: string, data: Record<string, unknown>) {
      calls.push({ method: "update", args: [id, data] });
      return { ...data, id };
    },
    async remove(id: string) {
      calls.push({ method: "remove", args: [id] });
      return { id, removed: true };
    },
    async search(text: string, options?: unknown) {
      calls.push({ method: "search", args: [text, options] });
      return { docs: [{ id: "doc-1" }], count: 1 };
    },
    async updateOneByQuery(query: unknown, update: unknown, options?: unknown) {
      calls.push({ method: "updateOneByQuery", args: [query, update, options] });
      return { acknowledged: true, matchedCount: 1, modifiedCount: 1 };
    },
    async updateManyByQuery(query: unknown, update: unknown) {
      calls.push({ method: "updateManyByQuery", args: [query, update] });
      return { acknowledged: true, matchedCount: 1, modifiedCount: 1 };
    },
    async deleteManyByQuery(query: unknown) {
      calls.push({ method: "deleteManyByQuery", args: [query] });
      return { acknowledged: true, matchedCount: 1, modifiedCount: 1 };
    },
    async bulkWrite(operations: unknown) {
      calls.push({ method: "bulkWrite", args: [operations] });
      return { acknowledged: true, matchedCount: 1, modifiedCount: 1 };
    },
  };
};

describe("DatabaseResolver declaration contracts", () => {
  test("turns document declarations into initialized model adaptors", async () => {
    const DatabaseAdaptor = DatabaseResolver.resolveDatabase(serverResolverTestConstant, serverResolverTestDatabase);
    const fakeDatabase = new FakeSqliteDatabase();
    const instance = new DatabaseAdaptor() as InstanceType<typeof DatabaseAdaptor> & {
      __database: FakeSqliteDatabase;
      __store: ReturnType<typeof makeFakeStore>;
      serverResolverTestItemLoader: {
        load: (key: string) => Promise<unknown>;
        loadMany: (keys: string[]) => Promise<unknown[]>;
      };
      byOwner: { load: (key: string) => Promise<unknown> };
      byTag: { load: (key: string) => Promise<unknown> };
      byOwnerCategory: { load: (key: Record<string, string>) => Promise<unknown> };
      ServerResolverTestItem: {
        refName: string;
        find: (query: unknown) => { sort: (sort: unknown) => Promise<unknown[]> };
      };
      listInCategory: (...args: unknown[]) => Promise<unknown[]>;
      findInCategory: (...args: unknown[]) => Promise<unknown>;
      pickInCategory: (...args: unknown[]) => Promise<unknown>;
      queryInCategory: (...args: unknown[]) => unknown;
      __pickId: (query?: unknown) => Promise<string>;
    };
    Object.assign(instance, { __database: fakeDatabase, __cache: new FakeSolidCache() });

    await instance.onInit();

    expect(instance.__store.calls.at(0)).toEqual({ method: "ensure", args: [] });
    expect(fakeDatabase.schema.indexes).toContainEqual({ fields: { category: 1 } });
    expect(fakeDatabase.schema.preHooks.get("create")?.length).toBeGreaterThanOrEqual(1);
    expect(ServerResolverTestModelMixin.schemaTouched).toBe(true);
    expect(instance.ServerResolverTestItem.refName).toBe("serverResolverTestItem");

    await instance.listInCategory("news", false, { limit: null, skip: 2, sort: "titleAsc" });
    expect(instance.__store.calls.at(-1)).toEqual({
      method: "find",
      args: [
        { kind: "all", queries: [{ category: "news" }, { removedAt: { kind: "op", op: "empty" } }] },
        { sort: { title: 1 }, skip: 2, limit: 20, sample: undefined },
      ],
    });

    expect(instance.queryInCategory("news", true)).toEqual({
      kind: "all",
      queries: [{ category: "news" }, {}],
    });
    expect(instance.queryInCategory("news")).toEqual({
      kind: "all",
      queries: [{ category: "news" }, { removedAt: { kind: "op", op: "empty" } }],
    });
    await instance.findInCategory("news", false, { select: { secret: true } });
    expect(instance.__store.calls.at(-1)).toEqual({
      method: "findOne",
      args: [
        { kind: "all", queries: [{ category: "news" }, { removedAt: { kind: "op", op: "empty" } }] },
        { sort: { createdAt: -1 }, skip: 0, sample: false, select: { secret: true } },
      ],
    });
    await instance.pickInCategory("news", false, { select: { secret: true } });
    expect(instance.__store.calls.at(-1)).toEqual({
      method: "pickOne",
      args: [
        { kind: "all", queries: [{ category: "news" }, { removedAt: { kind: "op", op: "empty" } }] },
        { sort: { createdAt: -1 }, skip: 0, sample: false, select: { secret: true } },
      ],
    });
    const bulkLoaded = await instance.serverResolverTestItemLoader.loadMany(["doc-2", "missing", "doc-1"]);
    expect(bulkLoaded).toEqual([
      { id: "doc-2", category: "news", title: "Beta" },
      null,
      { id: "doc-1", category: "news", title: "Alpha" },
    ]);
    expect(instance.__store.calls.at(-1)).toEqual({
      method: "find",
      args: [{ id: { kind: "op", op: "oneOf", value: ["doc-2", "missing", "doc-1"] } }, undefined],
    });
    expect(await instance.__pickId({ missing: true })).toBe("doc-1");
    await instance.byOwner.load("owner-1");
    expect(instance.__store.calls.at(-1)?.args[0]).toEqual({
      kind: "all",
      queries: [
        { removedAt: { kind: "op", op: "empty" } },
        { ownerId: { kind: "op", op: "oneOf", value: ["owner-1"] } },
      ],
    });
    await instance.byTag.load("featured");
    expect(instance.__store.calls.at(-1)?.args[0]).toEqual({
      kind: "all",
      queries: [{}, { tags: { kind: "op", op: "oneOf", value: ["featured"] } }],
    });
    await instance.byOwnerCategory.load({ ownerId: "owner-1", category: "news" });
    expect(instance.__store.calls.at(-1)?.args[0]).toEqual({
      kind: "all",
      queries: [{}, { kind: "any", queries: [{ ownerId: "owner-1", category: "news" }] }],
    });
  });
});

describe("ServiceResolver declaration contracts", () => {
  test("patches database services with CRUD, filter, and hook-chain implementations", async () => {
    const ServiceRef = ServiceResolver.resolveDatabaseService(
      serverResolverTestConstant,
      serverResolverTestDatabase,
      ServerResolverTestService,
    );
    const service = new ServiceRef() as InstanceType<typeof ServiceRef> & {
      __databaseModel: Record<string, (...args: unknown[]) => Promise<unknown>>;
      __create: (data: Record<string, unknown>) => Promise<Record<string, unknown>>;
      createServerResolverTestItem: (data: Record<string, unknown>) => Promise<Record<string, unknown>>;
      listInCategory: (...args: unknown[]) => Promise<unknown>;
      existsInCategory: (...args: unknown[]) => Promise<unknown>;
      queryInCategory: (...args: unknown[]) => unknown;
      getServerResolverTestItem: (id: string) => Promise<unknown>;
    };
    const databaseCalls: { method: string; args: unknown[] }[] = [];
    service.__databaseModel = new Proxy(
      {},
      {
        get:
          (_target, prop: string) =>
          async (...args: unknown[]) => {
            databaseCalls.push({ method: prop, args });
            if (prop === "__create") return { ...((args[0] as Record<string, unknown>) ?? {}), stored: true };
            if (prop === "__exists") return "exists-id";
            if (prop === "__get") return { id: args[0], title: "loaded" };
            return { method: prop, args };
          },
      },
    );

    const created = await service.createServerResolverTestItem({ title: "Alpha" });

    expect(databaseCalls[0]).toEqual({
      method: "__create",
      args: [{ title: "Alpha", parentPreCreate: true, childPreCreate: true }],
    });
    expect(created).toMatchObject({
      stored: true,
      parentPostCreate: true,
      childPostCreate: true,
    });

    await service.listInCategory("news", false, { skip: 1, limit: 3, sort: "titleAsc" });
    expect(databaseCalls.at(-1)).toEqual({
      method: "__list",
      args: [
        { kind: "all", queries: [{ category: "news" }, { removedAt: { kind: "op", op: "empty" } }] },
        { skip: 1, limit: 3, sort: "titleAsc" },
      ],
    });
    expect(await service.existsInCategory("news", true)).toBe("exists-id");
    expect(service.queryInCategory("news", true)).toEqual({ kind: "all", queries: [{ category: "news" }, {}] });
    expect(service.queryInCategory("news")).toEqual({
      kind: "all",
      queries: [{ category: "news" }, { removedAt: { kind: "op", op: "empty" } }],
    });
    expect(await service.getServerResolverTestItem(validId)).toEqual({ id: validId, title: "loaded" });
  });
});

describe("SignalResolver declaration contracts", () => {
  test("turns endpoint declarations into HTTP and websocket route handlers", async () => {
    resetResolverOrder();
    const registry = getDefaultInjectRegistry();
    const live = getDefaultLiveRegistry();
    const endpointInstance = new ServerResolverTestEndpoint() as InstanceType<typeof ServerResolverTestEndpoint> & {
      serverResolverTestItemService: InstanceType<typeof ServerResolverTestService>;
    };
    endpointInstance.serverResolverTestItemService = new ServerResolverTestService();
    const websocket = makeFakeWebsocket();
    registry.adaptor.set(SolidPubSub, websocket.instance);

    const resolved = SignalResolver.resolveEndpoint(ServerResolverTestEndpoint, endpointInstance, {
      registry,
      env: makeEnv(),
      live,
      middleware: new Map([["serverResolverTestMiddleware", ServerResolverTestMiddleware]]),
    });

    expect(Object.keys(resolved.routes ?? {}).sort()).toEqual([
      "/getTitle/:id",
      "/serverResolverTestItem/updateTitle/:id",
    ]);
    expect(resolved.routeOptions?.["/getTitle/:id"]).toEqual({ globalPrefix: false });

    const response = await resolved.routes?.["/getTitle/:id"]?.GET?.(
      makeHttpRequest({ url: `http://localhost/getTitle/${validId}?suffix=ok`, params: { id: validId } }),
    );
    expect(await response?.json()).toBe(`${validId}:ok:public`);
    expect(resolverOrder).toEqual([
      "global-before",
      "global-before",
      `query:${validId}:ok`,
      "global-after",
      "global-after",
    ]);

    const mutationResponse = await resolved.routes?.["/serverResolverTestItem/updateTitle/:id"]?.POST?.(
      makeHttpRequest({
        url: `http://localhost/updateTitle/${validId}`,
        params: { id: validId },
        body: {
          data: {
            ownerId: "owner-1",
            category: "news",
            title: "Alpha",
            count: 1,
            tags: ["featured"],
            nested: { label: "Nested" },
          },
        },
      }),
    );
    expect(await mutationResponse?.json()).toMatchObject({
      id: validId,
      category: "news",
      title: "Alpha",
    });

    const ws = makeWs();
    const ack = await resolved.wsRoutes?.roomFeed?.(ws, [validId], "subscribe");
    expect(ack).toEqual({ type: "sub", roomId: `roomFeed-${validId}`, subscribe: true });
    expect(ws.subscribed).toEqual([`roomFeed-${validId}`]);
    expect(websocket.instance.calls).toContainEqual({ method: "joinRoom", args: [ws, `roomFeed-${validId}`] });

    const message = await resolved.wsRoutes?.echoMessage?.(ws, ["hello"], "message");
    expect(message).toEqual({ type: "msg", key: "echoMessage", data: "echo:hello" });
  });

  test("turns slice declarations into CRUD/list/insight endpoint declarations", async () => {
    const SliceEndpoint = SignalResolver.resolveSlice(ServerResolverTestSlice);
    const endpointMeta = SliceEndpoint[ENDPOINT_META];

    expect(Object.keys(endpointMeta).sort()).toEqual([
      "createServerResolverTestItem",
      "lightServerResolverTestItem",
      "removeServerResolverTestItem",
      "serverResolverTestItem",
      "serverResolverTestItemInsight",
      "serverResolverTestItemInsightInCategory",
      "serverResolverTestItemList",
      "serverResolverTestItemListInCategory",
      "updateServerResolverTestItem",
    ]);

    const sliceEndpoint = new SliceEndpoint() as InstanceType<typeof SliceEndpoint> & {
      serverResolverTestItemService: Record<string, (...args: unknown[]) => Promise<unknown>>;
    };
    const calls: { method: string; args: unknown[] }[] = [];
    sliceEndpoint.serverResolverTestItemService = new Proxy(
      {
        queryInCategory: (category: string) => ({ category }),
      },
      {
        get:
          (_target, prop: string) =>
          async (...args: unknown[]) => {
            if (prop === "queryInCategory") return { category: args[0] };
            calls.push({ method: prop, args });
            return prop === "__list" ? [] : prop === "__insight" ? { total: 0 } : { id: args[0] ?? "created-1" };
          },
      },
    );

    await endpointMeta.serverResolverTestItemListInCategory.execFn?.call(sliceEndpoint, "news", 2, 10, "titleAsc");
    expect(calls.at(-1)).toEqual({
      method: "__list",
      args: [
        { category: "news" },
        {
          skip: 2,
          limit: 10,
          sort: "titleAsc",
          select: {
            id: true,
            title: true,
            category: true,
            createdAt: true,
            updatedAt: true,
            removedAt: true,
          },
        },
      ],
    });

    await endpointMeta.serverResolverTestItemInsightInCategory.execFn?.call(sliceEndpoint, "news");
    expect(calls.at(-1)).toEqual({ method: "__insight", args: [{ category: "news" }] });

    await endpointMeta.serverResolverTestItem.execFn?.call(sliceEndpoint, validId);
    expect(calls.at(-1)).toEqual({ method: "getServerResolverTestItem", args: [validId] });
    await endpointMeta.createServerResolverTestItem.execFn?.call(sliceEndpoint, { title: "Alpha" });
    expect(calls.at(-1)).toEqual({ method: "__create", args: [{ title: "Alpha" }] });
    await endpointMeta.updateServerResolverTestItem.execFn?.call(sliceEndpoint, validId, { title: "Beta" });
    expect(calls.at(-1)).toEqual({ method: "__update", args: [validId, { title: "Beta" }] });
    await endpointMeta.removeServerResolverTestItem.execFn?.call(sliceEndpoint, validId);
    expect(calls.at(-1)).toEqual({ method: "__remove", args: [validId] });
  });

  test("turns server signal declarations into pubsub publishers and process queue clients", async () => {
    const registry = getDefaultInjectRegistry();
    const live = getDefaultLiveRegistry();
    const websocket = makeFakeWebsocket();
    registry.adaptor.set(SolidPubSub, websocket.instance);
    const localPublishes: { roomId: string; data: object | object[] }[] = [];
    SignalResolver.setLocalPublish((roomId, data) => localPublishes.push({ roomId, data }), websocket.instance);

    const ServerSignalRef = SignalResolver.resolveServerSignal(ServerResolverTestServerSignal, { registry, live });
    const queueCalls: { key: string; args: unknown[]; options: unknown }[] = [];
    const serverSignal = Object.assign(new ServerSignalRef(), {
      queue: {
        registerProcessQueue: async (key: string, args: unknown[], options?: unknown) => {
          queueCalls.push({ key, args, options });
          return { id: "job-1", name: key, data: args, opts: options, attemptsMade: 0 };
        },
      },
    }) as InstanceType<typeof ServerSignalRef> & {
      roomFeed: (roomId: string, data: unknown) => Promise<void>;
      processItem: (itemId: string, options?: unknown) => Promise<unknown>;
    };

    await serverSignal.roomFeed(validId, {
      id: validId,
      title: "Alpha",
      category: "news",
      createdAt: new Date(0),
      updatedAt: new Date(0),
      removedAt: null,
    });
    expect(websocket.instance.calls).toContainEqual({
      method: "registerEndpoint",
      args: ["roomFeed", ServerResolverTestLight, 0],
    });
    expect(websocket.instance.calls.at(-1)).toEqual({
      method: "publish",
      args: [
        `roomFeed-${validId}`,
        {
          category: "news",
          createdAt: new Date(0),
          id: validId,
          removedAt: null,
          title: "Alpha",
          updatedAt: new Date(0),
        },
      ],
    });
    expect(localPublishes.at(-1)?.roomId).toBe(`roomFeed-${validId}`);

    await serverSignal.processItem(validId, { delay: 10 });
    expect(queueCalls).toEqual([{ key: "processItem", args: [validId], options: { delay: 10 } }]);
  });

  test("registers schedule declarations with operation and server mode filtering", () => {
    process.env.AKAN_PUBLIC_APP_NAME = "serverResolver";
    process.env.AKAN_PUBLIC_REPO_NAME = "akan";
    process.env.AKAN_PUBLIC_SERVE_DOMAIN = "example.com";
    process.env.AKAN_PUBLIC_ENV = "local";
    process.env.AKAN_PUBLIC_OPERATION_MODE = "local";
    resetResolverOrder();
    class ScheduleInternal extends internal(serverResolverTestServiceModel, (builder) => ({
      initLocal: builder.initialize({ operationMode: ["local"] }).exec(() => {
        resolverOrder.push("initLocal");
      }),
      destroyBatchOnly: builder.destroy({ serverMode: "batch" }).exec(() => {
        resolverOrder.push("destroyBatchOnly");
      }),
      intervalFederation: builder.interval(1000, { serverMode: "federation", lock: false }).exec(() => {
        resolverOrder.push("intervalFederation");
      }),
      processAll: builder.process(Boolean, { enabled: true }).exec(() => true),
    })) {}
    const internalInstance = Object.assign(new ScheduleInternal(), {
      schedule: makeFakeSchedule(),
      queue: makeFakeQueue(),
    });

    SignalResolver.resolveSchedule(ScheduleInternal, internalInstance, "federation");

    expect(internalInstance.schedule.calls.map((call) => call.method)).toEqual(["registerInit", "registerInterval"]);
    expect(internalInstance.queue.calls.map((call) => call.method)).toEqual(["registerProcessWorker"]);
    expect(internalInstance.schedule.calls[1]).toMatchObject({
      method: "registerInterval",
      args: ["intervalFederation", 1000, expect.any(Function), { lock: false }],
    });
  });
});

const makeFakeWebsocket = () => {
  class FakeWebsocket extends adapt("solidPubsub") {}
  const instance = Object.assign(new FakeWebsocket(), {
    calls: [] as { method: string; args: unknown[] }[],
    registerEndpoint(key: string, returnRef: unknown, arrDepth: number) {
      this.calls.push({ method: "registerEndpoint", args: [key, returnRef, arrDepth] });
    },
    publish(roomId: string, data: unknown) {
      this.calls.push({ method: "publish", args: [roomId, data] });
    },
    setEventHandler(handler: unknown) {
      this.calls.push({ method: "setEventHandler", args: [handler] });
    },
    joinRoom(ws: unknown, roomId: string) {
      this.calls.push({ method: "joinRoom", args: [ws, roomId] });
    },
    leaveRoom(ws: unknown, roomId: string) {
      this.calls.push({ method: "leaveRoom", args: [ws, roomId] });
    },
    registerSocket(ws: unknown) {
      this.calls.push({ method: "registerSocket", args: [ws] });
    },
    unregisterSocket(ws: unknown) {
      this.calls.push({ method: "unregisterSocket", args: [ws] });
    },
  }) as InstanceType<typeof FakeWebsocket> & WebsocketAdaptor & { calls: { method: string; args: unknown[] }[] };
  return { cls: FakeWebsocket, instance };
};

const makeWs = () =>
  ({
    subscribed: [] as string[],
    unsubscribed: [] as string[],
    subscribe(roomId: string) {
      this.subscribed.push(roomId);
    },
    unsubscribe(roomId: string) {
      this.unsubscribed.push(roomId);
    },
  }) as unknown as Bun.ServerWebSocket<unknown> & { subscribed: string[]; unsubscribed: string[] };

const makeFakeSchedule = () => ({
  calls: [] as { method: string; args: unknown[] }[],
  registerInit(key: string, callback: () => Promise<void>) {
    this.calls.push({ method: "registerInit", args: [key, callback] });
  },
  registerDestroy(key: string, callback: () => Promise<void>) {
    this.calls.push({ method: "registerDestroy", args: [key, callback] });
  },
  registerInterval(key: string, ms: number, callback: () => Promise<void>, option?: unknown) {
    this.calls.push({ method: "registerInterval", args: [key, ms, callback, option] });
  },
  registerTimeout(key: string, ms: number, callback: () => Promise<void>) {
    this.calls.push({ method: "registerTimeout", args: [key, ms, callback] });
  },
  registerCron(key: string, cron: string, callback: () => Promise<void>, option?: unknown) {
    this.calls.push({ method: "registerCron", args: [key, cron, callback, option] });
  },
});

const makeFakeQueue = () => ({
  calls: [] as { method: string; args: unknown[] }[],
  registerProcessWorker(key: string, handler: unknown) {
    this.calls.push({ method: "registerProcessWorker", args: [key, handler] });
    return { close: async () => undefined };
  },
});
