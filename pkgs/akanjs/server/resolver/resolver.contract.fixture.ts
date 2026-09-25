import { ID, Int } from "akanjs/base";
import { ConstantRegistry, via } from "akanjs/constant";
import { by, type DatabaseCls, DatabaseRegistry, from, into, type ModelCls, type SchemaOf } from "akanjs/document";
import { ServiceModel, serve } from "akanjs/service";
import { endpoint } from "../../signal/endpoint";
import { Public } from "../../signal/guards";
import { internal } from "../../signal/internal";
import { middleware } from "../../signal/middleware";
import { serverSignal } from "../../signal/serverSignal";
import type { SignalContext } from "../../signal/signalContext";
import { slice } from "../../signal/slice";

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

export const serverResolverTestDatabase = DatabaseRegistry.buildModel(
  "serverResolverTestItem",
  ServerResolverTestInput as unknown as DatabaseCls<InstanceType<typeof ServerResolverTestInput>>,
  ServerResolverTestDoc,
  ServerResolverTestModel,
  ServerResolverTestObject,
  ServerResolverTestInsight,
  ServerResolverTestFilter,
);

class ParentHookService extends serve(serverResolverTestDatabase, () => ({})) {
  _preCreate(data: Record<string, unknown>) {
    return { ...data, parentPreCreate: true };
  }
  _postCreate(doc: Record<string, unknown>) {
    return { ...doc, parentPostCreate: true };
  }
}

export class ServerResolverTestService extends serve(serverResolverTestDatabase, () => ({}), ParentHookService) {
  _preCreate(data: Record<string, unknown>) {
    return { ...data, childPreCreate: true };
  }
  _postCreate(doc: Record<string, unknown>) {
    return { ...doc, childPostCreate: true };
  }
  queryInCategory(category: string) {
    return { category };
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
    .mutation(ServerResolverTestLight)
    .param("id", ID)
    .body("data", ServerResolverTestInput)
    .exec((id, data) => {
      return { id, ...data, createdAt: new Date(0), updatedAt: new Date(0), removedAt: null, secret: "hidden" };
    }),
  roomFeed: builder
    .pubsub(ServerResolverTestLight)
    .room("roomId", ID)
    .exec(() => {
      resolverOrder.push("pubsub-subscribe");
    }),
  guardedRoomFeed: builder
    .pubsub(ServerResolverTestLight, { guards: [ServerResolverTestRoomGuard] })
    .room("roomId", ID)
    .exec(() => undefined),
  echoMessage: builder
    .message(String)
    .msg("text", String)
    .exec((text) => `echo:${text}`),
})) {}

export class ServerResolverTestSlice extends slice(
  serverResolverTestServiceModel,
  { guards: { root: Public, get: Public, cru: Public } },
  (init) => ({
    inCategory: init()
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

export const makeEnv = () => ({
  repoName: "akan",
  serveDomain: "example.com",
  appName: "serverResolver",
  environment: "local",
  operationMode: "local",
  tunnelUsername: "root",
  tunnelPassword: "akan",
});
