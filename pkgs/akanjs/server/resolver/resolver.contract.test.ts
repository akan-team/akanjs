import { describe, expect, spyOn, test } from "bun:test";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { type Dayjs, dayjs, ENDPOINT_META, ID } from "akanjs/base";
import { ConstantRegistry, via } from "akanjs/constant";
import { assertFilterFitsCrud, DocumentSchema, type SchemaOf } from "akanjs/document";
import { FetchClient } from "akanjs/fetch";
import {
  type AkanJob,
  adapt,
  getDefaultInjectRegistry,
  getDefaultLiveRegistry,
  getSolidConfig,
  type LiveChange,
  SolidPubSub,
  SolidQueue,
  type WebsocketAdaptor,
} from "akanjs/service";
import { endpoint } from "../../signal/endpoint";
import { Public } from "../../signal/guards";
import { type Internal, internal } from "../../signal/internal";
import { Ws } from "../../signal/internalArg";
import { FetchSerializer } from "../../signal/serializer";
import type { SignalContext } from "../../signal/signalContext";
import { slice } from "../../signal/slice";
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
    // The JSON content type `CrossSiteGuard` requires of every body-carrying mutation, as `HttpClient` sends it.
    headers: new Headers(body ? { "content-type": "application/json" } : {}),
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

const bootModel = async <Model>(database = new FakeSqliteDatabase()) => {
  const { adaptor: DatabaseAdaptor, schema } = DatabaseResolver.resolveDatabase(
    serverResolverTestConstant,
    serverResolverTestDatabase,
  );
  const instance = new DatabaseAdaptor() as InstanceType<typeof DatabaseAdaptor> & Model;
  Object.assign(instance, { __database: database, __cache: new FakeSolidCache() });
  await instance.onInit();
  return { instance, schema };
};

type FindChain<Result> = Promise<Result> & {
  sort: (sort: unknown) => FindChain<Result>;
  skip: (skip: number) => FindChain<Result>;
  limit: (limit: number) => FindChain<Result>;
  select: (projection?: unknown) => FindChain<Result>;
};

const makeFakeDoc = (calls: { method: string; args: unknown[] }[], id: string) => ({
  id,
  category: "news",
  title: "Alpha",
  toJSON: () => ({ id, title: "Alpha" }),
  set(patch: Record<string, unknown>) {
    Object.assign(this, patch);
    return this;
  },
  async save() {
    calls.push({ method: "save", args: [{ id: this.id, title: this.title }] });
    return this;
  },
});

const makeFakeStore = () => {
  const calls: { method: string; args: unknown[] }[] = [];
  const rec = <Result>(method: string, args: unknown[], result?: Result) => {
    calls.push({ method, args });
    return result as Result;
  };
  const written = () => ({ acknowledged: true, matchedCount: 1, modifiedCount: 1 });
  return {
    calls,
    ensure: async () => rec("ensure", []),
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
    findIds: async (query: unknown, options?: unknown) => rec("findIds", [query, options], ["doc-1"]),
    findOne: async (query: unknown, options?: unknown) => rec("findOne", [query, options], makeFakeDoc(calls, "doc-1")),
    findId: async (query: unknown, options?: unknown) => rec("findId", [query, options], "doc-1"),
    pickOne: async (query: unknown, options?: unknown) => rec("pickOne", [query, options], makeFakeDoc(calls, "doc-1")),
    pickById: async (id: string) => rec("pickById", [id], { id, title: "Alpha" }),
    exists: async (query: unknown) => rec("exists", [query], "doc-1"),
    count: async (query: unknown) => rec("count", [query], 1),
    insight: async (query: unknown) => rec("insight", [query], { total: 1 }),
    hydrate: async (data: Record<string, unknown>) => rec("hydrate", [data], { ...data, hydrated: true }),
    clone: async (data: Record<string, unknown>) => rec("clone", [data], { ...data, id: "clone-1" }),
    create: async (data: Record<string, unknown>) => rec("create", [data], { ...data, id: "created-1" }),
    update: async (id: string, data: Record<string, unknown>) => rec("update", [id, data], { ...data, id }),
    remove: async (id: string) => rec("remove", [id], { id, removed: true }),
    search: async (text: string, options?: unknown) =>
      rec("search", [text, options], { docs: [{ id: "doc-1" }], count: 1 }),
    updateOneByQuery: async (query: unknown, update: unknown, options?: unknown) =>
      rec("updateOneByQuery", [query, update, options], written()),
    updateManyByQuery: async (query: unknown, update: unknown) => rec("updateManyByQuery", [query, update], written()),
    removeManyByQuery: async (query: unknown) => rec("removeManyByQuery", [query], written()),
    removeOneByQuery: async (query: unknown) => rec("removeOneByQuery", [query], written()),
    bulkWrite: async (operations: unknown) => rec("bulkWrite", [operations], written()),
  };
};

describe("DatabaseResolver declaration contracts", () => {
  test("turns document declarations into initialized model adaptors", async () => {
    const fakeDatabase = new FakeSqliteDatabase();
    const { instance } = await bootModel<{
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
        find: (query: unknown) => FindChain<unknown[]>;
        findOne: (query: unknown) => FindChain<unknown>;
      };
      listInCategory: (...args: unknown[]) => Promise<unknown[]>;
      findInCategory: (...args: unknown[]) => Promise<unknown>;
      pickInCategory: (...args: unknown[]) => Promise<unknown>;
      queryInCategory: (...args: unknown[]) => unknown;
      __pickId: (query?: unknown) => Promise<string>;
    }>(fakeDatabase);

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

    const callsBeforeChain = instance.__store.calls.length;
    const chain = instance.ServerResolverTestItem.find({ category: "news" });
    expect(instance.__store.calls.length).toBe(callsBeforeChain);
    await chain.sort({ title: 1 }).skip(2).limit(3).select({ title: true });
    expect(instance.__store.calls.at(-1)).toEqual({
      method: "find",
      args: [{ category: "news" }, { sort: { title: 1 }, skip: 2, limit: 3, select: { title: true } }],
    });

    await chain;
    expect(instance.__store.calls.at(-1)).toEqual({ method: "find", args: [{ category: "news" }, {}] });

    await instance.ServerResolverTestItem.findOne({ category: "news" }).sort({ title: -1 }).skip(1);
    expect(instance.__store.calls.at(-1)).toEqual({
      method: "findOne",
      args: [{ category: "news" }, { sort: { title: -1 }, skip: 1 }],
    });
  });

  test("keeps multi-field query loader keys apart when their values concatenate alike", async () => {
    const { instance } = await bootModel<{
      __store: { find: (query: unknown) => Promise<unknown[]> };
      byOwnerCategory: { loadMany: (keys: Record<string, string>[]) => Promise<unknown[]> };
    }>();
    const first = { id: "doc-1", ownerId: "x", category: "yz" };
    const second = { id: "doc-2", ownerId: "xy", category: "z" };
    instance.__store.find = async () => [first, second];
    expect(
      await instance.byOwnerCategory.loadMany([
        { ownerId: "x", category: "yz" },
        { ownerId: "xy", category: "z" },
      ]),
    ).toEqual([first, second]);
  });

  test("hands the facade projection to the store", async () => {
    const { instance } = await bootModel<{
      __store: ReturnType<typeof makeFakeStore>;
      ServerResolverTestItem: {
        find: (query: unknown, projection?: unknown) => FindChain<unknown[]>;
        findOne: (query: unknown, projection?: unknown) => FindChain<unknown>;
        findById: (id: string | undefined, projection?: unknown) => Promise<unknown>;
        pickById: (id: string | undefined, projection?: unknown) => Promise<unknown>;
        pickOne: (query: unknown, projection?: unknown) => Promise<unknown>;
      };
    }>();

    await instance.ServerResolverTestItem.findById("doc-1", { title: true });
    expect(instance.__store.calls.at(-1)).toEqual({
      method: "findOne",
      args: [{ id: "doc-1" }, { select: { title: true } }],
    });

    await instance.ServerResolverTestItem.pickById("doc-1", { title: true });
    expect(instance.__store.calls.at(-1)).toEqual({
      method: "findOne",
      args: [{ id: "doc-1" }, { select: { title: true } }],
    });

    await instance.ServerResolverTestItem.pickOne({ category: "news" }, { title: true });
    expect(instance.__store.calls.at(-1)).toEqual({
      method: "pickOne",
      args: [{ category: "news" }, { select: { title: true } }],
    });

    await instance.ServerResolverTestItem.find({ category: "news" }, { title: true });
    expect(instance.__store.calls.at(-1)).toEqual({
      method: "find",
      args: [{ category: "news" }, { select: { title: true } }],
    });

    await instance.ServerResolverTestItem.findOne({ category: "news" }, { title: true }).select({ tags: true });
    expect(instance.__store.calls.at(-1)).toEqual({
      method: "findOne",
      args: [{ category: "news" }, { select: { tags: true } }],
    });

    const missing = await instance.ServerResolverTestItem.findById(undefined, { title: true });
    expect(missing).toBeNull();
  });

  test("writes through the document on pickAndWrite", async () => {
    const { instance } = await bootModel<{
      __store: ReturnType<typeof makeFakeStore>;
      ServerResolverTestItem: {
        pickAndWrite: (id: string, rawData: unknown) => Promise<unknown>;
        pickOneAndWrite: (query: unknown, rawData: unknown) => Promise<unknown>;
      };
    }>();

    await instance.ServerResolverTestItem.pickAndWrite("doc-1", { title: "Beta" });
    expect(instance.__store.calls.slice(-2)).toEqual([
      { method: "findOne", args: [{ id: "doc-1" }, { select: undefined }] },
      { method: "save", args: [{ id: "doc-1", title: "Beta" }] },
    ]);

    await instance.ServerResolverTestItem.pickOneAndWrite({ category: "news" }, { title: "Gamma" });
    expect(instance.__store.calls.slice(-2)).toEqual([
      { method: "pickOne", args: [{ category: "news" }, undefined] },
      { method: "save", args: [{ id: "doc-1", title: "Gamma" }] },
    ]);
  });

  test("unsubscribes a document listener", async () => {
    const { instance, schema: documentSchema } = await bootModel<{
      listenPre: (type: string, listener: () => void) => () => void;
      ServerResolverTestItem: { listenPost: (type: string, listener: () => void) => () => void };
    }>();

    const preBefore = documentSchema.preHooks.get("update")?.length ?? 0;
    const unlistenPre = instance.listenPre("update", () => undefined);
    expect(documentSchema.preHooks.get("update")?.length).toBe(preBefore + 1);
    unlistenPre();
    expect(documentSchema.preHooks.get("update")?.length).toBe(preBefore);

    const postBefore = documentSchema.postHooks.get("update")?.length ?? 0;
    const unlistenPost = instance.ServerResolverTestItem.listenPost("update", () => undefined);
    expect(documentSchema.postHooks.get("update")?.length).toBe(postBefore + 1);
    unlistenPost();
    expect(documentSchema.postHooks.get("update")?.length).toBe(postBefore);
  });

  test("tells a trailing query option from a filter argument", async () => {
    const { instance } = await bootModel<{
      __store: ReturnType<typeof makeFakeStore>;
      listInCategory: (...args: unknown[]) => Promise<unknown[]>;
    }>();

    const notRemoved = { removedAt: { kind: "op", op: "empty" } };
    const queryOf = (call?: { args: unknown[] }) => call?.args[0];
    const optionOf = (call?: { args: unknown[] }) => call?.args[1];

    // Misread as a filter arg, this option would fill `includeRemoved` and let soft-removed rows join the result.
    await instance.listInCategory("news", { sample: 2 });
    expect(queryOf(instance.__store.calls.at(-1))).toEqual({
      kind: "all",
      queries: [{ category: "news" }, notRemoved],
    });
    expect(optionOf(instance.__store.calls.at(-1))).toMatchObject({ sample: 2 });

    await instance.listInCategory("news", { sort: null, limit: null });
    expect(queryOf(instance.__store.calls.at(-1))).toEqual({
      kind: "all",
      queries: [{ category: "news" }, notRemoved],
    });

    await instance.listInCategory("news", {});
    expect(queryOf(instance.__store.calls.at(-1))).toEqual({
      kind: "all",
      queries: [{ category: "news" }, notRemoved],
    });

    await instance.listInCategory("news", true);
    expect(queryOf(instance.__store.calls.at(-1))).toEqual({ kind: "all", queries: [{ category: "news" }, {}] });

    await instance.listInCategory("news", true, { limit: 5 });
    expect(queryOf(instance.__store.calls.at(-1))).toEqual({ kind: "all", queries: [{ category: "news" }, {}] });
    expect(optionOf(instance.__store.calls.at(-1))).toMatchObject({ limit: 5 });
  });

  test("narrows the by-id facade writes to a single id query", async () => {
    const { instance } = await bootModel<{
      __store: ReturnType<typeof makeFakeStore>;
      ServerResolverTestItem: {
        updateById: (id: string, update: unknown, options?: unknown) => Promise<unknown>;
        removeById: (id: string) => Promise<unknown>;
      };
    }>();

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

    const wildcard = DatabaseResolver.resolveDatabase(
      constantWith({
        key: "parent",
        modelRef: null,
        refName: null,
        typeKey: "parentType",
        typeValues: [],
        anyOwner: true,
      }),
      serverResolverTestDatabase,
    );
    expect(wildcard.schema.indexes).toContainEqual({ fields: { removedAt: 1, parentType: 1, parent: 1 } });
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
    const listQueries: unknown[] = [];
    const ids = ["child-1", "child-2"];
    class ChildService {
      async _postRemove(doc: unknown) {
        return doc;
      }
    }
    class PlainChildService {}
    return {
      calls,
      listQueries,
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
        __listIds: async (query: unknown) => {
          listQueries.push(query);
          return [...ids];
        },
        __databaseModel: {
          __remove: async () => {
            throw new Error("cascade reached the target model directly");
          },
        },
      },
    };
  };

  const removeWithChild = (field: { key: string } & Record<string, unknown>) =>
    constantOf("cascadeChild", { removeWith: new Map([[field.key, field]]) });

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
    expect(() => cascade.seal(() => null as never)).toThrow('removes "cascadeChild", which this app does not mount');
  });

  test("removes the children that name the removed document as their owner", async () => {
    const child = childTarget(true);
    const { service } = buildCascade(
      constantOf(parentRef, {}),
      child,
      removeWithChild({ key: "parent", modelRef: null, refName: parentRef, typeKey: null, typeValues: [] }),
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
      removeWithChild({ key: "parent", modelRef: null, refName: parentRef, typeKey: null, typeValues: [] }),
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
      removeWithChild({
        key: "owner",
        modelRef: null,
        refName: null,
        typeKey: "ownerType",
        typeValues: [parentRef, "unmounted"],
      }),
    );
    service.__databaseModel = { __remove: async (id: string) => ({ id }) } as never;

    await service.__remove("parent-1");

    expect(child.calls).toEqual([{ method: "__removeMany", arg: { owner: "parent-1", ownerType: parentRef } }]);
  });

  test("sweeps a wildcard child on every removal, one document at a time", async () => {
    const child = childTarget();
    const { service } = buildCascade(
      constantOf(parentRef, {}),
      child,
      removeWithChild({
        key: "owner",
        modelRef: null,
        refName: null,
        typeKey: "ownerType",
        typeValues: [],
        anyOwner: true,
      }),
    );
    service.__databaseModel = { __remove: async (id: string) => ({ id }) } as never;

    await service.__remove("parent-1");

    expect(child.listQueries.at(0)).toEqual({ owner: "parent-1", ownerType: parentRef });
    expect(child.calls).toEqual([
      { method: "__remove", arg: "child-1" },
      { method: "__remove", arg: "child-2" },
    ]);
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
    await service.updateInCategory("news").set({ title: "Beta" });
    expect(calls.at(-1)).toEqual({ method: "__updateMany", args: [query, { title: "Beta" }] });
    await service.updateOneInCategory("news").set({ title: "Beta" });
    expect(calls.at(-1)).toEqual({ method: "__updateOne", args: [query, { title: "Beta" }] });
    const pending = service.updateInCategory("news");
    expect(calls.at(-1)?.method).toBe("__updateOne");
    await pending.set({ title: "Gamma" });
    expect(calls.at(-1)).toEqual({ method: "__updateMany", args: [query, { title: "Gamma" }] });
  });

  test("refuses a filter keyed after its own model", () => {
    expect(() => assertFilterFitsCrud("chat", "chat", "Chat")).toThrow(
      'Filter "chat" on "chat" generates removeChat/updateChat',
    );
    expect(() => assertFilterFitsCrud("chat", "inRoom", "Chat")).not.toThrow();
  });
});

describe("SignalResolver declaration contracts", () => {
  test("the fetch client calls the route the server mounts, whatever the endpoint's routing options", () => {
    class RoutedEndpoint extends endpoint(serverResolverTestServiceModel, (builder) => ({
      ingest: builder.mutation(Boolean, { guards: [Public], path: "itemDrop" }).exec(() => true),
      rooted: builder
        .query(String, { guards: [Public], path: "/rooted/:id" })
        .param("id", ID)
        .exec((id) => id),
      aliased: builder
        .query(String, { guards: [Public], prefix: "custom" })
        .param("id", ID)
        .exec((id) => id),
      token: builder
        .mutation(String, { guards: [Public], prefix: false, globalPrefix: false, path: "oauth/token" })
        .exec(() => "token"),
      plain: builder.query(String, { guards: [Public] }).exec(() => "plain"),
    })) {}
    for (const [Endpoint, instance] of [
      [ServerResolverTestEndpoint, makeTestEndpoint()],
      [RoutedEndpoint, new RoutedEndpoint()],
    ] as const) {
      const resolved = resolveWith(Endpoint, instance as never);
      const signal = FetchSerializer.serializeDatabaseSignal(ServerResolverTestSlice, Endpoint);
      const clientRoutes = Object.entries(signal.endpoint)
        .filter(([, serialized]) => serialized.type === "query" || serialized.type === "mutation")
        .map(([key, serialized]) => {
          const path = FetchClient.makeHttpUrl(key, serialized, signal.prefix, new Map());
          return [path, serialized.globalPrefix === false ? { globalPrefix: false as const } : undefined] as const;
        });
      expect(clientRoutes.map(([path]) => path).sort()).toEqual(Object.keys(resolved.routes ?? {}).sort());
      for (const [path, option] of clientRoutes) expect(resolved.routeOptions?.[path]).toEqual(option);
    }
  });

  test("turns endpoint declarations into HTTP and websocket route handlers", async () => {
    resetResolverOrder();
    const { registry, websocket } = withFakeWebsocket();

    const resolved = resolveWith(ServerResolverTestEndpoint, makeTestEndpoint(), {
      registry,
      middleware: new Map([["serverResolverTestMiddleware", ServerResolverTestMiddleware]]),
    });

    expect(Object.keys(resolved.routes ?? {}).sort()).toEqual([
      "/getTitle/:id",
      "/serverResolverTestItem/updateTitle/:id",
    ]);
    expect(resolved.routeOptions?.["/getTitle/:id"]).toEqual({ globalPrefix: false });

    const response = await (
      resolved.routes?.["/getTitle/:id"] as { GET?: (req: Bun.BunRequest) => Promise<Response> }
    )?.GET?.(makeHttpRequest({ url: `http://localhost/getTitle/${validId}?suffix=ok`, params: { id: validId } }));
    expect(await response?.json()).toBe(`${validId}:ok:public`);
    expect(resolverOrder).toEqual([
      "global-before",
      "global-before",
      `query:${validId}:ok`,
      "global-after",
      "global-after",
    ]);

    const mutationResponse = await (
      resolved.routes?.["/serverResolverTestItem/updateTitle/:id"] as {
        POST?: (req: Bun.BunRequest) => Promise<Response>;
      }
    )?.POST?.(
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
    expect(ack).toEqual({
      type: "sub",
      roomId: `roomFeed-${validId}`,
      requestRoomId: `roomFeed-${validId}`,
      subscribe: true,
    });
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
    const resolved = resolveWith(SharedPathEndpoint, new SharedPathEndpoint());
    expect(Object.keys(resolved.routes?.["/rest/v1/item"] ?? {}).sort()).toEqual(["GET", "POST"]);

    class DoubledPathEndpoint extends endpoint(serverResolverTestServiceModel, (builder) => ({
      readRow: builder.query(String, { guards: [Public], prefix: false, path: "rest/v1/item" }).exec(() => "read"),
      readRowAgain: builder.query(String, { guards: [Public], prefix: false, path: "rest/v1/item" }).exec(() => "read"),
    })) {}
    expect(() => resolveWith(DoubledPathEndpoint, new DoubledPathEndpoint())).toThrow(
      "Route conflict: GET /rest/v1/item is declared more than once",
    );
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
    const resolved = resolveWith(VerbEndpoint, new VerbEndpoint());
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
    const { registry, websocket } = withFakeWebsocket();
    const resolved = resolveWith(ServerResolverTestEndpoint, makeTestEndpoint(), { registry });
    const roomId = `guardedRoomFeed-${validId}`;

    const anonymous = makeWs();
    await expect(resolved.wsRoutes?.guardedRoomFeed?.(anonymous, [validId], "subscribe")).rejects.toThrow(
      "Access denied by guard: ServerResolverTestRoomGuard",
    );

    const member = makeWs();
    member.data.account = { role: "member" };
    const ack = await resolved.wsRoutes?.guardedRoomFeed?.(member, [validId], "subscribe");
    expect(ack).toEqual({ type: "sub", roomId, requestRoomId: roomId, subscribe: true });
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
    const { registry } = withFakeWebsocket();
    const resolved = resolveWith(LifecycleEndpoint, new LifecycleEndpoint(), { registry });

    const unsubscribed = makeWs();
    await resolved.wsRoutes?.lifecycleRoom?.(unsubscribed, [validId], "subscribe");
    expect(await resolved.wsRoutes?.lifecycleMessage?.(unsubscribed, ["chat"], "message")).toEqual({
      type: "msg",
      key: "lifecycleMessage",
      data: "ok:chat",
    });
    await resolved.wsRoutes?.lifecycleRoom?.(unsubscribed, [validId], "unsubscribe");
    expect(cleaned).toEqual([`unsubscribe:${validId}`]);

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
    const { registry } = withFakeWebsocket();
    const resolved = resolveWith(SharedCleanupEndpoint, new SharedCleanupEndpoint(), { registry });

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
    const { registry, websocket } = withFakeWebsocket();
    const resolved = resolveWith(ThrowingLifecycleEndpoint, new ThrowingLifecycleEndpoint(), { registry });

    const ws = makeWs();
    await resolved.wsRoutes?.throwingRoom?.(ws, [validId], "subscribe");
    await SignalResolver.handleWsClose(ws, registry);

    expect(websocket.instance.calls).toContainEqual({ method: "unregisterSocket", args: [ws] });
  });

  test("gives a live slice a room, routes a change into it, and lets it go when the socket does", async () => {
    class LiveTestSlice extends slice(
      serverResolverTestServiceModel,
      { guards: { root: Public, get: Public, cru: Public } },
      (init) => ({
        inCategory: init()
          .search("category", String)
          .live()
          .exec(function (category) {
            return this.serverResolverTestItemService.queryInCategory(category ?? "all");
          }),
      }),
    ) {}

    const SliceEndpoint = SignalResolver.resolveSlice(LiveTestSlice);
    expect(Object.keys(SliceEndpoint[ENDPOINT_META])).toContain("serverResolverTestItemLiveInCategory");

    const sliceEndpoint = new SliceEndpoint() as InstanceType<typeof SliceEndpoint> & Record<string, unknown>;
    sliceEndpoint.serverResolverTestItemService = { queryInCategory: (category: string) => ({ category }) };

    const { registry, websocket } = withFakeWebsocket();
    const live = getDefaultLiveRegistry();
    live.sliceCls.set(LiveTestSlice.baseName, LiveTestSlice as never);
    const listeners: ((doc: unknown, type: string, previous?: unknown) => void)[] = [];
    live.service.set("serverResolverTestItem", {
      listenPost: (_type: string, listener: (doc: unknown, type: string, previous?: unknown) => void) =>
        listeners.push(listener),
      __databaseModel: { __store: makeTextStore() },
    } as never);

    const published: { roomId: string; data: unknown }[] = [];
    SignalResolver.setLocalPublish((roomId, data) => published.push({ roomId, data }), websocket.instance, live);
    const liveKeys = SignalResolver.registerLiveSync(LiveTestSlice, { registry, live });
    expect(liveKeys).toEqual(["serverResolverTestItemLiveInCategory"]);
    expect(listeners).toHaveLength(3);

    await listeners[0]({ id: validId, category: "news", createdAt: dayjs(1000), updatedAt: dayjs(1000) }, "create");
    expect(websocket.instance.calls.filter((call: { method: string }) => call.method === "publishChange")).toHaveLength(
      1,
    );
    expect(published).toEqual([]);
    websocket.instance.calls.length = 0;

    const resolved = resolveWith(SliceEndpoint, sliceEndpoint as never, { registry, live });

    const ws = makeWs();
    const ack = await resolved.wsRoutes?.serverResolverTestItemLiveInCategory?.(ws, ["news"], "subscribe");
    expect(ack).toMatchObject({ type: "sub", roomId: "serverResolverTestItemLiveInCategory-news", subscribe: true });
    expect(live.syncHub.roomCountOf("serverResolverTestItem")).toBe(1);

    const inRoom = { id: validId, category: "news", title: "Alpha", createdAt: dayjs(1000), updatedAt: dayjs(1000) };
    await listeners[0](inRoom, "create", undefined);
    expect(published).toHaveLength(1);
    expect(published[0].roomId).toBe("serverResolverTestItemLiveInCategory-news");
    expect(published[0].data).toMatchObject({ op: "enter", id: validId });
    expect(websocket.instance.calls.map((call: { method: string }) => call.method)).toEqual([
      "joinRoom",
      "publishChange",
    ]);

    published.length = 0;
    const elsewhere = { ...inRoom, id: "5f5f5f5f5f5f5f5f5f5f5f5f", title: "Beta" };
    websocket.receiveChange({ refName: "serverResolverTestItem", next: JSON.stringify(elsewhere) });
    await Bun.sleep(0);
    expect(published).toEqual([
      {
        roomId: "serverResolverTestItemLiveInCategory-news",
        data: expect.objectContaining({ op: "enter", id: elsewhere.id }),
      },
    ]);

    published.length = 0;
    await listeners[1]({ ...inRoom, category: "sports" }, "update", inRoom);
    expect(published[0].data).toMatchObject({ op: "leave", id: validId });

    published.length = 0;
    await listeners[1]({ ...inRoom, category: "sports", title: "B" }, "update", { ...inRoom, category: "sports" });
    expect(published).toEqual([]);

    await SignalResolver.handleWsClose(ws, registry, live);
    expect(live.syncHub.roomCountOf("serverResolverTestItem")).toBe(0);
  });

  test("takes a live slice with two optional arguments, which a URL could not", () => {
    class TwoSearchLiveSlice extends slice(
      serverResolverTestServiceModel,
      { guards: { root: Public, get: Public } },
      (init) => ({
        inCategory: init()
          .search("category", String)
          .search("title", String)
          .live()
          .exec(function (category) {
            return this.serverResolverTestItemService.queryInCategory(category ?? "all");
          }),
      }),
    ) {}
    const SliceEndpoint = SignalResolver.resolveSlice(TwoSearchLiveSlice);
    const live = SliceEndpoint[ENDPOINT_META].serverResolverTestItemLiveInCategory;
    // Room args are a positional array with explicit nulls: without the nullable flag an absent one fails to parse.
    expect(live.args.map((arg) => [arg.type, arg.name, arg.option?.nullable])).toEqual([
      ["room", "category", true],
      ["room", "title", true],
    ]);
  });

  test("gates a live room with the slice's own guards, not the single-document read guard", async () => {
    class NeedsItemId {
      static name = "User";
      static scope = "resource" as const;
      canPass(context: SignalContext) {
        return !!context.getArg<string>("id");
      }
    }
    class GuardedLiveSlice extends slice(
      serverResolverTestServiceModel,
      { guards: { root: Public, get: NeedsItemId, cru: Public } },
      (init) => ({
        inCategory: init({ guards: [Public] })
          .search("category", String)
          .live()
          .exec(function (category) {
            return this.serverResolverTestItemService.queryInCategory(category ?? "all");
          }),
      }),
    ) {}

    const SliceEndpoint = SignalResolver.resolveSlice(GuardedLiveSlice);
    const liveInfo = SliceEndpoint[ENDPOINT_META].serverResolverTestItemLiveInCategory;
    expect(liveInfo.signalOption.guards).toEqual([Public]);
    expect(SliceEndpoint[ENDPOINT_META].serverResolverTestItem.signalOption.guards).toEqual([NeedsItemId]);

    const sliceEndpoint = new SliceEndpoint() as InstanceType<typeof SliceEndpoint> & Record<string, unknown>;
    sliceEndpoint.serverResolverTestItemService = { queryInCategory: (category: string) => ({ category }) };
    const { registry } = withFakeWebsocket();
    const live = getDefaultLiveRegistry();
    live.sliceCls.set(GuardedLiveSlice.baseName, GuardedLiveSlice as never);
    live.service.set("serverResolverTestItem", {
      listenPost: () => undefined,
      __databaseModel: { __store: makeTextStore() },
    } as never);
    SignalResolver.registerLiveSync(GuardedLiveSlice, { registry, live });
    const resolved = resolveWith(SliceEndpoint, sliceEndpoint as never, { registry, live });

    const ack = await resolved.wsRoutes?.serverResolverTestItemLiveInCategory?.(makeWs(), ["news"], "subscribe");
    expect(ack).toMatchObject({ type: "sub", subscribe: true });
    expect(live.syncHub.roomCountOf("serverResolverTestItem")).toBe(1);
  });

  test("keeps another socket's live room when a socket leaves a room it does not hold", async () => {
    const { live, route } = resolveLiveCategoryRoute();
    const [reader, other] = [makeWs(), makeWs()];
    await route(reader, ["news"], "subscribe");
    await route(other, ["news"], "subscribe");
    await route(other, ["sports"], "subscribe");
    await route(other, ["news"], "unsubscribe");
    await route(other, ["news"], "unsubscribe");
    expect(live.syncHub.roomIds()).toEqual([
      "serverResolverTestItemLiveInCategory-news",
      "serverResolverTestItemLiveInCategory-sports",
    ]);
  });

  test("lets a live room go when a socket that subscribed to it twice closes", async () => {
    const { registry, live, route } = resolveLiveCategoryRoute();
    const ws = makeWs();
    await route(ws, ["news"], "subscribe");
    await route(ws, ["news"], "subscribe");
    await SignalResolver.handleWsClose(ws, registry, live);
    expect(live.syncHub.roomIds()).toEqual([]);
  });

  test("pauses a live room while a declared argument carries a value", async () => {
    class PausedLiveSlice extends slice(
      serverResolverTestServiceModel,
      { guards: { root: Public, get: Public, cru: Public } },
      (init) => ({
        inCategory: init({ guards: [Public] })
          .param("category", String)
          .search("text", String)
          .live({ pauseOn: ["text"] })
          .exec(function (category) {
            return this.serverResolverTestItemService.queryInCategory(category);
          }),
      }),
    ) {}

    const SliceEndpoint = SignalResolver.resolveSlice(PausedLiveSlice);
    expect(SliceEndpoint[ENDPOINT_META].serverResolverTestItemLiveInCategory.signalOption.live).toMatchObject({
      pauseOn: ["text"],
    });

    const sliceEndpoint = new SliceEndpoint() as InstanceType<typeof SliceEndpoint> & Record<string, unknown>;
    sliceEndpoint.serverResolverTestItemService = { queryInCategory: (category: string) => ({ category }) };
    const { registry } = withFakeWebsocket();
    const live = getDefaultLiveRegistry();
    live.sliceCls.set(PausedLiveSlice.baseName, PausedLiveSlice as never);
    live.service.set("serverResolverTestItem", {
      listenPost: () => undefined,
      __databaseModel: { __store: makeTextStore() },
    } as never);
    SignalResolver.registerLiveSync(PausedLiveSlice, { registry, live });
    const resolved = resolveWith(SliceEndpoint, sliceEndpoint as never, { registry, live });
    const subscribeTo = async (args: unknown[]) =>
      await resolved.wsRoutes?.serverResolverTestItemLiveInCategory?.(makeWs(), args, "subscribe");

    expect(await subscribeTo(["news", null])).toMatchObject({ type: "sub", subscribe: true });
    expect(live.syncHub.roomCountOf("serverResolverTestItem")).toBe(1);

    await expect(subscribeTo(["news", "lovelace"])).rejects.toThrow(/paused while "text" carries a value/);
    expect(live.syncHub.roomCountOf("serverResolverTestItem")).toBe(1);
  });

  test("refuses a pauseOn naming an unknown argument or a required one", () => {
    const build = (pauseOn: string[]) =>
      class extends slice(serverResolverTestServiceModel, { guards: { root: Public, get: Public } }, (init) => ({
        inCategory: init()
          .param("category", String)
          .search("text", String)
          .live({ pauseOn: pauseOn as never })
          .exec(function (category) {
            return this.serverResolverTestItemService.queryInCategory(category);
          }),
      })) {};

    expect(() => SignalResolver.resolveSlice(build(["nope"]))).toThrow(/not one of its arguments/);
    expect(() => SignalResolver.resolveSlice(build(["category"]))).toThrow(/always present/);
    expect(() => SignalResolver.resolveSlice(build(["text"]))).not.toThrow();
  });

  test("a live sort on a field the client orders as SQL does resolves without a warning", () => {
    const warn = spyOn(SignalResolver.logger, "warn");
    try {
      SignalResolver.resolveSlice(
        class extends slice(serverResolverTestServiceModel, { guards: { root: Public, get: Public } }, (init) => ({
          inCategory: init()
            .param("category", String)
            .live({ sort: ["titleAsc"] })
            .exec(function (category) {
              return this.serverResolverTestItemService.queryInCategory(category);
            }),
        })) {},
      );
      expect(warn.mock.calls.filter(([message]) => String(message).startsWith("Live slice"))).toEqual([]);
    } finally {
      warn.mockRestore();
    }
  });

  test("refuses a live root slice and a live sort the model does not have", () => {
    expect(() =>
      SignalResolver.resolveSlice(
        class extends slice(serverResolverTestServiceModel, { guards: { root: Public, get: Public } }, (init) => ({
          inCategory: init()
            .search("category", String)
            .live({ sort: ["noSuchSort"] })
            .exec(function (category) {
              return this.serverResolverTestItemService.queryInCategory(category ?? "all");
            }),
        })) {},
      ),
    ).toThrow(/which the model does not have/);
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
    const { registry, websocket } = withFakeWebsocket();
    const live = getDefaultLiveRegistry();
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

    const packet = new Uint8Array([2, 148, 1, 2, 63]);
    await serverSignal.roomStream("ch1", packet);
    expect(websocket.instance.calls.at(-1)).toEqual({ method: "publish", args: ["roomStream-ch1", packet] });
    expect(localPublishes.at(-1)).toEqual({ roomId: "roomStream-ch1", data: packet });

    await serverSignal.roomStream("ch1", "ApQBAj8=" as unknown as Uint8Array);
    const last = localPublishes.at(-1)?.data;
    expect(last).toBeInstanceOf(Uint8Array);
    expect([...(last as Uint8Array)]).toEqual([2, 148, 1, 2, 63]);

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

    SignalResolver.resolveSchedule(ScheduleInternal, internalInstance as unknown as Internal, "federation");

    expect(internalInstance.schedule.calls.map((call) => call.method)).toEqual(["registerInit", "registerInterval"]);
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

    SignalResolver.resolveSchedule(ProcessInternal, internalInstance as unknown as Internal, "all");

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

    SignalResolver.resolveSchedule(QueuedInternal, internalInstance as unknown as Internal, "all");
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

const makeTextStore = () => ({
  serialize: (doc: object) => JSON.stringify(doc),
  deserialize: (text: string) => {
    const doc = JSON.parse(text) as Record<string, unknown>;
    return { ...doc, createdAt: dayjs(doc.createdAt as string), updatedAt: dayjs(doc.updatedAt as string) };
  },
});

const makeFakeWebsocket = () => {
  class FakeWebsocket extends adapt("solidPubsub") {}
  let changeHandler: ((change: LiveChange) => void) | null = null;
  const calls: { method: string; args: unknown[] }[] = [];
  const rec = (method: string, args: unknown[]) => void calls.push({ method, args });
  const instance = Object.assign(new FakeWebsocket(), {
    calls,
    publish: (roomId: string, data: unknown) => rec("publish", [roomId, data]),
    publishChange: (change: LiveChange) => rec("publishChange", [change]),
    onChange(handler: (change: LiveChange) => void) {
      changeHandler = handler;
    },
    setEventHandler: (handler: unknown) => rec("setEventHandler", [handler]),
    joinRoom: (ws: unknown, roomId: string) => rec("joinRoom", [ws, roomId]),
    leaveRoom: (ws: unknown, roomId: string) => rec("leaveRoom", [ws, roomId]),
    registerSocket: (ws: unknown) => rec("registerSocket", [ws]),
    unregisterSocket: (ws: unknown) => rec("unregisterSocket", [ws]),
  }) as InstanceType<typeof FakeWebsocket> & WebsocketAdaptor & { calls: { method: string; args: unknown[] }[] };
  return { cls: FakeWebsocket, instance, receiveChange: (change: LiveChange) => changeHandler?.(change) };
};

const makeWs = () => {
  const recorded = { subscribed: [] as string[], unsubscribed: [] as string[] };
  return {
    data: {} as Record<string, unknown>,
    ...recorded,
    subscribe(roomId: string) {
      recorded.subscribed.push(roomId);
    },
    unsubscribe(roomId: string) {
      recorded.unsubscribed.push(roomId);
    },
  } as unknown as Bun.ServerWebSocket<{ kind?: string }> & {
    data: Record<string, unknown>;
    subscribed: string[];
    unsubscribed: string[];
  };
};

const withFakeWebsocket = () => {
  const registry = getDefaultInjectRegistry();
  const websocket = makeFakeWebsocket();
  registry.adaptor.set(SolidPubSub, websocket.instance);
  return { registry, websocket };
};

const resolveLiveCategoryRoute = () => {
  class LiveCategorySlice extends slice(
    serverResolverTestServiceModel,
    { guards: { root: Public, get: Public, cru: Public } },
    (init) => ({
      inCategory: init()
        .search("category", String)
        .live()
        .exec(function (category) {
          return this.serverResolverTestItemService.queryInCategory(category ?? "all");
        }),
    }),
  ) {}
  const SliceEndpoint = SignalResolver.resolveSlice(LiveCategorySlice);
  const sliceEndpoint = new SliceEndpoint() as InstanceType<typeof SliceEndpoint> & Record<string, unknown>;
  sliceEndpoint.serverResolverTestItemService = { queryInCategory: (category: string) => ({ category }) };
  const { registry } = withFakeWebsocket();
  const live = getDefaultLiveRegistry();
  live.sliceCls.set(LiveCategorySlice.baseName, LiveCategorySlice as never);
  live.service.set("serverResolverTestItem", {
    listenPost: () => undefined,
    __databaseModel: { __store: makeTextStore() },
  } as never);
  SignalResolver.registerLiveSync(LiveCategorySlice, { registry, live });
  const route = resolveWith(SliceEndpoint, sliceEndpoint as never, { registry, live }).wsRoutes
    .serverResolverTestItemLiveInCategory;
  return { registry, live, route };
};

const resolveWith = (
  Endpoint: Parameters<typeof SignalResolver.resolveEndpoint>[0],
  instance: Parameters<typeof SignalResolver.resolveEndpoint>[1],
  {
    registry = getDefaultInjectRegistry(),
    live = getDefaultLiveRegistry(),
    middleware = new Map(),
  }: Partial<Parameters<typeof SignalResolver.resolveEndpoint>[2]> = {},
) => SignalResolver.resolveEndpoint(Endpoint, instance, { registry, env: makeEnv(), live, middleware });

const makeTestEndpoint = () =>
  Object.assign(new ServerResolverTestEndpoint(), { serverResolverTestItemService: new ServerResolverTestService() });

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
