import { afterAll, describe, expect, spyOn, test } from "bun:test";
import { DEFAULT_AKAN_I18N, Logger } from "akanjs/common";
import { getDefaultInjectRegistry, getDefaultLiveRegistry } from "akanjs/service";
import { resetEnvCache } from "../../base/baseEnv";
import { AkanApp } from "../akanApp";
import type { DiLifecycle } from "../di/diLifecycle";
import { OpsRoute } from "../ops/opsRoute";
import { type BaseBuildArtifact, defaultAkanImageConfig } from "../types";
import { WebRouter } from "../webRouter";
import { type ApiRouteInputs, ApiRouter } from "./apiRouter";
import { BuiltinRoutes } from "./builtinRoutes";
import { DevSurfacePolicy } from "./devSurfacePolicy";
import { DevSurfaces } from "./devSurfaces";

type Handler = (req: Request, server: unknown) => Response | Promise<Response | undefined> | undefined;
type Route = Handler | Response | Record<string, Handler>;

const managed = [
  "NODE_ENV",
  "AKAN_COMMAND_TYPE",
  "AKAN_PUBLIC_APP_NAME",
  "AKAN_PUBLIC_REPO_NAME",
  "AKAN_PUBLIC_SERVE_DOMAIN",
  "AKAN_PUBLIC_ENV",
  "AKAN_PUBLIC_OPERATION_MODE",
  "AKAN_ALLOWED_HOSTS",
  "AKAN_DEVTOOLS",
  "AKAN_LOG_DEBUG_HEADER",
  "AKAN_EXPOSE_RSC_MANIFEST",
  "AKAN_DEV_CSR",
];
const saved = Object.fromEntries(managed.map((key) => [key, process.env[key]]));
const savedSend = process.send;
const sent: unknown[] = [];

const applyEnv = (values: Record<string, string | undefined>) => {
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  resetEnvCache();
};

afterAll(() => {
  applyEnv(saved);
  process.send = savedSend;
});

const artifact = (): BaseBuildArtifact => ({
  rscClientUrl: "/_akan/rsc-client.js",
  vendorMap: {},
  pagesBundlePath: "/tmp/akan-test-pages.js",
  pagesBundleBuildId: 1,
  cssAssets: {},
  domains: [],
  subRoutes: {},
  basePaths: [],
  branches: [],
  i18n: DEFAULT_AKAN_I18N,
  imageConfig: defaultAkanImageConfig,
});

const rscWorker = {
  ready: Promise.resolve(),
  renderWithMeta: () => Promise.reject(new Error("not rendered in this test")),
  invalidateRouteResultCache: () => undefined,
  kill: () => undefined,
  reload: () => Promise.resolve(),
  getMetrics: () => ({}),
};

const di = {
  live: getDefaultLiveRegistry(),
  registry: getDefaultInjectRegistry(),
  modules: { database: new Map(), service: new Map(), scalar: new Map(), adaptor: new Map(), middleware: new Map() },
  hierarchy: { adaptorStages: [], serviceStages: [] },
  webProxies: new Map(),
  disabledModules: new Map(),
  getAdaptor: () => ({}),
} as unknown as DiLifecycle;

const serverTable = async (
  env: Record<string, string | undefined>,
  use?: (table: Record<string, Route>) => Promise<void>,
): Promise<Record<string, Route>> => {
  applyEnv({
    AKAN_COMMAND_TYPE: undefined,
    AKAN_PUBLIC_APP_NAME: "alpha",
    AKAN_PUBLIC_REPO_NAME: "akanjs",
    AKAN_PUBLIC_SERVE_DOMAIN: "akanjs.com",
    AKAN_PUBLIC_ENV: "local",
    AKAN_PUBLIC_OPERATION_MODE: "local",
    AKAN_ALLOWED_HOSTS: undefined,
    AKAN_DEVTOOLS: undefined,
    AKAN_LOG_DEBUG_HEADER: undefined,
    AKAN_EXPOSE_RSC_MANIFEST: undefined,
    AKAN_DEV_CSR: undefined,
    ...env,
  });
  //? A dev router opens the builder IPC channel, which exists only in a process the CLI spawned.
  process.send = ((message: unknown): boolean => {
    sent.push(message);
    return true;
  }) as typeof process.send;
  const webRouter = new WebRouter({
    artifact: artifact(),
    web: { ssr: true, csr: true },
    cssBytesByUrl: {},
    rsc: rscWorker as never,
    seedIndex: { entries: [], globalLayoutFiles: [] },
    upgradeHmrWs: () => false,
  });
  try {
    const { renderEnvRoutes } = await webRouter.initializeRoute();
    const builtinRoutes = new BuiltinRoutes({
      owner: {
        name: "AkanServer",
        logger: new Logger("devRouteTable"),
        env: { appName: "alpha" },
        status: "running",
        serverMode: "all",
        prefix: "/api",
        websocketPrefix: "/ws",
        openapi: true,
        mcp: false,
        mcpReadOnly: false,
        mcpAuth: null,
        mcpOption: {},
      } as unknown as ConstructorParameters<typeof BuiltinRoutes>[0]["owner"],
      di,
      solo: true,
      listener: { port: 0 } as never,
      metrics: { last: null } as never,
      logging: { stream: null } as never,
    }).timed(webRouter as never, new Map());
    const table = ApiRouter.buildRoutes({
      prefix: "/api",
      websocketPrefix: "/ws",
      routes: {},
      builtinRoutes,
      renderEnvRoutes,
      upgradeAppWs: () => false,
      hostAllowlist: null,
    }) as Record<string, Route>;
    await use?.(table);
    return table;
  } finally {
    webRouter.dispose();
  }
};

const pathOf = (key: string) => key.replace(/\*$/, "probe.js");

const answer = async (route: Route, key: string, host: string): Promise<number[]> => {
  const server = { requestIP: () => null, upgrade: () => false, timeout: () => undefined };
  const handlers = route instanceof Response || typeof route === "function" ? { GET: route } : route;
  const statuses: number[] = [];
  for (const [method, handler] of Object.entries(handlers)) {
    const req = new Request(`http://${host}${pathOf(key)}`, { method, headers: { host } });
    const res = typeof handler === "function" ? await handler(req, server) : handler;
    statuses.push(res?.status ?? 101);
  }
  return statuses;
};

const devSurfaceKeys = (table: Record<string, Route>) => Object.keys(table).filter((key) => DevSurfaces.find(key));

describe("the route table a server registers", () => {
  test("registers no dev route in production, even with AKAN_DEVTOOLS on and no secret", async () => {
    for (const env of [{ NODE_ENV: "production" }, { NODE_ENV: "production", AKAN_DEVTOOLS: "true" }])
      expect([env, devSurfaceKeys(await serverTable(env))]).toEqual([env, []]);
  });

  test("registers a route only in development when the dev-surface registry lists it", async () => {
    const production = new Set(Object.keys(await serverTable({ NODE_ENV: "production" })));
    const development = Object.keys(await serverTable({ NODE_ENV: "development" }));
    const devOnly = development.filter((key) => !production.has(key));
    expect(devOnly.length).toBeGreaterThan(0);
    expect(devOnly.filter((key) => !DevSurfaces.find(key))).toEqual([]);
    expect([...new Set(devOnly.map((key) => DevSurfaces.find(key)?.path))].sort()).toEqual(
      DevSurfaces.all.map(({ path }) => path).sort(),
    );
  });

  test("answers every dev route on localhost and refuses it on any other Host", async () => {
    const table = await serverTable({ NODE_ENV: "development" });
    for (const key of devSurfaceKeys(table)) {
      const route = table[key];
      if (!route) continue;
      const refused = await answer(route, key, "rebound.example:4200");
      expect([key, refused.every((status) => status === 403)]).toEqual([key, true]);
      const local = await answer(route, key, "localhost:4200");
      expect([key, local.some((status) => status === 403)]).toEqual([key, false]);
    }
  });

  test("keeps every dev route off a tunnel except the module registries a shared dev page loads", async () => {
    const table = await serverTable({ NODE_ENV: "development" });
    const shared = devSurfaceKeys(table).filter((key) => !DevSurfaces.refusedThroughTunnel(pathOf(key)));
    expect(shared.sort()).toEqual(["/_akan/csr-dev/*", "/_akan/ssr-dev/*"]);
  });

  test("on a deployed server opens devtools to the debug-header secret only, and no other dev route", async () => {
    const secret = "s3cret-value-of-at-least-32-characters";
    const table = await serverTable({ NODE_ENV: "production", AKAN_DEVTOOLS: "true", AKAN_LOG_DEBUG_HEADER: secret });
    const keys = devSurfaceKeys(table);
    expect(keys.every((key) => DevSurfaces.find(key)?.gate === "devtools")).toBe(true);
    expect(keys).toContain("/_akan/devtools/unlock");
    for (const key of keys.filter((key) => key !== "/_akan/devtools/unlock")) {
      const route = table[key];
      if (!route) continue;
      expect([key, await answer(route, key, "localhost")]).toEqual([key, [401]]);
      expect([key, await answer(route, key, "rebound.example")]).toEqual([key, [403]]);
    }
  });

  test("refuses at registration a route under a reserved prefix that neither the registry nor the production list names", () => {
    const handler = () => new Response("ok");
    const build = (inputs: Partial<ApiRouteInputs>) => () =>
      ApiRouter.buildRoutes({
        prefix: "/api",
        websocketPrefix: "/ws",
        routes: {},
        renderEnvRoutes: {},
        upgradeAppWs: () => false,
        ...inputs,
      });
    expect(
      build({ routes: { "/_akan/feed": handler }, routeOptions: { "/_akan/feed": { globalPrefix: false } } }),
    ).toThrow(/registers \/_akan\/feed, .*DevSurfaces/);
    expect(build({ builtinRoutes: { "/__rsc/raw": handler } })).toThrow("registers /__rsc/raw");
    expect(build({ builtinRoutes: { "/__csr/raw": handler } })).toThrow("registers /__csr/raw");
    expect(build({ renderEnvRoutes: { "/_akan/studio/raw": handler } })).toThrow("registers /_akan/studio/raw");
    expect(
      build({
        routes: { "sitemap.xml": handler },
        routeOptions: { "sitemap.xml": { globalPrefix: false } },
        builtinRoutes: { "/_akan/client/*": handler, "/_akan/app/health": handler },
      }),
    ).not.toThrow();
  });

  test("names in the production list every reserved route the server and the gateway answer, and nothing else", async () => {
    const reservedKeys = async (env: Record<string, string | undefined>) =>
      Object.keys(await serverTable(env)).filter((key) => DevSurfaces.isReserved(key));
    const claim = spyOn(DevSurfacePolicy, "checkReserved");
    try {
      new AkanApp("./server", { port: 0 });
      const gateway = claim.mock.calls.flatMap(([, routes]) => [...routes].map(([key]) => key));
      expect(gateway).toContain("/_akan/app/health");
      const production = await reservedKeys({ NODE_ENV: "production" });
      const development = await reservedKeys({ NODE_ENV: "development" });
      for (const key of [...gateway, ...production])
        expect([key, DevSurfaces.isProductionRoute(key)]).toEqual([key, true]);
      expect(development.filter((key) => !DevSurfaces.isProductionRoute(key) && !DevSurfaces.find(key))).toEqual([]);
      const named = new Set([...gateway, ...production, `${OpsRoute.prefix}*`]);
      expect(DevSurfaces.productionRoutes.filter((key) => !named.has(key))).toEqual([]);
    } finally {
      claim.mockRestore();
    }
  });

  test("starts the on-demand dev CSR build only for a Host a dev surface answers", async () => {
    const server = { requestIP: () => null, upgrade: () => false, timeout: () => undefined };
    const builds = () => sent.filter((message) => (message as { type?: string } | null)?.type === "build-csr").length;
    const ask = (route: Route | undefined, path: string, host: string) => {
      if (typeof route !== "function") throw new Error(`${path} is not a handler`);
      void Promise.resolve(route(new Request(`http://${host}${path}`, { headers: { host } }), server)).catch(
        () => null,
      );
    };
    await serverTable({ NODE_ENV: "development" }, async (table) => {
      const before = builds();
      ask(table["/__csr"], "/__csr", "rebound.example:4200");
      ask(table["/*"], "/en/tasks?csr=true", "rebound.example:4200");
      await Bun.sleep(20);
      expect(builds()).toBe(before);
      ask(table["/__csr"], "/__csr", "localhost:4200");
      await Bun.sleep(20);
      expect(builds()).toBe(before + 1);
    });
  });
});
