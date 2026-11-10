import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type BackendEnv, dayjs, ID, ImageResult } from "akanjs/base";
import { ConstantRegistry, via } from "akanjs/constant";
import { type AgentToolsAdaptor, AgentToolsRole, ServiceModel, serve } from "akanjs/service";
import { endpoint } from "../../signal/endpoint";
import { Exception } from "../../signal/exception";
import type { Guard, GuardScope } from "../../signal/guard";
import { Public } from "../../signal/guards";
import { internal } from "../../signal/internal";
import { CallerAccount, type InternalArg, Ip, Req } from "../../signal/internalArg";
import { middleware } from "../../signal/middleware";
import { serverSignal } from "../../signal/serverSignal";
import type { SignalContext } from "../../signal/signalContext";
import { ServiceSignal, SignalRegistry } from "../../signal/signalRegistry";
import { slice } from "../../signal/slice";
import { AkanLib } from "../akanLib";
import { AkanOption } from "../akanOption";
import { DiLifecycle } from "../di/diLifecycle";
import {
  serverResolverTestConstant,
  serverResolverTestDatabase,
  serverResolverTestServiceModel,
} from "../resolver/resolver.contract.fixture";
import { AgentTools } from "./AgentTools";
import { McpRouter } from "./McpRouter";

class BearerAccount extends middleware("bearerAccount") {
  override async use() {
    return async (context: SignalContext, next: () => Promise<unknown>) => {
      const { req } = context.getHttpContext<{ account?: { id: string } }>();
      const id = req.headers.get("authorization")?.replace(/^Bearer /, "");
      Object.assign(req, { account: id ? { id } : undefined });
      return await next();
    };
  }
}

class HasAccount implements Guard {
  static name = "HasAccount";
  static scope: GuardScope = "account";
  canPass(context: SignalContext) {
    return !!context.get<{ id?: string }>("account");
  }
}

class PersonOnly implements Guard {
  static name = "PersonOnly";
  static scope: GuardScope = "account";
  static agents = false;
  canPass() {
    return true;
  }
}

class Origin implements InternalArg<string> {
  getArg(context: SignalContext) {
    return context.origin;
  }
}

const ToolsVisualInput = via((f) => ({ title: f(String), preview: f.visual(String) }));
const ToolsVisualObject = via(ToolsVisualInput, () => ({}));
const ToolsVisualLight = via(ToolsVisualObject, ["title", "preview"] as const, () => ({}));
const ToolsVisualFull = via(ToolsVisualObject, ToolsVisualLight, () => ({}));
const ToolsVisualInsight = via(ToolsVisualFull, () => ({}));
ConstantRegistry.buildModel(
  "agentToolsVisualItem",
  ToolsVisualInput,
  ToolsVisualObject,
  ToolsVisualFull,
  ToolsVisualLight,
  ToolsVisualInsight,
  {},
);

const pixelPng = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

class ToolsEndpoint extends endpoint(serverResolverTestServiceModel, (builder) => ({
  echoTitle: builder
    .query(String, { guards: [Public] })
    .param("id", ID)
    .exec((id) => `${id}:echo`),
  whoAmI: builder
    .query(String, { guards: [HasAccount] })
    .with(CallerAccount)
    .exec((account) => (account as { id: string }).id),
  originOf: builder
    .query(String, { guards: [Public] })
    .with(Origin)
    .exec((origin) => origin),
  callerIp: builder
    .query(String, { guards: [Public], nullable: true })
    .with(Ip, { nullable: true })
    .exec((ip) => ip),
  orgHeader: builder
    .query(String, { guards: [Public], nullable: true })
    .with(Req)
    .exec((req) => req.headers.get("x-org")),
  renameTitle: builder
    .mutation(String, { guards: [HasAccount] })
    .param("id", ID)
    .body("title", String)
    .exec((id, title) => `${id}:${title}`),
  lockedTitle: builder.query(String, { guards: [Public] }).exec(() => {
    throw new Exception(409, "serverResolverTestItem.error.locked", undefined, {});
  }),
  visualItem: builder.query(ToolsVisualLight, { guards: [Public] }).exec(() => ({
    id: "507f1f77bcf86cd799439011",
    title: "shot",
    preview: "data:image/png;base64,AAAA",
    createdAt: dayjs(0),
    updatedAt: dayjs(0),
  })),
  shotImage: builder
    .query(ImageResult, { guards: [Public] })
    .exec(() => ({ data: pixelPng, mimeType: "image/png", caption: "pixel" })),
  quietTitle: builder.query(String, { guards: [HasAccount], mcp: false }).exec(() => "quiet"),
  personTitle: builder.query(String, { guards: [HasAccount, PersonOnly] }).exec(() => "person"),
  unguardedTitle: builder.query(String).exec(() => "unguarded"),
})) {}

class ToolsSlice extends slice(
  serverResolverTestServiceModel,
  { guards: { root: Public, get: Public, cru: HasAccount } },
  () => ({}),
) {}

class ToolsInternal extends internal(serverResolverTestServiceModel, () => ({})) {}
class ToolsServerSignal extends serverSignal(ToolsEndpoint, ToolsInternal) {}

class AgentRunService extends serve("agentRun" as const, ({ plug }) => ({ agentTools: plug(AgentToolsRole) })) {}
const agentRunService = ServiceModel.from(AgentRunService);
class AgentRunEndpoint extends endpoint(agentRunService, () => ({})) {}
class AgentRunInternal extends internal(agentRunService, () => ({})) {}
class AgentRunSignal extends serverSignal(AgentRunEndpoint, AgentRunInternal) {}

let tmp = "";
let env: BackendEnv;
let di: DiLifecycle;
let tools: AgentToolsAdaptor;
const ann = { id: "ann" };
const itemId = "507f1f77bcf86cd799439011";

beforeAll(async () => {
  process.env.AKAN_PUBLIC_APP_NAME = "agentToolsTest";
  process.env.AKAN_PUBLIC_REPO_NAME = "akan";
  process.env.AKAN_PUBLIC_SERVE_DOMAIN = "example.com";
  process.env.AKAN_PUBLIC_ENV = "local";
  process.env.AKAN_PUBLIC_OPERATION_MODE = "local";
  tmp = await mkdtemp(join(tmpdir(), "akan-agent-tools-"));
  env = {
    database: {
      sqlite: { filePath: join(tmp, "akan.db"), journalMode: "WAL", busyTimeoutMs: 1000, foreignKeys: true },
    },
    solid: {
      filePath: join(tmp, "solid.db"),
      journalMode: "WAL",
      busyTimeoutMs: 1000,
      cleanupIntervalMs: 60_000,
      queuePollIntervalMs: 60_000,
      queueLeaseMs: 30_000,
    },
  } as BackendEnv;
  const lib = new AkanLib("agentToolsTest", {
    databases: [
      {
        constant: serverResolverTestConstant,
        database: serverResolverTestDatabase,
        service: serverResolverTestServiceModel,
        signal: SignalRegistry.registerDatabase(
          "serverResolverTestItem",
          ToolsInternal,
          ToolsEndpoint,
          ToolsSlice,
          ToolsServerSignal,
        ),
      },
    ],
    services: [
      { service: agentRunService, signal: new ServiceSignal(AgentRunInternal, AgentRunEndpoint, AgentRunSignal) },
    ],
    scalars: [],
    option: new AkanOption().applyMiddleware(BearerAccount),
  });
  di = new DiLifecycle({ env }, lib);
  AgentTools.provide(di, { env, mcpOption: {}, mcpReadOnly: false });
  await di.initializeAll();
  tools = di.getByClass(AgentToolsRole) as unknown as AgentToolsAdaptor;
});

afterAll(async () => {
  await di?.destroyAll();
  if (tmp) await rm(tmp, { recursive: true, force: true });
});

const mcp = () =>
  new McpRouter({
    registry: di.registry,
    live: di.live,
    middleware: new Map(di.modules.middleware),
    env,
    rateLimit: false,
  });
const mcpRequest = (bearer: string | null, body?: object) =>
  new Request("http://127.0.0.1/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", ...(bearer ? { authorization: `Bearer ${bearer}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
const mcpToolNames = async (bearer: string | null) =>
  (await mcp().listFor(mcpRequest(bearer))).tools.map((tool) => tool.name).sort((a, b) => a.localeCompare(b));
const mcpCallText = async (bearer: string | null, name: string, args: Record<string, unknown>) => {
  const body = { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } };
  const routes = mcp().createRoutes() as unknown as { "/mcp": { POST: (req: Request) => Promise<Response> } };
  const { result } = (await (await routes["/mcp"].POST(mcpRequest(bearer, body))).json()) as {
    result: { content: { text: string }[]; isError: boolean };
  };
  expect(result.isError).toBe(true);
  return result.content[0]?.text;
};

const call = async (account: unknown, name: string, args: Record<string, unknown> = {}, caller = {}) =>
  await tools.callAs(account, { id: "call-1", name, args }, caller);

describe("AgentTools", () => {
  test("is what a service plugging AgentToolsRole receives, built without a router", () => {
    expect(tools).toBeInstanceOf(AgentTools);
    expect(di.getService<AgentRunService>("agentRun").agentTools).toBe(tools as never);
    expect(di.registry.adaptor.get(AgentToolsRole)).toBe(tools as never);
    expect(di.live.adaptor.has(AgentToolsRole.refName)).toBe(false);
  });

  test("lists for an account exactly what /mcp lists for a bearer of it", async () => {
    const listed = async (account: unknown) =>
      (await tools.listAs(account)).map((tool) => tool.name).sort((a, b) => a.localeCompare(b));
    expect(await listed(ann)).toEqual(await mcpToolNames("ann"));
    expect(await listed(null)).toEqual(await mcpToolNames(null));
    expect(await listed(ann)).toContain("whoAmI");
    expect(await listed(null)).not.toContain("whoAmI");
  });

  test("hands a provider the input schema as parameters and marks queries read-only", async () => {
    const listed = await tools.listAs(ann, { allow: ["echoTitle", "renameTitle"] });
    const byName = Object.fromEntries(listed.map((tool) => [tool.name, tool]));
    expect(byName.echoTitle?.readOnly).toBe(true);
    expect(byName.renameTitle?.readOnly).toBe(false);
    expect(byName.renameTitle?.parameters).toMatchObject({
      type: "object",
      properties: { id: expect.any(Object), title: expect.any(Object) },
      required: ["id", "title"],
    });
  });

  test("narrows to allow and never widens past the catalogue", async () => {
    const allow = ["echoTitle", "quietTitle", "personTitle", "unguardedTitle", "missingTitle"];
    expect((await tools.listAs(ann, { allow })).map((tool) => tool.name)).toEqual(["echoTitle"]);
    for (const name of ["quietTitle", "personTitle", "unguardedTitle"])
      expect(await call(ann, name, {}, { allow })).toEqual({ id: "call-1", name, error: `Unknown tool: ${name}.` });
    expect(await call(ann, "whoAmI", {}, { allow: ["echoTitle"] })).toEqual({
      id: "call-1",
      name: "whoAmI",
      error: "Unknown tool: whoAmI.",
    });
  });

  test("runs the endpoint as the account given, with origin mcp", async () => {
    expect(await call(ann, "whoAmI")).toEqual({ id: "call-1", name: "whoAmI", result: "ann" });
    expect((await call(ann, "originOf")).result).toBe("mcp");
    expect(await call(ann, "renameTitle", { id: itemId, title: "new" })).toEqual({
      id: "call-1",
      name: "renameTitle",
      result: `${itemId}:new`,
    });
  });

  test("takes no identity from the headers it forwards", async () => {
    const forged = { headers: { authorization: "Bearer ann", cookie: "session=ann", "x-org": "org-1" } };
    expect(await call(null, "whoAmI", {}, forged)).toEqual({
      id: "call-1",
      name: "whoAmI",
      error: "You are not permitted to perform this action.",
    });
    expect((await call(null, "orgHeader", {}, forged)).result).toBe("org-1");
  });

  test("reports the ip it was given and never one a forwarded header claims", async () => {
    const forwarded = { "x-forwarded-for": "198.51.100.1", "x-real-ip": "198.51.100.1" };
    expect((await call(ann, "callerIp", {}, { ip: "203.0.113.9", headers: forwarded })).result).toBe("203.0.113.9");
    expect((await call(ann, "callerIp", {}, { headers: forwarded })).result).toBeNull();
  });

  test("answers failures with the text /mcp gives, never throwing", async () => {
    const failing: [string, Record<string, unknown>][] = [
      ["lockedTitle", {}],
      ["renameTitle", { id: itemId }],
      ["echoTitle", { id: itemId, extra: 1 }],
    ];
    for (const [name, args] of failing)
      expect((await call(ann, name, args)).error).toBe(await mcpCallText("ann", name, args));
    expect((await call(ann, "renameTitle", { id: itemId })).error).toBe('Missing required argument "title".');
  });

  test("masks a result as /mcp does and carries images as attachments", async () => {
    expect((await call(ann, "visualItem")).result).not.toHaveProperty("preview");
    expect(await call(ann, "shotImage")).toEqual({
      id: "call-1",
      name: "shotImage",
      result: { mimeType: "image/png", caption: "pixel" },
      attachments: [{ name: "shotImage-1", mimeType: "image/png", data: pixelPng }],
    });
  });

  test("keeps the deployment's catalogue options: exclusions and read-only", async () => {
    const narrowed = new AgentTools({
      registry: di.registry,
      env,
      live: di.live,
      middleware: di.modules.middleware,
      readOnly: true,
      excludeEndpoints: ["echoTitle"],
    });
    const names = (await narrowed.listAs(ann)).map((tool) => tool.name);
    expect(names).toContain("whoAmI");
    expect(names).not.toContain("echoTitle");
    expect(names).not.toContain("renameTitle");
    expect((await narrowed.callAs(ann, { id: "c", name: "renameTitle", args: {} })).error).toBe(
      "Unknown tool: renameTitle.",
    );
  });
});
