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
  ImageResult,
  type PrimitiveAgentFace,
  PrimitiveRegistry,
  PrimitiveScalar,
  SERVER_VALUE,
} from "akanjs/base";
import { Logger } from "akanjs/common";
import { ConstantRegistry, via } from "akanjs/constant";
import { endpoint } from "../../signal/endpoint";
import { Exception } from "../../signal/exception";
import type { Guard, GuardScope } from "../../signal/guard";
import { None, Public } from "../../signal/guards";
import { internal } from "../../signal/internal";
import { MCP_APP_META, McpProgress } from "../../signal/mcp";
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

// Signals and models live here, not in the shared resolver fixture: changing it alters every other test's output.

// Says yes like `Public` does, but is a real guard — which is the whole difference an exposed mutation turns on.
class SignedIn implements Guard {
  static name = "SignedIn";
  static scope: GuardScope = "account";
  canPass() {
    return true;
  }
}

// Reads both channels an app's account middleware reads, so the suite can show which one `/mcp` honours.
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

// Marked `account` yet reads an argument — the mismark a listing evaluates with none, and throws on.
class ReadsArgument implements Guard {
  static name = "ReadsArgument";
  static scope: GuardScope = "account";
  canPass(context: SignalContext) {
    return (context.getArg<string>("id") as string).length > 0;
  }
}

// Would pass anyone at call time; what keeps it off the shelf is the declaration that no model may.
class PersonOnly implements Guard {
  static name = "PersonOnly";
  static scope: GuardScope = "account";
  static agents = false;
  canPass() {
    return true;
  }
}

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

const pixelPng = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

class McpItemSlice extends slice(
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

class Period extends enumOf("mcpItemPeriod", ["day", "month"] as const) {}

class McpItemEndpoint extends endpoint(serverResolverTestServiceModel, (builder) => ({
  echoTitle: builder
    .query(String, { guards: [Public] })
    .param("id", ID)
    .search("suffix", String)
    .exec((id, suffix) => `${id}:${suffix ?? "none"}`),
  // Declares no guards, which is what keeps it out of the catalogue.
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
  shotImage: builder
    .query(ImageResult, { guards: [Public] })
    .search("caption", String)
    .exec((caption) => ({ data: pixelPng, mimeType: "image/png", ...(caption ? { caption } : {}) })),
  shotImages: builder.query([ImageResult], { guards: [Public] }).exec(() => [
    { data: pixelPng, mimeType: "image/png", caption: "first" },
    { data: pixelPng, mimeType: "image/webp" },
  ]),
  dataUrlShot: builder
    .query(ImageResult, { guards: [Public] })
    .exec(() => ({ data: `data:image/png;base64,${pixelPng}`, mimeType: "image/png" })),
  rewriteOutline: builder
    .mutation(String, { guards: [SignedIn] })
    .body("outline", McpOutline)
    .exec((outline) => `lines:${outline.lines.length}`),
  retitleOutline: builder
    .mutation(String, { guards: [SignedIn] })
    .body("item", McpOutlineInput)
    .exec((item) => `${item.title}:${item.outline.lines.length}`),
  failingTitle: builder.query(String, { guards: [Public] }).exec(() => {
    throw new Error("boom: internal detail that must not travel");
  }),
  lockedTitle: builder
    .query(String, { guards: [Public] })
    .param("id", ID)
    .exec((id) => {
      throw new Exception(409, "mcpItem.error.locked", { field: "title" }, { id });
    }),
  vendorTitle: builder.query(String, { guards: [Public] }).exec(() => {
    throw Object.assign(new Error("GET https://vendor.example/?key=secret 422"), { statusCode: 422, data: { raw: 1 } });
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
  // A step a screen drives: guarded, and kept off the model's shelf.
  quietTitle: builder
    .query(String, { guards: [SignedIn], mcp: false })
    .param("id", ID)
    .exec((id) => `${id}:quiet`),
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

const rpc = (method: string, params?: object) => ({ jsonrpc: "2.0", id: 1, method, ...(params ? { params } : {}) });

const call = async (name: string, args: Record<string, unknown> = {}) =>
  (await post(rpc("tools/call", { name, arguments: args }))).json;

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
const pagePromptsOf = (run: PagePromptRun, entries: PagePromptEntry[] = [briefEntry]): PagePromptSource => ({
  list: async () => entries,
  run: async () => run,
});
const promptsGet = (args: Record<string, string>) => rpc("prompts/get", { name: "briefItem", arguments: args });

describe("MCP over a booted container", () => {
  test("names an account guard that reaches for arguments, once, and hides its entry without an error line", async () => {
    // Must stay first in the file: the warning is said once per guard and endpoint for the life of the process.
    const lines: string[] = [];
    const stop = Logger.addSink(({ message }) => void lines.push(message));
    try {
      const { json } = await post(rpc("tools/list"));
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
    expect(lines.some((line) => line.startsWith("Error query-"))).toBe(false);
  });

  test("lists every endpoint its guards admit", async () => {
    const { json } = await post(rpc("tools/list"));
    expect(json.result.tools.map((tool: { name: string }) => tool.name)).toEqual([
      "dataUrlShot",
      "echoTitle",
      "failingTitle",
      "joinTags",
      "lockedTitle",
      "maybeItem",
      "outlineItem",
      "outlineText",
      "periodTitle",
      "renameTitle",
      "retitleOutline",
      "rewriteOutline",
      "serverResolverTestItem",
      "serverResolverTestItemInsight",
      "serverResolverTestItemInsightInCategory",
      "serverResolverTestItemList",
      "serverResolverTestItemListInCategory",
      "shotImage",
      "shotImages",
      "slowTitle",
      "vendorTitle",
      "visualItem",
    ]);
  });

  test("refuses an exposed mutation whose only guard is Public", async () => {
    const { json } = await post(rpc("tools/list"));
    expect(json.result.tools.map((tool: { name: string }) => tool.name)).not.toContain("publicRenameTitle");
    const called = await call("publicRenameTitle", { id: "507f1f77bcf86cd799439011" });
    expect(called.error.message).toBe("Unknown tool: publicRenameTitle.");
  });

  test("answers ping", async () => {
    const { json } = await post(rpc("ping"));
    expect(json.result).toEqual({});
    expect(json.error).toBeUndefined();
  });

  test("hides what an account-scoped guard already refuses this caller", async () => {
    const { json } = await post(rpc("tools/list"));
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
    expect(json.result.content[0].text).toBe("507f1f77bcf86cd799439011:tail");
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
    const list = await call("serverResolverTestItemList", { limit: 5 });
    expect(list.result.isError).toBe(false);
    expect(list.result.structuredContent).toEqual({ items: [] });
    const read = await post(rpc("resources/read", { uri: "akan://serverResolverTestItem/list?limit=5" }));
    expect(read.json.result.contents[0].text).toBe('{"items":[]}');
    const single = await call("serverResolverTestItem", { serverResolverTestItemId: "507f1f77bcf86cd799439011" });
    expect(single.result.isError).toBe(true);
    expect(single.result.content[0].text).toBe("No serverResolverTestItem found for the arguments given.");
  });

  test("ships an empty answer as text alone rather than as a null structuredContent", async () => {
    // The official client SDK throws on `structuredContent: null`: it types the field as an object.
    const empty = await call("maybeItem");
    expect(empty.result.isError).toBe(false);
    expect(empty.result.content[0].text).toBe("null");
    expect("structuredContent" in empty.result).toBe(false);
    const found = await call("maybeItem", { title: "here" });
    expect(found.result.structuredContent).toMatchObject({ title: "here" });
    const { json } = await post(rpc("tools/list"));
    // No outputSchema either: a declared one obliges every result to match.
    expect(json.result.tools.find((tool: { name: string }) => tool.name === "maybeItem").outputSchema).toBeUndefined();
  });

  test("reports arguments that are not an object as the caller's own mistake", async () => {
    const called = await post(rpc("tools/call", { name: "echoTitle", arguments: "oops" }));
    expect(called.json.error.code).toBe(-32602);
    expect(called.json.error.message).toBe("`arguments` must be an object of named values.");
    const positional = await post(rpc("tools/call", { name: "echoTitle", arguments: ["507f1f77bcf86cd799439011"] }));
    expect(positional.json.error.code).toBe(-32602);
    expect(positional.json.error.message).toBe("`arguments` must be an object of named values.");
  });

  test("advertises only the capabilities it actually has entries for", async () => {
    const initialize = rpc("initialize", { protocolVersion: "2025-11-25", capabilities: {} });
    const { json } = await post(initialize);
    expect(json.result.capabilities).toEqual({ tools: {}, resources: {} });
    const { json: withPages } = await postWith(initialize, { pagePrompts: pagePromptsOf(okRun()) });
    expect(withPages.result.capabilities).toEqual({ tools: {}, resources: {}, prompts: {} });
  });

  test("says at boot what it published and what it refused", async () => {
    const lines: string[] = [];
    const stop = Logger.addSink(({ message }) => void lines.push(message));
    try {
      mcpRouter().report();
      mcpRouter({ readOnly: true }).report();
    } finally {
      stop();
    }
    const log = lines.join("\n");
    // The whole build, not one caller's view: per-credential hiding makes these counts exceed tools/list above.
    expect(log).toContain("MCP catalogue: tools=25 resourceTemplates=3 · listing ");
    expect(log).toContain("MCP catalogue cost: serverResolverTestItem 25/");
    expect(lines.find((line) => line.includes('"publicRenameTitle"'))).toContain("`[Public]` is having none");
    expect(log).toContain("MCP catalogue: tools=22 resourceTemplates=3 (read-only deployment)");
    expect(lines.find((line) => line.includes('did not expose "renameTitle"'))).toContain("read-only");
    // These signals carry no dictionary, so every entry, generated ones included, is named.
    expect(lines.find((line) => line.includes('exposed "echoTitle" with no description'))).toContain(
      "no dictionary `.desc()`",
    );
    expect(lines.find((line) => line.includes('exposed "serverResolverTestItemList" with no description'))).toContain(
      "`serverResolverTestItem` has no `.desc()`",
    );
    expect(lines.find((line) => line.includes('did not expose "hiddenTitle"'))).toContain("declares no guards");
    expect(lines.find((line) => line.includes('did not expose "personTitle"'))).toContain("SignedIn, PersonOnly");
    // An explicit `Public` (`root: Public`, `[Public]`) is a decision, so neither entry is warned about.
    expect(lines.find((line) => line.includes('exposed "serverResolverTestItemList", which'))).toBeUndefined();
    expect(lines.find((line) => line.includes('exposed "echoTitle", which'))).toBeUndefined();
    // deniedTitle, ownedTitle and renameTitle need a credential, and no issuer is configured.
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
    const list = rpc("tools/list");
    const owned = rpc("tools/call", { name: "ownedTitle" });
    const names = async (res: Response) =>
      ((await res.json()) as { result: { tools: { name: string }[] } }).result.tools.map((tool) => tool.name);
    expect(await names(await postRaw(list, { authorization: "Bearer u1" }))).toContain("ownedTitle");
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
    const initialize = rpc("initialize", {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "probe", version: "0" },
    });
    const send = async (headers: Record<string, string>) =>
      await mcpRoutes({ auth: { authorizationServers: ["https://app.example.com"] } })["/mcp"].POST(
        new Request("http://127.0.0.1:8080/mcp", {
          method: "POST",
          body: JSON.stringify(initialize),
          headers: { "content-type": "application/json", ...headers },
        }),
      );
    const anonymous = await send({});
    expect(anonymous.status).toBe(401);
    expect(anonymous.headers.get("WWW-Authenticate")).toContain("resource_metadata=");
    expect((await postRaw(initialize, {})).status).toBe(200);
    expect((await send({ authorization: `Bearer ${"a.b".concat(".c")}` })).status).toBe(200);
  });

  test("refuses a guarded call without naming the guard that refused it", async () => {
    // A credential was presented, so this is a tool error rather than a 401 challenge.
    const { json } = await postAs(rpc("tools/call", { name: "deniedTitle" }), { authorization: "Bearer whatever" }, {});
    expect(json.result.isError).toBe(true);
    expect(json.result.content[0].text).toBe("You are not permitted to perform this action.");
  });

  test("refuses a tool the guards kept out, without confirming it exists", async () => {
    const json = await call("hiddenTitle", { id: "507f1f77bcf86cd799439011" });
    expect(json.error.code).toBe(-32602);
    expect(json.error.message).toBe("Unknown tool: hiddenTitle.");
  });

  test("names the argument a caller got wrong instead of reporting a server failure", async () => {
    const missing = await call("echoTitle");
    expect(missing.result.isError).toBe(true);
    expect(missing.result.content[0].text).toBe('Missing required argument "id".');
    const invalid = await call("echoTitle", { id: 12345 });
    expect(invalid.result.isError).toBe(true);
    expect(invalid.result.content[0].text).toBe('Invalid argument "id": expected ID.');
  });

  test("names the body field a caller got wrong, from the argument down", async () => {
    const wrongType = await call("retitleOutline", { item: { title: 3, outline: "# A" } });
    expect(wrongType.result.isError).toBe(true);
    expect(wrongType.result.content[0].text).toBe('Invalid field "item.title": expected String.');
    const missing = await call("retitleOutline", { item: { outline: "# A" } });
    expect(missing.result.content[0].text).toBe('Missing required field "item.title".');
    const valid = await call("retitleOutline", { item: { title: "guide", outline: "# A\nb", extra: true } });
    expect(valid.result.content[0].text).toBe("guide:2");
  });

  test("says a document is missing rather than that the server failed", async () => {
    const uri = "akan://serverResolverTestItem/507f1f77bcf86cd799439011";
    const { json } = await post(rpc("resources/read", { uri }));
    expect(json.error.code).toBe(-32602);
    expect(json.error.message).toBe("No serverResolverTestItem found for the arguments given.");
  });

  test("refuses an argument nobody declared instead of dropping it", async () => {
    const dropped = await call("serverResolverTestItemListInCategory", { category: "all", status: "active" });
    expect(dropped.result.isError).toBe(true);
    expect(dropped.result.content[0].text).toBe('Unknown argument "status".');
    expect((await call("serverResolverTestItemListInCategory", { category: "all", limit: 5 })).result.isError).toBe(
      false,
    );
  });

  test("refuses a value sent for the Any argument it left out of the schema", async () => {
    const raw = await call("serverResolverTestItemList", { args: ["all"] });
    expect(raw.result.isError).toBe(true);
    expect(raw.result.content[0].text).toBe('Unknown argument "args".');
    expect((await call("serverResolverTestItemList", { queryKey: "any" })).result.isError).toBe(false);
  });

  test("lifts a lone value into the list an argument was declared as", async () => {
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
    const { json } = await post(
      rpc("resources/read", { uri: "akan://serverResolverTestItem/list/inCategory?category=all" }),
    );
    expect(json.result.contents[0]).toEqual({
      uri: "akan://serverResolverTestItem/list/inCategory?category=all",
      mimeType: "application/json",
      text: '{"items":[]}',
    });
  });

  test("refuses a value outside its enum", async () => {
    // `enumOf` erases to `String` in every argRef, so only the enum check refuses "year".
    const ok = await call("periodTitle", { period: "day" });
    expect(ok.result.content[0].text).toBe("period:day");
    const bad = await call("periodTitle", { period: "year" });
    expect(bad.result.isError).toBe(true);
    expect(bad.result.content[0].text).toBe('Invalid argument "period": expected one of day, month.');
    // A bare string is lifted whole, comma and all: a tool's list is a JSON array already.
    const joined = await call("joinTags", { tags: "a,b" });
    expect(joined.result.content[0].text).toBe("a,b");
  });

  test("lists page prompts as the pages declared them", async () => {
    const { json } = await postWith(rpc("prompts/list"), { pagePrompts: pagePromptsOf(okRun()) });
    expect(json.result.prompts).toEqual([
      { name: "briefItem", description: briefEntry.description, arguments: briefEntry.arguments },
    ]);
    const { json: none } = await post(rpc("prompts/list"));
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
    expect(messages[1].content).toMatchObject({
      type: "resource",
      resource: { uri: "akan://serverResolverTestItem/list/inCategory?category=all", mimeType: "application/json" },
    });
    expect(JSON.parse(messages[1].content.resource.text)).toHaveLength(2);
    expect(messages[2].content.resource.uri).toBe(`akan://echoTitle?id=${itemId}&suffix=x`);
    expect(JSON.parse(messages[2].content.resource.text)).toBe(`${itemId}:x`);
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

  test("attaches an image result the screen fetched as its caption, not its base64", async () => {
    const run: PagePromptRun = {
      ok: true,
      url: `http://127.0.0.1/en/item/${itemId}`,
      records: [
        {
          key: "shotImage",
          args: {},
          returns: { refName: "ImageResult" },
          value: { data: pixelPng, mimeType: "image/png", caption: "plan view" },
        },
      ],
    };
    const { json } = await postWith(promptsGet({ serverResolverTestItemId: itemId }), {
      pagePrompts: pagePromptsOf(run),
    });
    const resources = (json.result.messages as { content: any }[]).filter((m) => m.content.type === "resource");
    expect(JSON.parse(resources[0]?.content.resource.text)).toEqual({ mimeType: "image/png", caption: "plan view" });
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
    const { res } = await postWith(promptsGet({ serverResolverTestItemId: itemId }), {
      pagePrompts: pagePromptsOf(redirect),
    });
    expect(res.status).toBe(401);
    const { json: refused } = await postAs(
      promptsGet({ serverResolverTestItemId: itemId }),
      { Authorization: "Bearer not-a-real-token" },
      { pagePrompts: pagePromptsOf(redirect) },
    );
    expect(refused.error.code).toBe(-32602);
    expect(refused.error.message).toBe("This screen is not available to the signed-in account.");
    expect(JSON.stringify(refused)).not.toContain("/signin");
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

  test("answers a prompt the worker could not list as the server's failure, never as an unknown prompt", async () => {
    const down: PagePromptSource = {
      list: async () => {
        throw new Error("rsc worker is stopped");
      },
      run: async () => okRun(),
    };
    for (const body of [promptsGet({ serverResolverTestItemId: itemId }), rpc("prompts/list")]) {
      const { json } = await postWith(body, { pagePrompts: down });
      expect(json.error).toEqual({ code: -32603, message: "Internal server error." });
    }
  });

  test("leaves a visual field out of what an agent is handed, and in what the page is", async () => {
    const json = await call("visualItem");
    expect(json.result.structuredContent).toMatchObject({ id: "507f1f77bcf86cd799439011", title: "shot" });
    expect("preview" in json.result.structuredContent).toBe(false);
    expect(json.result.content[0].text).not.toContain("base64");
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

  test("hands an image result to an agent as its caption and an image block, never as base64 text", async () => {
    const json = await call("shotImage", { caption: "Window 0,0 to 120,80" });
    expect(json.result).toEqual({
      content: [
        { type: "text", text: "Window 0,0 to 120,80" },
        { type: "image", data: pixelPng, mimeType: "image/png" },
      ],
      isError: false,
    });
    const bare = await call("shotImage");
    expect(bare.result.content).toEqual([{ type: "image", data: pixelPng, mimeType: "image/png" }]);
    const { json: lean } = await postWith(rpc("tools/call", { name: "shotImage", arguments: {} }), {
      legacyTextBlock: false,
    });
    expect(lean.result.content).toEqual(bare.result.content);
    const { json: listed } = await post(rpc("tools/list"));
    const tool = listed.result.tools.find((entry: { name: string }) => entry.name === "shotImage");
    expect(tool.outputSchema).toBeUndefined();
  });

  test("sends a list of image results as one caption and image per picture", async () => {
    const json = await call("shotImages");
    expect(json.result.content).toEqual([
      { type: "text", text: "first" },
      { type: "image", data: pixelPng, mimeType: "image/png" },
      { type: "image", data: pixelPng, mimeType: "image/webp" },
    ]);
    expect("structuredContent" in json.result).toBe(false);
  });

  test("answers an image result over HTTP as the JSON object the client reads", async () => {
    const routes = httpRoutes as Record<string, { GET: (req: Request) => Promise<Response> }>;
    const response = await routes["/serverResolverTestItem/shotImage"].GET(
      new Request("http://127.0.0.1:8080/api/serverResolverTestItem/shotImage?caption=plan"),
    );
    expect(await response.json()).toEqual({ data: pixelPng, mimeType: "image/png", caption: "plan" });
  });

  test("refuses an image whose data is a data URL, and logs what an ImageResult needs", async () => {
    const lines: string[] = [];
    const stop = Logger.addSink(({ message }) => void lines.push(message));
    try {
      const json = await call("dataUrlShot");
      expect(json.result).toEqual({
        content: [{ type: "text", text: "The server failed to complete this request." }],
        isError: true,
      });
    } finally {
      stop();
    }
    expect(lines.find((line) => line.includes('MCP refused the "dataUrlShot" image result'))).toContain(
      "without a `data:` prefix",
    );
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
    expect((await list("?limit=5")).status).toBe(200);
    // A missing filter arg is refused (400) rather than widening the query to every row.
    expect((await list("?queryKey=inCategory")).status).toBe(400);
    expect((await list("?queryKey=notAFilter")).status).toBe(400);
    expect((await list("?queryKey=inCategory&args=not-json")).status).toBe(400);
  });

  test("stops sending the structured result twice when the legacy text block is turned off", async () => {
    const body = rpc("tools/call", { name: "visualItem", arguments: {} });
    const { json: both } = await postWith(body, {});
    expect(JSON.parse(both.result.content[0].text)).toEqual(both.result.structuredContent);
    const { json: once } = await postWith(body, { legacyTextBlock: false });
    expect(once.result.structuredContent).toMatchObject({ id: "507f1f77bcf86cd799439011", title: "shot" });
    expect(once.result.content[0].text).toBe("The result is in this call's structuredContent.");
  });

  test("reads a resource whole when the legacy text block is turned off", async () => {
    const body = rpc("resources/read", { uri: "akan://serverResolverTestItem/list/inCategory?category=all" });
    const { json } = await postWith(body, { legacyTextBlock: false });
    expect(json.result.contents[0].text).toBe('{"items":[]}');
  });

  test("keeps the text block whole for a scalar return, which has no structured half to point at", async () => {
    const body = rpc("tools/call", {
      name: "echoTitle",
      arguments: { id: "507f1f77bcf86cd799439011", suffix: "tail" },
    });
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
    const { json } = await post(rpc("tools/list"));
    expect(names).toEqual(json.result.tools.map((tool: { name: string }) => tool.name));
    expect(json.result.nextCursor).toBeUndefined();
  });

  test("refuses a cursor that addresses nothing rather than serving a short page", async () => {
    const { json } = await post(rpc("tools/list", { cursor: Buffer.from("999").toString("base64url") }));
    expect(json.error.code).toBe(-32602);
    expect(json.error.message).toBe("Invalid cursor.");
  });

  test("refuses a cursor that decodes to nothing instead of restarting the walk", async () => {
    for (const cursor of ["", "===="]) {
      const { json } = await post(rpc("tools/list", { cursor }));
      expect(json.error?.message).toBe("Invalid cursor.");
    }
  });

  test("tells a modern client how long a catalogue may be cached, and per whom", async () => {
    const meta = {
      "io.modelcontextprotocol/protocolVersion": "2026-07-28",
      "io.modelcontextprotocol/clientCapabilities": {},
    };
    const modern = async (method: string) =>
      await (
        await postRaw(rpc(method, { _meta: meta }), { "mcp-method": method, "mcp-protocol-version": "2026-07-28" })
      ).json();
    const json = await modern("tools/list");
    expect(json.result.cacheScope).toBe("private");
    expect(json.result.ttlMs).toBe(300_000);
    const discover = await modern("server/discover");
    expect(discover.result.cacheScope).toBe("public");
    const legacy = await post(rpc("tools/list"));
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
    expect(messages[2]).toMatchObject({ jsonrpc: "2.0", id: 7, result: { isError: false } });
    expect(messages[2].result.content[0].text).toBe("counted");
  });

  test("answers with plain JSON unless the caller asks for a stream and names a token", async () => {
    const call = rpc("tools/call", { name: "slowTitle", arguments: {} });
    const tokenOnly = await postRaw({ ...call, params: { ...call.params, _meta: { progressToken: "t" } } }, {});
    expect(tokenOnly.headers.get("content-type")).toContain("application/json");
    const streamOnly = await postRaw(call, { accept: "text/event-stream" });
    expect(streamOnly.headers.get("content-type")).toContain("application/json");
    expect((await streamOnly.json()).result.content[0].text).toBe("counted");
  });

  test("keeps the 401 challenge reachable by deciding to stream only after guards pass", async () => {
    const res = await postRaw(
      rpc("tools/call", { name: "deniedTitle", arguments: {}, _meta: { progressToken: "t" } }),
      { accept: "text/event-stream" },
    );
    expect(res.status).toBe(401);
    expect(res.headers.get("WWW-Authenticate")).toContain("resource_metadata=");
  });

  test("lets a configured browser origin past the preflight and reads its own answer", async () => {
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
        body: JSON.stringify(rpc("tools/list")),
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
    const routes = mcpRoutes({ allowedOrigins: ["https://console.example.com"] });
    const headers = { origin: "https://console.example.com" };
    for (const method of ["GET", "DELETE"] as const) {
      const res = await routes["/mcp"][method](new Request("http://127.0.0.1:8080/mcp", { method, headers }));
      expect(res.status).toBe(405);
      expect(res.headers.get("access-control-allow-origin")).toBe("https://console.example.com");
    }
  });

  test("matches an Origin against the public host rather than the one the proxy dialed", async () => {
    const proxied = (headers: Record<string, string>) =>
      mcpRoutes()["/mcp"].POST(
        new Request("http://akan-child:9001/mcp", {
          method: "POST",
          body: JSON.stringify(rpc("tools/list")),
          headers: { "content-type": "application/json", origin: "https://app.example.com", ...headers },
        }),
      );
    const forwarded = await proxied({ "x-forwarded-host": "app.example.com", "x-forwarded-proto": "https" });
    expect(forwarded.status).toBe(200);
    expect(forwarded.headers.get("access-control-allow-origin")).toBe("https://app.example.com");
    expect((await proxied({})).status).toBe(403);
  });

  test("advertises the templates its exposed reads are addressable by", async () => {
    const { json } = await post(rpc("resources/templates/list"));
    expect(json.result.resourceTemplates.map((t: { uriTemplate: string }) => t.uriTemplate)).toEqual([
      "akan://serverResolverTestItem/{serverResolverTestItemId}",
      "akan://serverResolverTestItem/list{?queryKey,skip,limit,sort}",
      "akan://serverResolverTestItem/list/inCategory{?category,skip,limit,sort}",
    ]);
  });
});

describe("MCP Apps", () => {
  const shellHtml =
    '<!DOCTYPE html><html lang="en"><head><title>shell</title></head><body><div id="root"></div></body></html>';
  const appShell = { basePaths: [] as string[], read: async () => shellHtml };
  const apps = { apps: true, appShell, pagePrompts: pagePromptsOf(okRun()) } satisfies Partial<McpRouterProps>;
  const uiCapabilities = { extensions: { "io.modelcontextprotocol/ui": { mimeTypes: ["text/html;profile=mcp-app"] } } };
  const names = (json: { result: { tools: { name: string }[] } }) => json.result.tools.map((tool) => tool.name);
  const uiSession = async () => {
    const init = rpc("initialize", { protocolVersion: "2025-11-25", capabilities: uiCapabilities });
    const { res } = await postAs(init, {}, apps);
    return res.headers.get("mcp-session-id") ?? "";
  };
  const sender = (props: Partial<McpRouterProps>) => {
    const routes = mcpRoutes(props)["/mcp"];
    return async (body: object, headers: Record<string, string> = {}) =>
      await (
        await routes.POST(
          new Request("http://127.0.0.1:8080/mcp", {
            method: "POST",
            body: JSON.stringify(body),
            headers: { "Content-Type": "application/json", ...headers },
          }),
        )
      ).json();
  };

  test("publishes a `.prompt()` page as a tool that names its view, and never claims its run reads only", async () => {
    const { json } = await postWith(rpc("tools/list"), apps);
    const tool = json.result.tools.find((candidate: { name: string }) => candidate.name === "briefItem");
    expect(tool._meta).toEqual({
      ui: { resourceUri: "ui://mcpintegration/app" },
      "ui/resourceUri": "ui://mcpintegration/app",
    });
    expect(tool.annotations).toEqual({ readOnlyHint: false, openWorldHint: false });
    expect(tool.inputSchema.required).toEqual(["serverResolverTestItemId"]);
    const { json: textOnly } = await postWith(rpc("tools/list"), { ...apps, appShell: undefined });
    const plain = textOnly.result.tools.find((candidate: { name: string }) => candidate.name === "briefItem");
    expect(plain._meta).toBeUndefined();
    const { json: off } = await postWith(rpc("tools/list"), { pagePrompts: pagePromptsOf(okRun()) });
    expect(names(off)).not.toContain("briefItem");
  });

  const modernMeta = {
    "io.modelcontextprotocol/protocolVersion": "2026-07-28",
    "io.modelcontextprotocol/clientCapabilities": uiCapabilities,
  };
  const modernHeaders = (method: string) => ({ "mcp-method": method, "mcp-protocol-version": "2026-07-28" });

  test("sends every client through `initialize` while it renders views, unless told to speak the modern revision", async () => {
    const discovered = await postAs(
      rpc("server/discover", { _meta: modernMeta }),
      modernHeaders("server/discover"),
      apps,
    );
    expect(discovered.res.status).toBe(200);
    expect(discovered.json.error.code).toBe(-32601);
    const cached = await postAs(rpc("tools/list", { _meta: modernMeta }), modernHeaders("tools/list"), apps);
    expect(cached.json.error.code).toBe(-32022);
    expect(cached.json.error.data.supported).toEqual(["2025-11-25", "2025-06-18"]);
    const init = rpc("initialize", { protocolVersion: "2026-07-28", capabilities: uiCapabilities });
    expect((await postAs(init, {}, apps)).json.result.protocolVersion).toBe("2025-11-25");
    const textOnly = { ...apps, appShell: undefined };
    expect(
      (await postAs(rpc("server/discover", { _meta: modernMeta }), modernHeaders("server/discover"), textOnly)).json
        .result.supportedVersions,
    ).toContain("2026-07-28");
    expect(
      (
        await postAs(rpc("server/discover", { _meta: modernMeta }), modernHeaders("server/discover"), {
          ...apps,
          modern: true,
        })
      ).json.result.supportedVersions,
    ).toContain("2026-07-28");
    expect(
      (
        await postAs(rpc("server/discover", { _meta: modernMeta }), modernHeaders("server/discover"), {
          ...textOnly,
          modern: false,
        })
      ).json.error.code,
    ).toBe(-32601);
  });

  test("speaks the modern revision once the worker has listed no `.prompt()` page, which no view then needs", async () => {
    const discover = rpc("server/discover", { _meta: modernMeta });
    const pageless = sender({ ...apps, pagePrompts: pagePromptsOf(okRun(), []) });
    expect((await pageless(discover, modernHeaders("server/discover"))).error.code).toBe(-32601);
    await pageless(rpc("tools/list"));
    expect((await pageless(discover, modernHeaders("server/discover"))).result.supportedVersions).toContain(
      "2026-07-28",
    );
    const paged = sender(apps);
    await paged(rpc("tools/list"));
    expect((await paged(discover, modernHeaders("server/discover"))).error.code).toBe(-32601);
  });

  test("declares the UI extension on both eras' handshakes only when it can render a view", async () => {
    const extensions = { "io.modelcontextprotocol/ui": {} };
    const discover = async (props: Partial<McpRouterProps>) =>
      (await postAs(rpc("server/discover", { _meta: modernMeta }), modernHeaders("server/discover"), props)).json.result
        .capabilities;
    expect((await discover({ ...apps, modern: true })).extensions).toEqual(extensions);
    expect((await discover({ ...apps, appShell: undefined })).extensions).toBeUndefined();
    const { json } = await postAs(
      rpc("initialize", { protocolVersion: "2025-11-25", capabilities: uiCapabilities }),
      {},
      apps,
    );
    expect(json.result.capabilities.extensions).toEqual(extensions);
  });

  test("issues a legacy session only to a client that declares it renders views", async () => {
    expect(await uiSession()).toStartWith("ui.");
    const { res } = await postAs(rpc("initialize", { protocolVersion: "2025-11-25", capabilities: {} }), {}, apps);
    expect(res.headers.get("mcp-session-id")).toBeNull();
    const { res: textOnly } = await postAs(
      rpc("initialize", { protocolVersion: "2025-11-25", capabilities: uiCapabilities }),
      {},
      { ...apps, appShell: undefined },
    );
    expect(textOnly.headers.get("mcp-session-id")).toBeNull();
  });

  test("lists and runs an `mcp: false` endpoint for a client that renders views, and for no other", async () => {
    const { json: plain } = await postWith(rpc("tools/list"), apps);
    expect(names(plain)).not.toContain("quietTitle");
    const refused = await postWith(rpc("tools/call", { name: "quietTitle", arguments: { id: itemId } }), apps);
    expect(refused.json.error.message).toBe("Unknown tool: quietTitle.");

    const session = { "mcp-session-id": await uiSession() };
    const { json: legacy } = await postAs(rpc("tools/list"), session, apps);
    const quiet = legacy.result.tools.find((tool: { name: string }) => tool.name === "quietTitle");
    expect(quiet._meta).toEqual({ ui: { visibility: ["app"] } });
    const called = await postAs(rpc("tools/call", { name: "quietTitle", arguments: { id: itemId } }), session, apps);
    expect(called.json.result.content[0].text).toBe(`${itemId}:quiet`);

    const meta = {
      "io.modelcontextprotocol/protocolVersion": "2026-07-28",
      "io.modelcontextprotocol/clientCapabilities": uiCapabilities,
    };
    const { json: modern } = await postAs(
      rpc("tools/list", { _meta: meta }),
      { "mcp-method": "tools/list", "mcp-protocol-version": "2026-07-28" },
      { ...apps, modern: true },
    );
    expect(names(modern)).toContain("quietTitle");
  });

  test("counts a client as rendering views only by a session this server issued it", async () => {
    const issued = await uiSession();
    const [nonce] = issued.slice("ui.".length).split(".");
    for (const forged of ["ui.forged", `ui.${nonce}`, `ui.${nonce}.${"A".repeat(43)}`]) {
      const session = { "mcp-session-id": forged };
      expect(names((await postAs(rpc("tools/list"), session, apps)).json)).not.toContain("quietTitle");
      const called = await postAs(rpc("tools/call", { name: "quietTitle", arguments: { id: itemId } }), session, apps);
      expect(called.json.error.message).toBe("Unknown tool: quietTitle.");
    }
    expect(names((await postAs(rpc("tools/list"), { "mcp-session-id": issued }, apps)).json)).toContain("quietTitle");
  });

  test("lets a view read a relation's light shape, which no model is shown", async () => {
    const light = "lightServerResolverTestItem";
    const session = { "mcp-session-id": await uiSession() };
    const { json: listed } = await postAs(rpc("tools/list"), session, apps);
    const tool = listed.result.tools.find((candidate: { name: string }) => candidate.name === light);
    expect(tool._meta).toEqual({ ui: { visibility: ["app"] } });
    const args = { serverResolverTestItemId: itemId };
    const read = await postAs(rpc("tools/call", { name: light, arguments: args }), session, apps);
    expect(read.json.result.content[0].text).toBe("No serverResolverTestItem found for the arguments given.");
    expect(names((await postWith(rpc("tools/list"), apps)).json)).not.toContain(light);
    const refused = await postWith(rpc("tools/call", { name: light, arguments: args }), apps);
    expect(refused.json.error.message).toBe(`Unknown tool: ${light}.`);
  });

  test("turns MCP Apps off in a read-only deployment, where a page tool would run the page's own mutations", async () => {
    const readOnly = { ...apps, readOnly: true };
    expect(names((await postWith(rpc("tools/list"), readOnly)).json)).not.toContain("briefItem");
    const args = { serverResolverTestItemId: itemId };
    const called = await postWith(rpc("tools/call", { name: "briefItem", arguments: args }), readOnly);
    expect(called.json.error.message).toBe("Unknown tool: briefItem.");
    const init = rpc("initialize", { protocolVersion: "2025-11-25", capabilities: uiCapabilities });
    const { res, json } = await postAs(init, {}, readOnly);
    expect(res.headers.get("mcp-session-id")).toBeNull();
    expect(json.result.capabilities.extensions).toBeUndefined();
  });

  test("answers the model with the briefing and the view with where the screen starts", async () => {
    const session = { "mcp-session-id": await uiSession() };
    const run = async (props: Partial<McpRouterProps>, headers: Record<string, string> = session) =>
      (
        await postAs(
          rpc("tools/call", { name: "briefItem", arguments: { serverResolverTestItemId: itemId } }),
          headers,
          props,
        )
      ).json.result;
    const result = await run(apps);
    expect(result.isError).toBe(false);
    expect(result.content.at(-1)).toEqual({
      type: "text",
      text: `Open this screen in a browser: http://127.0.0.1:8080/en/item/${itemId}`,
    });
    expect(result.structuredContent).toEqual({ href: `/en/item/${itemId}` });
    // The raw screen values ride `_meta`, which no host hands to the model.
    expect(result._meta[MCP_APP_META.snapshot].map((record: { key: string }) => record.key)).toEqual([
      "serverResolverTestItemListInCategory",
      "echoTitle",
    ]);
    expect((await run({ ...apps, appShell: undefined })).structuredContent).toBeUndefined();
    const textOnly = await run(apps, {});
    expect(textOnly.structuredContent).toBeUndefined();
    expect(textOnly._meta).toBeUndefined();
    expect(textOnly.content).toEqual(result.content);
  });

  test("hands a view the value a browser would get, visual fields included, and a model the masked one", async () => {
    const session = { "mcp-session-id": await uiSession() };
    const call = (headers: Record<string, string>, meta?: object) =>
      postAs(rpc("tools/call", { name: "visualItem", arguments: {}, ...(meta ? { _meta: meta } : {}) }), headers, apps);
    const view = (await call(session, { [MCP_APP_META.view]: true })).json.result;
    expect(view.structuredContent.preview).toBeUndefined();
    expect(view._meta[MCP_APP_META.value]).toMatchObject({ title: "shot", preview: "data:image/png;base64,AAAA" });
    expect((await call(session)).json.result._meta).toBeUndefined();
    expect((await call({}, { [MCP_APP_META.view]: true })).json.result._meta).toBeUndefined();
  });

  test("hands a view an image result's JSON object beside the image block a model reads", async () => {
    const session = { "mcp-session-id": await uiSession() };
    const call = (meta?: object) =>
      postAs(
        rpc("tools/call", { name: "shotImage", arguments: { caption: "plan" }, ...(meta ? { _meta: meta } : {}) }),
        session,
        apps,
      );
    const view = (await call({ [MCP_APP_META.view]: true })).json.result;
    expect(view.content).toEqual([
      { type: "text", text: "plan" },
      { type: "image", data: pixelPng, mimeType: "image/png" },
    ]);
    expect(view._meta[MCP_APP_META.value]).toEqual({ data: pixelPng, mimeType: "image/png", caption: "plan" });
    expect((await call()).json.result._meta).toBeUndefined();
  });

  test("hands a view the domain error a browser would get, and nothing a refusal or a crash would", async () => {
    const session = { "mcp-session-id": await uiSession() };
    const id = "507f1f77bcf86cd799439011";
    const call = (name: string, headers: Record<string, string>, meta?: object) =>
      postAs(
        rpc("tools/call", { name, arguments: name === "lockedTitle" ? { id } : {}, ...(meta ? { _meta: meta } : {}) }),
        headers,
        apps,
      );
    const view = (await call("lockedTitle", session, { [MCP_APP_META.view]: true })).json.result;
    expect(view.isError).toBe(true);
    expect(view._meta[MCP_APP_META.error]).toEqual({
      error: "mcpItem.error.locked",
      statusCode: 409,
      details: { field: "title" },
      data: { id },
    });
    expect((await call("lockedTitle", session)).json.result._meta).toBeUndefined();
    const misnamed = await postAs(
      rpc("tools/call", { name: "lockedTitle", arguments: { id, extra: 1 }, _meta: { [MCP_APP_META.view]: true } }),
      session,
      apps,
    );
    expect(misnamed.json.result.isError).toBe(true);
    expect(misnamed.json.result._meta).toBeUndefined();
    expect((await call("failingTitle", session, { [MCP_APP_META.view]: true })).json.result._meta).toBeUndefined();
    const vendor = (await call("vendorTitle", session, { [MCP_APP_META.view]: true })).json.result;
    expect(vendor._meta).toBeUndefined();
    expect(vendor.content[0].text).toBe("The server failed to complete this request.");
  });

  test("gives the view the caller's claims to decide what it shows, and never the token", async () => {
    const payload = Buffer.from(
      JSON.stringify({
        appName: "mcpIntegration",
        self: { id: "u1" },
        aud: "http://127.0.0.1:8080/mcp",
        exp: 4102444800,
      }),
    );
    const token = `e30.${payload.toString("base64url")}.sig`;
    const headers = { "mcp-session-id": await uiSession(), authorization: `Bearer ${token}` };
    const { json } = await postAs(
      rpc("tools/call", { name: "briefItem", arguments: { serverResolverTestItemId: itemId } }),
      headers,
      apps,
    );
    expect(json.result._meta[MCP_APP_META.account]).toEqual({ appName: "mcpIntegration", self: { id: "u1" } });
    expect(JSON.stringify(json.result)).not.toContain(token);
  });

  test("answers a refused screen as a tool error the model reads, and drops a null it was handed", async () => {
    const tool = (args: Record<string, unknown>, run: PagePromptRun) =>
      postWith(rpc("tools/call", { name: "briefItem", arguments: args }), {
        ...apps,
        pagePrompts: pagePromptsOf(run),
      });
    const missing = await tool({ serverResolverTestItemId: null }, okRun());
    expect(missing.json.result.content[0].text).toContain("No serverResolverTestItemId was named");
    const notFound = await tool({ serverResolverTestItemId: itemId }, { ok: false, reason: "not-found", message: "x" });
    expect(notFound.json.result).toEqual({
      content: [{ type: "text", text: "No screen exists for these arguments." }],
      isError: true,
    });
    const nested = await tool({ serverResolverTestItemId: { id: itemId } }, okRun());
    expect(nested.json.error.message).toBe("`arguments` must be an object of named values.");
  });

  test("keeps serving endpoint tools while the page list cannot be read, and gives back the caller's slot", async () => {
    const down: PagePromptSource = {
      list: async () => {
        throw new Error("rsc worker is stopped");
      },
      run: async () => okRun(),
    };
    const props = { ...apps, pagePrompts: down, rateLimit: { calls: 100, concurrent: 1 } };
    const routes = mcpRoutes(props)["/mcp"];
    const send = async (body: object) =>
      (
        await routes.POST(
          new Request("http://127.0.0.1:8080/mcp", {
            method: "POST",
            body: JSON.stringify(body),
            headers: { "Content-Type": "application/json" },
          }),
        )
      ).json();
    expect(names(await send(rpc("tools/list")))).toContain("echoTitle");
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const called = await send(rpc("tools/call", { name: "briefItem", arguments: {} }));
      expect(called.error.message).toBe("Unknown tool: briefItem.");
    }
    const echoed = await send(rpc("tools/call", { name: "echoTitle", arguments: { id: itemId } }));
    expect(echoed.result.content[0].text).toBe(`${itemId}:none`);
  });

  test("lists the endpoint tools at once while the worker restarts, beside the page tools it listed last", async () => {
    const answers = [Promise.resolve([briefEntry])];
    const worker: PagePromptSource = {
      list: () => answers.shift() ?? new Promise<PagePromptEntry[]>(() => {}),
      run: async () => okRun(),
    };
    const send = sender({ ...apps, pagePrompts: worker });
    expect(names(await send(rpc("tools/list")))).toContain("briefItem");
    expect(names(await send(rpc("tools/list")))).toEqual(expect.arrayContaining(["echoTitle", "briefItem"]));
    const cold = names(await sender({ ...apps, pagePrompts: worker })(rpc("tools/list")));
    expect(cold).toContain("echoTitle");
    expect(cold).not.toContain("briefItem");
  });

  test("serves the view with the app's origin as its base, and opens nothing else", async () => {
    const read = await postWith(rpc("resources/read", { uri: "ui://mcpintegration/app" }), apps);
    const [contents] = read.json.result.contents;
    expect(contents.mimeType).toBe("text/html;profile=mcp-app");
    expect(contents.text).toStartWith(
      '<!DOCTYPE html><html lang="en"><head><base href="http://127.0.0.1:8080/"><script>\nwindow.__AKAN_EMBED__',
    );
    expect(contents._meta.ui.csp).toEqual({
      resourceDomains: ["http://127.0.0.1:8080"],
      baseUriDomains: ["http://127.0.0.1:8080"],
    });
    const forged = await postAs(
      rpc("resources/read", { uri: "ui://mcpintegration/app" }),
      { "x-forwarded-host": 'evil.test"><script>alert(1)</script>' },
      apps,
    );
    expect(forged.json.result.contents[0].text).not.toContain("alert(1)");
    for (const host of ['evil.test"target="_top', "evil.test%22target=%22_top"]) {
      const quoted = await postAs(
        rpc("resources/read", { uri: "ui://mcpintegration/app" }),
        { "x-forwarded-host": host },
        apps,
      );
      const [read] = quoted.json.result.contents;
      expect(read.text).not.toContain("evil.test");
      expect(read._meta.ui.csp).toBeUndefined();
    }
    const unknown = await postWith(rpc("resources/read", { uri: "ui://mcpintegration/app/admin" }), apps);
    expect(unknown.json.error.message).toBe("Unknown resource: ui://mcpintegration/app/admin.");
  });

  test("offers the view as a resource only to a client that renders it", async () => {
    const uris = (json: { result: { resources: { uri: string }[] } }) => json.result.resources.map(({ uri }) => uri);
    expect(uris((await postWith(rpc("resources/list"), apps)).json)).toEqual([]);
    const session = { "mcp-session-id": await uiSession() };
    expect(uris((await postAs(rpc("resources/list"), session, apps)).json)).toEqual(["ui://mcpintegration/app"]);
  });

  test("keeps an endpoint's name when a page takes it too, and says so at boot", async () => {
    const clash: PagePromptEntry = { ...briefEntry, name: "echoTitle" };
    const refusedClash: PagePromptEntry = { ...briefEntry, name: "hiddenTitle" };
    const props = { ...apps, pagePrompts: pagePromptsOf(okRun(), [briefEntry, clash, refusedClash]) };
    const { json } = await postWith(rpc("tools/list"), props);
    expect(names(json).filter((name) => name === "echoTitle")).toHaveLength(1);
    expect(names(json)).not.toContain("hiddenTitle");
    const echo = json.result.tools.find((tool: { name: string }) => tool.name === "echoTitle");
    expect(echo._meta).toBeUndefined();
    const called = await postWith(rpc("tools/call", { name: "echoTitle", arguments: { id: itemId } }), props);
    expect(called.json.result.content[0].text).toBe(`${itemId}:none`);
    const lines: string[] = [];
    const stop = Logger.addSink(({ message }) => void lines.push(message));
    try {
      mcpRouter(props).report();
      await Bun.sleep(20);
    } finally {
      stop();
    }
    expect(lines.some((line) => line.includes('did not publish page "echoTitle" as a tool'))).toBe(true);
  });
});
