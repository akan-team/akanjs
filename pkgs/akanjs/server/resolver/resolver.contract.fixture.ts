import { join } from "node:path";
import { type BackendEnv, Binary, dayjs, ID, Int } from "akanjs/base";
import { ConstantRegistry, via } from "akanjs/constant";
import {
  by,
  type DatabaseCls,
  DatabaseRegistry,
  type DataInputOf,
  from,
  into,
  type ModelCls,
  type SchemaOf,
} from "akanjs/document";
import { ServiceModel, serve } from "akanjs/service";
import { endpoint } from "../../signal/endpoint";
import { Public } from "../../signal/guards";
import { internal } from "../../signal/internal";
import { middleware } from "../../signal/middleware";
import { serverSignal } from "../../signal/serverSignal";
import type { SignalContext } from "../../signal/signalContext";
import { DatabaseSignal } from "../../signal/signalRegistry";
import { slice } from "../../signal/slice";
import type { DatabaseModule } from "../akanLib";

const ServerResolverTestNested = via((f) => ({
  label: f(String),
}));
ConstantRegistry.buildScalar("serverResolverTestNested", ServerResolverTestNested, { ServerResolverTestNested });

const ServerResolverTestInput = via((f) => ({
  ownerId: f(ID),
  category: f(String),
  title: f(String),
  count: f(Int, { default: 0 }),
  tags: f([String]),
  nested: f(ServerResolverTestNested),
}));
const ServerResolverTestObject = via(ServerResolverTestInput, (f) => ({
  secret: f.secret(String),
}));
export const ServerResolverTestLight = via(ServerResolverTestObject, ["title", "category"] as const, () => ({}));
const ServerResolverTestFull = via(ServerResolverTestObject, ServerResolverTestLight, (r) => ({
  resolvedLabel: r(String),
}));
const ServerResolverTestInsight = via(ServerResolverTestFull, (f) => ({
  total: f(Int, { default: 0, accumulate: {} }),
}));
export const serverResolverTestConstant = ConstantRegistry.buildModel(
  "serverResolverTestItem",
  ServerResolverTestInput,
  ServerResolverTestObject,
  ServerResolverTestFull,
  ServerResolverTestLight,
  ServerResolverTestInsight,
  {
    ServerResolverTestInput,
    ServerResolverTestObject,
    ServerResolverTestFull,
    ServerResolverTestLight,
    ServerResolverTestInsight,
  },
);

class ServerResolverTestFilter extends from(ServerResolverTestFull, (filter) => ({
  query: {
    inCategory: filter()
      .arg("category", String)
      .opt("includeRemoved", Boolean)
      .query((category, includeRemoved, q) => q.all({ category }, q.when(!includeRemoved, q.empty("removedAt")))),
    byOwner: filter()
      .arg("ownerId", ID, { ref: "user" })
      .query((ownerId) => ({ ownerId })),
  },
  sort: {
    titleAsc: { title: 1 },
  },
})) {}

class ServerResolverTestDoc extends by(ServerResolverTestFull) {}

export class ServerResolverTestModelMixin {
  static schemaTouched = false;
  static _onSchema(schema: SchemaOf) {
    ServerResolverTestModelMixin.schemaTouched = true;
    schema.index({ category: 1 });
    schema.pre("create", () => {
      //
    });
  }
  static modelKind() {
    return "resolver-contract";
  }
}

class ServerResolverTestModel extends into(
  ServerResolverTestDoc,
  ServerResolverTestFilter,
  serverResolverTestConstant,
  (loader) => ({
    byOwner: loader.byField("ownerId", { removedAt: { kind: "op", op: "empty" } }),
    byTag: loader.byArrayField("tags"),
    byOwnerCategory: loader.byQuery(["ownerId", "category"] as const),
  }),
  ServerResolverTestModelMixin as unknown as ModelCls,
) {}

class ServerResolverTestInsightDoc extends by(ServerResolverTestInsight) {}

export const serverResolverTestDatabase = DatabaseRegistry.buildModel(
  "serverResolverTestItem",
  ServerResolverTestInput as unknown as DatabaseCls<InstanceType<typeof ServerResolverTestInput>>,
  ServerResolverTestDoc,
  ServerResolverTestModel,
  ServerResolverTestObject,
  ServerResolverTestInsightDoc,
  ServerResolverTestFilter,
);

/** Named so the hook overrides below can extend it: a class expression cannot be extended twice. */
const ServerResolverTestServe = serve(serverResolverTestDatabase, () => ({}));
type HookRecord = Record<string, unknown>;
type PreCreateData = DataInputOf<InstanceType<typeof ServerResolverTestInput>, ServerResolverTestDoc>;

class ParentHookService extends ServerResolverTestServe {
  // Methods, not class fields: `serve` collects an extension service's hooks off its prototype.
  override async _preCreate(data: PreCreateData) {
    return { ...(data as HookRecord), parentPreCreate: true } as unknown as PreCreateData;
  }
  override async _postCreate(doc: ServerResolverTestDoc) {
    return { ...(doc as unknown as HookRecord), parentPostCreate: true } as unknown as ServerResolverTestDoc;
  }
}

export class ServerResolverTestService extends serve(serverResolverTestDatabase, () => ({}), ParentHookService) {
  override async _preCreate(data: PreCreateData) {
    return { ...(data as HookRecord), childPreCreate: true } as unknown as PreCreateData;
  }
  override async _postCreate(doc: ServerResolverTestDoc) {
    return { ...(doc as unknown as HookRecord), childPostCreate: true } as unknown as ServerResolverTestDoc;
  }
  categoryEcho(category: string) {
    return category;
  }
}

export const serverResolverTestServiceModel = ServiceModel.fromModel(
  ServerResolverTestService,
  serverResolverTestConstant,
  serverResolverTestDatabase,
);

export let resolverOrder: string[] = [];
export const resetResolverOrder = () => {
  resolverOrder = [];
};
export const validId = "507f1f77bcf86cd799439011";

export class ServerResolverTestMiddleware extends middleware("serverResolverTestMiddleware") {
  override async use() {
    return async (_context: SignalContext, next: () => Promise<unknown>) => {
      resolverOrder.push("global-before");
      const result = await next();
      resolverOrder.push("global-after");
      return result;
    };
  }
}

export class ServerResolverTestRoomGuard {
  static name = "ServerResolverTestRoomGuard";
  static scope = "account" as const;
  canPass(context: SignalContext): boolean {
    return context.get<{ role?: string }>("account")?.role === "member";
  }
}

export class ServerResolverTestEndpoint extends endpoint(serverResolverTestServiceModel, (builder) => ({
  getTitle: builder
    .query(String, {
      guards: [Public],
      middlewares: [ServerResolverTestMiddleware],
      globalPrefix: false,
      prefix: false,
    })
    .param("id", ID)
    .search("suffix", String)
    .exec(function (id, suffix) {
      resolverOrder.push(`query:${id}:${suffix}`);
      return `${id}:${suffix}:${this.serverResolverTestItemService.categoryEcho("public")}`;
    }),
  updateTitle: builder
    .mutation(ServerResolverTestLight, { guards: [Public] })
    .param("id", ID)
    .body("data", ServerResolverTestInput)
    .exec((id, data) => {
      // A binding, not a literal: the excess-property check would reject `secret`, which the tests expect dropped.
      const row = { id, ...data, createdAt: dayjs(0), updatedAt: dayjs(0), secret: "hidden" };
      return row;
    }),
  roomFeed: builder
    .pubsub(ServerResolverTestLight, { guards: [Public] })
    .room("roomId", ID)
    .exec(() => {
      resolverOrder.push("pubsub-subscribe");
    }),
  roomStream: builder
    .pubsub(Binary, { guards: [Public] })
    .room("channel", String)
    .exec(() => undefined),
  roomQueuedStream: builder
    .pubsub(Binary, { guards: [Public], backpressure: "queue" })
    .room("channel", String)
    .exec(() => undefined),
  guardedRoomFeed: builder
    .pubsub(ServerResolverTestLight, { guards: [ServerResolverTestRoomGuard] })
    .room("roomId", ID)
    .exec(() => undefined),
  echoMessage: builder
    .message(String, { guards: [Public] })
    .msg("text", String)
    .exec((text) => `echo:${text}`),
})) {}

export class ServerResolverTestSlice extends slice(
  serverResolverTestServiceModel,
  { guards: { root: Public, get: Public, cru: Public } },
  (init) => ({
    inCategory: init({ guards: [Public] })
      .search("category", String)
      .exec(function (category) {
        return this.serverResolverTestItemService.queryInCategory(category ?? "all");
      }),
  }),
) {}

export class ServerResolverTestInternal extends internal(serverResolverTestServiceModel, (builder) => ({
  processItem: builder
    .process(Boolean)
    .msg("itemId", ID)
    .exec(() => true),
  boot: builder.initialize().exec(() => {
    resolverOrder.push("init");
  }),
  cleanup: builder.destroy().exec(() => {
    resolverOrder.push("destroy");
  }),
})) {}

export class ServerResolverTestServerSignal extends serverSignal(
  ServerResolverTestEndpoint,
  ServerResolverTestInternal,
) {}

export const makeEnv = () => ({});

export const makeSqliteEnv = (workspaceRoot: string) =>
  ({
    workspaceRoot,
    database: {
      sqlite: {
        filePath: join(workspaceRoot, "akan.db"),
        journalMode: "WAL",
        busyTimeoutMs: 1000,
        synchronous: "NORMAL",
        foreignKeys: true,
      },
    },
    solid: {
      filePath: join(workspaceRoot, "solid.db"),
      journalMode: "WAL",
      busyTimeoutMs: 1000,
      synchronous: "NORMAL",
      cleanupIntervalMs: 60_000,
      queuePollIntervalMs: 60_000,
      queueLeaseMs: 30_000,
    },
  }) satisfies BackendEnv & { workspaceRoot: string };

export const serverResolverTestModule = (service: ServiceModel = serverResolverTestServiceModel): DatabaseModule => ({
  constant: serverResolverTestConstant,
  database: serverResolverTestDatabase,
  service,
  signal: new DatabaseSignal(
    ServerResolverTestInternal,
    ServerResolverTestEndpoint,
    ServerResolverTestSlice,
    ServerResolverTestServerSignal,
  ),
});
