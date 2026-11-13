import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type BackendEnv, dayjs, getEnv, ID, ImageResult } from "akanjs/base";
import { MCP_FAILURE_META, type McpFailure } from "akanjs/common";
import { ConstantRegistry, via } from "akanjs/constant";
import {
  type AgentLoopEvent,
  type AgentLoopRequest,
  type AgentService,
  type AgentToolsAdaptor,
  AgentToolsRole,
  adapt,
  InjectError,
  type LlmAdaptor,
  LlmAdaptorRole,
  type LlmTurnAnswer,
  type LlmTurnRequest,
  ServiceModel,
  serve,
} from "akanjs/service";
import { endpoint } from "../../signal/endpoint";
import { Exception } from "../../signal/exception";
import type { Guard, GuardScope } from "../../signal/guard";
import { Public } from "../../signal/guards";
import { internal } from "../../signal/internal";
import { CallerAccount, type InternalArg, Ip, Machine, Req } from "../../signal/internalArg";
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
    const { appName, environment } = getEnv();
    return async (context: SignalContext, next: () => Promise<unknown>) => {
      const { req } = context.getHttpContext<{ account?: { id?: string } }>();
      const id = req.headers.get("authorization")?.replace(/^Bearer /, "");
      Object.assign(req, { account: id ? { id } : { appName, environment } });
      return await next();
    };
  }
}

class HasAccount implements Guard {
  static name = "HasAccount";
  static scope: GuardScope = "account";
  canPass(context: SignalContext) {
    return !!context.get<{ id?: string }>("account")?.id;
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

const ranEndpoints: string[] = [];
class ArgReadingGuard implements Guard {
  static name = "ArgReadingGuard";
  static scope: GuardScope = "account";
  canPass(context: SignalContext) {
    return !!context.args[0];
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
  callerMachine: builder
    .query(String, { guards: [Public], nullable: true })
    .with(Machine, { nullable: true })
    .exec((machine) => machine?.id ?? null),
  limitedTitle: builder
    .query(String, { guards: [Public], rateLimit: { calls: 1, windowMs: 60_000 } })
    .exec(() => "limited"),
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
  removeTitle: builder
    .mutation(String, { guards: [HasAccount] })
    .param("id", ID)
    .exec((id) => {
      ranEndpoints.push(`removeTitle:${id}`);
      return "gone";
    }),
  archiveTitle: builder.mutation(String, { guards: [HasAccount], destructive: true }).exec(() => "archived"),
  dropOffTitle: builder.mutation(String, { guards: [HasAccount], destructive: false }).exec(() => "dropped off"),
  purgeTitle: builder.mutation(String, { guards: [HasAccount] }).exec(() => "purged"),
  argGuardedTitle: builder
    .mutation(String, { guards: [ArgReadingGuard] })
    .param("id", ID)
    .exec((id) => {
      ranEndpoints.push(`argGuardedTitle:${id}`);
      return "ran";
    }),
  quietTitle: builder.query(String, { guards: [HasAccount], mcp: false }).exec(() => "quiet"),
  agentTitle: builder.query(String, { guards: [HasAccount], mcp: "agent" }).exec(() => "agent only"),
  agentPersonTitle: builder.query(String, { guards: [HasAccount, PersonOnly], mcp: "agent" }).exec(() => "person"),
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

class AgentToolsUser extends adapt("agentToolsUser" as const, ({ plug }) => ({ agentTools: plug(AgentToolsRole) })) {}

let bootAnswers: unknown[] = [];
class AgentRunService extends serve("agentRun" as const, ({ plug }) => ({
  agentTools: plug(AgentToolsRole),
  agentToolsUser: plug(AgentToolsUser),
})) {
  override async onInit() {
    const caught = (error: unknown) => error;
    bootAnswers = await Promise.all([
      this.agentTools.listAs(null).catch(caught),
      this.agentTools.callAs(null, { id: "boot", name: "echoTitle", args: { id: itemId } }).catch(caught),
      this.agentTools.callAs(null, { id: "boot", name: "echoTitle", args: {} }, { allow: [] }).catch(caught),
    ]);
  }
}

const llmScript: LlmTurnAnswer[] = [];
const llmSeen: LlmTurnRequest[] = [];
class ScriptedLlm extends adapt("scriptedLlm" as const, () => ({})) implements LlmAdaptor {
  async chat(request: LlmTurnRequest) {
    llmSeen.push(request);
    return llmScript.shift() ?? { text: "out of script", stop: "end" as const };
  }
}

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
    option: new AkanOption().applyMiddleware(BearerAccount).applyAdaptor(LlmAdaptorRole, ScriptedLlm),
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
const mcpCallFailure = async (bearer: string | null, name: string, args: Record<string, unknown>) => {
  const body = { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } };
  const routes = mcp().createRoutes() as unknown as { "/mcp": { POST: (req: Request) => Promise<Response> } };
  const { result } = (await (await routes["/mcp"].POST(mcpRequest(bearer, body))).json()) as {
    result: { content: { text: string }[]; isError: boolean; _meta: { [MCP_FAILURE_META]: McpFailure } };
  };
  expect(result.isError).toBe(true);
  return { error: result.content[0]?.text, code: result._meta[MCP_FAILURE_META].code };
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

  test("is what an adaptor plugging AgentToolsRole receives", () => {
    expect(di.getService<AgentRunService>("agentRun").agentToolsUser.agentTools).toBe(tools as never);
  });

  test("refuses a call made before the endpoints exist, and caches nothing from it", async () => {
    expect(bootAnswers).toHaveLength(3);
    for (const answer of bootAnswers) {
      expect(answer).toBeInstanceOf(InjectError);
      expect((answer as InjectError).code).toBe("notInitialized");
    }
    expect((await tools.listAs(ann)).map((tool) => tool.name)).toContain("echoTitle");
    expect(await call(ann, "echoTitle", { id: itemId })).toEqual({
      id: "call-1",
      name: "echoTitle",
      result: `${itemId}:echo`,
    });
  });

  test("lists for an account exactly what /mcp lists for a bearer of it", async () => {
    const listed = async (account: unknown) =>
      (await tools.listAs(account)).map((tool) => tool.name).sort((a, b) => a.localeCompare(b));
    expect((await listed(ann)).filter((name) => name !== "agentTitle")).toEqual(await mcpToolNames("ann"));
    expect(await listed(null)).toEqual(await mcpToolNames(null));
    expect(await listed(ann)).toContain("whoAmI");
    expect(await listed(null)).not.toContain("whoAmI");
  });

  test('lists and runs an `mcp: "agent"` endpoint that /mcp neither lists nor runs', async () => {
    const names = (await tools.listAs(ann)).map((tool) => tool.name);
    expect(names).toContain("agentTitle");
    expect(names).not.toContain("agentPersonTitle");
    expect(await mcpToolNames("ann")).not.toContain("agentTitle");
    expect(await call(ann, "agentTitle")).toEqual({ id: "call-1", name: "agentTitle", result: "agent only" });
    const body = { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "agentTitle", arguments: {} } };
    const routes = mcp().createRoutes() as unknown as { "/mcp": { POST: (req: Request) => Promise<Response> } };
    const answer = (await (await routes["/mcp"].POST(mcpRequest("ann", body))).json()) as {
      error?: { message: string };
    };
    expect(answer.error?.message).toBe("Unknown tool: agentTitle.");
    expect((await call(ann, "agentTitle", {}, { allow: ["echoTitle"] })).code).toBe("unknownTool");
    expect((await call(null, "agentTitle")).code).toBe("forbidden");
    expect((await call(ann, "agentPersonTitle")).code).toBe("unknownTool");
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
      expect(await call(ann, name, {}, { allow })).toEqual({
        id: "call-1",
        name,
        error: `Unknown tool: ${name}.`,
        code: "unknownTool",
      });
    expect(await call(ann, "whoAmI", {}, { allow: ["echoTitle"] })).toEqual({
      id: "call-1",
      name: "whoAmI",
      error: "Unknown tool: whoAmI.",
      code: "unknownTool",
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
      code: "forbidden",
    });
    expect((await call(null, "orgHeader", {}, forged)).result).toBe("org-1");
  });

  test("takes a machine claim off the account, as only a verified machine token may set one", async () => {
    const claimed = { id: "ann", machine: { kind: "worker", id: "forged", version: 1 } };
    expect((await call(claimed, "callerMachine")).result).toBeNull();
    expect((await call(claimed, "whoAmI")).result).toBe("ann");
    expect(claimed.machine.id).toBe("forged");
  });

  test("reports the ip it was given and never one a forwarded header claims", async () => {
    const forwarded = { "x-forwarded-for": "198.51.100.1", "x-real-ip": "198.51.100.1" };
    expect((await call(ann, "callerIp", {}, { ip: "203.0.113.9", headers: forwarded })).result).toBe("203.0.113.9");
    expect((await call(ann, "callerIp", {}, { headers: forwarded })).result).toBeNull();
  });

  test("spends the endpoint's own rate limit, per pinned ip", async () => {
    const first = { ip: "203.0.113.20" };
    expect((await call(ann, "limitedTitle", {}, first)).result).toBe("limited");
    expect((await call(ann, "limitedTitle", {}, first)).code).toBe("base.error.tooManyRequests");
    expect((await call(ann, "limitedTitle", {}, { ip: "203.0.113.21" })).result).toBe("limited");
  });

  test("answers failures with the text and code /mcp gives, never throwing", async () => {
    const failing: [string, Record<string, unknown>][] = [
      ["lockedTitle", {}],
      ["renameTitle", { id: itemId }],
      ["echoTitle", { id: itemId, extra: 1 }],
    ];
    for (const [name, args] of failing)
      expect(await call(ann, name, args)).toEqual({
        id: "call-1",
        name,
        ...(await mcpCallFailure("ann", name, args)),
      });
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
      endpointsBuilt: () => true,
      readOnly: true,
      excludeEndpoints: ["echoTitle", "agentTitle"],
    });
    const names = (await narrowed.listAs(ann)).map((tool) => tool.name);
    expect(names).toContain("whoAmI");
    expect(names).not.toContain("echoTitle");
    expect(names).not.toContain("agentTitle");
    expect(names).not.toContain("renameTitle");
    expect((await narrowed.callAs(ann, { id: "c", name: "renameTitle", args: {} })).error).toBe(
      "Unknown tool: renameTitle.",
    );
  });
});

describe("AgentService.loop", () => {
  test("runs the model over the account's /mcp tools in-process, and hands their results back to it", async () => {
    llmScript.push(
      {
        stop: "toolUse",
        toolCalls: [
          { id: "c1", name: "whoAmI", args: {} },
          { id: "c2", name: "quietTitle", args: {} },
        ],
      },
      { text: "You are ann.", stop: "end" },
    );
    const agent = di.getService<AgentService>("agent");
    expect(agent.agentTools).toBe(tools as never);
    const events: AgentLoopEvent[] = [];
    const allow = ["whoAmI", "quietTitle", "echoTitle"];
    for await (const event of agent.loop({ account: ann, allow, messages: [{ role: "user", text: "who am I?" }] }))
      events.push(event);
    expect(llmSeen[0]?.tools.map((tool) => tool.name).sort()).toEqual(["echoTitle", "whoAmI"]);
    expect(events.flatMap((event) => (event.type === "toolResult" ? [event.result] : []))).toEqual([
      { id: "c1", name: "whoAmI", result: "ann" },
      { id: "c2", name: "quietTitle", error: "Unknown tool: quietTitle.", code: "unknownTool" },
    ]);
    expect(llmSeen[1]?.messages.at(-1)?.role).toBe("tool");
    expect(events.at(-1)).toEqual({ type: "done", stop: "end", rounds: 2 });
  });

  const runLoop = async (request: Partial<AgentLoopRequest>, ...script: LlmTurnAnswer[]) => {
    llmScript.splice(0, llmScript.length, ...script);
    const events: AgentLoopEvent[] = [];
    const agent = di.getService<AgentService>("agent");
    const messages = [{ role: "user" as const, text: "go" }];
    for await (const event of agent.loop({ account: ann, messages, ...request } as AgentLoopRequest))
      events.push(event);
    return events;
  };
  const resultsOf = (events: AgentLoopEvent[]) =>
    events.flatMap((event) => (event.type === "toolResult" ? [event.result] : []));

  test("marks a remove as needing a person, refuses it with no approve, and runs it once approve allows", async () => {
    const byName = Object.fromEntries(
      (await tools.listAs(ann, { allow: ["removeTitle", "renameTitle"] })).map((tool) => [tool.name, tool]),
    );
    expect(byName.removeTitle?.needsConfirm).toBe(true);
    expect(byName.renameTitle?.needsConfirm).toBe(false);

    ranEndpoints.length = 0;
    const call = { id: "r1", name: "removeTitle", args: { id: itemId } };
    const script: LlmTurnAnswer[] = [
      { stop: "toolUse", toolCalls: [call] },
      { text: "ok", stop: "end" },
    ];
    const allow = ["removeTitle"];
    const refused = await runLoop({ allow }, ...script);
    expect(ranEndpoints).toEqual([]);
    expect(resultsOf(refused)).toEqual([
      { id: "r1", name: "removeTitle", error: expect.stringContaining("needs a person's confirmation") },
    ]);

    const seen: unknown[] = [];
    await runLoop(
      {
        allow,
        approve: (_call, { tool }) => {
          seen.push(tool.needsConfirm);
          return "allow";
        },
      },
      ...script,
    );
    expect(seen).toEqual([true]);
    expect(ranEndpoints).toEqual([`removeTitle:${itemId}`]);
  });

  test("marks a mutation by its destructive option first and its key second", async () => {
    const allow = ["archiveTitle", "dropOffTitle", "purgeTitle", "renameTitle"];
    const needs = Object.fromEntries(
      (await tools.listAs(ann, { allow })).map((tool) => [tool.name, tool.needsConfirm]),
    );
    expect(needs).toEqual({ archiveTitle: true, dropOffTitle: false, purgeTitle: true, renameTitle: false });
  });

  test("answers a tool this round did not list as unknown, without asking approve or running it", async () => {
    const allow = ["argGuardedTitle", "echoTitle"];
    expect((await tools.listAs(ann, { allow })).map((tool) => tool.name)).toEqual(["echoTitle"]);
    ranEndpoints.length = 0;
    const asked: string[] = [];
    const events = await runLoop(
      {
        allow,
        approve: (call) => {
          asked.push(call.name);
          return { deny: "no" };
        },
      },
      { stop: "toolUse", toolCalls: [{ id: "h1", name: "argGuardedTitle", args: { id: itemId } }] },
      { text: "ok", stop: "end" },
    );
    expect(asked).toEqual([]);
    expect(ranEndpoints).toEqual([]);
    expect(resultsOf(events)).toEqual([
      { id: "h1", name: "argGuardedTitle", error: "Unknown tool: argGuardedTitle.", code: "unknownTool" },
    ]);
  });

  test("offers nothing and runs nothing when allow is missing at runtime", async () => {
    const seenBefore = llmSeen.length;
    const events = await runLoop({}, { text: "never", stop: "end" });
    expect(llmSeen).toHaveLength(seenBefore);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "error" });
  });
});
