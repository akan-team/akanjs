import { describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { type Dayjs, dayjs, ENDPOINT_META, ID } from "akanjs/base";
import { ConstantRegistry, via } from "akanjs/constant";
import { assertFilterFitsCrud, DocumentSchema, type SchemaOf } from "akanjs/document";
import {
  type AkanJob,
  adapt,
  getDefaultInjectRegistry,
  getDefaultLiveRegistry,
  getSolidConfig,
  SolidPubSub,
  SolidQueue,
  type WebsocketAdaptor,
} from "akanjs/service";
import { endpoint } from "../../signal/endpoint";
import { Public } from "../../signal/guards";
import { internal } from "../../signal/internal";
import { Ws } from "../../signal/internalArg";
import { CascadeRunner } from "./CascadeRunner";
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
    async removeManyByQuery(query: unknown) {
      calls.push({ method: "removeManyByQuery", args: [query] });
      return { acknowledged: true, matchedCount: 1, modifiedCount: 1 };
    },
    async removeOneByQuery(query: unknown) {
      calls.push({ method: "removeOneByQuery", args: [query] });
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
    const { adaptor: DatabaseAdaptor } = DatabaseResolver.resolveDatabase(
      serverResolverTestConstant,
      serverResolverTestDatabase,
    );
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
        { sort: null, skip: 0, sample: false, select: { secret: true } },
      ],
    });
    await instance.pickInCategory("news", false, { select: { secret: true } });
    expect(instance.__store.calls.at(-1)).toEqual({
      method: "pickOne",
      args: [
        { kind: "all", queries: [{ category: "news" }, { removedAt: { kind: "op", op: "empty" } }] },
        { sort: null, skip: 0, sample: false, select: { secret: true } },
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

  test("narrows the by-id facade writes to a single id query", async () => {
    const { adaptor: DatabaseAdaptor } = DatabaseResolver.resolveDatabase(
      serverResolverTestConstant,
      serverResolverTestDatabase,
    );
    const instance = new DatabaseAdaptor() as InstanceType<typeof DatabaseAdaptor> & {
      __store: ReturnType<typeof makeFakeStore>;
      ServerResolverTestItem: {
        updateById: (id: string, update: unknown, options?: unknown) => Promise<unknown>;
        removeById: (id: string) => Promise<unknown>;
      };
    };
    Object.assign(instance, { __database: new FakeSqliteDatabase(), __cache: new FakeSolidCache() });
    await instance.onInit();

    await instance.ServerResolverTestItem.updateById("doc-1", { title: "Beta" }, { upsert: true });
    expect(instance.__store.calls.at(-1)).toEqual({
      method: "updateOneByQuery",
      args: [{ id: "doc-1" }, { title: "Beta" }, { upsert: true }],
    });

    await instance.ServerResolverTestItem.removeById("doc-1");
    expect(instance.__store.calls.at(-1)).toEqual({ method: "removeOneByQuery", args: [{ id: "doc-1" }] });
  });

  test("indexes the column a removeWith child is found by", () => {
    const constantWith = (path: Record<string, unknown>) =>
      ({
        full: { cascade: { removeRef: new Map(), removeWith: new Map([[path.key as string, path]]) } },
      }) as unknown as typeof serverResolverTestConstant;
    // Without the index the owner's removal scans the whole child table: every non-base field is inside `_doc`.
    const single = DatabaseResolver.resolveDatabase(
      constantWith({ key: "agentSession", modelRef: null, refName: "agentSession", typeKey: null, typeValues: [] }),
      serverResolverTestDatabase,
    );
    expect(single.schema.indexes).toContainEqual({ fields: { removedAt: 1, agentSession: 1 } });

    const polymorphic = DatabaseResolver.resolveDatabase(
      constantWith({ key: "parent", modelRef: null, refName: null, typeKey: "parentType", typeValues: ["a"] }),
      serverResolverTestDatabase,
    );
    expect(polymorphic.schema.indexes).toContainEqual({ fields: { removedAt: 1, parentType: 1, parent: 1 } });
  });
});

const cascadeChildInput = via((f) => ({ label: f(String) }));
const cascadeChildObject = via(cascadeChildInput, () => ({}));
const cascadeChildLight = via(cascadeChildObject, ["label"] as const, () => ({}));
const cascadeChildFull = via(cascadeChildObject, cascadeChildLight, () => ({}));
const cascadeChildInsight = via(cascadeChildFull, () => ({}));
const cascadeChildConstant = ConstantRegistry.buildModel(
  "cascadeChild",
  cascadeChildInput,
  cascadeChildObject,
  cascadeChildFull,
  cascadeChildLight,
  cascadeChildInsight,
  { cascadeChildInput, cascadeChildObject, cascadeChildFull, cascadeChildLight, cascadeChildInsight },
) as unknown as typeof serverResolverTestConstant;

describe("ServiceResolver cascade", () => {
  const parentRef = serverResolverTestDatabase.refName;

  const constantOf = (
    refName: string,
    cascade: { removeRef?: Map<string, unknown>; removeWith?: Map<string, unknown> },
  ) =>
    ({
      refName,
      full: { cascade: { removeRef: new Map(), removeWith: new Map(), ...cascade } },
    }) as unknown as typeof serverResolverTestConstant;

  const childTarget = (hasHook = false) => {
    const calls: { method: string; arg: unknown }[] = [];
    const ids = ["child-1", "child-2"];
    class ChildService {
      async _postRemove(doc: unknown) {
        return doc;
      }
    }
    class PlainChildService {}
    return {
      calls,
      srvRef: (hasHook ? ChildService : PlainChildService) as never,
      service: {
        __remove: async (id: string) => {
          calls.push({ method: "__remove", arg: id });
          const idx = ids.indexOf(id);
          if (idx >= 0) ids.splice(idx, 1);
          return { id };
        },
        __removeMany: async (query: unknown) => {
          calls.push({ method: "__removeMany", arg: query });
          ids.length = 0;
          return { acknowledged: true, matchedCount: 2, modifiedCount: 2 };
        },
        __listIds: async () => [...ids],
        __databaseModel: {
          __remove: async () => {
            throw new Error("cascade reached the target model directly");
          },
        },
      },
    };
  };

  const buildCascade = (
    parentConstant: typeof serverResolverTestConstant,
    child: ReturnType<typeof childTarget> | null,
    childConstant?: typeof serverResolverTestConstant,
  ) => {
    class CascadeService extends ServerResolverTestService {}
    const cascade = new CascadeRunner();
    cascade.register(parentConstant, new DocumentSchema(), CascadeService as never);
    if (child) cascade.register(childConstant ?? constantOf("cascadeChild", {}), new DocumentSchema(), child.srvRef);
    cascade.seal(() => child?.service as never);
    const ServiceRef = ServiceResolver.resolveDatabaseService(
      serverResolverTestDatabase,
      CascadeService as never,
      cascade,
    );
    const service = new ServiceRef() as InstanceType<typeof ServiceRef> & {
      __databaseModel: Record<string, (...args: unknown[]) => Promise<unknown>>;
      __remove: (id: string) => Promise<Record<string, unknown>>;
    };
    return { service, cascade };
  };

  test("removes each referenced document through the target's service, not its model", async () => {
    // Through the service is the whole point: `__remove` is what runs the target's `_postRemove`, and that is
    // where a module puts the side effect the removal has to carry — deleting the stored file, say. Reaching the
    // model instead still empties the row, so nothing looks wrong until the storage bill arrives.
    const child = childTarget(true);
    const { service } = buildCascade(
      constantOf(parentRef, { removeRef: new Map([["cover", cascadeChildFull]]) }),
      child,
      cascadeChildConstant,
    );
    service.__databaseModel = { __remove: async (id: string) => ({ id, cover: "file-1" }) } as never;

    await service.__remove("parent-1");

    expect(child.calls).toEqual([{ method: "__remove", arg: "file-1" }]);
  });

  test("removes every id of an array field and skips an empty one", async () => {
    const child = childTarget(true);
    const { service } = buildCascade(
      constantOf(parentRef, { removeRef: new Map([["cover", cascadeChildFull]]) }),
      child,
      cascadeChildConstant,
    );
    service.__databaseModel = { __remove: async (id: string) => ({ id, cover: ["file-1", "file-2"] }) } as never;
    await service.__remove("parent-1");
    expect(child.calls.map((call) => call.arg)).toEqual(["file-1", "file-2"]);

    child.calls.length = 0;
    service.__databaseModel = { __remove: async (id: string) => ({ id, cover: null }) } as never;
    await service.__remove("parent-2");
    expect(child.calls).toEqual([]);
  });

  test("fails to seal when a cascade target is not mounted", () => {
    const cascade = new CascadeRunner();
    cascade.register(
      constantOf(parentRef, { removeRef: new Map([["cover", cascadeChildFull]]) }),
      new DocumentSchema(),
      ServerResolverTestService as never,
    );
    // Cascading into a module the app never mounted is a misconfiguration. Every service is live by the time the
    // plan is sealed, so saying so at boot beats discovering it half-way through the first removal.
    expect(() => cascade.seal(() => null as never)).toThrow('removes "cascadeChild", which this app does not mount');
  });

  test("removes the children that name the removed document as their owner", async () => {
    const child = childTarget(true);
    const { service } = buildCascade(
      constantOf(parentRef, {}),
      child,
      constantOf("cascadeChild", {
        removeWith: new Map([
          ["parent", { key: "parent", modelRef: null, refName: parentRef, typeKey: null, typeValues: [] }],
        ]),
      }),
    );
    service.__databaseModel = { __remove: async (id: string) => ({ id }) } as never;

    await service.__remove("parent-1");

    expect(child.calls).toEqual([
      { method: "__remove", arg: "child-1" },
      { method: "__remove", arg: "child-2" },
    ]);
  });

  test("removes children in one query when the target carries no removal side effect", async () => {
    const child = childTarget();
    const { service } = buildCascade(
      constantOf(parentRef, {}),
      child,
      constantOf("cascadeChild", {
        removeWith: new Map([
          ["parent", { key: "parent", modelRef: null, refName: parentRef, typeKey: null, typeValues: [] }],
        ]),
      }),
    );
    service.__databaseModel = { __remove: async (id: string) => ({ id }) } as never;

    await service.__remove("parent-1");

    expect(child.calls).toEqual([{ method: "__removeMany", arg: { parent: "parent-1" } }]);
  });

  test("keeps the owner type in the query of a polymorphic child", async () => {
    const child = childTarget();
    const { service } = buildCascade(
      constantOf(parentRef, {}),
      child,
      constantOf("cascadeChild", {
        removeWith: new Map([
          [
            "owner",
            { key: "owner", modelRef: null, refName: null, typeKey: "ownerType", typeValues: [parentRef, "unmounted"] },
          ],
        ]),
      }),
    );
    service.__databaseModel = { __remove: async (id: string) => ({ id }) } as never;

    await service.__remove("parent-1");

    expect(child.calls).toEqual([{ method: "__removeMany", arg: { owner: "parent-1", ownerType: parentRef } }]);
  });
});

describe("ServiceResolver declaration contracts", () => {
  test("patches database services with CRUD, filter, and hook-chain implementations", async () => {
    const cascade = new CascadeRunner();
    cascade.register(serverResolverTestConstant, new DocumentSchema(), ServerResolverTestService);
    cascade.seal((refName) => {
      throw new Error(`unexpected cascade lookup: ${refName}`);
    });
    const ServiceRef = ServiceResolver.resolveDatabaseService(
      serverResolverTestDatabase,
      ServerResolverTestService,
      cascade,
    );
    const service = new ServiceRef() as InstanceType<typeof ServiceRef> & {
      __databaseModel: Record<string, (...args: unknown[]) => Promise<unknown>>;
      __create: (data: Record<string, unknown>) => Promise<Record<string, unknown>>;
      createServerResolverTestItem: (data: Record<string, unknown>) => Promise<Record<string, unknown>>;
      listInCategory: (...args: unknown[]) => Promise<unknown>;
      existsInCategory: (...args: unknown[]) => Promise<unknown>;
      queryInCategory: (...args: unknown[]) => unknown;
      getServerResolverTestItem: (id: string) => Promise<unknown>;
      removeInCategory: (...args: unknown[]) => Promise<unknown>;
      removeOneInCategory: (...args: unknown[]) => Promise<unknown>;
      updateInCategory: (...args: unknown[]) => { set: (update: unknown) => Promise<unknown> };
      updateOneInCategory: (...args: unknown[]) => { set: (update: unknown) => Promise<unknown> };
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

  test("generates a query-level write per filter, with the patch on a terminal set()", async () => {
    const cascade = new CascadeRunner();
    cascade.register(serverResolverTestConstant, new DocumentSchema(), ServerResolverTestService);
    cascade.seal(() => null as never);
    const ServiceRef = ServiceResolver.resolveDatabaseService(
      serverResolverTestDatabase,
      ServerResolverTestService,
      cascade,
    );
    const service = new ServiceRef() as InstanceType<typeof ServiceRef> & {
      __databaseModel: Record<string, (...args: unknown[]) => Promise<unknown>>;
      removeInCategory: (...args: unknown[]) => Promise<unknown>;
      removeOneInCategory: (...args: unknown[]) => Promise<unknown>;
      updateInCategory: (...args: unknown[]) => { set: (update: unknown) => Promise<unknown> };
      updateOneInCategory: (...args: unknown[]) => { set: (update: unknown) => Promise<unknown> };
    };
    const calls: { method: string; args: unknown[] }[] = [];
    service.__databaseModel = new Proxy(
      {},
      {
        get:
          (_target, prop: string) =>
          async (...args: unknown[]) => {
            calls.push({ method: prop, args });
            return { acknowledged: true, matchedCount: 1, modifiedCount: 1 };
          },
      },
    );
    const query = { kind: "all", queries: [{ category: "news" }, { removedAt: { kind: "op", op: "empty" } }] };

    await service.removeInCategory("news");
    expect(calls.at(-1)).toEqual({ method: "__removeMany", args: [query] });
    await service.removeOneInCategory("news");
    expect(calls.at(-1)).toEqual({ method: "__removeOne", args: [query] });
    // The patch lands on `set()`, so it can never be mistaken for an omitted trailing filter arg.
    await service.updateInCategory("news").set({ title: "Beta" });
    expect(calls.at(-1)).toEqual({ method: "__updateMany", args: [query, { title: "Beta" }] });
    await service.updateOneInCategory("news").set({ title: "Beta" });
    expect(calls.at(-1)).toEqual({ method: "__updateOne", args: [query, { title: "Beta" }] });
    // Building the chain touches nothing until `set()` runs.
    const pending = service.updateInCategory("news");
    expect(calls.at(-1)?.method).toBe("__updateOne");
    await pending.set({ title: "Gamma" });
    expect(calls.at(-1)).toEqual({ method: "__updateMany", args: [query, { title: "Gamma" }] });
  });

  test("refuses a filter keyed after its own model", () => {
    // Filter methods are assigned after CRUD, so this collision would silently swap the single-document
    // remove/update for a query-level one that fires no hooks — and therefore no cascade.
    expect(() => assertFilterFitsCrud("chat", "chat", "Chat")).toThrow(
      'Filter "chat" on "chat" generates removeChat/updateChat',
    );
    expect(() => assertFilterFitsCrud("chat", "inRoom", "Chat")).not.toThrow();
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

  test("mounts a query and a mutation that share a custom path, and refuses a duplicated method", () => {
    class SharedPathEndpoint extends endpoint(serverResolverTestServiceModel, (builder) => ({
      readRow: builder.query(String, { guards: [Public], prefix: false, path: "rest/v1/item" }).exec(() => "read"),
      writeRow: builder.mutation(String, { guards: [Public], prefix: false, path: "rest/v1/item" }).exec(() => "write"),
    })) {}
    const resolved = SignalResolver.resolveEndpoint(SharedPathEndpoint, new SharedPathEndpoint(), {
      registry: getDefaultInjectRegistry(),
      env: makeEnv(),
      live: getDefaultLiveRegistry(),
      middleware: new Map(),
    });
    expect(Object.keys(resolved.routes?.["/rest/v1/item"] ?? {}).sort()).toEqual(["GET", "POST"]);

    class DoubledPathEndpoint extends endpoint(serverResolverTestServiceModel, (builder) => ({
      readRow: builder.query(String, { guards: [Public], prefix: false, path: "rest/v1/item" }).exec(() => "read"),
      readRowAgain: builder.query(String, { guards: [Public], prefix: false, path: "rest/v1/item" }).exec(() => "read"),
    })) {}
    expect(() =>
      SignalResolver.resolveEndpoint(DoubledPathEndpoint, new DoubledPathEndpoint(), {
        registry: getDefaultInjectRegistry(),
        env: makeEnv(),
        live: getDefaultLiveRegistry(),
        middleware: new Map(),
      }),
    ).toThrow("Route conflict: GET /rest/v1/item is declared more than once");
  });

  test("mounts a mutation under the verb it declares", () => {
    class VerbEndpoint extends endpoint(serverResolverTestServiceModel, (builder) => ({
      createRow: builder
        .mutation(String, { guards: [Public], prefix: false, path: "rest/v1/item" })
        .exec(() => "create"),
      patchRow: builder
        .mutation(String, { guards: [Public], prefix: false, path: "rest/v1/item", method: "PATCH" })
        .exec(() => "patch"),
    })) {}
    const resolved = SignalResolver.resolveEndpoint(VerbEndpoint, new VerbEndpoint(), {
      registry: getDefaultInjectRegistry(),
      env: makeEnv(),
      live: getDefaultLiveRegistry(),
      middleware: new Map(),
    });
    expect(Object.keys(resolved.routes?.["/rest/v1/item"] ?? {}).sort()).toEqual(["PATCH", "POST"]);
  });

  test("folds two endpoint classes into one table and refuses a path both of them serve", () => {
    const table = {} as NonNullable<ReturnType<typeof SignalResolver.resolveEndpoint>["routes"]>;
    SignalResolver.mergeHttpRoutes(table, { "/rest/v1/item": { GET: () => new Response("read") } });
    SignalResolver.mergeHttpRoutes(table, { "/rest/v1/item": { POST: () => new Response("write") } });
    expect(Object.keys(table["/rest/v1/item"] ?? {}).sort()).toEqual(["GET", "POST"]);
    expect(() =>
      SignalResolver.mergeHttpRoutes(table, { "/rest/v1/item": { POST: () => new Response("write") } }),
    ).toThrow("Route conflict: POST /rest/v1/item is declared more than once");
  });

  test("guards a pubsub subscribe and revokes the room once the socket loses access", async () => {
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
      middleware: new Map(),
    });
    const roomId = `guardedRoomFeed-${validId}`;

    const anonymous = makeWs();
    await expect(resolved.wsRoutes?.guardedRoomFeed?.(anonymous, [validId], "subscribe")).rejects.toThrow(
      "Access denied by guard: ServerResolverTestRoomGuard",
    );

    const member = makeWs();
    member.data.account = { role: "member" };
    const ack = await resolved.wsRoutes?.guardedRoomFeed?.(member, [validId], "subscribe");
    expect(ack).toEqual({ type: "sub", roomId, subscribe: true });
    expect(member.subscribed).toEqual([roomId]);
    expect(await SignalResolver.revalidateWsRooms(member, registry)).toEqual([]);

    member.data.account = { role: "guest" };
    expect(await SignalResolver.revalidateWsRooms(member, registry)).toEqual([roomId]);
    expect(member.unsubscribed).toEqual([roomId]);
    expect(websocket.instance.calls).toContainEqual({ method: "leaveRoom", args: [member, roomId] });
    expect(await SignalResolver.revalidateWsRooms(member, registry)).toEqual([]);
  });

  test("runs ws cleanup on unsubscribe and close, from a message handler as well as a room", async () => {
    const cleaned: string[] = [];
    class LifecycleEndpoint extends endpoint(serverResolverTestServiceModel, (builder) => ({
      lifecycleRoom: builder
        .pubsub(ServerResolverTestLight, { guards: [Public] })
        .room("roomId", ID)
        .with(Ws)
        .exec((roomId, ws) => {
          ws.on("unsubscribe", () => {
            cleaned.push(`unsubscribe:${roomId as string}`);
          });
          ws.on("disconnect", () => {
            cleaned.push(`disconnect:${roomId as string}`);
          });
        }),
      lifecycleMessage: builder
        .message(String, { guards: [Public] })
        .msg("text", String)
        .with(Ws)
        .exec((text, ws) => {
          ws.on("disconnect", () => {
            cleaned.push(`disconnect:${text as string}`);
          });
          return `ok:${text as string}`;
        }),
    })) {}
    const registry = getDefaultInjectRegistry();
    const websocket = makeFakeWebsocket();
    registry.adaptor.set(SolidPubSub, websocket.instance);
    const resolved = SignalResolver.resolveEndpoint(LifecycleEndpoint, new LifecycleEndpoint(), {
      registry,
      env: makeEnv(),
      live: getDefaultLiveRegistry(),
      middleware: new Map(),
    });

    const unsubscribed = makeWs();
    await resolved.wsRoutes?.lifecycleRoom?.(unsubscribed, [validId], "subscribe");
    expect(await resolved.wsRoutes?.lifecycleMessage?.(unsubscribed, ["chat"], "message")).toEqual({
      type: "msg",
      key: "lifecycleMessage",
      data: "ok:chat",
    });
    await resolved.wsRoutes?.lifecycleRoom?.(unsubscribed, [validId], "unsubscribe");
    expect(cleaned).toEqual([`unsubscribe:${validId}`]);

    // The room was already unsubscribed, so only the message handler is left to run at close.
    await SignalResolver.handleWsClose(unsubscribed, registry);
    expect(cleaned).toEqual([`unsubscribe:${validId}`, "disconnect:chat"]);

    cleaned.length = 0;
    const closed = makeWs();
    await resolved.wsRoutes?.lifecycleRoom?.(closed, [validId], "subscribe");
    await resolved.wsRoutes?.lifecycleMessage?.(closed, ["chat"], "message");
    await SignalResolver.handleWsClose(closed, registry);
    expect(cleaned).toEqual([`unsubscribe:${validId}`, `disconnect:${validId}`, "disconnect:chat"]);

    cleaned.length = 0;
    const reclosed = makeWs();
    await SignalResolver.handleWsClose(reclosed, registry);
    expect(cleaned).toEqual([]);
  });

  test("runs a cleanup registered for both endings once when the socket closes subscribed", async () => {
    const cleaned: string[] = [];
    class SharedCleanupEndpoint extends endpoint(serverResolverTestServiceModel, (builder) => ({
      sharedRoom: builder
        .pubsub(ServerResolverTestLight, { guards: [Public] })
        .room("roomId", ID)
        .with(Ws)
        .exec((roomId, ws) => {
          const leave = () => {
            cleaned.push(`left:${roomId as string}`);
          };
          ws.on("unsubscribe", leave);
          ws.on("disconnect", leave);
        }),
    })) {}
    const registry = getDefaultInjectRegistry();
    const websocket = makeFakeWebsocket();
    registry.adaptor.set(SolidPubSub, websocket.instance);
    const resolved = SignalResolver.resolveEndpoint(SharedCleanupEndpoint, new SharedCleanupEndpoint(), {
      registry,
      env: makeEnv(),
      live: getDefaultLiveRegistry(),
      middleware: new Map(),
    });

    const ws = makeWs();
    await resolved.wsRoutes?.sharedRoom?.(ws, [validId], "subscribe");
    await SignalResolver.handleWsClose(ws, registry);

    expect(cleaned).toEqual([`left:${validId}`]);
  });

  test("keeps a throwing cleanup handler from skipping the socket teardown", async () => {
    class ThrowingLifecycleEndpoint extends endpoint(serverResolverTestServiceModel, (builder) => ({
      throwingRoom: builder
        .pubsub(ServerResolverTestLight, { guards: [Public] })
        .room("roomId", ID)
        .with(Ws)
        .exec((_roomId, ws) => {
          ws.on("disconnect", () => {
            throw new Error("cleanup exploded");
          });
        }),
    })) {}
    const registry = getDefaultInjectRegistry();
    const websocket = makeFakeWebsocket();
    registry.adaptor.set(SolidPubSub, websocket.instance);
    const resolved = SignalResolver.resolveEndpoint(ThrowingLifecycleEndpoint, new ThrowingLifecycleEndpoint(), {
      registry,
      env: makeEnv(),
      live: getDefaultLiveRegistry(),
      middleware: new Map(),
    });

    const ws = makeWs();
    await resolved.wsRoutes?.throwingRoom?.(ws, [validId], "subscribe");
    await SignalResolver.handleWsClose(ws, registry);

    expect(websocket.instance.calls).toContainEqual({ method: "unregisterSocket", args: [ws] });
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

    // The root list compiles its `(queryKey, args)` pair through the model's own filter, and defaults to `any`.
    await endpointMeta.serverResolverTestItemList.execFn?.call(sliceEndpoint, "byOwner", [validId], 0, 20, "latest");
    expect((calls.at(-1) as { args: unknown[] }).args[0]).toEqual({ ownerId: validId });
    await endpointMeta.serverResolverTestItemList.execFn?.call(sliceEndpoint, undefined, undefined, 0, 20, "latest");
    expect((calls.at(-1) as { args: unknown[] }).args[0]).toEqual({ removedAt: { empty: true } });

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
    const localPublishes: { roomId: string; data: unknown }[] = [];
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
      roomStream: (channel: string, data: Uint8Array) => Promise<void>;
      roomQueuedStream: (channel: string, data: Uint8Array) => Promise<void>;
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

    // A Binary return skips `serialize`, which would have base64'd it, and travels as the bytes themselves.
    const packet = new Uint8Array([2, 148, 1, 2, 63]);
    await serverSignal.roomStream("ch1", packet);
    expect(websocket.instance.calls.at(-1)).toEqual({ method: "publish", args: ["roomStream-ch1", packet] });
    expect(localPublishes.at(-1)).toEqual({ roomId: "roomStream-ch1", data: packet });

    await serverSignal.roomStream("ch1", "ApQBAj8=" as unknown as Uint8Array);
    const last = localPublishes.at(-1)?.data;
    expect(last).toBeInstanceOf(Uint8Array);
    expect([...(last as Uint8Array)]).toEqual([2, 148, 1, 2, 63]);

    // Coalescing follows the endpoint that owns the room, so every publish path reaches the same answer
    // without carrying it. A room no endpoint declared `Binary` for is absent, and queues.
    expect(SignalResolver.coalescesRoom("roomStream-ch1")).toBe(true);
    expect(SignalResolver.coalescesRoom("roomQueuedStream-ch1")).toBe(false);
    expect(SignalResolver.coalescesRoom("roomFeed-anything")).toBe(false);

    await serverSignal.roomQueuedStream("ch1", packet);
    expect(localPublishes.at(-1)?.roomId).toBe("roomQueuedStream-ch1");

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
      processAll: builder.process(Boolean).exec(() => true),
      processDisabled: builder.process(Boolean, { enabled: false }).exec(() => true),
    })) {}
    const internalInstance = Object.assign(new ScheduleInternal(), {
      schedule: makeFakeSchedule(),
      queue: makeFakeQueue(),
    });

    SignalResolver.resolveSchedule(ScheduleInternal, internalInstance, "federation");

    expect(internalInstance.schedule.calls.map((call) => call.method)).toEqual(["registerInit", "registerInterval"]);
    // `process` defaults to enabled: placement is governed by serverMode/operationMode, not an extra opt-in flag.
    expect(internalInstance.queue.calls.map((call) => call.method)).toEqual(["registerProcessWorker"]);
    expect(internalInstance.queue.calls[0]?.args[0]).toBe("processAll");
    expect(internalInstance.schedule.calls[1]).toMatchObject({
      method: "registerInterval",
      args: ["intervalFederation", 1000, expect.any(Function), { lock: false }],
    });
  });

  test("calls process workers with the declared msg args, then the job", async () => {
    resetResolverOrder();
    const execArgs: unknown[][] = [];
    class ProcessInternal extends internal(serverResolverTestServiceModel, (builder) => ({
      handleItem: builder
        .process(Boolean)
        .msg("itemId", ID)
        .msg("at", Date)
        .exec(((...args: unknown[]) => {
          execArgs.push(args);
          return true;
        }) as never),
    })) {}
    const internalInstance = Object.assign(new ProcessInternal(), {
      schedule: makeFakeSchedule(),
      queue: makeFakeQueue(),
    });

    SignalResolver.resolveSchedule(ProcessInternal, internalInstance, "all");

    const handler = internalInstance.queue.calls[0]?.args[1] as (job: AkanJob) => Promise<void>;
    const job: AkanJob = {
      id: "job-1",
      name: "handleItem",
      // a queue round-trips the payload through JSON, so the declared Date arrives as a string
      data: [validId, "2026-07-26T00:00:00.000Z"],
      attemptsMade: 1,
    };
    await handler(job);

    expect(execArgs).toHaveLength(1);
    const [itemId, at, passedJob] = execArgs[0] as [string, Dayjs, AkanJob];
    expect(itemId).toBe(validId);
    // deserialized against the declared arg type, so `Date` lands as dayjs rather than the raw JSON string
    expect(dayjs.isDayjs(at)).toBe(true);
    expect(at.toISOString()).toBe("2026-07-26T00:00:00.000Z");
    expect(passedJob).toBe(job);
  });

  test("runs an enqueued job end-to-end through the solid queue", async () => {
    resetResolverOrder();
    const filePath = path.join(tmpdir(), `solid-queue-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
    const queue = Object.assign(new SolidQueue(), {
      config: getSolidConfig({ solid: { filePath, queuePollIntervalMs: 20 } }),
      queueName: "queue-test",
      workerId: "worker-test",
    });
    await queue.onInit();

    const ran: unknown[][] = [];
    class QueuedInternal extends internal(serverResolverTestServiceModel, (builder) => ({
      archiveItem: builder
        .process(Boolean)
        .msg("itemId", ID)
        .exec(((...args: unknown[]) => {
          ran.push(args);
          return true;
        }) as never),
    })) {}
    const internalInstance = Object.assign(new QueuedInternal(), { schedule: makeFakeSchedule(), queue });

    // the worker side: `process` needs no `enabled` flag to be registered
    SignalResolver.resolveSchedule(QueuedInternal, internalInstance, "all");
    // the producer side: exactly what resolveServerSignal's generated method calls
    await queue.registerProcessQueue("archiveItem", [validId]);

    const startedAt = Date.now();
    while (!ran.length && Date.now() - startedAt < 2000) await new Promise((resolve) => setTimeout(resolve, 10));

    expect(ran).toHaveLength(1);
    const [itemId, job] = ran[0] as [string, AkanJob];
    expect(itemId).toBe(validId);
    expect(job.name).toBe("archiveItem");

    await queue.onDestroy();
    for (const suffix of ["", "-wal", "-shm"]) {
      try {
        rmSync(`${filePath}${suffix}`);
      } catch {
        // ignore missing files
      }
    }
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
    data: {} as Record<string, unknown>,
    subscribed: [] as string[],
    unsubscribed: [] as string[],
    subscribe(roomId: string) {
      this.subscribed.push(roomId);
    },
    unsubscribe(roomId: string) {
      this.unsubscribed.push(roomId);
    },
  }) as unknown as Bun.ServerWebSocket<unknown> & {
    data: Record<string, unknown>;
    subscribed: string[];
    unsubscribed: string[];
  };

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
