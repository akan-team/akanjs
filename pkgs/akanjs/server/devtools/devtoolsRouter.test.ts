import { afterEach, describe, expect, test } from "bun:test";
import type { BaseEnv } from "akanjs/base";
import { getDefaultInjectRegistry, getDefaultLiveRegistry } from "akanjs/service";
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

  test("registers all five routes in local and none otherwise", () => {
    const localRoutes = new DevtoolsRouter(makeContext("local")).createRoutes() ?? {};
    expect(Object.keys(localRoutes).sort()).toEqual([
      "/_akan/constant",
      "/_akan/deps",
      "/_akan/devtools",
      "/_akan/dictionary",
      "/_akan/signal",
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
