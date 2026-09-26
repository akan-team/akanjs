import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type BackendEnv,
  CLIENT_VALUE,
  DEFAULT_VALUE,
  dayjs,
  enumOf,
  ID,
  type PrimitiveAgentFace,
  PrimitiveRegistry,
  PrimitiveScalar,
  SERVER_VALUE,
} from "akanjs/base";
import { Logger } from "akanjs/common";
import { ConstantRegistry, via } from "akanjs/constant";
import { endpoint } from "../../signal/endpoint";
import type { Guard, GuardScope } from "../../signal/guard";
import { None, Public } from "../../signal/guards";
import { internal } from "../../signal/internal";
import { McpProgress } from "../../signal/mcp";
import type { PagePromptEntry, PagePromptRun, PagePromptSource } from "../../signal/mcp/pagePrompt";
import { middleware } from "../../signal/middleware";
import { serverSignal } from "../../signal/serverSignal";
import type { SignalContext } from "../../signal/signalContext";
import { SignalRegistry } from "../../signal/signalRegistry";
import { slice } from "../../signal/slice";
import { AkanLib } from "../akanLib";
import { AkanOption } from "../akanOption";
import { DiLifecycle } from "../di/diLifecycle";
import {
  ServerResolverTestLight,
  serverResolverTestConstant,
  serverResolverTestDatabase,
  serverResolverTestServiceModel,
} from "../resolver/resolver.contract.fixture";
import type { SignalRoutes } from "../types";
import { McpRouter, type McpRouterProps } from "./McpRouter";

/**
 * Exercises the whole execution path an MCP tool call takes — document → dispatcher → `McpExecutionContext` →
 * `SignalContext` → guards and middleware → service → serialization — against a booted DI container. The unit
 * tests cover the wire format; this is the one that would catch the context being wired to the wrong transport.
 *
 * The shared resolver fixture supplies the model and service, but the signals are declared here: opting that
 * fixture into MCP would change what every other test sees serialized.
 */
/** Says yes like `Public` does, but is a real guard — which is the whole difference an exposed mutation turns on. */
class SignedIn implements Guard {
  static name = "SignedIn";
  static scope: GuardScope = "account";
  canPass() {
    return true;
  }
}

/**
 * Resolves the caller from the `Authorization` header or a `session` cookie, the two channels an app's account
 * middleware reads — so the suite can show which of the two `/mcp` honours.
 */
class McpAccountMiddleware extends middleware("mcpAccount") {
  override async use() {
    return async (context: SignalContext, next: () => Promise<unknown>) => {
      const { req } = context.getHttpContext<{ account?: { id: string } }>();
      const bearer = req.headers.get("authorization")?.replace(/^Bearer /, "");
      const cookie = req.headers.get("cookie")?.match(/(?:^|;\s*)session=([^;]+)/)?.[1];
      const id = bearer ?? cookie;
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

/** Marked `account` yet reads an argument — the mismark a listing evaluates with none, and throws on. */
class ReadsArgument implements Guard {
  static name = "ReadsArgument";
  static scope: GuardScope = "account";
  canPass(context: SignalContext) {
    return (context.getArg<string>("id") as string).length > 0;
  }
}

/** Would pass anyone at call time; what keeps it off the shelf is the declaration that no model may. */
class PersonOnly implements Guard {
  static name = "PersonOnly";
  static scope: GuardScope = "account";
  static agents = false;
  canPass() {
    return true;
  }
}

/**
 * A model whose Light carries a `visual` field. Declared here rather than in the shared resolver fixture for the
 * same reason the signals are: a field added there changes what every other test sees serialized.
 */
const McpVisualInput = via((f) => ({
  title: f(String),
  preview: f.visual(String),
}));
const McpVisualObject = via(McpVisualInput, () => ({}));
const McpVisualLight = via(McpVisualObject, ["title", "preview"] as const, () => ({}));
const McpVisualFull = via(McpVisualObject, McpVisualLight, () => ({}));
const McpVisualInsight = via(McpVisualFull, () => ({}));
ConstantRegistry.buildModel(
  "mcpVisualItem",
  McpVisualInput,
  McpVisualObject,
  McpVisualFull,
  McpVisualLight,
  McpVisualInsight,
  {},
);

interface McpOutlineDoc {
  lines: string[];
}
/** Stored as structured lines, handed to an agent as one text: the shape of an editor document and its markdown. */
class McpOutline extends PrimitiveScalar {
  static override refName = "McpOutline";
  static override [SERVER_VALUE]: McpOutlineDoc;
  static override [CLIENT_VALUE]: McpOutlineDoc;
  static override [DEFAULT_VALUE]: McpOutlineDoc = { lines: [] };
  static override agent: PrimitiveAgentFace<McpOutlineDoc> = {
    schema: { type: "string", description: "Markdown." },
    read: (value) => value.lines.join("\n"),
  };
  static override validate(value: McpOutlineDoc) {
    return Array.isArray(value.lines);
  }
  static override parseValue(input: string | McpOutlineDoc): McpOutlineDoc {
    return typeof input === "string" ? { lines: input.split("\n") } : input;
  }
}
PrimitiveRegistry.register(McpOutline);

const McpOutlineInput = via((f) => ({ title: f(String), outline: f(McpOutline) }));
const McpOutlineObject = via(McpOutlineInput, () => ({}));
const McpOutlineLight = via(McpOutlineObject, ["title", "outline"] as const, () => ({}));
const McpOutlineFull = via(McpOutlineObject, McpOutlineLight, () => ({}));
const McpOutlineInsight = via(McpOutlineFull, () => ({}));
ConstantRegistry.buildModel(
  "mcpOutlineItem",
  McpOutlineInput,
  McpOutlineObject,
  McpOutlineFull,
  McpOutlineLight,
  McpOutlineInsight,
  {},
);

class McpItemSlice extends slice(
  serverResolverTestServiceModel,
  // `list` is the root slice's own opt-in — it is generated by `slice()`, so there is nowhere else to write it.
  { guards: { root: Public, get: Public, cru: Public } },
  (init) => ({
    inCategory: init({ guards: [Public] })
      .search("category", String)
      .exec(function (category) {
        return this.serverResolverTestItemService.queryInCategory(category ?? "all");
      }),
  }),
) {}

class Period extends enumOf("mcpItemPeriod", ["day", "month"] as const) {}

class McpItemEndpoint extends endpoint(serverResolverTestServiceModel, (builder) => ({
  echoTitle: builder
    .query(String, { guards: [Public] })
    .param("id", ID)
    .search("suffix", String)
    .exec((id, suffix) => `${id}:${suffix ?? "none"}`),
  // Declares no guards at all, which is what keeps it out of the catalogue now that exposure follows them.
  hiddenTitle: builder
    .query(String)
    .param("id", ID)
    .exec((id) => `hidden:${id}`),
  joinTags: builder
    .query(String, { guards: [Public] })
    .search("tags", [String])
    .exec((tags) => (tags ?? []).join("|")),
  periodTitle: builder
    .query(String, { guards: [Public] })
    .search("period", Period)
    .exec((period) => `period:${period ?? "none"}`),
  maybeItem: builder
    .query(ServerResolverTestLight, { guards: [Public], nullable: true })
    .search("title", String)
    .exec((title) =>
      title
        ? {
            id: "507f1f77bcf86cd799439011",
            title,
            category: "all",
            createdAt: dayjs(0),
            updatedAt: dayjs(0),
          }
        : null,
    ),
  visualItem: builder.query(McpVisualLight, { guards: [Public] }).exec(() => ({
    id: "507f1f77bcf86cd799439011",
    title: "shot",
    preview: "data:image/png;base64,AAAA",
    createdAt: dayjs(0),
    updatedAt: dayjs(0),
  })),
  outlineText: builder.query(McpOutline, { guards: [Public] }).exec(() => ({ lines: ["# Title", "text"] })),
  outlineItem: builder.query(McpOutlineLight, { guards: [Public] }).exec(() => ({
    id: "507f1f77bcf86cd799439011",
    title: "guide",
    outline: { lines: ["# Guide", "body"] },
    createdAt: dayjs(0),
    updatedAt: dayjs(0),
  })),
  rewriteOutline: builder
    .mutation(String, { guards: [SignedIn] })
    .body("outline", McpOutline)
    .exec((outline) => `lines:${outline.lines.length}`),
  failingTitle: builder.query(String, { guards: [Public] }).exec(() => {
    throw new Error("boom: internal detail that must not travel");
  }),
  deniedTitle: builder.query(String, { guards: [None] }).exec(() => "denied"),
  ownedTitle: builder.query(String, { guards: [HasAccount] }).exec(() => "owned"),
  personTitle: builder.query(String, { guards: [SignedIn, PersonOnly] }).exec(() => "signed by a person"),
  mismarkedTitle: builder
    .query(String, { guards: [ReadsArgument] })
    .param("id", ID)
    .exec((id) => `${id}:mismarked`),
  slowTitle: builder.query(String, { guards: [Public] }).exec(async () => {
    McpProgress.report(1, { total: 2, message: "counting" });
    await new Promise((resolve) => setTimeout(resolve, 5));
    McpProgress.report(2, { total: 2 });
    return "counted";
  }),
  renameTitle: builder
    .mutation(String, { guards: [SignedIn] })
    .param("id", ID)
    .body("title", String)
    .exec((id, title) => `${id}:${title}`),
  publicRenameTitle: builder
    .mutation(String, { guards: [Public] })
    .param("id", ID)
    .exec((id) => `${id}:public`),
})) {}

class McpItemInternal extends internal(serverResolverTestServiceModel, () => ({})) {}
class McpItemServerSignal extends serverSignal(McpItemEndpoint, McpItemInternal) {}

const createEnv = (tmp: string) =>
  ({
    workspaceRoot: tmp,
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
  }) satisfies BackendEnv & { workspaceRoot: string };

let tmp = "";
let di: DiLifecycle;
let httpRoutes: NonNullable<SignalRoutes["routes"]>;
let post: (body: object) => Promise<{ res: Response; json: any }>;
let postPaged: (body: object, pageSize: number) => Promise<{ res: Response; json: any }>;
let postWith: (body: object, props: Partial<McpRouterProps>) => Promise<{ res: Response; json: any }>;
let postRaw: (body: object, headers: Record<string, string>) => Promise<Response>;
let postAs: (
  body: object,
  headers: Record<string, string>,
  props: Partial<McpRouterProps>,
) => Promise<{ res: Response; json: any }>;
let mcpRouter: (props?: Partial<McpRouterProps>) => McpRouter;
let mcpRoutes: (props?: Partial<McpRouterProps>) => Record<string, Record<string, (req: Request) => Promise<Response>>>;

beforeAll(async () => {
  process.env.AKAN_PUBLIC_APP_NAME = "mcpIntegration";
  process.env.AKAN_PUBLIC_REPO_NAME = "akan";
  process.env.AKAN_PUBLIC_SERVE_DOMAIN = "example.com";
  process.env.AKAN_PUBLIC_ENV = "local";
  process.env.AKAN_PUBLIC_OPERATION_MODE = "local";
  process.env.SERVER_MODE = "all";
  tmp = await mkdtemp(join(tmpdir(), "akan-mcp-"));
  const env = createEnv(tmp);
  const lib = new AkanLib("mcpIntegrationTest", {
    databases: [
      {
        constant: serverResolverTestConstant,
        database: serverResolverTestDatabase,
        service: serverResolverTestServiceModel,
        signal: SignalRegistry.registerDatabase(
          "serverResolverTestItem",
          McpItemInternal,
          McpItemEndpoint,
          McpItemSlice,
          McpItemServerSignal,
        ),
      },
    ],
    services: [],
    scalars: [],
    option: new AkanOption().applyMiddleware(McpAccountMiddleware),
  });
  di = new DiLifecycle({ env }, lib);
  httpRoutes = (await di.initializeAll()).routes ?? {};
  mcpRouter = (props: Partial<McpRouterProps> = {}) =>
    new McpRouter({ registry: di.registry, live: di.live, middleware: new Map(di.modules.middleware), env, ...props });
  mcpRoutes = (props: Partial<McpRouterProps> = {}) =>
    mcpRouter(props).createRoutes() as Record<string, Record<string, (req: Request) => Promise<Response>>>;
  const send = async (body: object, headers: Record<string, string> = {}, props: Partial<McpRouterProps> = {}) => {
    const routes = mcpRoutes(props);
    return await routes["/mcp"].POST(
      new Request("http://127.0.0.1:8080/mcp", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json", ...headers },
      }),
    );
  };
  const withJson = async (res: Response) => ({ res, json: await res.json() });
  post = async (body: object) => await withJson(await send(body));
  postPaged = async (body: object, pageSize: number) => await withJson(await send(body, {}, { pageSize }));
  postWith = async (body: object, props: Partial<McpRouterProps>) => await withJson(await send(body, {}, props));
  postRaw = async (body: object, headers: Record<string, string>) => await send(body, headers);
  postAs = async (body: object, headers: Record<string, string>, props: Partial<McpRouterProps>) =>
    await withJson(await send(body, headers, props));
});

afterAll(async () => {
  await di?.destroyAll();
  if (tmp) await rm(tmp, { recursive: true, force: true });
});

const call = async (name: string, args: Record<string, unknown> = {}) =>
  (await post({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } })).json;

const itemId = "507f1f77bcf86cd799439011";
const briefEntry: PagePromptEntry = {
  name: "briefItem",
  description: "Brief the item screen: what it shows and what is due.",
  arguments: [
    { name: "serverResolverTestItemId", description: "The item.", required: true },
    { name: "tags", description: "Comma-separated list.", required: false },
  ],
  pattern: "/:lang/item/:serverResolverTestItemId",
};
const rows = (count: number) =>
  Array.from({ length: count }, (_, idx) => ({
    id: `507f1f77bcf86cd7994390${String(idx).padStart(2, "0")}`,
    title: `row ${idx}`,
    category: "all",
    createdAt: "1970-01-01T00:00:00.000Z",
    updatedAt: "1970-01-01T00:00:00.000Z",
  }));
const okRun = (count = 2): PagePromptRun => ({
  ok: true,
  url: `http://127.0.0.1/en/item/${itemId}`,
  records: [
    {
      key: "serverResolverTestItemListInCategory",
      args: { category: "all" },
      returns: { refName: "serverResolverTestItem", modelType: "light", arrDepth: 1 },
      value: rows(count),
    },
    { key: "echoTitle", args: { id: itemId, suffix: "x" }, returns: { refName: "String" }, value: `${itemId}:x` },
  ],
});
/** What the RSC worker would answer, without a worker: the router's half is what these tests are about. */
const pagePromptsOf = (run: PagePromptRun, entries: PagePromptEntry[] = [briefEntry]): PagePromptSource => ({
  list: async () => entries,
  run: async () => run,
});
const promptsGet = (args: Record<string, string>) => ({
  jsonrpc: "2.0",
  id: 1,
  method: "prompts/get",
  params: { name: "briefItem", arguments: args },
});

describe("MCP over a booted container", () => {
  test("names an account guard that reaches for arguments, once, and hides its entry without an error line", async () => {
    // First in the file on purpose: the warning is said once per guard and endpoint for the life of the process,
    // so it has to be caught on the first listing that evaluates the guard.
    const lines: string[] = [];
    const stop = Logger.addSink(({ message }) => void lines.push(message));
    try {
      const { json } = await post({ jsonrpc: "2.0", id: 1, method: "tools/list" });
      expect(json.result.tools.map((tool: { name: string }) => tool.name)).not.toContain("mismarkedTitle");
      // Absent from the document, not merely hidden for this caller: `PersonOnly` would have passed anyone.
      expect(json.result.tools.map((tool: { name: string }) => tool.name)).not.toContain("personTitle");
      await post({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    } finally {
      stop();
    }
    const warned = lines.filter((line) => line.includes("Guard ReadsArgument threw while listing"));
    expect(warned).toHaveLength(1);
    expect(warned[0]).toContain('"mismarkedTitle"');
    expect(warned[0]).toContain('static scope = "resource"');
    // A refusal at listing time is the expected answer for most of a catalogue, not an error to log.
    expect(lines.some((line) => line.startsWith("Error query-"))).toBe(false);
  });

  test("lists every endpoint its guards admit", async () => {
    const { json } = await post({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    expect(json.result.tools.map((tool: { name: string }) => tool.name)).toEqual([
      "echoTitle",
      "failingTitle",
      "joinTags",
      "maybeItem",
      "outlineItem",
      "outlineText",
      "periodTitle",
      "renameTitle",
      "rewriteOutline",
      "serverResolverTestItem",
      "serverResolverTestItemInsight",
      "serverResolverTestItemInsightInCategory",
      "serverResolverTestItemList",
      "serverResolverTestItemListInCategory",
      "slowTitle",
      "visualItem",
    ]);
  });

  test("refuses an exposed mutation whose only guard is Public", async () => {
    // `Public` answers true unconditionally, so a list containing only it is an unguarded write spelled out —
    // the exact thing the mutation check exists to keep off an agent's shelf.
    const { json } = await post({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    expect(json.result.tools.map((tool: { name: string }) => tool.name)).not.toContain("publicRenameTitle");
    const called = await call("publicRenameTitle", { id: "507f1f77bcf86cd799439011" });
    expect(called.error.message).toBe("Unknown tool: publicRenameTitle.");
  });

  test("answers ping", async () => {
    // A utility of both eras, and a client that uses it as a liveness check reads a -32601 as a dead connection.
    const { json } = await post({ jsonrpc: "2.0", id: 1, method: "ping" });
    expect(json.result).toEqual({});
    expect(json.error).toBeUndefined();
  });

  test("hides what an account-scoped guard already refuses this caller", async () => {
    // `None` reads only the caller, so the answer is known before any argument exists. A resource guard is not
    // evaluated here at all, which is why `renameTitle` above stays listed and is stopped at call time instead.
    const { json } = await post({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    expect(json.result.tools.map((tool: { name: string }) => tool.name)).not.toContain("deniedTitle");
  });

  test("runs an opted-in guarded mutation", async () => {
    const json = await call("renameTitle", { id: "507f1f77bcf86cd799439011", title: "renamed" });
    expect(json.result.isError).toBe(false);
    expect(json.result.content[0].text).toBe("507f1f77bcf86cd799439011:renamed");
  });

  test("runs a tool through the signal pipeline and returns its value", async () => {
    const json = await call("echoTitle", { id: "507f1f77bcf86cd799439011", suffix: "tail" });
    expect(json.result.isError).toBe(false);
    // Not `"…"` with the quotes: JSON is how a structured result is mirrored as text, and a scalar has no
    // structured half to mirror — encoding one anyway spent the block on syntax a model has to know to strip.
    expect(json.result.content[0].text).toBe("507f1f77bcf86cd799439011:tail");
    // A scalar return promises no `outputSchema`, so it carries no structured result either.
    expect(json.result.structuredContent).toBeUndefined();
  });

  test("treats an omitted optional arg as absent rather than failing", async () => {
    const json = await call("echoTitle", { id: "507f1f77bcf86cd799439011" });
    expect(json.result.content[0].text).toBe("507f1f77bcf86cd799439011:none");
  });

  test("wraps a list result so structuredContent stays an object", async () => {
    const json = await call("serverResolverTestItemListInCategory", { category: "all", limit: 5 });
    expect(json.result.isError).toBe(false);
    expect(json.result.structuredContent).toEqual({ items: [] });
  });

  test("runs the two generated entries a slice opts in, not merely lists them", async () => {
    // The root list's raw `query` argument is typed `Any` and is left out of the published schema, so it has to
    // reach the endpoint as omitted — not as `{}`, and not as a required value the caller never saw declared.
    const list = await call("serverResolverTestItemList", { limit: 5 });
    expect(list.result.isError).toBe(false);
    expect(list.result.structuredContent).toEqual({ items: [] });
    const read = await post({
      jsonrpc: "2.0",
      id: 1,
      method: "resources/read",
      params: { uri: "akan://serverResolverTestItem/list?limit=5" },
    });
    expect(read.json.result.contents[0].text).toBe('{"items":[]}');
    // And the generated single-document tool answers a missing document the way its resource URI already does.
    const single = await call("serverResolverTestItem", { serverResolverTestItemId: "507f1f77bcf86cd799439011" });
    expect(single.result.isError).toBe(true);
    expect(single.result.content[0].text).toBe("No serverResolverTestItem found for the arguments given.");
  });

  test("ships an empty answer as text alone rather than as a null structuredContent", async () => {
    // `structuredContent: null` is a successful call the official client SDK throws on: the field is typed as an
    // object there, so a nullable model that found nothing has to travel the same way a scalar does.
    const empty = await call("maybeItem");
    expect(empty.result.isError).toBe(false);
    expect(empty.result.content[0].text).toBe("null");
    expect("structuredContent" in empty.result).toBe(false);
    const found = await call("maybeItem", { title: "here" });
    expect(found.result.structuredContent).toMatchObject({ title: "here" });
    const { json } = await post({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    // And no schema is published for it, because a declared one obliges every result to match.
    expect(json.result.tools.find((tool: { name: string }) => tool.name === "maybeItem").outputSchema).toBeUndefined();
  });

  test("reports arguments that are not an object as the caller's own mistake", async () => {
    // Coerced to `{}`, this ran with every argument missing: a tool that takes none simply succeeded, and one
    // that takes some answered "Missing required argument", sending a model to look for a value it did send.
    const called = await post({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "echoTitle", arguments: "oops" },
    });
    expect(called.json.error.code).toBe(-32602);
    expect(called.json.error.message).toBe("`arguments` must be an object of named values.");
    // An array is refused with the rest: MCP names its arguments, so positional ones would read as `0`, `1`, `2`.
    const positional = await post({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "echoTitle", arguments: ["507f1f77bcf86cd799439011"] },
    });
    expect(positional.json.error.code).toBe(-32602);
    expect(positional.json.error.message).toBe("`arguments` must be an object of named values.");
  });

  test("advertises only the capabilities it actually has entries for", async () => {
    // A fixed `{ tools, resources, prompts }` invites three listing round-trips whatever the server carries.
    const initialize = {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-11-25", capabilities: {} },
    };
    const { json } = await post(initialize);
    expect(json.result.capabilities).toEqual({ tools: {}, resources: {} });
    // Prompts are the pages', so the capability follows whether there are pages to ask.
    const { json: withPages } = await postWith(initialize, { pagePrompts: pagePromptsOf(okRun()) });
    expect(withPages.result.capabilities).toEqual({ tools: {}, resources: {}, prompts: {} });
  });

  test("says at boot what it published and what it refused", async () => {
    // Every rejection here is fail-closed and was silent: `publicRenameTitle` names a guard, opts in, and simply
    // is not there. `akan quality scan` cannot cover it — it reads source, where a return type and a guard list
    // are names rather than resolved types — so the boot log is the only place an author can be told.
    const lines: string[] = [];
    const stop = Logger.addSink(({ message }) => void lines.push(message));
    try {
      mcpRouter().report();
      mcpRouter({ readOnly: true }).report();
    } finally {
      stop();
    }
    const log = lines.join("\n");
    // The whole build, not one caller's view: `deniedTitle` and `deniedItem` are in the catalogue and are hidden
    // per credential at listing time, so these counts run ahead of what `tools/list` returned above.
    expect(log).toContain("MCP catalogue: tools=19 resourceTemplates=3 · listing ");
    // Which signals a listing went to, so a catalogue that grew can say where. Every entry inlines the schema of
    // every model it mentions, and the whole thing is re-sent to every agent that connects.
    expect(log).toContain("MCP catalogue cost: serverResolverTestItem 19/");
    expect(lines.find((line) => line.includes('"publicRenameTitle"'))).toContain("`[Public]` is having none");
    // The read-only valve reports itself the same way, rather than leaving an author to wonder where a guarded,
    // deliberately exposed mutation went.
    expect(log).toContain("MCP catalogue: tools=17 resourceTemplates=3 (read-only deployment)");
    expect(lines.find((line) => line.includes('did not expose "renameTitle"'))).toContain("read-only");
    // Published with nothing an agent can pick it by, which is a broken tool rather than an untidy one. These
    // signals carry no dictionary at all, so every entry is named — including the generated ones, whose only
    // possible text is the model's own `.desc()`.
    expect(lines.find((line) => line.includes('exposed "echoTitle" with no description'))).toContain(
      "no dictionary `.desc()`",
    );
    expect(lines.find((line) => line.includes('exposed "serverResolverTestItemList" with no description'))).toContain(
      "`serverResolverTestItem` has no `.desc()`",
    );
    // A read kept out for declaring no guards is named too, and the sentence is the one an author can act on: the
    // slice call's `get: Public` reaches base CRUD and the root slice and never a named slice, which is how an
    // endpoint arrives here without anyone writing anything down.
    expect(lines.find((line) => line.includes('did not expose "hiddenTitle"'))).toContain("declares no guards");
    // A guard that admits no model takes the entry out of the document itself — not hidden per caller, absent —
    // and the reason names the guards so the author can find the one that said so.
    expect(lines.find((line) => line.includes('did not expose "personTitle"'))).toContain("SignedIn, PersonOnly");
    // The root list took `root: Public`, and `echoTitle` wrote `[Public]` itself: both are decisions, both quiet.
    expect(lines.find((line) => line.includes('exposed "serverResolverTestItemList", which'))).toBeUndefined();
    expect(lines.find((line) => line.includes('exposed "echoTitle", which'))).toBeUndefined();
    // Three tools need a credential (`deniedTitle`, `ownedTitle`, `renameTitle`) and nothing here can issue or
    // check one, so the shelf lists tools no client can reach. Said once, at boot; quiet once an issuer is named.
    expect(log).toContain("MCP publishes 3 guarded tool(s) but no authorization server is configured");
    const configured: string[] = [];
    const stopConfigured = Logger.addSink(({ message }) => void configured.push(message));
    try {
      mcpRouter({ auth: { authorizationServers: ["https://app.example.com"] } }).report();
    } finally {
      stopConfigured();
    }
    expect(configured.find((line) => line.includes("no authorization server is configured"))).toBeUndefined();
  });

  test("honours a bearer token and ignores a cookie, the one credential channel the spec admits", async () => {
    const list = { jsonrpc: "2.0", id: 1, method: "tools/list" };
    const owned = { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "ownedTitle" } };
    const names = async (res: Response) =>
      ((await res.json()) as { result: { tools: { name: string }[] } }).result.tools.map((tool) => tool.name);
    expect(await names(await postRaw(list, { authorization: "Bearer u1" }))).toContain("ownedTitle");
    // The same session as a cookie is stripped before the account middleware runs, so this caller is anonymous:
    // the account-guarded tool is off its shelf, and calling it by name is answered with the challenge.
    expect(await names(await postRaw(list, { cookie: "session=u1" }))).not.toContain("ownedTitle");
    const cookieCall = await postRaw(owned, { cookie: "session=u1" });
    expect(cookieCall.status).toBe(401);
    expect(cookieCall.headers.get("WWW-Authenticate")).toContain("resource_metadata=");
    const bearerCall = (await (await postRaw(owned, { authorization: "Bearer u1" })).json()) as {
      result: { content: { text: string }[] };
    };
    expect(bearerCall.result.content[0].text).toBe("owned");
  });

  test("challenges an anonymous initialize once an authorization server is named", async () => {
    const initialize = {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "probe", version: "0" } },
    };
    const send = async (headers: Record<string, string>) =>
      await mcpRoutes({ auth: { authorizationServers: ["https://app.example.com"] } })["/mcp"].POST(
        new Request("http://127.0.0.1:8080/mcp", {
          method: "POST",
          body: JSON.stringify(initialize),
          headers: { "content-type": "application/json", ...headers },
        }),
      );
    // A client starts its OAuth flow on a 401 and on nothing else; an anonymous handshake that succeeded would leave
    // it connected to the anonymous shelf, never asking.
    const anonymous = await send({});
    expect(anonymous.status).toBe(401);
    expect(anonymous.headers.get("WWW-Authenticate")).toContain("resource_metadata=");
    // The same server naming no issuer keeps its anonymous handshake, which is what a public catalogue wants.
    expect((await postRaw(initialize, {})).status).toBe(200);
    // With a token the handshake proceeds; whether that token is any good is the next gate's question.
    expect((await send({ authorization: `Bearer ${"a.b".concat(".c")}` })).status).toBe(200);
  });

  test("refuses a guarded call without naming the guard that refused it", async () => {
    // The framework's own message is `Access denied by guard: None` — the private authorization structure told to
    // the one caller not allowed to see it, which is what the shared "unknown tool" message keeps off the wire.
    // A credential was presented, so this is a tool error rather than a 401 challenge.
    const routes = mcpRoutes();
    const res = await routes["/mcp"].POST(
      new Request("http://127.0.0.1:8080/mcp", {
        method: "POST",
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "deniedTitle" } }),
        headers: { "content-type": "application/json", authorization: "Bearer whatever" },
      }),
    );
    const json = (await res.json()) as { result: { isError: boolean; content: { text: string }[] } };
    expect(json.result.isError).toBe(true);
    expect(json.result.content[0].text).toBe("You are not permitted to perform this action.");
  });

  test("refuses a tool the guards kept out, without confirming it exists", async () => {
    const json = await call("hiddenTitle", { id: "507f1f77bcf86cd799439011" });
    expect(json.error.code).toBe(-32602);
    expect(json.error.message).toBe("Unknown tool: hiddenTitle.");
  });

  test("names the argument a caller got wrong instead of reporting a server failure", async () => {
    // Both of these are one keystroke away for a model, and both used to answer "the server failed" — a lie that
    // also wrote a stack to the server log on every attempt.
    const missing = await call("echoTitle");
    expect(missing.result.isError).toBe(true);
    expect(missing.result.content[0].text).toBe('Missing required argument "id".');
    const invalid = await call("echoTitle", { id: 12345 });
    expect(invalid.result.isError).toBe(true);
    expect(invalid.result.content[0].text).toBe('Invalid argument "id": expected ID.');
  });

  test("says a document is missing rather than that the server failed", async () => {
    const uri = "akan://serverResolverTestItem/507f1f77bcf86cd799439011";
    const { json } = await post({ jsonrpc: "2.0", id: 1, method: "resources/read", params: { uri } });
    // An `invalid params` whose message reads "the server failed to complete this request" contradicts itself,
    // and tells an agent holding a stale id nothing it can act on. The framework's own wording is not that
    // message either: `No Document (x): <id>` is a shape internal callers match on, and echoing the id back
    // says nothing the caller did not just send.
    expect(json.error.code).toBe(-32602);
    expect(json.error.message).toBe("No serverResolverTestItem found for the arguments given.");
  });

  test("refuses an argument nobody declared instead of dropping it", async () => {
    // `additionalProperties: false` is published, but this server does not validate against it and plenty of
    // clients do not either — so an extra name was read by nobody. `{ category, status }` on a slice that filters
    // by category alone came back a successful, unfiltered list, which a model reads as its filter having applied.
    const dropped = await call("serverResolverTestItemListInCategory", { category: "all", status: "active" });
    expect(dropped.result.isError).toBe(true);
    expect(dropped.result.content[0].text).toBe('Unknown argument "status".');
    // The framework's own pagination args are declared and stay callable.
    expect((await call("serverResolverTestItemListInCategory", { category: "all", limit: 5 })).result.isError).toBe(
      false,
    );
  });

  test("refuses a value sent for the Any argument it left out of the schema", async () => {
    // The root list names a filter through `queryKey` and passes that filter's own args through `args`, which is
    // `Any` and so published nowhere: an `Any` schema tells a model nothing. A model may still pick a filter that
    // needs no arguments, which is the narrowing the key exists to make deliberate.
    const raw = await call("serverResolverTestItemList", { args: ["all"] });
    expect(raw.result.isError).toBe(true);
    expect(raw.result.content[0].text).toBe('Unknown argument "args".');
    expect((await call("serverResolverTestItemList", { queryKey: "any" })).result.isError).toBe(false);
  });

  test("lifts a lone value into the list an argument was declared as", async () => {
    // A model types a bare string for an array argument, and form-style uri expansion writes one `?tags=` for a
    // single tag. The http path never meets this because `searchParams.getAll` is always an array.
    expect((await call("joinTags", { tags: "solo" })).result.content[0].text).toBe("solo");
    expect((await call("joinTags", { tags: ["a", "b"] })).result.content[0].text).toBe("a|b");
  });

  test("reports an unexpected failure without leaking its message or stack", async () => {
    const json = await call("failingTitle");
    expect(json.result.isError).toBe(true);
    expect(json.result.content[0].text).toBe("The server failed to complete this request.");
    expect(JSON.stringify(json)).not.toContain("boom");
  });

  test("reads a resource through the same path as its tool", async () => {
    const { json } = await post({
      jsonrpc: "2.0",
      id: 1,
      method: "resources/read",
      params: { uri: "akan://serverResolverTestItem/list/inCategory?category=all" },
    });
    expect(json.result.contents[0]).toEqual({
      uri: "akan://serverResolverTestItem/list/inCategory?category=all",
      mimeType: "application/json",
      text: '{"items":[]}',
    });
  });

  test("refuses a value outside its enum", async () => {
    // `enumOf` erases to `String` in every argRef, so the parser passed `"year"` through and the endpoint ran on
    // a value the published schema said could not exist.
    const ok = await call("periodTitle", { period: "day" });
    expect(ok.result.content[0].text).toBe("period:day");
    const bad = await call("periodTitle", { period: "year" });
    expect(bad.result.isError).toBe(true);
    expect(bad.result.content[0].text).toBe('Invalid argument "period": expected one of day, month.');
    // A tool's list is a JSON array already; a bare string is lifted whole, comma and all.
    const joined = await call("joinTags", { tags: "a,b" });
    expect(joined.result.content[0].text).toBe("a,b");
  });

  test("lists page prompts as the pages declared them", async () => {
    const { json } = await postWith(
      { jsonrpc: "2.0", id: 1, method: "prompts/list" },
      { pagePrompts: pagePromptsOf(okRun()) },
    );
    expect(json.result.prompts).toEqual([
      { name: "briefItem", description: briefEntry.description, arguments: briefEntry.arguments },
    ]);
    // Without pages there is nothing to list, and nothing was advertised.
    const { json: none } = await post({ jsonrpc: "2.0", id: 1, method: "prompts/list" });
    expect(none.result.prompts).toEqual([]);
  });

  test("answers a page prompt with the screen's data, addressed and masked, and the tools of its modules", async () => {
    const { json } = await postWith(promptsGet({ serverResolverTestItemId: itemId }), {
      pagePrompts: pagePromptsOf(okRun()),
    });
    expect(json.result.description).toBe(briefEntry.description);
    const messages = json.result.messages as { role: string; content: any }[];
    expect(messages[0]).toEqual({
      role: "user",
      content: { type: "text", text: briefEntry.description, annotations: { priority: 1 } },
    });
    // A generated read is attached under the uri `resources/read` answers, so a model can fetch it again.
    expect(messages[1].content).toMatchObject({
      type: "resource",
      resource: { uri: "akan://serverResolverTestItem/list/inCategory?category=all", mimeType: "application/json" },
    });
    expect(JSON.parse(messages[1].content.resource.text)).toHaveLength(2);
    // A custom read has no template and is addressed by its own call.
    expect(messages[2].content.resource.uri).toBe(`akan://echoTitle?id=${itemId}&suffix=x`);
    expect(JSON.parse(messages[2].content.resource.text)).toBe(`${itemId}:x`);
    // The screen fetched from one module, so its published tools are the ones offered — not the whole shelf, and
    // not the reads whose answers are already attached above.
    const tools = messages.at(-1)?.content.text as string;
    expect(tools).toStartWith("Tools for this screen: ");
    expect(tools).toContain("serverResolverTestItemList,");
    expect(tools).toContain("maybeItem");
    expect(tools).not.toContain("serverResolverTestItemListInCategory");
    expect(tools).not.toContain("echoTitle");
    expect(tools).not.toContain("deniedTitle");
  });

  test("attaches one document once when a layout and its page read it in two shapes", async () => {
    const doc = {
      id: itemId,
      title: "shot",
      category: "all",
      createdAt: "1970-01-01T00:00:00.000Z",
      updatedAt: "1970-01-01T00:00:00.000Z",
    };
    const run: PagePromptRun = {
      ok: true,
      url: `http://127.0.0.1/en/item/${itemId}`,
      records: [
        {
          key: "lightServerResolverTestItem",
          args: { serverResolverTestItemId: itemId },
          returns: { refName: "serverResolverTestItem", modelType: "light" },
          value: { id: doc.id, title: doc.title },
        },
        {
          key: "serverResolverTestItem",
          args: { serverResolverTestItemId: itemId },
          returns: { refName: "serverResolverTestItem", modelType: "full" },
          value: doc,
        },
      ],
    };
    const { json } = await postWith(promptsGet({ serverResolverTestItemId: itemId }), {
      pagePrompts: pagePromptsOf(run),
    });
    const resources = (json.result.messages as { content: any }[]).filter((m) => m.content.type === "resource");
    expect(resources).toHaveLength(1);
    expect(resources[0]?.content.resource.uri).toBe(`akan://serverResolverTestItem/${itemId}`);
    expect(JSON.parse(resources[0]?.content.resource.text)).toMatchObject({ category: "all" });
  });

  test("attaches a primitive the screen fetched in its agent face", async () => {
    const run: PagePromptRun = {
      ok: true,
      url: `http://127.0.0.1/en/item/${itemId}`,
      records: [{ key: "outlineText", args: {}, returns: { refName: "McpOutline" }, value: { lines: ["# A", "b"] } }],
    };
    const { json } = await postWith(promptsGet({ serverResolverTestItemId: itemId }), {
      pagePrompts: pagePromptsOf(run),
    });
    const resources = (json.result.messages as { content: any }[]).filter((m) => m.content.type === "resource");
    expect(JSON.parse(resources[0]?.content.resource.text)).toBe("# A\nb");
  });

  test("points a prompt missing its required argument at the tool that finds the id", async () => {
    const { json } = await postWith(promptsGet({}), { pagePrompts: pagePromptsOf(okRun()) });
    expect(json.result.messages).toEqual([
      {
        role: "user",
        content: {
          type: "text",
          text: 'No serverResolverTestItemId was named for "briefItem". Find it with `serverResolverTestItemList`, then run this prompt again with serverResolverTestItemId=<id>.',
        },
      },
    ]);
  });

  test("cuts the largest list to the prompt budget and says how much was cut", async () => {
    const { json } = await postWith(promptsGet({ serverResolverTestItemId: itemId }), {
      pagePrompts: pagePromptsOf(okRun(64)),
      promptBudget: 3000,
    });
    const messages = json.result.messages as { content: any }[];
    const attached = JSON.parse(messages[1].content.resource.text) as unknown[];
    expect(attached.length).toBeLessThan(64);
    expect(attached.length).toBeGreaterThan(0);
    const note = messages.find((m) => m.content.type === "text" && m.content.text.startsWith("Attached the first"));
    expect(note?.content.text).toBe(
      `Attached the first ${attached.length} of 64 rows of \`serverResolverTestItemListInCategory\`; call it for the rest.`,
    );
  });

  test("turns a page's refusals into the caller's, and a sign-in redirect into the credential challenge", async () => {
    const argument: PagePromptRun = {
      ok: false,
      reason: "argument",
      message: 'Invalid argument "tags": expected String[].',
    };
    const { json: bad } = await postWith(promptsGet({ serverResolverTestItemId: itemId, tags: "x" }), {
      pagePrompts: pagePromptsOf(argument),
    });
    expect(bad.error).toEqual({ code: -32602, message: 'Invalid argument "tags": expected String[].' });
    const redirect: PagePromptRun = { ok: false, reason: "redirect", message: "The page redirects to /signin." };
    // No credential: told to get one, the way a guarded tool tells a client.
    const { res } = await postWith(promptsGet({ serverResolverTestItemId: itemId }), {
      pagePrompts: pagePromptsOf(redirect),
    });
    expect(res.status).toBe(401);
    // With one, the account simply may not see this screen — and the location it was sent to stays private.
    const { json: refused } = await postAs(
      promptsGet({ serverResolverTestItemId: itemId }),
      { Authorization: "Bearer not-a-real-token" },
      { pagePrompts: pagePromptsOf(redirect) },
    );
    expect(refused.error.code).toBe(-32602);
    expect(refused.error.message).toBe("This screen is not available to the signed-in account.");
    expect(JSON.stringify(refused)).not.toContain("/signin");
    // A guard refusing a query inside the body is the screen refusing this account, said the same way.
    const forbidden: PagePromptRun = {
      ok: false,
      reason: "forbidden",
      message: "A query the screen makes refused the caller (403).",
    };
    const { res: challenged } = await postWith(promptsGet({ serverResolverTestItemId: itemId }), {
      pagePrompts: pagePromptsOf(forbidden),
    });
    expect(challenged.status).toBe(401);
    const { json: gated } = await postAs(
      promptsGet({ serverResolverTestItemId: itemId }),
      { Authorization: "Bearer not-a-real-token" },
      { pagePrompts: pagePromptsOf(forbidden) },
    );
    expect(gated.error.message).toBe("This screen is not available to the signed-in account.");
    const failed: PagePromptRun = { ok: false, reason: "error", message: "boom: internal detail" };
    const { json: internal } = await postWith(promptsGet({ serverResolverTestItemId: itemId }), {
      pagePrompts: pagePromptsOf(failed),
    });
    expect(internal.error.message).toBe("The page failed to load.");
    expect(JSON.stringify(internal)).not.toContain("boom");
    const { json: unknown } = await postWith(
      { ...promptsGet({}), params: { name: "nope", arguments: {} } },
      { pagePrompts: pagePromptsOf(okRun()) },
    );
    expect(unknown.error.message).toBe("Unknown prompt: nope.");
  });

  test("leaves a visual field out of what an agent is handed, and in what the page is", async () => {
    const json = await call("visualItem");
    expect(json.result.structuredContent).toMatchObject({ id: "507f1f77bcf86cd799439011", title: "shot" });
    expect("preview" in json.result.structuredContent).toBe(false);
    expect(json.result.content[0].text).not.toContain("base64");
    // The point of a `visual` field is that a browser still receives it — stripping it in `resolveReturn` would
    // have taken it off the page too, which is why the strip lives in the MCP dispatcher instead.
    const routes = httpRoutes as Record<string, { GET: (req: Request) => Promise<Response> }>;
    const response = await routes["/serverResolverTestItem/visualItem"].GET(
      new Request("http://127.0.0.1:8080/api/serverResolverTestItem/visualItem"),
    );
    expect(await response.json()).toMatchObject({ title: "shot", preview: "data:image/png;base64,AAAA" });
  });

  test("hands an agent-faced primitive to an agent in its face, and to the page in its stored shape", async () => {
    const text = await call("outlineText");
    expect(text.result.content[0].text).toBe("# Title\ntext");
    const item = await call("outlineItem");
    expect(item.result.structuredContent).toMatchObject({ title: "guide", outline: "# Guide\nbody" });
    const routes = httpRoutes as Record<string, { GET: (req: Request) => Promise<Response> }>;
    const response = await routes["/serverResolverTestItem/outlineText"].GET(
      new Request("http://127.0.0.1:8080/api/serverResolverTestItem/outlineText"),
    );
    expect(await response.json()).toEqual({ lines: ["# Title", "text"] });
  });

  test("takes an agent-faced primitive argument in its face, parsed before the handler sees it", async () => {
    const json = await call("rewriteOutline", { outline: "# One\ntwo\nthree" });
    expect(json.result.content[0].text).toBe("lines:3");
  });

  test("compiles the root list's queryKey and args into the filter the model declared", async () => {
    const routes = httpRoutes as Record<string, { GET: (req: Request) => Promise<Response> }>;
    const list = async (search: string) =>
      await routes["/serverResolverTestItem/serverResolverTestItemList"].GET(
        new Request(`http://127.0.0.1:8080/api/serverResolverTestItem/serverResolverTestItemList${search}`),
      );

    // `args` rides the query string JSON-encoded, which is the only spelling `Any` has there.
    const named = await list(`?queryKey=inCategory&args=${encodeURIComponent('["news"]')}&limit=5`);
    expect(named.status).toBe(200);
    // No key at all is the `any` filter every model carries.
    expect((await list("?limit=5")).status).toBe(200);
    // A filter arg the caller left out is refused rather than widening the query to every row, and a refusal
    // the caller can fix answers 400 — only a throw from inside the filter itself is the app's own 500.
    expect((await list("?queryKey=inCategory")).status).toBe(400);
    expect((await list("?queryKey=notAFilter")).status).toBe(400);
    expect((await list("?queryKey=inCategory&args=not-json")).status).toBe(400);
  });

  test("stops sending the structured result twice when the legacy text block is turned off", async () => {
    const body = { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "visualItem", arguments: {} } };
    // The default duplicates on purpose — that is what the spec asks of a server for clients predating
    // `structuredContent` — and it is also a flat doubling of what every model-returning tool costs.
    const { json: both } = await postWith(body, {});
    expect(JSON.parse(both.result.content[0].text)).toEqual(both.result.structuredContent);
    const { json: once } = await postWith(body, { legacyTextBlock: false });
    expect(once.result.structuredContent).toMatchObject({ id: "507f1f77bcf86cd799439011", title: "shot" });
    expect(once.result.content[0].text).toBe("The result is in this call's structuredContent.");
  });

  test("reads a resource whole when the legacy text block is turned off", async () => {
    // `ReadResourceResult` has no `structuredContent`, so the pointer a tool result leaves in its text block would
    // send a client to a field this reply cannot have. Every resource of a deployment that took the option was
    // answering with that one sentence.
    const body = {
      jsonrpc: "2.0",
      id: 1,
      method: "resources/read",
      params: { uri: "akan://serverResolverTestItem/list/inCategory?category=all" },
    };
    const { json } = await postWith(body, { legacyTextBlock: false });
    expect(json.result.contents[0].text).toBe('{"items":[]}');
  });

  test("keeps the text block whole for a scalar return, which has no structured half to point at", async () => {
    const body = {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "echoTitle", arguments: { id: "507f1f77bcf86cd799439011", suffix: "tail" } },
    };
    const { json } = await postWith(body, { legacyTextBlock: false });
    expect(json.result.content[0].text).toBe("507f1f77bcf86cd799439011:tail");
  });

  test("walks the catalogue a page at a time and stops without a cursor", async () => {
    const names: string[] = [];
    let cursor: string | undefined;
    do {
      const { json } = await postPaged(
        { jsonrpc: "2.0", id: 1, method: "tools/list", ...(cursor ? { params: { cursor } } : {}) },
        3,
      );
      names.push(...json.result.tools.map((tool: { name: string }) => tool.name));
      cursor = json.result.nextCursor;
    } while (cursor);
    const { json } = await post({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    expect(names).toEqual(json.result.tools.map((tool: { name: string }) => tool.name));
    // One page holds the whole catalogue here, so there is nothing left to point at.
    expect(json.result.nextCursor).toBeUndefined();
  });

  test("refuses a cursor that addresses nothing rather than serving a short page", async () => {
    const { json } = await post({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: { cursor: Buffer.from("999").toString("base64url") },
    });
    expect(json.error.code).toBe(-32602);
    expect(json.error.message).toBe("Invalid cursor.");
  });

  test("refuses a cursor that decodes to nothing instead of restarting the walk", async () => {
    // `Number("")` is 0, so an empty cursor would read as "start from the beginning" and hand a client that
    // corrupted its cursor page one again, forever.
    for (const cursor of ["", "===="]) {
      const { json } = await post({ jsonrpc: "2.0", id: 1, method: "tools/list", params: { cursor } });
      expect(json.error?.message).toBe("Invalid cursor.");
    }
  });

  test("tells a modern client how long a catalogue may be cached, and per whom", async () => {
    const meta = {
      "io.modelcontextprotocol/protocolVersion": "2026-07-28",
      "io.modelcontextprotocol/clientCapabilities": {},
    };
    // The modern era mirrors the version and the method into headers on every POST, and one that omits either
    // is refused — a gateway rule keyed on a header does not fire for a request that left the header out.
    const modern = async (method: string) =>
      await (
        await postRaw(
          { jsonrpc: "2.0", id: 1, method, params: { _meta: meta } },
          { "mcp-method": method, "mcp-protocol-version": "2026-07-28" },
        )
      ).json();
    const json = await modern("tools/list");
    // Private because `filterForAccount` makes the listing depend on the caller's credential.
    expect(json.result.cacheScope).toBe("private");
    expect(json.result.ttlMs).toBe(300_000);
    const discover = await modern("server/discover");
    expect(discover.result.cacheScope).toBe("public");
    const legacy = await post({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    expect(legacy.json.result.cacheScope).toBeUndefined();
  });

  test("streams progress and then the result when the caller asks for both", async () => {
    const res = await postRaw(
      {
        jsonrpc: "2.0",
        id: 7,
        method: "tools/call",
        params: { name: "slowTitle", arguments: {}, _meta: { progressToken: "tok-1" } },
      },
      { accept: "application/json, text/event-stream" },
    );
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    // An intermediary that buffers the stream would deliver every event only once the work already finished.
    expect(res.headers.get("x-accel-buffering")).toBe("no");
    const messages = (await res.text())
      .split("\n\n")
      .flatMap((frame) => (frame.startsWith("data: ") ? [JSON.parse(frame.slice(6))] : []));
    expect(messages.map((message) => message.method ?? "result")).toEqual([
      "notifications/progress",
      "notifications/progress",
      "result",
    ]);
    expect(messages[0].params).toEqual({ progressToken: "tok-1", progress: 1, total: 2, message: "counting" });
    expect(messages[1].params).toEqual({ progressToken: "tok-1", progress: 2, total: 2 });
    // The final message is the ordinary JSON-RPC response — a streamed call answers nothing extra.
    expect(messages[2]).toMatchObject({ jsonrpc: "2.0", id: 7, result: { isError: false } });
    expect(messages[2].result.content[0].text).toBe("counted");
  });

  test("answers with plain JSON unless the caller asks for a stream and names a token", async () => {
    const call = { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "slowTitle", arguments: {} } };
    // A token with no stream to carry it, and a stream with no token to correlate against, are both just a call.
    const tokenOnly = await postRaw({ ...call, params: { ...call.params, _meta: { progressToken: "t" } } }, {});
    expect(tokenOnly.headers.get("content-type")).toContain("application/json");
    const streamOnly = await postRaw(call, { accept: "text/event-stream" });
    expect(streamOnly.headers.get("content-type")).toContain("application/json");
    expect((await streamOnly.json()).result.content[0].text).toBe("counted");
  });

  test("keeps the 401 challenge reachable by deciding to stream only after guards pass", async () => {
    // `None` refuses before the endpoint body could report anything, so the response is still a plain status.
    const res = await postRaw(
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "deniedTitle", arguments: {}, _meta: { progressToken: "t" } },
      },
      { accept: "text/event-stream" },
    );
    expect(res.status).toBe(401);
    expect(res.headers.get("WWW-Authenticate")).toContain("resource_metadata=");
  });

  test("lets a configured browser origin past the preflight and reads its own answer", async () => {
    // `allowedOrigins` grants a browser-hosted client nothing on its own: `content-type: application/json` and
    // the `mcp-*` mirror headers each force a preflight, and an answer with no `access-control-allow-origin` is
    // unreadable to the page that asked for it.
    const routes = mcpRoutes({ allowedOrigins: ["https://console.example.com"] });
    const headers = { origin: "https://console.example.com" };
    const preflight = await routes["/mcp"].OPTIONS(
      new Request("http://127.0.0.1:8080/mcp", {
        method: "OPTIONS",
        headers: { ...headers, "access-control-request-headers": "authorization, mcp-method" },
      }),
    );
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe("https://console.example.com");
    expect(preflight.headers.get("access-control-allow-headers")).toBe("authorization, mcp-method");
    const res = await routes["/mcp"].POST(
      new Request("http://127.0.0.1:8080/mcp", {
        method: "POST",
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
        headers: { "content-type": "application/json", ...headers },
      }),
    );
    expect(res.headers.get("access-control-allow-origin")).toBe("https://console.example.com");
    expect(res.headers.get("vary")).toBe("origin");
    const refused = await routes["/mcp"].OPTIONS(
      new Request("http://127.0.0.1:8080/mcp", { method: "OPTIONS", headers: { origin: "https://evil.example.com" } }),
    );
    expect(refused.status).toBe(403);
  });

  test("lets a browser read the 405 for a verb this transport does not have", async () => {
    // Legacy clients probe `GET /mcp` for a server-opened stream. Without the CORS header the browser hands the
    // page an unlabelled network error, which is indistinguishable from the server being unreachable.
    const routes = mcpRoutes({ allowedOrigins: ["https://console.example.com"] });
    const headers = { origin: "https://console.example.com" };
    for (const method of ["GET", "DELETE"] as const) {
      const res = await routes["/mcp"][method](new Request("http://127.0.0.1:8080/mcp", { method, headers }));
      expect(res.status).toBe(405);
      expect(res.headers.get("access-control-allow-origin")).toBe("https://console.example.com");
    }
  });

  test("matches an Origin against the public host rather than the one the proxy dialed", async () => {
    // The same mismatch the resource identifier had: behind the gateway `req.url` names the internal child, so a
    // browser client whose `Origin` is the public URL is refused on every request.
    const proxied = (headers: Record<string, string>) =>
      mcpRoutes()["/mcp"].POST(
        new Request("http://akan-child:9001/mcp", {
          method: "POST",
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
          headers: { "content-type": "application/json", origin: "https://app.example.com", ...headers },
        }),
      );
    const forwarded = await proxied({ "x-forwarded-host": "app.example.com", "x-forwarded-proto": "https" });
    expect(forwarded.status).toBe(200);
    expect(forwarded.headers.get("access-control-allow-origin")).toBe("https://app.example.com");
    // Without the forwarded headers the origin really is a stranger, and the rebinding defence still holds.
    expect((await proxied({})).status).toBe(403);
  });

  test("advertises the templates its exposed reads are addressable by", async () => {
    const { json } = await post({ jsonrpc: "2.0", id: 1, method: "resources/templates/list" });
    expect(json.result.resourceTemplates.map((t: { uriTemplate: string }) => t.uriTemplate)).toEqual([
      "akan://serverResolverTestItem/{serverResolverTestItemId}",
      "akan://serverResolverTestItem/list{?queryKey,skip,limit,sort}",
      "akan://serverResolverTestItem/list/inCategory{?category,skip,limit,sort}",
    ]);
  });
});
