import { afterEach, describe, expect, test } from "bun:test";
import { AkanError } from "akanjs/base";
import { SignalContext } from "../../signal/signalContext";
import { DevRoutes } from "./devRoutes";
import { DevSurfacePolicy } from "./devSurfacePolicy";
import { DevSurfaces } from "./devSurfaces";

Object.assign(process.env, {
  AKAN_PUBLIC_APP_NAME: "alpha",
  AKAN_PUBLIC_REPO_NAME: "akanjs",
  AKAN_PUBLIC_SERVE_DOMAIN: "akanjs.com",
  AKAN_PUBLIC_ENV: "local",
});

type Handler = (req: Request) => Response;
const local = { environment: "local", operationMode: "local" } as const;
const at = (pathname: string, host: string) => new Request(`http://${host}${pathname}`, { headers: { host } });

const withEnv = <T>(vars: Record<string, string | undefined>, run: () => T): T => {
  const previous = Object.fromEntries(Object.keys(vars).map((key) => [key, process.env[key]]));
  const assign = (values: Record<string, string | undefined>) => {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
  assign(vars);
  try {
    return run();
  } finally {
    assign(previous);
  }
};

afterEach(() => {
  SignalContext.setHttpPeerResolver(null);
});

describe("DevSurfaces", () => {
  test("finds a dev route however its path is spelled, and nothing else", () => {
    for (const pathname of [
      "/_akan/studio",
      "/_akan/studio/graph",
      "//_akan/devtools",
      "/_akan/%64evtools",
      "/_AKAN/HMR",
      "/_akan/ssr-dev/*",
      "/__rsc/manifest",
    ])
      expect([pathname, DevSurfaces.find(pathname)?.path]).toEqual([pathname, expect.any(String)]);
    for (const pathname of ["/", "/_akan/devtoolsx", "/_akan/client/chunk.js", "/__rsc", "/_akan/app/health"])
      expect([pathname, DevSurfaces.find(pathname)]).toEqual([pathname, null]);
  });

  test("lets a tunnel serve only the dev assets a shared page loads", () => {
    for (const { path, tunnel } of DevSurfaces.all)
      expect([path, DevSurfaces.refusedThroughTunnel(`${path}/page.js`)]).toEqual([path, tunnel === "refuse"]);
    expect(DevSurfaces.all.filter(({ tunnel }) => tunnel === "share").map(({ path }) => path)).toEqual([
      "/_akan/ssr-dev",
      "/_akan/csr-dev",
    ]);
    for (const pathname of ["/_akan/app/logs", "/_akan/ops/snapshot", "/_akan/csr-dev/page.js.map", "/%E0%A4%A"])
      expect([pathname, DevSurfaces.refusedThroughTunnel(pathname)]).toEqual([pathname, true]);
  });

  test("keeps the framework's prefixes however a route key spells them", () => {
    for (const key of ["/_akan", "/_akan/feed", "//_akan/feed", "/_AKAN/Feed", "/__rsc/raw", "/__csr", "/_akan/%64ev"])
      expect([key, DevSurfaces.isReserved(key)]).toEqual([key, true]);
    for (const key of ["/", "/api/_akan", "/_akanx", "/__rscx", "sitemap.xml", "/100%"])
      expect([key, DevSurfaces.isReserved(key)]).toEqual([key, false]);
    for (const { path } of DevSurfaces.all) expect([path, DevSurfaces.isProductionRoute(path)]).toEqual([path, false]);
    expect(DevSurfaces.productionRoutes.every((key) => DevSurfaces.isReserved(key))).toBe(true);
  });

  test("drops only the client-render switch from a shared page's query", () => {
    expect(DevSurfaces.searchThroughTunnel("?csr=true&page=2")).toBe("?page=2");
    expect(DevSurfaces.searchThroughTunnel("?csr=true")).toBe("");
    expect(DevSurfaces.searchThroughTunnel("?page=2&q=a%20b")).toBe("?page=2&q=a%20b");
    expect(DevSurfaces.searchThroughTunnel("")).toBe("");
  });
});

describe("DevSurfacePolicy", () => {
  test("lets a reserved route through only when DevRoutes mounted it or the production list names it", () => {
    const handler = () => new Response("ok");
    const mounted = withEnv({ NODE_ENV: "development" }, () => DevRoutes.mount({ "/_akan/hmr": handler }));
    expect(() => DevSurfacePolicy.checkReserved("A test", Object.entries(mounted))).not.toThrow();
    expect(() => DevSurfacePolicy.checkReserved("A test", [["/_akan/client/*", handler]])).not.toThrow();
    expect(() => DevSurfacePolicy.checkReserved("A test", [["/api/task", handler]])).not.toThrow();
    expect(() => DevSurfacePolicy.checkReserved("A test", [["/_akan/hmr", handler]])).toThrow(AkanError);
    expect(() => DevSurfacePolicy.checkReserved("A test", [["/_akan/hmr", handler]])).toThrow(
      "A test registers /_akan/hmr",
    );
  });
});

describe("DevRoutes", () => {
  test("refuses to mount a path the registry does not list", () => {
    expect(() => DevRoutes.mount({ "/_akan/new-panel": () => new Response("ok") })).toThrow(AkanError);
  });

  test("answers localhost, IP literals and the app's own host, and refuses any other Host", async () => {
    const routes = DevRoutes.mount({ "/_akan/hmr": () => new Response("ok") }) as Record<string, Handler>;
    for (const host of [
      "localhost:4200",
      "127.0.0.1:4200",
      "[::1]:4200",
      "app.localhost:4200",
      "alpha-local.akanjs.com",
    ])
      expect([host, routes["/_akan/hmr"](at("/_akan/hmr", host)).status]).toEqual([host, 200]);
    const refused = routes["/_akan/hmr"](at("/_akan/hmr", "rebound.example:4200"));
    expect(refused.status).toBe(403);
    expect(await refused.text()).toContain("AKAN_ALLOWED_HOSTS");
  });

  test("answers the gateway's hop name only on the gateway's socket", () => {
    const routes = DevRoutes.mount({ "/_akan/ssr-dev/*": () => new Response("ok") }) as Record<string, Handler>;
    const viaGateway = () => routes["/_akan/ssr-dev/*"](at("/_akan/ssr-dev/page.js", "akan-child")).status;
    expect(viaGateway()).toBe(403);
    SignalContext.setHttpPeerResolver(() => ({ address: "203.0.113.9", family: "IPv4", port: 5000 }));
    expect(viaGateway()).toBe(403);
    SignalContext.setHttpPeerResolver(() => null);
    expect(viaGateway()).toBe(200);
  });

  test("guards every method of a method map and keeps a synchronous handler synchronous", () => {
    const routes = DevRoutes.mount(
      { "/_akan/studio": { GET: () => new Response("get"), POST: () => new Response("post") } },
      local,
    ) as Record<string, Record<string, Handler>>;
    const answered = routes["/_akan/studio"].GET(at("/_akan/studio", "localhost"));
    expect(answered).toBeInstanceOf(Response);
    expect(answered.status).toBe(200);
    expect(routes["/_akan/studio"].POST(at("/_akan/studio", "rebound.example")).status).toBe(403);
  });

  test("mounts no dev build route in production unless its production setting opens it", () => {
    const build = () =>
      Object.keys(
        DevRoutes.mount({
          "/_akan/hmr": () => new Response("hmr"),
          "/__rsc/manifest": () => new Response("{}"),
        }),
      );
    expect(withEnv({ NODE_ENV: "production", AKAN_COMMAND_TYPE: undefined }, build)).toEqual([]);
    expect(withEnv({ NODE_ENV: "production", AKAN_COMMAND_TYPE: "start" }, build)).toEqual([
      "/_akan/hmr",
      "/__rsc/manifest",
    ]);
    expect(
      withEnv({ NODE_ENV: "production", AKAN_COMMAND_TYPE: undefined, AKAN_EXPOSE_RSC_MANIFEST: "1" }, build),
    ).toEqual(["/__rsc/manifest"]);
  });

  test("mounts no devtools route outside a local runtime, and closes one whose gate shuts after mounting", async () => {
    const devtools = { "/_akan/devtools": { GET: () => new Response("index") } };
    expect(DevRoutes.mount(devtools, { environment: "main", operationMode: "local" })).toEqual({});
    const routes = DevRoutes.mount(devtools, local) as Record<string, Record<string, Handler>>;
    const closed = withEnv({ AKAN_DEVTOOLS: "false" }, () =>
      routes["/_akan/devtools"].GET(at("/_akan/devtools", "localhost")),
    );
    expect(closed.status).toBe(404);
    expect(await closed.json()).toEqual({ error: "Not found" });
  });
});
