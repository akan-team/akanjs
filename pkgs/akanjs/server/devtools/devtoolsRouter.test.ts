import { afterEach, describe, expect, test } from "bun:test";
import type { BaseEnv } from "akanjs/base";
import { getDefaultInjectRegistry, getDefaultLiveRegistry } from "akanjs/service";
import type { BuildChangesPayload, BuildGraphPayload } from "../artifact";
import type { DiLifecycle } from "../di/diLifecycle";
import { DevtoolsFixture, fixtureRefName } from "./devtools.fixture";
import { DevtoolsRouter, type DevtoolsRouterContext } from "./devtoolsRouter";
import type { StudioRuntimePayload } from "./studio/studioRuntimeGraph";

const makeEnv = (environment: string): BaseEnv =>
  ({
    repoName: "akan",
    serveDomain: "example.com",
    appName: "devtools",
    environment,
    operationMode: "local",
  }) as BaseEnv;

const emptyDi = () =>
  ({
    live: getDefaultLiveRegistry(),
    registry: getDefaultInjectRegistry(),
    modules: {
      database: new Map(),
      service: new Map(),
      scalar: new Map(),
      adaptor: new Map(),
      middleware: new Map(),
    },
    hierarchy: { adaptorStages: [], serviceStages: [] },
  }) as unknown as DiLifecycle;

const makeContext = (environment: string, di: DiLifecycle = emptyDi()): DevtoolsRouterContext => ({
  di,
  env: makeEnv(environment),
  name: "AkanServer",
  serverMode: "all",
  prefix: "/api",
  websocketPrefix: "/ws",
  openapi: false,
  getStatus: () => "running",
});

afterEach(() => {
  process.env.AKAN_DEVTOOLS = undefined;
});

describe("DevtoolsRouter gating", () => {
  test("enables the endpoints only under the local environment", () => {
    expect(DevtoolsRouter.isEnabled(makeEnv("local"))).toBe(true);
    expect(DevtoolsRouter.isEnabled(makeEnv("debug"))).toBe(false);
    expect(DevtoolsRouter.isEnabled(makeEnv("main"))).toBe(false);
  });

  test("stays shut for a local environment built for production or run in a non-local operation mode", () => {
    const saved = { nodeEnv: process.env.NODE_ENV, command: process.env.AKAN_COMMAND_TYPE };
    try {
      delete process.env.AKAN_COMMAND_TYPE;
      process.env.NODE_ENV = "production";
      expect(DevtoolsRouter.isEnabled(makeEnv("local"))).toBe(false);
      process.env.AKAN_COMMAND_TYPE = "start";
      expect(DevtoolsRouter.isEnabled(makeEnv("local"))).toBe(true);
      expect(DevtoolsRouter.isEnabled({ ...makeEnv("local"), operationMode: "cloud" })).toBe(false);
      process.env.AKAN_DEVTOOLS = "true";
      expect(DevtoolsRouter.isEnabled({ ...makeEnv("local"), operationMode: "cloud" })).toBe(true);
    } finally {
      if (saved.nodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = saved.nodeEnv;
      if (saved.command === undefined) delete process.env.AKAN_COMMAND_TYPE;
      else process.env.AKAN_COMMAND_TYPE = saved.command;
    }
  });

  test("AKAN_DEVTOOLS forces the gate open or shut", () => {
    process.env.AKAN_DEVTOOLS = "true";
    expect(DevtoolsRouter.isEnabled(makeEnv("debug"))).toBe(true);
    process.env.AKAN_DEVTOOLS = "1";
    expect(DevtoolsRouter.isEnabled(makeEnv("debug"))).toBe(true);
    process.env.AKAN_DEVTOOLS = "false";
    expect(DevtoolsRouter.isEnabled(makeEnv("local"))).toBe(false);
    process.env.AKAN_DEVTOOLS = "0";
    expect(DevtoolsRouter.isEnabled(makeEnv("local"))).toBe(false);
  });

  test("registers all seven routes in local and none otherwise", () => {
    const localRoutes = new DevtoolsRouter(makeContext("local")).createRoutes() ?? {};
    expect(Object.keys(localRoutes).sort()).toEqual([
      "/_akan/constant",
      "/_akan/deps",
      "/_akan/devtools",
      "/_akan/dictionary",
      "/_akan/signal",
      "/_akan/studio",
      "/_akan/studio/graph",
    ]);
    expect(new DevtoolsRouter(makeContext("debug")).createRoutes()).toEqual({});
  });

  test("the index route advertises the four payload endpoints", async () => {
    const routes = (new DevtoolsRouter(makeContext("local")).createRoutes() ?? {}) as Record<
      string,
      { GET: (req: Request) => Response }
    >;
    const response = routes["/_akan/devtools"].GET(new Request("http://localhost/_akan/devtools"));
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const body = (await response.json()) as { version: number; endpoints: { kind: string; path: string }[] };
    expect(body.version).toBe(1);
    expect(body.endpoints.map((endpoint) => endpoint.kind)).toEqual(["constant", "signal", "dictionary", "deps"]);
  });

  test("a serializer failure answers 500 instead of crashing the dev server", async () => {
    const brokenDi = {} as DiLifecycle;
    const routes = (new DevtoolsRouter(makeContext("local", brokenDi)).createRoutes() ?? {}) as Record<
      string,
      { GET: (req: Request) => Response }
    >;
    const response = routes["/_akan/signal"].GET(new Request("http://localhost/_akan/signal"));
    expect(response.status).toBe(500);
    expect((await response.json()) as { kind: string }).toMatchObject({ kind: "signal" });
    const deps = routes["/_akan/deps"].GET(new Request("http://localhost/_akan/deps"));
    expect(deps.status).toBe(500);
    expect(await deps.json()).toEqual({ kind: "deps", error: expect.any(String) });
  });
});

const studioPayload: BuildGraphPayload = {
  workspaceRoot: "/ws",
  graph: {
    version: 1,
    nodes: [
      {
        id: "slice:apps/devtools:memo.inPublic",
        kind: "slice",
        name: "inPublic",
        label: "memo.inPublic",
        owner: "apps/devtools",
        module: "memo",
        detail: ["Public"],
        at: { file: "apps/devtools/lib/memo/memo.signal.ts", line: 4, column: 3 },
      },
      {
        id: "method:apps/devtools:memo.list",
        kind: "method",
        name: "list",
        label: "MemoService.list",
        owner: "apps/devtools",
        module: "memo",
        detail: [],
        at: { file: "apps/devtools/lib/memo/memo.service.ts", line: 9, column: 9 },
      },
    ],
    edges: [
      {
        from: "slice:apps/devtools:memo.inPublic",
        to: "method:apps/devtools:memo.list",
        kind: "calls",
        label: "list",
        count: 1,
        at: null,
      },
    ],
  },
};

type AsyncRoutes = Record<string, { GET: (req: Request) => Promise<Response> }>;
const studioRoutes = (buildGraph?: () => Promise<BuildGraphPayload | null>) =>
  (new DevtoolsRouter({ ...makeContext("local"), buildGraph }).createRoutes() ?? {}) as AsyncRoutes;

describe("Akan Studio", () => {
  test("draws a module's signals with links that open each source in the chosen editor", async () => {
    const response = await studioRoutes(async () => studioPayload)["/_akan/studio"].GET(
      new Request("http://localhost/_akan/studio?view=signals&module=memo&editor=cursor"),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    const html = await response.text();
    expect(html).toContain('data-node="slice:apps/devtools:memo.inPublic"');
    expect(html).toContain('data-from="slice:apps/devtools:memo.inPublic"');
    expect(html).toContain('href="cursor://file/ws/apps/devtools/lib/memo/memo.service.ts:9:9"');
    expect(html).toContain("Public");
  });

  test("lets only an editor webview frame it, and answers the panel that does", async () => {
    const response = await studioRoutes(async () => studioPayload)["/_akan/studio"].GET(
      new Request("http://localhost/_akan/studio"),
    );
    expect(response.headers.get("X-Frame-Options")).toBeNull();
    expect(response.headers.get("Content-Security-Policy")).toBe(
      "frame-ancestors 'self' vscode-webview: vscode-file:; base-uri 'self'",
    );
    const html = await response.text();
    expect(html).toContain("akan-studio:host");
    expect(html).toContain("akan-studio:open");
  });

  test("says where to open it when no dev builder can draw the graph", async () => {
    const response = await studioRoutes()["/_akan/studio"].GET(new Request("http://localhost/_akan/studio"));
    expect(response.status).toBe(503);
    const html = await response.text();
    expect(html).toContain("akan start");
    expect(html).toContain("akan-studio:ready");
    const failing = await studioRoutes(async () => {
      throw new Error("[builder] build-graph failed: boom");
    })["/_akan/studio/graph"].GET(new Request("http://localhost/_akan/studio/graph"));
    expect(failing.status).toBe(503);
    expect(await failing.json()).toEqual({ error: "[builder] build-graph failed: boom" });
  });

  test("draws the Change Map since the revision asked for, with the changed files no node covers", async () => {
    const asked: (string | null)[] = [];
    const [slice, method] = studioPayload.graph.nodes;
    const changesPayload: BuildChangesPayload = {
      workspaceRoot: "/ws",
      changes: {
        ...studioPayload.graph,
        nodes: [{ ...slice, change: "changed" }, method],
        edges: [{ ...studioPayload.graph.edges[0], change: "added" }],
        since: "0123456789ab",
        summary: { added: 0, removed: 0, changed: 1 },
        unmapped: [
          { file: "apps/devtools/lib/memo/memo.dictionary.ts", change: "changed" },
          { file: "apps/devtools/lib/memo/memo.util.ts", change: "removed" },
        ],
      },
    };
    const buildChanges = async (since: string | null) => {
      asked.push(since);
      return since === "nope"
        ? { workspaceRoot: "/ws", changes: { error: "nope is not a commit in this repository." } }
        : changesPayload;
    };
    const routes = new DevtoolsRouter({ ...makeContext("local"), buildChanges }).createRoutes() as AsyncRoutes;
    const response = await routes["/_akan/studio"].GET(
      new Request("http://localhost/_akan/studio?view=changes&since=main"),
    );
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('class="box slice changed"');
    expect(html).toContain('class="box method context"');
    expect(html).toContain('class="link calls added"');
    expect(html).toContain("since 0123456789ab · +0 −0 ~1");
    expect(html).toContain('href="vscode://file/ws/apps/devtools/lib/memo/memo.dictionary.ts:1:1"');
    expect(html).toContain("memo.util.ts");
    expect(html).not.toContain("memo.util.ts:1:1");
    expect(html).toContain('href="/_akan/studio/graph?view=changes&amp;editor=vscode&amp;since=main"');
    expect(html).toContain('name="since" value="main"');
    expect(html).toContain("~ memo.inPublic");
    expect(html).toContain('href="/_akan/studio?view=erd&amp;editor=vscode&amp;since=main"');
    const graph = await routes["/_akan/studio/graph"].GET(
      new Request("http://localhost/_akan/studio/graph?view=changes"),
    );
    expect(await graph.json()).toEqual(changesPayload);
    const unknown = await routes["/_akan/studio"].GET(
      new Request("http://localhost/_akan/studio?view=changes&since=nope"),
    );
    expect(unknown.status).toBe(200);
    expect(await unknown.text()).toContain("nope is not a commit in this repository.");
    const scoped = await routes["/_akan/studio"].GET(
      new Request("http://localhost/_akan/studio?view=changes&module=ghost"),
    );
    expect(await scoped.text()).toContain('<option value="ghost" selected="">ghost</option>');
    expect(asked).toEqual(["main", null, "nope", null]);
  });

  test("draws the running server's DI graph and jobs live, with no dev builder", async () => {
    const fixture = await DevtoolsFixture.boot("federation");
    try {
      const routes = new DevtoolsRouter({
        ...makeContext("local", fixture.lifecycle),
        serverMode: "federation",
      }).createRoutes() as AsyncRoutes;
      const response = await routes["/_akan/studio"].GET(new Request("http://localhost/_akan/studio?view=runtime"));
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain('aria-current="page">Runtime (live)</a>');
      expect(html).toContain(`live from pid ${process.pid} · federation replica 0`);
      expect(html).toContain(`data-node="service:${fixtureRefName}"`);
      expect(html).toContain(`data-node="internal:${fixtureRefName}Internal"`);
      expect(html).toContain("process processItem");
      expect(html).toContain('href="/_akan/studio/graph?view=runtime&amp;editor=vscode"');
      expect(html).not.toContain("vscode://file");
      const graph = await routes["/_akan/studio/graph"].GET(
        new Request("http://localhost/_akan/studio/graph?view=runtime"),
      );
      const json = (await graph.json()) as StudioRuntimePayload;
      expect(json.app.serverMode).toBe("federation");
      expect("nodes" in json.deps && json.deps.nodes.some((node) => node.id === `service:${fixtureRefName}`)).toBe(
        true,
      );
      expect("signals" in json.signal && Object.keys(json.signal.signals)).toContain(fixtureRefName);
    } finally {
      await fixture.destroy();
    }
  });

  test("says why the runtime view is empty when a serializer fails, and still answers", async () => {
    const routes = new DevtoolsRouter(makeContext("local", {} as DiLifecycle)).createRoutes() as AsyncRoutes;
    const response = await routes["/_akan/studio"].GET(new Request("http://localhost/_akan/studio?view=runtime"));
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("The running server&#x27;s DI graph could not be read");
    const graph = await routes["/_akan/studio/graph"].GET(
      new Request("http://localhost/_akan/studio/graph?view=runtime"),
    );
    const json = (await graph.json()) as StudioRuntimePayload;
    expect(json.deps).toHaveProperty("error");
    expect(json.signal).toHaveProperty("error");
  });

  test("draws the DI graph without jobs when only the signal serializer fails, and lists the modules left out", async () => {
    const di = {
      ...emptyDi(),
      modules: {
        ...emptyDi().modules,
        service: {
          entries: () => {
            throw new Error("signal boom");
          },
        },
      },
      disabledModules: new Map([["memo", 'depends on disabled module "file"']]),
      webProxies: [],
    } as unknown as DiLifecycle;
    const routes = new DevtoolsRouter(makeContext("local", di)).createRoutes() as AsyncRoutes;
    const response = await routes["/_akan/studio"].GET(new Request("http://localhost/_akan/studio?view=runtime"));
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).not.toContain("DI graph could not be read");
    expect(html).toContain("Jobs are not drawn: the signal serializer failed (signal boom).");
    expect(html).toContain("Modules this server left out");
    expect(html).toContain("memo: depends on disabled module &quot;file&quot;");
    const graph = await routes["/_akan/studio/graph"].GET(
      new Request("http://localhost/_akan/studio/graph?view=runtime"),
    );
    const json = (await graph.json()) as StudioRuntimePayload;
    expect(json.signal).toEqual({ error: "signal boom" });
    expect("disabledModules" in json.deps && json.deps.disabledModules).toEqual([
      { refName: "memo", reason: 'depends on disabled module "file"' },
    ]);
  });

  test("serves the graph it draws as JSON", async () => {
    const response = await studioRoutes(async () => studioPayload)["/_akan/studio/graph"].GET(
      new Request("http://localhost/_akan/studio/graph"),
    );
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual(studioPayload);
  });
});
