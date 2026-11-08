import { afterEach, describe, expect, test } from "bun:test";
import type { BaseEnv } from "akanjs/base";
import { getDefaultInjectRegistry, getDefaultLiveRegistry } from "akanjs/service";
import type { BuildGraphPayload } from "../artifact";
import type { DiLifecycle } from "../di/diLifecycle";
import { DevtoolsRouter, type DevtoolsRouterContext } from "./devtoolsRouter";

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

  test("says where to open it when no dev builder can draw the graph", async () => {
    const response = await studioRoutes()["/_akan/studio"].GET(new Request("http://localhost/_akan/studio"));
    expect(response.status).toBe(503);
    expect(await response.text()).toContain("akan start");
    const failing = await studioRoutes(async () => {
      throw new Error("[builder] build-graph failed: boom");
    })["/_akan/studio/graph"].GET(new Request("http://localhost/_akan/studio/graph"));
    expect(failing.status).toBe(503);
    expect(await failing.json()).toEqual({ error: "[builder] build-graph failed: boom" });
  });

  test("serves the graph it draws as JSON", async () => {
    const response = await studioRoutes(async () => studioPayload)["/_akan/studio/graph"].GET(
      new Request("http://localhost/_akan/studio/graph"),
    );
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual(studioPayload);
  });
});
