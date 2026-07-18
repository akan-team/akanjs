import { describe, expect, test } from "bun:test";
import { ENDPOINT_META, ID, INJECT_META, INTERNAL_META, Int, SLICE_META } from "akanjs/base";
import { ConstantRegistry, via } from "akanjs/constant";
import { by, type DatabaseCls, DatabaseRegistry, from, into, type ModelCls } from "akanjs/document";
import {
  adapt,
  type DatabaseService,
  getDefaultInjectRegistry,
  type LiveRegistry,
  ServiceModel,
  serve,
} from "akanjs/service";
import { endpoint } from "./endpoint";
import { buildEndpoint } from "./endpointInfo";
import type { Guard } from "./guard";
import { None, Public } from "./guards";
import { type Internal, internal } from "./internal";
import type { InternalArg } from "./internalArg";
import { Ws } from "./internalArg";
import { buildInternal } from "./internalInfo";
import { middleware } from "./middleware";
import { FetchSerializer } from "./serializer";
import { serverSignal } from "./serverSignal";
import { SignalContext } from "./signalContext";
import { SignalRegistry } from "./signalRegistry";
import { slice } from "./slice";
import { buildSlice } from "./sliceInfo";

const SignalTestNested = via((f) => ({
  label: f(String),
}));
ConstantRegistry.buildScalar("signalTestNested", SignalTestNested, { SignalTestNested });

const SignalTestInput = via((f) => ({
  ownerId: f(ID),
  title: f(String),
  count: f(Int, { default: 0 }),
  nested: f(SignalTestNested),
}));
const SignalTestObject = via(SignalTestInput, (f) => ({
  hiddenMemo: f.hidden(String),
  secret: f.secret(String),
  relatedId: f(ID, { ref: "signalTestRelated" }).optional(),
  relatedIds: f([ID], { ref: "signalTestRelated" }),
}));
const SignalTestLight = via(SignalTestObject, ["title"] as const, () => ({}));
const SignalTestFull = via(SignalTestObject, SignalTestLight, (f) => ({
  resolvedLabel: f(String),
}));
const SignalTestInsight = via(SignalTestFull, (f) => ({
  total: f(Int, { default: 0, accumulate: {} }),
}));
const signalTestConstant = ConstantRegistry.buildModel(
  "signalTestItem",
  SignalTestInput,
  SignalTestObject,
  SignalTestFull,
  SignalTestLight,
  SignalTestInsight,
  { SignalTestInput, SignalTestObject, SignalTestFull, SignalTestLight, SignalTestInsight },
);

const SignalTestRelatedInput = via((f) => ({
  title: f(String),
}));
const SignalTestRelatedObject = via(SignalTestRelatedInput, (f) => ({
  memo: f(String).optional(),
}));
const SignalTestRelatedLight = via(SignalTestRelatedObject, ["title"] as const, () => ({}));
const SignalTestRelatedFull = via(SignalTestRelatedObject, SignalTestRelatedLight, () => ({}));
const SignalTestRelatedInsight = via(SignalTestRelatedFull, (f) => ({
  total: f(Int, { default: 0, accumulate: {} }),
}));
ConstantRegistry.buildModel(
  "signalTestRelated",
  SignalTestRelatedInput,
  SignalTestRelatedObject,
  SignalTestRelatedFull,
  SignalTestRelatedLight,
  SignalTestRelatedInsight,
  {
    SignalTestRelatedInput,
    SignalTestRelatedObject,
    SignalTestRelatedFull,
    SignalTestRelatedLight,
    SignalTestRelatedInsight,
  },
);

class SignalTestFilter extends from(SignalTestFull, (filter) => ({
  query: {
    byOwner: filter()
      .arg("ownerId", ID, { ref: "user" })
      .query((ownerId) => ({ ownerId })),
  },
  sort: {
    titleAsc: { title: 1 },
  },
})) {}

class SignalTestDoc extends by(SignalTestFull) {}
class SignalTestModel extends into(
  SignalTestDoc,
  SignalTestFilter,
  signalTestConstant,
  () => ({}),
  class SignalTestModelMixin {} as unknown as ModelCls,
) {}
const signalTestDatabase = DatabaseRegistry.buildModel(
  "signalTestItem",
  SignalTestInput as unknown as DatabaseCls<InstanceType<typeof SignalTestInput>>,
  SignalTestDoc,
  SignalTestModel,
  SignalTestObject,
  SignalTestInsight,
  SignalTestFilter,
);

class SignalTestService extends serve(signalTestDatabase, () => ({})) {
  queryToOwner(ownerId: string) {
    return { ownerId };
  }
}
class SignalTestAuxService extends serve("signalTestAux" as const, () => ({})) {
  ping() {
    return "pong";
  }
}
const signalTestServiceModel = ServiceModel.fromModel(SignalTestService, signalTestConstant, signalTestDatabase).with(
  ServiceModel.from(SignalTestAuxService),
);

class TestAdmin implements Guard {
  static name = "TestAdmin";
  canPass() {
    return true;
  }
}
class TestDeny implements Guard {
  static name = "TestDeny";
  canPass() {
    return false;
  }
}
class TestInternalArg implements InternalArg<string> {
  getArg() {
    return "internal-value";
  }
}
class MissingInternalArg implements InternalArg<null> {
  getArg() {
    return null;
  }
}
class GlobalMiddleware extends middleware("global") {
  override async use() {
    return async (_context: SignalContext, next: () => Promise<unknown>) => {
      signalTestOrder.push("global:before");
      const result = await next();
      signalTestOrder.push("global:after");
      return result;
    };
  }
}
class EndpointMiddleware extends middleware("endpoint") {
  override async use() {
    return async (_context: SignalContext, next: () => Promise<unknown>) => {
      signalTestOrder.push("endpoint:before");
      const result = await next();
      signalTestOrder.push("endpoint:after");
      return result;
    };
  }
}
let signalTestOrder: string[] = [];

const makeLiveRegistry = (): LiveRegistry => ({
  adaptor: new Map(),
  adaptorCls: new Map(),
  service: new Map(),
  serviceCls: new Map(),
  endpoint: new Map(),
  endpointCls: new Map(),
  slice: new Map(),
  sliceCls: new Map(),
  internal: new Map(),
  internalCls: new Map(),
  serverSignal: new Map(),
  serverSignalCls: new Map(),
});

const makeHttpRequest = ({
  url = "http://localhost/api?ownerId=u1&ids=a&ids=b",
  params = { id: "123" },
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

const makeSignalContext = ({
  endpointInfo = buildEndpoint.query(String).exec(() => "ok"),
  request = makeHttpRequest(),
  adaptor = new (adapt("signalTestContextAdaptor"))(),
  live = makeLiveRegistry(),
  middlewareMap = new Map(),
}: {
  endpointInfo?: ReturnType<typeof buildEndpoint.query>;
  request?: Bun.BunRequest;
  adaptor?: InstanceType<ReturnType<typeof adapt>>;
  live?: LiveRegistry;
  middlewareMap?: Map<string, typeof GlobalMiddleware>;
} = {}) =>
  new SignalContext("contextKey", request, {
    endpointInfo,
    adaptor,
    registry: getDefaultInjectRegistry(),
    env: {} as never,
    live,
    middleware: middlewareMap,
  });

describe("signal metadata builders", () => {
  test("builds endpoint metadata, paths, nullable search args, and validation errors", () => {
    const endpointInfo = buildEndpoint
      .query([SignalTestFull], {
        nullable: true,
        partial: ["title"] as never,
        guards: [Public],
        path: "custom/items/:id",
      })
      .param("id", ID, { example: "abc" })
      .search("tags", [String], { example: "tag" })
      .body("input", SignalTestInput, { nullable: true })
      .with(TestInternalArg)
      .exec(() => []);

    expect(endpointInfo.type).toBe("query");
    expect(endpointInfo.argNames).toEqual(["id", "tags", "input"]);
    expect(endpointInfo.args.map((arg) => [arg.type, arg.name, arg.arrDepth, arg.option?.nullable])).toEqual([
      ["param", "id", 0, undefined],
      ["search", "tags", 1, true],
      ["body", "input", 0, true],
    ]);
    expect(endpointInfo.returns.returnRef).toBe(SignalTestFull);
    expect(endpointInfo.returns.arrDepth).toBe(1);
    expect(endpointInfo.returns.nullable).toBe(true);
    expect(endpointInfo.signalOption.partial).toEqual(["title"]);
    expect(endpointInfo.getPath("fallback")).toBe("/custom/items/:id");
    expect(buildEndpoint.query(String).param("id", ID).getPath("getOne")).toBe("/getOne/:id");
    expect(buildEndpoint.query(String, { name: "renamed" }).getPath("getOne")).toBe("/renamed");
    expect(() => buildEndpoint.query(String).body("maybe", String, { nullable: true }).param("id", ID)).toThrow(
      "Last argument is nullable",
    );
    expect(() => endpointInfo.param("late", String)).toThrow("Query function is already set");
    expect(() =>
      buildEndpoint
        .query(String)
        .exec(() => "ok")
        .exec(() => "again"),
    ).toThrow("Query function is already set");
  });

  test("builds slice metadata with query, internal args, and nullable search args", () => {
    const sliceInfo = buildSlice(
      "signalTestItem",
      SignalTestInput,
      SignalTestFull,
      SignalTestLight,
      SignalTestInsight,
      SignalTestFilter,
    )({ guards: [TestAdmin], path: "items/custom" })
      .param("ownerId", ID)
      .search("q", String)
      .with(TestInternalArg, { nullable: true })
      .exec((ownerId, q) => ({ ownerId, q }));

    expect(sliceInfo.refName).toBe("signalTestItem");
    expect(sliceInfo.args.map((arg) => [arg.type, arg.name, arg.option?.nullable])).toEqual([
      ["param", "ownerId", undefined],
      ["search", "q", true],
    ]);
    expect(sliceInfo.internalArgs[0]?.argRef).toBe(TestInternalArg);
    expect(sliceInfo.internalArgs[0]?.option?.nullable).toBe(true);
    expect(sliceInfo.signalOption.path).toBe("items/custom");
    expect(sliceInfo.execFn?.("u1", "search", null)).toEqual({ ownerId: "u1", q: "search" });
    expect(() =>
      buildSlice(
        "signalTestItem",
        SignalTestInput,
        SignalTestFull,
        SignalTestLight,
        SignalTestInsight,
        SignalTestFilter,
      )({})
        .body("maybe", String, { nullable: true })
        .param("id", ID),
    ).toThrow("Last argument is nullable");
  });

  test("builds internal scheduling metadata and default args", () => {
    const interval = buildInternal.interval(5000, { serverMode: "batch" });
    const cron = buildInternal.cron("0 * * * *", { operationMode: ["cloud"] });
    const timeout = buildInternal.timeout(1000);
    const init = buildInternal.initialize();
    const destroy = buildInternal.destroy();
    const process = buildInternal
      .process(Boolean)
      .msg("force", Boolean)
      .exec(() => true);
    const resolveField = buildInternal
      .resolveField(String)
      .with(MissingInternalArg)
      .exec((parent) => `${parent}`);

    expect(interval.signalOption).toMatchObject({
      enabled: true,
      lock: true,
      scheduleType: "interval",
      scheduleTime: 5000,
    });
    expect(cron.signalOption).toMatchObject({
      enabled: true,
      lock: true,
      scheduleType: "cron",
      scheduleCron: "0 * * * *",
    });
    expect(timeout.signalOption).toMatchObject({
      enabled: true,
      lock: true,
      scheduleType: "timeout",
      scheduleTime: 1000,
    });
    expect(init.signalOption).toMatchObject({ enabled: true, scheduleType: "init" });
    expect(destroy.signalOption).toMatchObject({ enabled: true, lock: true, scheduleType: "destroy" });
    expect(process.type).toBe("process");
    expect(process.defaultArgs).toEqual(["Job"]);
    expect(process.args[0]?.name).toBe("force");
    expect(resolveField.defaultArgs).toEqual(["Parent"]);
    expect(resolveField.internalArgs[0]?.option?.nullable).toBe(true);
  });
});

describe("signal class factories and composition", () => {
  test("creates endpoint classes and merges lib endpoint metadata and services", () => {
    class LibEndpoint extends endpoint(ServiceModel.from(SignalTestAuxService), (builder) => ({
      ping: builder.query(String).exec(() => "pong"),
    })) {}
    class MainEndpoint extends endpoint(
      signalTestServiceModel,
      (builder) => ({
        getTitle: builder
          .query(String, { guards: [Public] })
          .param("id", ID)
          .exec((id) => id),
        publish: builder
          .pubsub(SignalTestLight)
          .room("ownerId", ID)
          .exec(() => undefined),
      }),
      LibEndpoint,
    ) {}

    expect(MainEndpoint.baseName).toBe("signalTestItem");
    expect(Object.keys(MainEndpoint[ENDPOINT_META]).sort()).toEqual(["getTitle", "ping", "publish"]);
    expect(MainEndpoint[ENDPOINT_META].getTitle?.args[0]?.name).toBe("id");
    expect(MainEndpoint[ENDPOINT_META].publish?.type).toBe("pubsub");
    expect(Object.keys(MainEndpoint.srv.srvMap).sort()).toEqual(["signalTestAuxService", "signalTestItemService"]);
    expect(MainEndpoint[INJECT_META].signalTestItemService.type).toBe("service");
    expect(MainEndpoint[INJECT_META].signalTestAuxService.type).toBe("service");
  });

  test("creates internal classes and merges lib internals", () => {
    class LibInternal extends internal(ServiceModel.from(SignalTestAuxService), (builder) => ({
      auxProcess: builder.process(String).exec(() => "queued"),
    })) {}
    class MainInternal extends internal(
      signalTestServiceModel,
      (builder) => ({
        hourly: builder.cron("0 * * * *").exec(() => undefined),
        resolveLabel: builder.resolveField(String).exec((parent) => (parent as { title: string }).title),
      }),
      LibInternal,
    ) {}

    expect(MainInternal.refName).toBe("signalTestItemInternal");
    expect(Object.keys(MainInternal[INTERNAL_META]).sort()).toEqual(["auxProcess", "hourly", "resolveLabel"]);
    expect(MainInternal[INTERNAL_META].hourly?.signalOption.scheduleType).toBe("cron");
    expect(MainInternal[INTERNAL_META].auxProcess?.type).toBe("process");
    expect(Object.keys(MainInternal.srv.srvMap).sort()).toEqual(["signalTestAuxService", "signalTestItemService"]);
    expect(MainInternal[INJECT_META].schedule.type).toBe("plug");
    expect(MainInternal[INJECT_META].queue.type).toBe("plug");
  });

  test("creates slice classes with default root slice, guards, and lib slice metadata", () => {
    class LibSlice extends slice(
      signalTestServiceModel,
      { guards: { root: Public, get: None, cru: Public } },
      (init) => ({
        libOwner: init()
          .param("ownerId", ID)
          .exec((ownerId) => ({ ownerId })),
      }),
    ) {}
    class MainSlice extends slice(
      signalTestServiceModel,
      { guards: { root: TestAdmin, get: [Public, None], cru: [TestAdmin] }, prefix: "customPrefix" },
      (init) => ({
        byOwner: init()
          .param("ownerId", ID)
          .search("q", String)
          .exec((ownerId, q) => ({ ownerId, q })),
      }),
      LibSlice,
    ) {}

    expect(Object.keys(MainSlice[SLICE_META]).sort()).toEqual(["", "byOwner", "libOwner"]);
    expect(MainSlice[SLICE_META][""]?.args[0]?.name).toBe("query");
    expect(MainSlice[SLICE_META][""]?.args[0]?.option?.nullable).toBe(true);
    expect(MainSlice.getGuards.map((guard) => guard.name)).toEqual(["Public", "None"]);
    expect(MainSlice.cruGuards.map((guard) => guard.name)).toEqual(["TestAdmin"]);
    expect(Object.keys(MainSlice.srv.srvMap).sort()).toEqual(["signalTestAuxService", "signalTestItemService"]);
    expect(() => slice(ServiceModel.from(SignalTestAuxService), {}, () => ({}))).toThrow("cnst and db are required");
  });
});

describe("signal serialization and registry", () => {
  class RegistryEndpoint extends endpoint(signalTestServiceModel, (builder) => ({
    list: builder
      .query([SignalTestLight], {
        guards: [Public],
        partial: ["title"] as never,
        path: "items/list",
      })
      .search("ownerId", ID, { example: "user-1" })
      .exec(() => []),
    mutate: builder
      .mutation(SignalTestFull, { nullable: true })
      .body("input", SignalTestInput)
      .exec((input) => input as never),
  })) {}
  class RegistryInternal extends internal(signalTestServiceModel, (builder) => ({
    processItem: builder
      .process(Boolean)
      .msg("force", Boolean)
      .exec(() => true),
  })) {}
  class RegistrySlice extends slice(
    signalTestServiceModel,
    { guards: { root: Public, get: None, cru: [None] } },
    (init) => ({
      byOwner: init()
        .param("ownerId", ID)
        .exec((ownerId) => ({ ownerId })),
    }),
  ) {}
  class RegistryServerSignal extends serverSignal(RegistryEndpoint, RegistryInternal) {}

  test("serializes database and service signals", () => {
    const databaseSignal = FetchSerializer.serializeDatabaseSignal(RegistrySlice, RegistryEndpoint);
    const serviceEndpoint = endpoint(ServiceModel.from(SignalTestAuxService), (builder) => ({
      ping: builder.query(String).exec(() => "pong"),
    }));
    const serviceSignal = FetchSerializer.serializeServiceSignal(serviceEndpoint);

    expect(databaseSignal.prefix).toBe("signalTestItem");
    expect(databaseSignal.slice?.byOwner?.args[0]).toMatchObject({ type: "param", name: "ownerId", refName: "ID" });
    expect(databaseSignal.endpoint.list).toMatchObject({
      type: "query",
      path: "items/list",
      guards: ["Public"],
      returns: { refName: "signalTestItem", modelType: "light", arrDepth: 1, partial: ["title"] },
    });
    expect(databaseSignal.endpoint.list?.args[0]).toMatchObject({
      type: "search",
      name: "ownerId",
      refName: "ID",
      nullable: true,
      example: "user-1",
    });
    expect(databaseSignal.endpoint.mutate?.returns).toMatchObject({
      refName: "signalTestItem",
      modelType: "full",
      nullable: true,
    });
    expect(databaseSignal.getGuards).toBeUndefined();
    expect(databaseSignal.cruGuards).toBeUndefined();
    expect(serviceSignal).toEqual({
      endpoint: {
        ping: { type: "query", args: [], returns: { refName: "String" } },
      },
    });
  });

  test("registers signals and serializes live registry", () => {
    const databaseRegistered = SignalRegistry.registerDatabase(
      "signalTestItem" as const,
      RegistryInternal,
      RegistryEndpoint,
      RegistrySlice,
      RegistryServerSignal,
    );
    const ServiceEndpoint = endpoint(ServiceModel.from(SignalTestAuxService), (builder) => ({
      ping: builder.query(String).exec(() => "pong"),
    }));
    const ServiceInternal = internal(ServiceModel.from(SignalTestAuxService), () => ({}));
    const ServiceServer = serverSignal(ServiceEndpoint, ServiceInternal);
    const serviceRegistered = SignalRegistry.registerService(
      "signalTestAux" as const,
      ServiceInternal,
      ServiceEndpoint,
      ServiceServer,
    );
    const live = makeLiveRegistry();
    live.endpointCls.set("signalTestItem", RegistryEndpoint);
    live.sliceCls.set("signalTestItem", RegistrySlice);
    live.endpointCls.set("signalTestAux", ServiceEndpoint);

    expect(SignalRegistry.getDatabase("signalTestItem")).toBe(databaseRegistered);
    expect(SignalRegistry.getService("signalTestAux")).toBe(serviceRegistered);
    expect(databaseRegistered.serializedSignal.endpoint.list?.type).toBe("query");
    expect(serviceRegistered.serializedSignal.endpoint.ping?.returns.refName).toBe("String");
    expect(FetchSerializer.serializeRegistry(live).signal.signalTestItem?.prefix).toBe("signalTestItem");
    expect(FetchSerializer.serializeRegistry(live).signal.signalTestAux?.endpoint.ping?.type).toBe("query");
    expect(() =>
      SignalRegistry.registerDatabase(
        "signalTestItem" as const,
        RegistryInternal,
        ServiceEndpoint as never,
        RegistrySlice,
        RegistryServerSignal,
      ),
    ).toThrow('Signal base mismatch: endpoint uses "signalTestAux", but registry expected "signalTestItem"');

    const brokenLive = makeLiveRegistry();
    brokenLive.endpointCls.set("signalTestItem", RegistryEndpoint);
    expect(() => FetchSerializer.serializeRegistry(brokenLive)).toThrow(
      'No slice found for service signal "signalTestItem"',
    );
  });

  test("serverSignal exposes only pubsub endpoints and process internals", () => {
    class ServerEndpoint extends endpoint(signalTestServiceModel, (builder) => ({
      queryItem: builder.query(String).exec(() => "query"),
      publishItem: builder
        .pubsub(String)
        .room("roomId", String)
        .exec(() => undefined),
    })) {}
    class ServerInternal extends internal(signalTestServiceModel, (builder) => ({
      hourly: builder.cron("* * * * *").exec(() => undefined),
      queueItem: builder.process(Boolean).exec(() => true),
    })) {}
    class SignalRef extends serverSignal(ServerEndpoint, ServerInternal) {}

    expect(Object.keys(SignalRef[ENDPOINT_META])).toEqual(["publishItem"]);
    expect(Object.keys(SignalRef[INTERNAL_META])).toEqual(["queueItem"]);
    expect(SignalRef[INJECT_META].queue.type).toBe("plug");
  });
});

describe("SignalContext execution", () => {
  test("parses HTTP params, query arrays, nullable search args, and JSON body", async () => {
    const endpointInfo = buildEndpoint
      .mutation(String)
      .param("id", ID)
      .search("ids", [ID])
      .search("maybe", String)
      .body("title", String)
      .exec((id, ids, maybe, title) => `${id}:${ids.join(",")}:${maybe ?? "none"}:${title}`);
    const context = makeSignalContext({
      endpointInfo,
      request: makeHttpRequest({
        url: "http://localhost/update?ids=abcdefabcdefabcdefabcdef&ids=bbbbbbbbbbbbbbbbbbbbbbbb",
        params: { id: "1234567890abcdef12345678" },
        body: { title: "Hello" },
      }),
    });

    await context.init();
    const response = (await context.exec()) as Response;

    expect(context.args).toEqual([
      "1234567890abcdef12345678",
      ["abcdefabcdefabcdefabcdef", "bbbbbbbbbbbbbbbbbbbbbbbb"],
      null,
      "Hello",
    ]);
    expect(await response.json()).toBe(
      "1234567890abcdef12345678:abcdefabcdefabcdefabcdef,bbbbbbbbbbbbbbbbbbbbbbbb:none:Hello",
    );
  });

  test("parses websocket message and pubsub room args", async () => {
    const messageInfo = buildEndpoint
      .message(String)
      .msg("text", String)
      .with(Ws)
      .exec((text, ws) => `${text}:${ws.subscribe}`);
    const pubsubInfo = buildEndpoint
      .pubsub(String)
      .room("roomId", String)
      .exec(() => undefined);
    const wsReq = {
      ws: { id: "ws-1" },
      data: ["hello"],
      eventType: "message",
    } as never;
    const messageContext = new SignalContext("messageKey", wsReq, {
      endpointInfo: messageInfo,
      adaptor: new (adapt("signalTestWsAdaptor"))(),
      registry: getDefaultInjectRegistry(),
      env: {} as never,
      live: makeLiveRegistry(),
      middleware: new Map(),
    });
    const pubsubContext = new SignalContext(
      "roomKey",
      { ws: { id: "ws-2" }, data: ["room-1"], eventType: "subscribe" } as never,
      {
        endpointInfo: pubsubInfo,
        adaptor: new (adapt("signalTestPubsubAdaptor"))(),
        registry: getDefaultInjectRegistry(),
        env: {} as never,
        live: makeLiveRegistry(),
        middleware: new Map(),
      },
    );

    await messageContext.init();
    await pubsubContext.init();

    expect(messageContext.args).toEqual(["hello"]);
    expect(messageContext.internalArgs).toEqual([]);
    expect(pubsubContext.args).toEqual(["room-1"]);
    expect(pubsubContext.getRoomId("roomKey")).toBe("roomKey-room-1");
  });

  test("runs guards, internal args, and middleware in order", async () => {
    signalTestOrder = [];
    const endpointInfo = buildEndpoint
      .query(String, { guards: [Public], middlewares: [EndpointMiddleware] })
      .with(TestInternalArg)
      .exec((internalValue) => {
        signalTestOrder.push(`exec:${internalValue}`);
        return internalValue;
      });
    const context = makeSignalContext({
      endpointInfo,
      middlewareMap: new Map([["global", GlobalMiddleware]]),
    });

    await context.init();
    const response = (await context.exec()) as Response;

    expect(await response.json()).toBe("internal-value");
    expect(signalTestOrder).toEqual([
      "global:before",
      "endpoint:before",
      "exec:internal-value",
      "endpoint:after",
      "global:after",
    ]);
  });

  test("reports guard and internal argument failures through HTTP responses", async () => {
    const denyInfo = buildEndpoint.query(String, { guards: [TestDeny] }).exec(() => "blocked");
    const missingInternalInfo = buildEndpoint
      .query(String)
      .with(MissingInternalArg)
      .exec(() => "missing");
    const denyAdaptor = new (adapt("signalTestDenyAdaptor"))();
    const denyResponse = await SignalContext.try(denyAdaptor, denyInfo, "deny", async () => {
      const context = makeSignalContext({ endpointInfo: denyInfo, adaptor: denyAdaptor });
      await context.init();
      return (await context.exec()) as Response;
    });
    const missingResponse = await SignalContext.try(denyAdaptor, missingInternalInfo, "missing", async () => {
      const context = makeSignalContext({ endpointInfo: missingInternalInfo, adaptor: denyAdaptor });
      await context.init();
      return (await context.exec()) as Response;
    });
    const nullableInfo = buildEndpoint
      .query(String)
      .with(MissingInternalArg, { nullable: true })
      .exec((arg) => (arg === null ? "nullable" : "value"));
    const nullableContext = makeSignalContext({ endpointInfo: nullableInfo });

    await nullableContext.init();
    const nullableResponse = (await nullableContext.exec()) as Response;

    expect(denyResponse).toBeInstanceOf(Response);
    expect((denyResponse as Response).status).toBe(403);
    expect(await (denyResponse as Response).json()).toMatchObject({
      statusCode: 403,
      error: "Access denied by guard: TestDeny",
    });
    expect((missingResponse as Response).status).toBe(401);
    expect(await (missingResponse as Response).json()).toMatchObject({
      statusCode: 401,
      error: "Internal Argument MissingInternalArg is required",
    });
    expect(await nullableResponse.json()).toBe("nullable");
  });

  test("passes through raw Response results", async () => {
    const endpointInfo = buildEndpoint.query(Response as never).exec(() => Response.json({ ok: true }));
    const context = makeSignalContext({ endpointInfo });

    await context.init();
    const response = (await context.exec()) as Response;

    expect(response).toBeInstanceOf(Response);
    expect(await response.json()).toEqual({ ok: true });
  });
});

describe("SignalContext return resolution", () => {
  test("resolves primitives, arrays, hidden fields, scalar fields, nested documents, and resolve fields", async () => {
    const live = makeLiveRegistry();
    const relatedService = {
      __load: async (id: string) => ({
        toJSON: () => ({ id, title: `related:${id}` }),
      }),
      __loadMany: async (ids: string[]) =>
        ids.map((id) => ({
          toJSON: () => ({ id, title: `related:${id}` }),
        })),
    } as unknown as DatabaseService;
    class ResolveInternal extends internal(signalTestServiceModel, (builder) => ({
      resolvedLabel: builder.resolveField(String).exec((parent) => `resolved:${(parent as { title: string }).title}`),
    })) {}
    live.service.set("signalTestRelated", relatedService);
    live.internal.set("signalTestItemInternal", new ResolveInternal() as unknown as Internal);

    const resolved = await SignalContext.resolveReturn(
      {
        id: "item-1",
        ownerId: "owner-1",
        title: "Item",
        count: 3,
        nested: { label: "Nested" },
        hiddenMemo: "server-only",
        secret: "hidden",
        relatedId: "rel-1",
        relatedIds: ["rel-2", "rel-3"],
      },
      {
        signalContext: null,
        returnRef: SignalTestFull,
        arrDepth: 0,
        registry: getDefaultInjectRegistry(),
        live,
      },
    );
    const resolvedArray = await SignalContext.resolveReturn(
      [[{ title: "A", nested: { label: "N" }, relatedIds: [] }]],
      {
        signalContext: null,
        returnRef: SignalTestFull,
        arrDepth: 2,
        registry: getDefaultInjectRegistry(),
        live,
      },
    );

    expect(
      await SignalContext.resolveReturn("text", {
        signalContext: null,
        returnRef: String,
        arrDepth: 0,
        registry: getDefaultInjectRegistry(),
        live,
      }),
    ).toBe("text");
    expect(resolved).toMatchObject({
      title: "Item",
      count: 3,
      nested: { label: "Nested" },
      resolvedLabel: "resolved:Item",
      relatedId: "rel-1",
      relatedIds: ["rel-2", "rel-3"],
    });
    expect(resolved).not.toHaveProperty("hiddenMemo");
    expect(resolved).not.toHaveProperty("secret");
    expect(resolvedArray).toEqual([
      [{ title: "A", nested: { label: "N" }, relatedIds: [], resolvedLabel: "resolved:A" }],
    ]);
  });

  test("loadNested handles nullable and non-nullable missing documents", async () => {
    const missingService = {
      __load: async () => null,
      __loadMany: async () => [null],
    } as unknown as DatabaseService;

    await expect(SignalContext.loadNested("missing", missingService, { arrDepth: 0, nullable: false })).rejects.toThrow(
      "Document missing is not found",
    );
    await expect(
      SignalContext.loadNested("missing", missingService, { arrDepth: 0, nullable: true }),
    ).resolves.toBeNull();
    await expect(
      SignalContext.loadNested(["missing"], missingService, { arrDepth: 1, nullable: false }),
    ).rejects.toThrow("Document missing is not found");
  });
});

describe("representative signal usage regressions", () => {
  test("mirrors cron internal plus slice query/search pattern", () => {
    class SummaryLikeInternal extends internal(signalTestServiceModel, (builder) => ({
      makeSummary: builder.cron("0 * * * *", { serverMode: "batch", operationMode: ["cloud"] }).exec(() => undefined),
    })) {}
    class SummaryLikeSlice extends slice(
      signalTestServiceModel,
      { guards: { root: TestAdmin, get: Public, cru: None } },
      (init) => ({
        inPeriod: init()
          .param("from", Date)
          .param("to", Date)
          .search("types", [String])
          .exec((from, to, types) => ({ from, to, types })),
      }),
    ) {}

    expect(SummaryLikeInternal[INTERNAL_META].makeSummary?.signalOption).toMatchObject({
      scheduleType: "cron",
      scheduleCron: "0 * * * *",
      serverMode: "batch",
      operationMode: ["cloud"],
    });
    expect(
      SummaryLikeSlice[SLICE_META].inPeriod?.args.map((arg) => [
        arg.type,
        arg.name,
        arg.arrDepth,
        arg.option?.nullable,
      ]),
    ).toEqual([
      ["param", "from", 0, undefined],
      ["param", "to", 0, undefined],
      ["search", "types", 1, true],
    ]);
  });

  test("mirrors websocket message/pubsub and Ws internal arg pattern", () => {
    class ChatLikeEndpoint extends endpoint(signalTestServiceModel, (builder) => ({
      send: builder
        .message(SignalTestLight)
        .msg("roomId", ID)
        .msg("text", String)
        .with(Ws)
        .exec((roomId, text) => ({ title: `${roomId}:${text}` }) as never),
      room: builder
        .pubsub(SignalTestLight)
        .room("roomId", ID)
        .exec(() => undefined),
    })) {}

    expect(ChatLikeEndpoint[ENDPOINT_META].send?.type).toBe("message");
    expect(ChatLikeEndpoint[ENDPOINT_META].send?.args.map((arg) => [arg.type, arg.name])).toEqual([
      ["msg", "roomId"],
      ["msg", "text"],
    ]);
    expect(ChatLikeEndpoint[ENDPOINT_META].send?.internalArgs[0]?.argRef).toBe(Ws);
    expect(ChatLikeEndpoint[ENDPOINT_META].room?.args[0]?.type).toBe("room");
  });

  test("mirrors custom path, prefix false, wildcard, and process internal metadata", () => {
    const customPath = buildEndpoint
      .query(String, { path: "wsl/homes/:dongho/erv", prefix: false })
      .param("dongho", String)
      .exec((dongho) => dongho);
    const wildcard = buildEndpoint.query(Response as never, { path: "localFile/getBlob/*" }).exec(() => new Response());
    const processInternal = buildInternal
      .process(Boolean, { serverMode: "all" })
      .msg("force", Boolean)
      .exec(() => true);

    expect(customPath.getPath("ignored")).toBe("/wsl/homes/:dongho/erv");
    expect(customPath.signalOption.prefix).toBe(false);
    expect(wildcard.getPath("blob")).toBe("/localFile/getBlob/*");
    expect(processInternal.type).toBe("process");
    expect(processInternal.defaultArgs).toEqual(["Job"]);
    expect(processInternal.args[0]?.name).toBe("force");
    expect(processInternal.signalOption.serverMode).toBe("all");
  });
});
