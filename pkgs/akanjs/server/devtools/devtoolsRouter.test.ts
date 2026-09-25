import { afterEach, describe, expect, test } from "bun:test";
import type { BaseEnv } from "akanjs/base";
import type { DiLifecycle } from "../di/diLifecycle";
import { DevtoolsRouter, type DevtoolsRouterContext } from "./devtoolsRouter";

const makeEnv = (environment: string): BaseEnv =>
  ({
    repoName: "akan",
    serveDomain: "example.com",
    appName: "devtools",
    environment,
    operationMode: "local",
    tunnelUsername: "root",
    tunnelPassword: "akan",
  }) as BaseEnv;

const makeContext = (environment: string): DevtoolsRouterContext => ({
  di: {} as DiLifecycle,
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
    const routes = (new DevtoolsRouter(makeContext("local")).createRoutes() ?? {}) as Record<
      string,
      { GET: (req: Request) => Response }
    >;
    // `di` is a bare object here, so the signal serializer throws on the first registry access.
    const response = routes["/_akan/signal"].GET(new Request("http://localhost/_akan/signal"));
    expect(response.status).toBe(500);
    expect((await response.json()) as { kind: string }).toMatchObject({ kind: "signal" });
  });
});
