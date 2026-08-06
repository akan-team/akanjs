import { beforeEach, describe, expect, test } from "bun:test";
import { dayjs, INJECT_META, Int } from "akanjs/base";
import { ConstantRegistry, via } from "akanjs/constant";
import { by, type DatabaseCls, DatabaseRegistry, from, getFilterInfoByKey, into } from "akanjs/document";
import type { ServerSignal, ServerSignalCls } from "akanjs/signal";
import { type Adaptor, type AdaptorCls, adapt, dangerouslyAdapt } from "./adapt";
import { getDefaultInjectRegistry, InjectInfo, injectionBuilder } from "./injectInfo";
import type { CacheAdaptor, CacheSetOptions } from "./predefinedAdaptor";
import { type Service, serve } from "./serve";
import { ServiceModel } from "./serviceModule";
import type { DatabaseService } from "./types";

type Equal<Left, Right> =
  (<Type>() => Type extends Left ? 1 : 2) extends <Type>() => Type extends Right ? 1 : 2 ? true : false;
type Expect<Type extends true> = Type;

const TestItemInput = via((f) => ({
  title: f(String),
  category: f(String).optional(),
  score: f(Int, { default: 0 }),
}));
const TestItemObject = via(TestItemInput, (f) => ({
  note: f(String).optional(),
}));
const TestItemLight = via(TestItemObject, ["title"] as const, (f) => ({
  label: f(String),
}));
const TestItemFull = via(TestItemObject, TestItemLight, (f) => ({
  searchable: f(String),
}));
const TestItemInsight = via(TestItemFull, (f) => ({
  count: f(Int, { default: 0, accumulate: {} }),
}));
const testItemConstant = ConstantRegistry.buildModel(
  "serviceTestItem",
  TestItemInput,
  TestItemObject,
  TestItemFull,
  TestItemLight,
  TestItemInsight,
  { TestItemInput, TestItemObject, TestItemFull, TestItemLight, TestItemInsight },
);

class TestItemFilter extends from(TestItemFull, (filter) => ({
  query: {
    inCategory: filter()
      .opt("category", String)
      .query((category) => ({ category })),
    withMeta: filter()
      .arg("meta", Object)
      .query((meta) => ({ meta })),
  },
  sort: {
    scoreHigh: { score: -1 },
  },
})) {}

class TestItemDoc extends by(TestItemFull) {}

class TestItemModel extends into(TestItemDoc, TestItemFilter, testItemConstant, () => ({})) {}

const testItemDatabase = DatabaseRegistry.buildModel(
  "serviceTestItem",
  TestItemInput as unknown as DatabaseCls<InstanceType<typeof TestItemInput>>,
  TestItemDoc,
  TestItemModel,
  TestItemObject,
  TestItemInsight,
  TestItemFilter,
);

const PromoteParentInput = via((f) => ({
  name: f(String),
}));
const PromoteParentObject = via(PromoteParentInput, (f) => ({}));
const PromoteParentLight = via(PromoteParentObject, ["name"] as const, (f) => ({}));
const PromoteParentFull = via(PromoteParentObject, PromoteParentLight, (f) => ({}));
const PromoteParentInsight = via(PromoteParentFull, (f) => ({}));
const promoteParentConstant = ConstantRegistry.buildModel(
  "serviceTestPromoteParent",
  PromoteParentInput,
  PromoteParentObject,
  PromoteParentFull,
  PromoteParentLight,
  PromoteParentInsight,
  { PromoteParentInput, PromoteParentObject, PromoteParentFull, PromoteParentLight, PromoteParentInsight },
);
class PromoteParentFilter extends from(PromoteParentFull, () => ({ query: {}, sort: {} })) {}
class PromoteParentDoc extends by(PromoteParentFull) {}
class PromoteParentModel extends into(PromoteParentDoc, PromoteParentFilter, promoteParentConstant, () => ({})) {}
const promoteParentDatabase = DatabaseRegistry.buildModel(
  "serviceTestPromoteParent",
  PromoteParentInput as unknown as DatabaseCls<InstanceType<typeof PromoteParentInput>>,
  PromoteParentDoc,
  PromoteParentModel,
  PromoteParentObject,
  PromoteParentInsight,
  PromoteParentFilter,
);

const PromoteChildInput = via((f) => ({
  name: f(String),
  extra: f(String).optional(),
}));
const PromoteChildObject = via(PromoteChildInput, (f) => ({}));
const PromoteChildLight = via(PromoteChildObject, ["name", "extra"] as const, (f) => ({}));
const PromoteChildFull = via(PromoteChildObject, PromoteChildLight, (f) => ({}));
const PromoteChildInsight = via(PromoteChildFull, (f) => ({}));
const promoteChildConstant = ConstantRegistry.buildModel(
  "serviceTestPromoteChild",
  PromoteChildInput,
  PromoteChildObject,
  PromoteChildFull,
  PromoteChildLight,
  PromoteChildInsight,
  { PromoteChildInput, PromoteChildObject, PromoteChildFull, PromoteChildLight, PromoteChildInsight },
);
class PromoteChildFilter extends from(PromoteChildFull, () => ({ query: {}, sort: {} })) {}
class PromoteChildDoc extends by(PromoteChildFull) {}
class PromoteChildModel extends into(PromoteChildDoc, PromoteChildFilter, promoteChildConstant, () => ({})) {}
const promoteChildDatabase = DatabaseRegistry.buildModel(
  "serviceTestPromoteChild",
  PromoteChildInput as unknown as DatabaseCls<InstanceType<typeof PromoteChildInput>>,
  PromoteChildDoc,
  PromoteChildModel,
  PromoteChildObject,
  PromoteChildInsight,
  PromoteChildFilter,
);

class PromoteParentService extends serve(promoteParentDatabase, () => ({})) {
  async getPromotedParentDoc() {
    return await this.getServiceTestPromoteParent("parent");
  }
  async listPromotedParentDocs() {
    return [await this.getServiceTestPromoteParent("parent")];
  }
}
class PromoteChildService extends serve(promoteChildDatabase, () => ({}), PromoteParentService) {}
type _PromotedLibServiceReturnAssertions = [
  Expect<Equal<Awaited<ReturnType<PromoteChildService["getPromotedParentDoc"]>>, PromoteChildDoc>>,
  Expect<Equal<Awaited<ReturnType<PromoteChildService["listPromotedParentDocs"]>>, PromoteChildDoc[]>>,
];

type TestDoc = { id: string; title: string; category?: string | null; score?: number; note?: string | null };
type CallRecord = { method: string; args: unknown[] };
type TestItemDocInstance = InstanceType<typeof TestItemDoc>;
type TestItemDataInput = Parameters<DatabaseService["__libsPreCreate"]>[0];
type TestHookServiceCls = { prototype: object };

const makeFakeDatabaseModel = () => {
  const calls: CallRecord[] = [];
  const doc = { id: "doc-1", title: "Alpha", category: "notice", score: 10 };
  const model = {
    calls,
    async __get(id: string) {
      calls.push({ method: "__get", args: [id] });
      return { ...doc, id };
    },
    async __load(id?: string) {
      calls.push({ method: "__load", args: [id] });
      return id ? { ...doc, id } : null;
    },
    async __loadMany(ids: string[]) {
      calls.push({ method: "__loadMany", args: [ids] });
      return ids.map((id) => ({ ...doc, id }));
    },
    async __create(data: Record<string, unknown>) {
      calls.push({ method: "__create", args: [data] });
      return { ...doc, ...data, id: "created" };
    },
    async __update(id: string, data: Record<string, unknown>) {
      calls.push({ method: "__update", args: [id, data] });
      return { ...doc, ...data, id };
    },
    async __remove(id: string) {
      calls.push({ method: "__remove", args: [id] });
      return { ...doc, id, removed: true };
    },
    async __list(query: unknown, queryOption?: unknown) {
      calls.push({ method: "__list", args: [query, queryOption] });
      return [doc];
    },
    async __listIds(query: unknown, queryOption?: unknown) {
      calls.push({ method: "__listIds", args: [query, queryOption] });
      return [doc.id];
    },
    async __find(query: unknown, queryOption?: unknown) {
      calls.push({ method: "__find", args: [query, queryOption] });
      return doc;
    },
    async __findId(query: unknown, queryOption?: unknown) {
      calls.push({ method: "__findId", args: [query, queryOption] });
      return doc.id;
    },
    async __pick(query: unknown, queryOption?: unknown) {
      calls.push({ method: "__pick", args: [query, queryOption] });
      return doc;
    },
    async __pickId(query: unknown, queryOption?: unknown) {
      calls.push({ method: "__pickId", args: [query, queryOption] });
      return doc.id;
    },
    async __exists(query: unknown) {
      calls.push({ method: "__exists", args: [query] });
      return doc.id;
    },
    async __count(query: unknown) {
      calls.push({ method: "__count", args: [query] });
      return 1;
    },
    async __insight(query: unknown) {
      calls.push({ method: "__insight", args: [query] });
      return { count: 1 };
    },
    listenPre(type: string, listener: unknown) {
      calls.push({ method: "listenPre", args: [type, listener] });
      return () => calls.push({ method: "unlistenPre", args: [type] });
    },
    listenPost(type: string, listener: unknown) {
      calls.push({ method: "listenPost", args: [type, listener] });
      return () => calls.push({ method: "unlistenPost", args: [type] });
    },
  };
  return model;
};

const dbMethods = ServiceModel.getDefaultDbServiceMethods("ServiceTestItem");
const filterMethods = ServiceModel.getFilterServiceMethods(
  "inCategory",
  getFilterInfoByKey(TestItemFilter, "inCategory").queryFn as (...args: unknown[]) => Record<string, unknown>,
);
const metaFilterMethods = ServiceModel.getFilterServiceMethods(
  "withMeta",
  getFilterInfoByKey(TestItemFilter, "withMeta").queryFn as (...args: unknown[]) => Record<string, unknown>,
);
type ServiceInstance = Service &
  DatabaseService &
  typeof dbMethods &
  typeof filterMethods &
  typeof metaFilterMethods & {
    childToken?: string;
    childOnlyMethod?: () => string;
    parentCallsChildMethod?: () => string;
    parentReadsChildProperty?: () => string | undefined;
    parentCallsChildDbHelper?: (id: string) => Promise<TestDoc>;
    parentReturnsDoc?: () => Promise<TestDoc>;
    parentReturnsDocs?: () => Promise<TestDoc[]>;
    childCallsParent?: () => string;
    collision?: () => string;
    secondParentMethod?: () => string;
  };
type RuntimeServiceInstance = ServiceInstance & Record<string, (...args: unknown[]) => unknown>;

const installDatabaseMethods = (instance: object, fakeDb = makeFakeDatabaseModel()) => {
  Object.entries({ ...dbMethods, ...filterMethods, ...metaFilterMethods }).forEach(([key, value]) => {
    if (key.startsWith("_") && key in instance) return;
    Object.assign(instance, { [key]: value });
  });
  Object.defineProperty(instance, "__databaseModel", { value: fakeDb, configurable: true, enumerable: true });
  Object.defineProperty(instance, "serviceTestItemModel", { value: fakeDb, configurable: true, enumerable: true });
  return fakeDb;
};
const setTestHook = (srv: TestHookServiceCls, key: string, hook: (...args: never[]) => unknown) => {
  Object.defineProperty(srv.prototype, key, { value: hook, configurable: true });
};

const originalServerMode = process.env.SERVER_MODE;
const originalNodeEnv = process.env.NODE_ENV;

beforeEach(() => {
  process.env.SERVER_MODE = originalServerMode;
  process.env.NODE_ENV = originalNodeEnv;
});

describe("adapt and serve factories", () => {
  test("creates adaptor classes with metadata and lifecycle defaults", async () => {
    const TestAdaptor = adapt("serviceTestAdaptor", ({ env }) => ({
      token: env((env: { token: string }) => env.token),
    }));
    const DangerousAdaptor = dangerouslyAdapt("serviceTestDangerous", ({ service }) => ({
      otherService: service<Service>(),
    }));

    expect(TestAdaptor.refName).toBe("serviceTestAdaptor");
    expect(TestAdaptor[INJECT_META].token.type).toBe("env");
    expect(DangerousAdaptor[INJECT_META].otherService.type).toBe("service");

    const adaptor = new TestAdaptor();

    expect(adaptor.logger).toBeDefined();
    await expect(adaptor.onInit()).resolves.toBeUndefined();
    await expect(adaptor.onDestroy()).resolves.toBeUndefined();
  });

  test("creates plain services with lowerlized names, enabled flags, and lifecycle mixins", async () => {
    const calls: string[] = [];
    class ParentOne extends serve("parentOne" as const, () => ({})) {
      override async onInit() {
        calls.push("parentOne:init");
      }
      override async onDestroy() {
        calls.push("parentOne:destroy");
      }
      parentOneMethod() {
        return "parent-one";
      }
    }
    class ParentTwo extends serve("parentTwo" as const, () => ({})) {
      override async onInit() {
        calls.push("parentTwo:init");
      }
    }
    process.env.SERVER_MODE = "batch";
    class ChildService extends serve(
      "ServiceTestChild" as const,
      { serverMode: "batch" },
      ({ use }) => ({ childUse: use<string>() }),
      ParentOne,
      ParentTwo,
    ) {
      override async onInit() {
        calls.push("child:init");
      }
      override async onDestroy() {
        calls.push("child:destroy");
      }
      childMethod() {
        return (this as unknown as ServiceInstance).parentOneMethod?.();
      }
    }

    const child = new ChildService();

    expect(ChildService.refName as string).toBe("serviceTestChild");
    expect(ChildService.type).toBe("plain");
    expect(ChildService.enabled).toBe(true);
    expect(ChildService[INJECT_META].childUse.type).toBe("use");
    expect(child.childMethod()).toBe("parent-one");

    await child._libsOnInit();
    await child._libsOnDestroy();

    expect(calls).toEqual(["parentOne:init", "parentTwo:init", "child:init", "parentOne:destroy", "child:destroy"]);
  });

  test("creates database services with database injection metadata", () => {
    class DbService extends serve(testItemDatabase, () => ({})) {}
    const injectMeta = DbService[INJECT_META] as Record<string, InjectInfo>;

    expect(DbService.refName).toBe("serviceTestItem");
    expect(DbService.type).toBe("database");
    expect(injectMeta.serviceTestItemModel?.type).toBe("database");
    expect(injectMeta.__databaseModel?.type).toBe("database");
  });
});

describe("service extension contracts", () => {
  class ParentService extends serve(testItemDatabase, ({ use }) => ({ parentUse: use<string>() })) {
    parentCallsChildMethod() {
      return (this as unknown as ServiceInstance).childOnlyMethod?.();
    }
    parentReadsChildProperty() {
      return (this as unknown as ServiceInstance).childToken;
    }
    async parentCallsChildDbHelper(id: string) {
      return await (this as unknown as ServiceInstance).getServiceTestItem(id);
    }
    async parentReturnsDoc() {
      return await (this as unknown as ServiceInstance).getServiceTestItem("parent-doc");
    }
    async parentReturnsDocs() {
      return await (this as unknown as ServiceInstance).listInCategory("notice");
    }
    collision() {
      return "parent";
    }
  }

  class SecondParentService extends serve(testItemDatabase, () => ({})) {
    secondParentMethod() {
      return "second-parent";
    }
  }

  class ChildService extends serve(
    testItemDatabase,
    ({ use }) => ({ childUse: use<string>() }),
    ParentService,
    SecondParentService,
  ) {
    childToken = "child-token";
    childOnlyMethod() {
      return "child-only";
    }
    childCallsParent() {
      const self = this as unknown as ServiceInstance;
      return `${self.parentCallsChildMethod?.()}:${self.secondParentMethod?.()}`;
    }
    override collision = () => "child";
  }

  test("parent methods run with the final child instance as this", async () => {
    const child = new ChildService() as unknown as ServiceInstance;
    const fakeDb = installDatabaseMethods(child);

    expect(child.parentCallsChildMethod?.()).toBe("child-only");
    expect(child.parentReadsChildProperty?.()).toBe("child-token");
    expect(await child.parentCallsChildDbHelper?.("id-1")).toMatchObject({ id: "id-1", title: "Alpha" });
    expect(child.childCallsParent?.()).toBe("child-only:second-parent");
    expect(child.collision?.()).toBe("child");
    expect(await child.parentReturnsDoc?.()).toMatchObject({ id: "parent-doc" });
    expect(await child.parentReturnsDocs?.()).toEqual([{ id: "doc-1", title: "Alpha", category: "notice", score: 10 }]);
    expect(fakeDb.calls.map((call) => call.method)).toEqual(["__get", "__get", "__list"]);
  });
});

describe("database service hook chains", () => {
  test("composes sync and async parent hooks around generated CRUD methods", async () => {
    const calls: string[] = [];
    class SyncParent extends serve(testItemDatabase, () => ({})) {}
    setTestHook(SyncParent, "_preCreate", ((data: TestItemDataInput) => {
      calls.push("sync:preCreate");
      return { ...data, syncPreCreate: true } as TestItemDataInput;
    }) as (...args: never[]) => unknown);
    setTestHook(SyncParent, "_postCreate", ((doc: TestItemDocInstance) => {
      calls.push("sync:postCreate");
      return { ...doc, syncPostCreate: true } as typeof doc;
    }) as (...args: never[]) => unknown);
    setTestHook(SyncParent, "_preUpdate", ((id: string, data: Partial<TestItemDocInstance>) => {
      calls.push(`sync:preUpdate:${id}`);
      return { ...data, syncPreUpdate: true } as typeof data;
    }) as (...args: never[]) => unknown);
    setTestHook(SyncParent, "_postUpdate", ((doc: TestItemDocInstance) => {
      calls.push("sync:postUpdate");
      return { ...doc, syncPostUpdate: true } as typeof doc;
    }) as (...args: never[]) => unknown);
    setTestHook(SyncParent, "_preRemove", ((id: string) => {
      calls.push(`sync:preRemove:${id}`);
    }) as (...args: never[]) => unknown);
    setTestHook(SyncParent, "_postRemove", ((doc: TestItemDocInstance) => {
      calls.push("sync:postRemove");
      return { ...doc, syncPostRemove: true } as typeof doc;
    }) as (...args: never[]) => unknown);
    class AsyncParent extends serve(testItemDatabase, () => ({})) {}
    setTestHook(AsyncParent, "_preCreate", (async (data: TestItemDataInput) => {
      calls.push("async:preCreate");
      return { ...data, asyncPreCreate: true } as TestItemDataInput;
    }) as (...args: never[]) => unknown);
    setTestHook(AsyncParent, "_postCreate", (async (doc: TestItemDocInstance) => {
      calls.push("async:postCreate");
      return { ...doc, asyncPostCreate: true } as typeof doc;
    }) as (...args: never[]) => unknown);
    class Child extends serve(testItemDatabase, () => ({}), SyncParent, AsyncParent) {}
    setTestHook(Child, "_preCreate", ((data: TestItemDataInput) => {
      calls.push("child:preCreate");
      return { ...data, childPreCreate: true } as TestItemDataInput;
    }) as (...args: never[]) => unknown);
    setTestHook(Child, "_postCreate", ((doc: TestItemDocInstance) => {
      calls.push("child:postCreate");
      return { ...doc, childPostCreate: true } as typeof doc;
    }) as (...args: never[]) => unknown);
    const child = new Child() as unknown as ServiceInstance;
    const fakeDb = installDatabaseMethods(child);

    const created = await child.createServiceTestItem({ title: "Created" } as never);
    const updated = await child.updateServiceTestItem("u-1", { title: "Updated" } as never);
    const removed = await child.removeServiceTestItem("r-1");

    expect(created).toMatchObject({
      syncPreCreate: true,
      asyncPreCreate: true,
      childPreCreate: true,
      syncPostCreate: true,
      asyncPostCreate: true,
      childPostCreate: true,
    });
    expect(updated).toMatchObject({ syncPreUpdate: true, syncPostUpdate: true });
    expect(removed).toMatchObject({ removed: true, syncPostRemove: true });
    expect(fakeDb.calls.find((call) => call.method === "__create")?.args[0]).toMatchObject({
      syncPreCreate: true,
      asyncPreCreate: true,
      childPreCreate: true,
    });
    expect(calls).toEqual([
      "sync:preCreate",
      "async:preCreate",
      "child:preCreate",
      "sync:postCreate",
      "async:postCreate",
      "child:postCreate",
      "sync:preUpdate:u-1",
      "sync:postUpdate",
      "sync:preRemove:r-1",
      "sync:postRemove",
    ]);
  });

  test("propagates parent hook errors before writes continue", async () => {
    class ThrowingParent extends serve(testItemDatabase, () => ({})) {}
    setTestHook(ThrowingParent, "_preCreate", ((data: TestItemDataInput) => {
      void data;
      throw new Error("parent pre create failed");
    }) as (...args: never[]) => unknown);
    class Child extends serve(testItemDatabase, () => ({}), ThrowingParent) {}
    const child = new Child() as unknown as ServiceInstance;
    const fakeDb = installDatabaseMethods(child);

    await expect(child.createServiceTestItem({ title: "Never" } as never)).rejects.toThrow("parent pre create failed");
    expect(fakeDb.calls.some((call) => call.method === "__create")).toBe(false);
  });
});

describe("dependency injection resolution", () => {
  const makeFakeCache = () => {
    const values = new Map<string, unknown>();
    const hashValues = new Map<string, Map<string, unknown>>();
    const calls: CallRecord[] = [];
    const cache = {
      calls,
      async get(topic: string, key: string) {
        calls.push({ method: "get", args: [topic, key] });
        return values.has(`${topic}:${key}`) ? values.get(`${topic}:${key}`) : null;
      },
      async set(topic: string, key: string, value: unknown, option?: CacheSetOptions) {
        calls.push({ method: "set", args: [topic, key, value, option] });
        values.set(`${topic}:${key}`, value);
      },
      async delete(topic: string, key: string) {
        calls.push({ method: "delete", args: [topic, key] });
        values.delete(`${topic}:${key}`);
      },
      async hget(topic: string, prop: string, key: string) {
        calls.push({ method: "hget", args: [topic, prop, key] });
        return hashValues.get(`${topic}:${prop}`)?.get(key);
      },
      async hset(topic: string, prop: string, key: string, value: unknown, option?: CacheSetOptions) {
        calls.push({ method: "hset", args: [topic, prop, key, value, option] });
        const hashKey = `${topic}:${prop}`;
        const map = hashValues.get(hashKey) ?? new Map<string, unknown>();
        map.set(key, value);
        hashValues.set(hashKey, map);
      },
      async hdelete(topic: string, prop: string, key: string) {
        calls.push({ method: "hdelete", args: [topic, prop, key] });
        hashValues.get(`${topic}:${prop}`)?.delete(key);
      },
      async hkeys(topic: string, prop: string) {
        calls.push({ method: "hkeys", args: [topic, prop] });
        return [...(hashValues.get(`${topic}:${prop}`)?.keys() ?? [])];
      },
      async hentries(topic: string, prop: string) {
        calls.push({ method: "hentries", args: [topic, prop] });
        return [...(hashValues.get(`${topic}:${prop}`)?.entries() ?? [])];
      },
      async hclear(topic: string, prop: string) {
        calls.push({ method: "hclear", args: [topic, prop] });
        hashValues.delete(`${topic}:${prop}`);
      },
    };
    return cache as CacheAdaptor & { calls: CallRecord[] };
  };

  test("validates memory injection options", () => {
    const builder = injectionBuilder("serviceTestInject");

    expect(() => builder.memory(String, { local: true, get: (value: string) => value, set: (value) => value })).toThrow(
      "get and set should not be provided",
    );
    expect(() => builder.memory(String, { get: (value: string) => value })).toThrow("get and set should be both");
    expect(() => builder.memory(Map)).toThrow("of should be provided");
  });

  test("resolves use, env, plug, service, database, signal, and memory injections", async () => {
    const cache = makeFakeCache();
    class CacheAdaptorRef extends adapt("solidCache") {}
    class PlugAdaptor extends adapt("serviceTestPlug") {
      value = "plug-value";
    }
    class DepService extends serve("dep" as const, () => ({})) {
      dep = "service-value";
    }
    class SignalRef {}
    const signal = { ping: () => "pong" } as unknown as ServerSignal;
    const database = makeFakeDatabaseModel();
    const registry = getDefaultInjectRegistry();
    const cacheAdaptor = cache as unknown as Adaptor;
    const plugAdaptor = new PlugAdaptor() as unknown as PlugAdaptor & Adaptor;
    const depService = new DepService();
    const defaultExpireAt = dayjs().add(1, "hour");

    registry.uses.set("plainUse", "use-value");
    registry.adaptorCls.set("solidCache", CacheAdaptorRef);
    registry.adaptor.set(CacheAdaptorRef, cacheAdaptor);
    registry.adaptor.set(PlugAdaptor as unknown as AdaptorCls, plugAdaptor);
    registry.serviceCls.set("dep", DepService);
    registry.service.set(DepService, depService);
    registry.serverSignalCls.set("testSignal", SignalRef as unknown as ServerSignalCls);
    registry.serverSignal.set(SignalRef as unknown as ServerSignalCls, signal);
    registry.adaptorCls.set(
      "serviceTestItemModel",
      class ServiceTestItemModelAdaptor extends adapt("serviceTestItemModel") {},
    );
    const dbAdaptorCls = registry.adaptorCls.get("serviceTestItemModel") as AdaptorCls;
    registry.adaptor.set(dbAdaptorCls, database as unknown as Adaptor);

    class TargetService extends serve("serviceTestTarget" as const, ({ use, env, plug, service, signal, memory }) => ({
      plainUse: use<string>(),
      envValue: env((env: { envValue: string }) => env.envValue),
      plugValue: plug(PlugAdaptor as unknown as AdaptorCls<PlugAdaptor & Adaptor>, (adaptor) => adaptor.value),
      depService: service<DepService>(),
      testSignal: signal<typeof signal>(),
      localCounter: memory(Int, { local: true, default: 3 }),
      remoteValue: memory(String, { expireAt: defaultExpireAt }),
      remoteMap: memory(Map, { of: String, expireAt: defaultExpireAt }),
    })) {}
    Object.assign(TargetService[INJECT_META], {
      serviceTestItemModel: new InjectInfo("database", { parentRefName: "serviceTestItem" }),
    });
    const instance = new TargetService() as TargetService & {
      plainUse: string;
      envValue: string;
      plugValue: string;
      depService: DepService;
      testSignal: typeof signal;
      localCounter: number;
      remoteValue: {
        get: () => Promise<string | null>;
        set: (value: string, option?: CacheSetOptions) => Promise<void>;
        delete: () => Promise<void>;
      };
      remoteMap: {
        get: (key: string) => Promise<string | undefined>;
        set: (key: string, value: string, option?: CacheSetOptions) => Promise<void>;
        delete: (key: string) => Promise<void>;
        getOrInsert: (key: string, value: string, option?: CacheSetOptions) => Promise<string>;
        getOrInsertComputed: (
          key: string,
          compute: (key: string) => string | Promise<string>,
          option?: CacheSetOptions,
        ) => Promise<string>;
        keys: () => Promise<string[]>;
        entries: () => Promise<[string, string][]>;
        forEach: (callback: (value: string, key: string) => void | Promise<void>) => Promise<void>;
        clear: () => Promise<void>;
      };
      serviceTestItemModel: typeof database;
    };
    type RemoteMapGetValue = Awaited<ReturnType<TargetService["remoteMap"]["get"]>>;
    type _RemoteMapGetReturnsOptionalString = Expect<Equal<RemoteMapGetValue, string | undefined>>;
    type RemoteMapEntriesValue = Awaited<ReturnType<TargetService["remoteMap"]["entries"]>>;
    type _RemoteMapEntriesReturnsStringTuples = Expect<Equal<RemoteMapEntriesValue, [string, string][]>>;
    type RemoteMapSetOption = Parameters<TargetService["remoteMap"]["set"]>[2];
    type _RemoteMapSetAcceptsCacheOption = Expect<Equal<RemoteMapSetOption, CacheSetOptions | undefined>>;

    await InjectInfo.resolveInjection(instance, TargetService, registry, { envValue: "env-value" } as never);

    expect(instance.plainUse).toBe("use-value");
    expect(instance.envValue).toBe("env-value");
    expect(instance.plugValue as string).toBe("plug-value");
    expect(instance.depService).toBe(depService);
    expect(instance.testSignal as ServerSignal).toBe(signal);
    expect(instance.localCounter).toBe(3);
    instance.localCounter = 4;
    expect(instance.localCounter).toBe(4);
    expect(instance.serviceTestItemModel).toBe(database);

    await instance.remoteValue.set("hello");
    let lastCacheCall = cache.calls.at(-1);
    expect(lastCacheCall?.method).toBe("set");
    expect(lastCacheCall?.args.slice(0, 3)).toEqual(["akan:memory", "remoteValue", "hello"]);
    expect(lastCacheCall?.args[3]).toEqual({ expireAt: defaultExpireAt });
    expect(await instance.remoteValue.get()).toBe("hello");
    await instance.remoteValue.delete();
    expect(await instance.remoteValue.get()).toBeNull();
    const setOption = { expireAt: dayjs().add(2, "hour") };
    await instance.remoteMap.set("ko", "안녕", setOption);
    lastCacheCall = cache.calls.at(-1);
    expect(lastCacheCall?.method).toBe("hset");
    expect(lastCacheCall?.args.slice(0, 4)).toEqual(["akan:memory:serviceTestTarget", "remoteMap", "ko", "안녕"]);
    expect(lastCacheCall?.args[4]).toBe(setOption);
    expect(await instance.remoteMap.get("ko")).toBe("안녕");
    await instance.remoteMap.delete("ko");
    expect(await instance.remoteMap.get("ko")).toBeUndefined();
    expect(await instance.remoteMap.getOrInsert("ko", "다시 안녕")).toBe("다시 안녕");
    expect(cache.calls.at(-1)?.args[4]).toEqual({ expireAt: defaultExpireAt });
    const hsetCountAfterInsert = cache.calls.filter((call) => call.method === "hset").length;
    expect(await instance.remoteMap.getOrInsert("ko", "덮어쓰기")).toBe("다시 안녕");
    expect(cache.calls.filter((call) => call.method === "hset")).toHaveLength(hsetCountAfterInsert);
    const computedOption = { expireAt: dayjs().add(3, "hour") };
    expect(await instance.remoteMap.getOrInsertComputed("en", async (key) => `hello:${key}`, computedOption)).toBe(
      "hello:en",
    );
    expect(cache.calls.at(-1)?.args[4]).toBe(computedOption);
    const hsetCountAfterComputed = cache.calls.filter((call) => call.method === "hset").length;
    expect(await instance.remoteMap.getOrInsertComputed("en", () => "overwrite")).toBe("hello:en");
    expect(cache.calls.filter((call) => call.method === "hset")).toHaveLength(hsetCountAfterComputed);
    expect(await instance.remoteMap.keys()).toEqual(["ko", "en"]);
    expect(await instance.remoteMap.entries()).toEqual([
      ["ko", "다시 안녕"],
      ["en", "hello:en"],
    ]);
    const seen: string[] = [];
    await instance.remoteMap.forEach((value, key) => {
      seen.push(`${key}:${value}`);
    });
    expect(seen).toEqual(["ko:다시 안녕", "en:hello:en"]);
    await instance.remoteMap.clear();
    expect(await instance.remoteMap.keys()).toEqual([]);
    expect(cache.calls.map((call) => call.method)).toContain("hdelete");
    expect(cache.calls.map((call) => call.method)).toContain("hclear");

    expect(Object.getOwnPropertyDescriptor(instance, "plainUse")).toMatchObject({ enumerable: true, writable: false });
  });

  test("throws meaningful errors for missing or badly named injections", async () => {
    const registry = getDefaultInjectRegistry();
    class BadServiceKey extends serve("badServiceKey" as const, () => ({})) {}
    Object.assign(BadServiceKey[INJECT_META], { dep: injectionBuilder("badServiceKey").service<Service>() });

    await expect(
      InjectInfo.resolveInjection(new BadServiceKey(), BadServiceKey, registry, {} as never),
    ).rejects.toThrow("Service inject key must end");

    class BadSignalKey extends serve("badSignalKey" as const, () => ({})) {}
    Object.assign(BadSignalKey[INJECT_META], { dep: injectionBuilder("badSignalKey").signal<ServerSignal>() });

    await expect(InjectInfo.resolveInjection(new BadSignalKey(), BadSignalKey, registry, {} as never)).rejects.toThrow(
      "Signal inject key must end",
    );

    class MissingUse extends serve("missingUse" as const, ({ use }) => ({ missing: use<string>() })) {}
    await expect(InjectInfo.resolveInjection(new MissingUse(), MissingUse, registry, {} as never)).rejects.toThrow(
      'use "missing" has not been initialized',
    );

    class MissingMemory extends serve("missingMemory" as const, ({ memory }) => ({ value: memory(String) })) {}
    await expect(
      InjectInfo.resolveInjection(new MissingMemory(), MissingMemory, registry, {} as never),
    ).rejects.toThrow("Cache adaptor role is not registered");
  });
});

describe("ServiceModel generated methods", () => {
  test("creates service modules and merges srv maps", () => {
    class BaseSrv extends serve("baseSrv" as const, () => ({})) {}
    class OtherSrv extends serve("otherSrv" as const, () => ({})) {}

    const base = ServiceModel.from(BaseSrv);
    const other = ServiceModel.from(OtherSrv);
    const merged = base.with(other);
    const model = ServiceModel.fromModel(BaseSrv, testItemConstant, testItemDatabase);

    expect(base.srv).toBe(BaseSrv);
    expect(Object.keys(base.srvMap)).toEqual(["baseSrvService"]);
    expect(Object.keys(merged.srvMap).sort()).toEqual(["baseSrvService", "otherSrvService"]);
    expect(model.cnst).toBe(testItemConstant);
    expect(model.db).toBe(testItemDatabase);
  });

  test("delegates generated CRUD methods to database model", async () => {
    const fakeDb = makeFakeDatabaseModel();
    const service = { __databaseModel: fakeDb } as unknown as RuntimeServiceInstance;
    Object.assign(service, dbMethods);

    expect(await service.getServiceTestItem("g-1")).toMatchObject({ id: "g-1" });
    expect(await service.loadServiceTestItem("l-1")).toMatchObject({ id: "l-1" });
    expect(await service.loadServiceTestItemMany(["a", "b"])).toHaveLength(2);
    expect(fakeDb.calls.map((call) => call.method)).toEqual(["__get", "__load", "__loadMany"]);
  });

  test("delegates listener registration to database model", () => {
    const fakeDb = makeFakeDatabaseModel();
    const service = { __databaseModel: fakeDb } as unknown as RuntimeServiceInstance;
    Object.assign(service, dbMethods);
    const listener = () => undefined;

    const unlistenPre = service.listenPre("save", listener);
    const unlistenPost = service.listenPost("save", listener);
    unlistenPre();
    unlistenPost();

    expect(fakeDb.calls.map((call) => call.method)).toEqual(["listenPre", "listenPost", "unlistenPre", "unlistenPost"]);
  });
});

describe("filter query and sort utility methods", () => {
  test("generates all filter utility methods from a FilterInfo query", async () => {
    const fakeDb = makeFakeDatabaseModel();
    const service = { __databaseModel: fakeDb } as unknown as RuntimeServiceInstance;
    Object.assign(service, dbMethods, filterMethods);

    expect(service.queryInCategory("notice")).toEqual({ category: "notice" });
    expect(service.queryInCategory(undefined)).toEqual({ category: undefined });
    expect(await service.listInCategory("notice", { limit: 2, sort: "scoreHigh" })).toHaveLength(1);
    expect(await service.listIdsInCategory("notice", { skip: 1 })).toEqual(["doc-1"]);
    expect(await service.findInCategory("notice", { select: { title: true } })).toMatchObject({
      title: "Alpha",
    });
    expect(await service.findIdInCategory("notice")).toBe("doc-1");
    expect(await service.pickInCategory("notice")).toMatchObject({ id: "doc-1" });
    expect(await service.pickIdInCategory("notice")).toBe("doc-1");
    expect(await service.existsInCategory("notice")).toBe("doc-1");
    expect(await service.countInCategory("notice")).toBe(1);
    expect(await service.insightInCategory("notice")).toEqual({ count: 1 });

    expect(fakeDb.calls).toEqual([
      { method: "__list", args: [{ category: "notice" }, { limit: 2, sort: "scoreHigh" }] },
      { method: "__listIds", args: [{ category: "notice" }, { skip: 1 }] },
      { method: "__find", args: [{ category: "notice" }, { select: { title: true } }] },
      { method: "__findId", args: [{ category: "notice" }, {}] },
      { method: "__pick", args: [{ category: "notice" }, {}] },
      { method: "__pickId", args: [{ category: "notice" }, {}] },
      { method: "__exists", args: [{ category: "notice" }] },
      { method: "__count", args: [{ category: "notice" }] },
      { method: "__insight", args: [{ category: "notice" }] },
    ]);
  });

  test("keeps final ordinary objects as query args instead of query options", async () => {
    const fakeDb = makeFakeDatabaseModel();
    const service = { __databaseModel: fakeDb } as unknown as RuntimeServiceInstance;
    Object.assign(service, dbMethods, metaFilterMethods);
    const meta = { select: "business-value", nested: { ok: true } };

    expect(service.queryWithMeta(meta)).toEqual({ meta });
    await service.listWithMeta(meta);

    expect(fakeDb.calls).toEqual([{ method: "__list", args: [{ meta }, {}] }]);
  });
});
