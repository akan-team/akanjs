import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { brotliDecompressSync } from "node:zlib";
import { Logger, type LogRecord, SessionCookies } from "akanjs/common";
import { getDefaultInjectRegistry } from "akanjs/service";
import { SignalContext } from "akanjs/signal";
import { AkanResponse, WebProxyRunner } from "../proxy";
import type { HttpRoutes, WebsocketRoutes } from "../types";
import type { ApiRouter as ApiRouterType } from "./apiRouter";
import type { AppWsData as AppWsDataType } from "./appWsData";

type RouteFn = (req: Request) => Response | Promise<Response>;
const get = (path: string, acceptEncoding = "") =>
  new Request(`http://localhost${path}`, acceptEncoding ? { headers: { "accept-encoding": acceptEncoding } } : {});

const loadApiRouter = async () => {
  process.env.AKAN_PUBLIC_APP_NAME = "test";
  process.env.AKAN_PUBLIC_REPO_NAME ??= "akanjs";
  process.env.AKAN_PUBLIC_SERVE_DOMAIN ??= "example.com";
  return (await import("./apiRouter")).ApiRouter;
};

const buildRoutes = async (props: Partial<Parameters<typeof ApiRouterType.buildRoutes>[0]>) =>
  (await loadApiRouter()).buildRoutes({
    prefix: "/api",
    websocketPrefix: "/ws",
    routes: {} as HttpRoutes,
    renderEnvRoutes: {},
    upgradeAppWs: () => false,
    ...props,
  });

const buildWebsocketHandlers = async (props: Partial<Parameters<typeof ApiRouterType.buildWebsocketHandlers>[0]>) =>
  (await loadApiRouter()).buildWebsocketHandlers({
    wsRoutes: {} as WebsocketRoutes,
    registry: getDefaultInjectRegistry(),
    hmrHub: null,
    hmrState: null,
    logger: { error: () => undefined } as never,
    ...props,
  });

const fakeWs = (data: unknown, send: (message: string) => unknown = () => undefined) =>
  ({ data, send }) as unknown as Bun.ServerWebSocket<{ kind?: string }>;

describe("ApiRouter.buildRoutes", () => {
  test("keeps the global prefix by default", async () => {
    const routes = await buildRoutes({ routes: { "/admin/ping": () => new Response("ok") } as HttpRoutes });

    expect(Object.keys(routes)).toContain("/api/admin/ping");
  });

  test("allows selected endpoints to skip the global prefix", async () => {
    const routes = await buildRoutes({
      routes: { "/sitemap.xml": () => new Response("ok") } as HttpRoutes,
      routeOptions: { "/sitemap.xml": { globalPrefix: false } },
      renderEnvRoutes: { "/*": () => new Response("fallback") } as HttpRoutes,
    });

    expect(Object.keys(routes)).toContain("/sitemap.xml");
    expect(Object.keys(routes)).not.toContain("/api/sitemap.xml");
  });

  test("keeps builtin routes before render catch-all without API prefix", async () => {
    const routes = await buildRoutes({
      routes: { "/ping": () => new Response("api") } as HttpRoutes,
      builtinRoutes: { "/openapi.json": () => Response.json({ openapi: "3.1.0" }) } as HttpRoutes,
      renderEnvRoutes: { "/*": () => new Response("fallback") } as HttpRoutes,
    });

    expect(Object.keys(routes)).toContain("/openapi.json");
    expect(Object.keys(routes)).not.toContain("/api/openapi.json");
    expect(await (await (routes["/openapi.json"] as RouteFn)(get("/openapi.json"))).json()).toEqual({
      openapi: "3.1.0",
    });
  });

  test("wraps only render routes with the web proxy runner", async () => {
    class RewriteRenderProxy {
      static refName = "rewriteRenderProxy";
      use() {
        return AkanResponse.rewrite("http://localhost/rendered", { request: { headers: { "x-proxy": "1" } } });
      }
    }
    const routes = await buildRoutes({
      routes: { "/ping": () => Response.json("api") } as HttpRoutes,
      builtinRoutes: { "/openapi.json": () => Response.json({ openapi: "3.1.0" }) } as HttpRoutes,
      renderEnvRoutes: {
        "/*": (req) => Response.json({ url: req.url, proxy: req.headers.get("x-proxy") }),
      } as HttpRoutes,
      webProxyRunner: new WebProxyRunner([RewriteRenderProxy]),
    });

    expect(await (await (routes["/api/ping"] as RouteFn)(get("/api/ping"))).json()).toBe("api");
    expect(await (await (routes["/openapi.json"] as RouteFn)(get("/openapi.json"))).json()).toEqual({
      openapi: "3.1.0",
    });
    const renderResponse = await (routes["/*"] as (req: Request) => Response | Promise<Response>)(
      new Request("http://localhost/dashboard"),
    );
    expect(await renderResponse.json()).toEqual({ url: "http://localhost/rendered", proxy: "1" });
  });

  test("answers a native shell's preflight on a signal path and labels the answer", async () => {
    type MethodRoutes = Partial<Record<string, RouteFn>>;
    const routes = await buildRoutes({
      routes: { "/user/me": { GET: () => Response.json({ id: "u1" }) } } as unknown as HttpRoutes,
    });
    const route = routes["/api/user/me"] as unknown as MethodRoutes;
    const origin = { origin: "app://localhost" };

    const preflight = await route.OPTIONS?.(new Request("http://localhost/api/user/me", { headers: origin }));
    expect(preflight?.status).toBe(204);
    expect(preflight?.headers.get("access-control-allow-methods")).toBe("GET, OPTIONS");

    const answer = await route.GET?.(new Request("http://localhost/api/user/me", { headers: origin }));
    expect(answer?.headers.get("access-control-allow-origin")).toBe("app://localhost");
    expect(await answer?.json()).toEqual({ id: "u1" });
  });

  test("keeps a route's own preflight and leaves builtin routes alone", async () => {
    type MethodRoutes = Partial<Record<string, RouteFn>>;
    const routes = await buildRoutes({
      routes: {
        "/custom": { POST: () => new Response("ok"), OPTIONS: () => new Response("own", { status: 200 }) },
      } as unknown as HttpRoutes,
      builtinRoutes: { "/mcp": { POST: () => new Response("mcp") } } as unknown as HttpRoutes,
    });
    const own = await (routes["/api/custom"] as unknown as MethodRoutes).OPTIONS?.(get("/api/custom"));
    expect(await own?.text()).toBe("own");
    expect((routes["/mcp"] as unknown as MethodRoutes).OPTIONS).toBeUndefined();
  });

  test("a host allowlist refuses every route, the socket upgrade and the preflight included, for a Host it does not name", async () => {
    type MethodRoutes = Partial<Record<string, RouteFn>>;
    const { HostAllowlist } = await import("./hostAllowlist");
    let upgrades = 0;
    const routes = await buildRoutes({
      routes: { "/user/me": { GET: () => Response.json({ id: "u1" }) } } as unknown as HttpRoutes,
      builtinRoutes: { "/_akan/app/health": () => new Response("up") } as HttpRoutes,
      upgradeAppWs: () => {
        upgrades++;
        return true;
      },
      hostAllowlist: new HostAllowlist(["127.0.0.1:52345"]),
    });
    const at = (path: string, host: string, headers: Record<string, string> = {}) =>
      new Request(`http://127.0.0.1:52345${path}`, { headers: { host, ...headers } });
    const endpoint = routes["/api/user/me"] as unknown as MethodRoutes;
    const rebound = "attacker.example:52345";

    expect((await endpoint.GET?.(at("/api/user/me", rebound)))?.status).toBe(403);
    expect((await endpoint.OPTIONS?.(at("/api/user/me", rebound, { origin: "app://localhost" })))?.status).toBe(403);
    expect((await (routes["/_akan/app/health"] as RouteFn)(at("/_akan/app/health", rebound))).status).toBe(403);
    expect((await (routes["/api/ws"] as RouteFn)(at("/api/ws", rebound)))?.status).toBe(403);
    expect(upgrades).toBe(0);
    expect((await endpoint.GET?.(at("/api/user/me", rebound, { "x-forwarded-host": "127.0.0.1:52345" })))?.status).toBe(
      403,
    );

    expect(await (await endpoint.GET?.(at("/api/user/me", "127.0.0.1:52345")))?.json()).toEqual({ id: "u1" });
    expect(
      await (await (routes["/_akan/app/health"] as RouteFn)(at("/_akan/app/health", "127.0.0.1:52345"))).text(),
    ).toBe("up");
    await (routes["/api/ws"] as RouteFn)(at("/api/ws", "127.0.0.1:52345"));
    expect(upgrades).toBe(1);
  });

  test("the socket upgrade refuses a cross-site Origin and admits same-site, native shell and Origin-less callers", async () => {
    const { CrossSiteGuard } = await import("akanjs/signal");
    const upgraded: string[] = [];
    const routes = await buildRoutes({
      upgradeAppWs: (req) => {
        upgraded.push(req.headers.get("origin") ?? "none");
        return true;
      },
    });
    const open = (origin?: string, headers: Record<string, string> = {}) =>
      (routes["/api/ws"] as RouteFn)(
        new Request("http://127.0.0.1:52345/api/ws", {
          headers: { host: "127.0.0.1:52345", ...(origin ? { origin } : {}), ...headers },
        }),
      );
    const warn = CrossSiteGuard.logger.warn;
    CrossSiteGuard.logger.warn = () => undefined;
    try {
      expect((await open("https://evil.example"))?.status).toBe(403);
      expect((await open("null"))?.status).toBe(403);
      expect(upgraded).toEqual([]);

      for (const origin of ["http://127.0.0.1:52345", ...CrossSiteGuard.nativeOrigins]) {
        expect(await open(origin)).toBeUndefined();
      }
      expect(await open()).toBeUndefined();
      expect((await open("https://app.example.com", { "x-forwarded-host": "app.example.com" }))?.status).toBe(403);
      SignalContext.setHttpPeerResolver(() => null);
      expect(await open("https://app.example.com", { "x-forwarded-host": "app.example.com" })).toBeUndefined();
      expect(upgraded).toEqual([
        "http://127.0.0.1:52345",
        ...CrossSiteGuard.nativeOrigins,
        "none",
        "https://app.example.com",
      ]);
    } finally {
      CrossSiteGuard.logger.warn = warn;
      SignalContext.setHttpPeerResolver(null);
    }
  });

  test("the socket path answers a request that never asked to upgrade 426, and keeps 500 for a refused handshake", async () => {
    const routes = await buildRoutes({ upgradeAppWs: () => false });
    const open = (headers: Record<string, string> = {}) =>
      (routes["/api/ws"] as RouteFn)(new Request("http://localhost/api/ws", { headers }));

    const plain = await open();
    expect(plain?.status).toBe(426);
    expect(plain?.headers.get("upgrade")).toBe("websocket");
    expect(plain?.headers.get("connection")).toBe("Upgrade");
    expect((await open({ upgrade: "h2c" }))?.status).toBe(426);
    expect((await open({ upgrade: "WebSocket", connection: "Upgrade" }))?.status).toBe(500);
  });
});

describe("ApiRouter.buildWebsocketHandlers", () => {
  test("dispatches app websocket messages and returns route errors", async () => {
    const sent: string[] = [];
    const loggerErrors: string[] = [];
    const ws = fakeWs({}, (message) => sent.push(message));
    const handlers = await buildWebsocketHandlers({
      wsRoutes: {
        echo: async (_ws, data, event) => ({ event, data }),
      } as WebsocketRoutes,
      logger: { error: (message: string) => loggerErrors.push(message) } as never,
    });

    await handlers.message?.(ws, JSON.stringify({ key: "echo", data: ["hello"] }));
    const originalConsoleError = console.error;
    console.error = () => undefined;
    try {
      await handlers.message?.(ws, JSON.stringify({ key: "missing", data: [] }));
    } finally {
      console.error = originalConsoleError;
    }

    expect(JSON.parse(sent[0] ?? "{}")).toEqual({ event: "message", data: ["hello"] });
    // Detailed outside production, generalized inside (SignalFailure owns the split); the log keeps the stack.
    expect(JSON.parse(sent[1] ?? "{}").error).toBe('WebSocket route "missing" is not registered');
    expect(loggerErrors).toHaveLength(1);
    expect(loggerErrors[0]).toContain('WebSocket route "missing" is not registered');
  });

  test("answers a missing document over the socket as a 404 frame with its key, and logs no crash", async () => {
    const { NoDocumentError } = await import("akanjs/document");
    const sent: string[] = [];
    const loggerErrors: string[] = [];
    const ws = fakeWs({}, (message) => sent.push(message));
    const handlers = await buildWebsocketHandlers({
      wsRoutes: {
        item: async () => {
          throw new NoDocumentError("No Document (item): 507f1f77bcf86cd799439011");
        },
      } as WebsocketRoutes,
      logger: { error: (message: string) => loggerErrors.push(message) } as never,
    });

    await handlers.message?.(ws, JSON.stringify({ key: "item", data: [] }));

    const frame = JSON.parse(sent[0] ?? "{}") as Record<string, unknown>;
    expect(Object.keys(frame).sort()).toEqual(["error", "key", "statusCode", "timestamp"]);
    expect(frame).toMatchObject({ error: "base.error.documentNotFound", statusCode: 404, key: "item" });
    expect(loggerErrors).toEqual([]);
  });

  test("keeps HMR websocket traffic separate from app signal routes", async () => {
    const sent: string[] = [];
    let attached = false;
    let detached = false;
    const ws = fakeWs({ kind: "akan-hmr" }, (message) => sent.push(message));
    const handlers = await buildWebsocketHandlers({
      wsRoutes: {
        hmrShouldNotRun: () => {
          throw new Error("should not run");
        },
      } as WebsocketRoutes,
      hmrHub: {
        attach: () => {
          attached = true;
        },
        detach: () => {
          detached = true;
        },
      } as never,
      hmrState: { state: { buildId: 7, cssAssets: {} } },
    });

    handlers.open?.(ws);
    await handlers.message?.(ws, JSON.stringify({ key: "hmrShouldNotRun" }));
    handlers.close?.(ws, 1000, "");

    expect(attached).toBe(true);
    expect(detached).toBe(true);
    expect(JSON.parse(sent[0] ?? "{}")).toEqual({ type: "hello", buildId: 7, cssAssets: {} });
    expect(sent).toHaveLength(1);
  });
});

describe("ApiRouter websocket authentication", () => {
  test("hands the handshake credential to the upgrade instead of dropping it", async () => {
    const upgraded: AppWsDataType[] = [];
    const routes = await buildRoutes({
      upgradeAppWs: (_req, data) => {
        upgraded.push(data);
        return true;
      },
    });

    const upgrade = routes["/api/ws"] as (req: Request) => Response | undefined;
    const response = upgrade(
      new Request("http://localhost/api/ws", {
        headers: { authorization: "Bearer handshake-token", cookie: "jwt=cookie-token" },
      }),
    );

    expect(response).toBeUndefined();
    expect(upgraded).toHaveLength(1);
    expect(upgraded[0]?.headers.get("authorization")).toBe("Bearer handshake-token");
    expect(upgraded[0]?.jar.read("jwt").value).toBe("cookie-token");
  });

  test("applies an auth frame before the frames queued behind it and acks the revoked rooms", async () => {
    const { AppWsData } = await import("./appWsData");
    const { websocketAuthContract } = await import("akanjs/common");
    const sent: string[] = [];
    const seenCredentials: (string | null)[] = [];
    const ws = fakeWs(AppWsData.fromRequest(new Request("http://localhost/api/ws")), (message) => sent.push(message));
    const handlers = await buildWebsocketHandlers({
      wsRoutes: {
        room: (socket: Bun.ServerWebSocket<unknown>) => {
          seenCredentials.push(AppWsData.of(socket).headers.get("authorization"));
          return { ok: true };
        },
      } as unknown as WebsocketRoutes,
    });

    const auth = handlers.message?.(ws, JSON.stringify(websocketAuthContract.makeRequest("signed-in-token")));
    const subscribe = handlers.message?.(ws, JSON.stringify({ key: "room", data: [], subscribe: true }));
    await Promise.all([auth, subscribe]);

    expect(seenCredentials).toEqual(["Bearer signed-in-token"]);
    expect(JSON.parse(sent[0] ?? "{}")).toEqual({ type: "auth", revokedRooms: [] });
    expect(AppWsData.of(ws).account).toBeUndefined();
  });

  test("answers a heartbeat frame instead of rejecting it as an unregistered route", async () => {
    const { AppWsData } = await import("./appWsData");
    const { websocketHeartbeatContract } = await import("akanjs/common");
    const sent: string[] = [];
    const ws = fakeWs(AppWsData.fromRequest(new Request("http://localhost/api/ws")), (message) => sent.push(message));
    const handlers = await buildWebsocketHandlers({});

    await handlers.message?.(ws, JSON.stringify(websocketHeartbeatContract.makeRequest()));

    expect(sent).toHaveLength(1);
    expect(JSON.parse(sent[0] ?? "{}")).toEqual({ type: "pong" });
  });

  test("signing out over the socket clears the credential it was upgraded with", async () => {
    const { AppWsData } = await import("./appWsData");
    const { websocketAuthContract } = await import("akanjs/common");
    const ws = fakeWs(
      AppWsData.fromRequest(new Request("http://localhost/api/ws", { headers: { cookie: "jwt=cookie-token" } })),
    );
    AppWsData.of(ws).account = { role: "user" };
    const handlers = await buildWebsocketHandlers({});

    await handlers.message?.(ws, JSON.stringify(websocketAuthContract.makeRequest(null)));

    expect(AppWsData.of(ws).jar.has("jwt")).toBe(false);
    expect(AppWsData.of(ws).account).toBeUndefined();
  });
});

describe("ApiRouter session cookie sweep", () => {
  type MethodRoutes = Partial<Record<string, RouteFn>>;
  // The session cookie itself is `__Host-` here, which no deletion can reach, so a library's watched name stands in.
  const watched = "refresh:test";
  SessionCookies.watch(watched);
  const duplicated = `${watched}=planted-copy; theme=dark; ${watched}=own-copy`;
  const sweepAt = (...paths: string[]) =>
    ["app.example.com", "example.com"].flatMap((domain) =>
      paths.flatMap((path) => {
        const deletion = `${watched}=; Domain=${domain}; Path=${path}; Max-Age=0; Secure; SameSite=Lax`;
        return [deletion, `${deletion}; Partitioned`];
      }),
    );
  const warnings: LogRecord[] = [];
  const removeSink = Logger.addSink(
    ({ record }) => {
      if (record.name === "SessionCookies") warnings.push(record);
    },
    { minLevel: "warn" },
  );
  afterEach(() => {
    warnings.length = 0;
    SignalContext.setHttpPeerResolver(null);
  });
  afterAll(() => removeSink());

  test("answers a duplicated session cookie with parent-domain deletions and one warning that names no value", async () => {
    const seen: (string | null)[] = [];
    const routes = await buildRoutes({
      routes: {
        "/user/me": {
          GET: (req: Request) => {
            seen.push(req.headers.get("cookie"));
            return Response.json({ id: null });
          },
        },
      } as unknown as HttpRoutes,
    });

    const answer = await (routes["/api/user/me"] as unknown as MethodRoutes).GET?.(
      new Request("http://app.example.com/api/user/me", { headers: { cookie: duplicated } }),
    );

    expect(seen).toEqual([duplicated]);
    expect(answer?.headers.getSetCookie()).toEqual(
      sweepAt("/", "/api", "/api/", "/api/user", "/api/user/", "/api/user/me"),
    );
    expect(answer?.headers.getSetCookie().every((cookie) => cookie.includes("; Domain="))).toBe(true);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.attrs).toEqual({ name: watched, count: 2, host: "app.example.com" });
    expect(JSON.stringify(warnings)).not.toContain("copy");
  });

  test("reports a duplicated `__Host-` session cookie but sends no deletion, which the browser would refuse", async () => {
    const routes = await buildRoutes({ renderEnvRoutes: { "/*": () => new Response("page") } as HttpRoutes });

    const answer = await (routes["/*"] as RouteFn)(
      new Request("http://app.example.com/", { headers: { cookie: "__Host-jwt:test=a; __Host-jwt:test=b" } }),
    );

    expect(answer.headers.getSetCookie()).toEqual([]);
    expect(warnings.map((record) => record.attrs?.name)).toEqual(["__Host-jwt:test"]);
  });

  test("sweeps under the Host header, and under a forwarded host only from a trusted hop", async () => {
    const routes = await buildRoutes({ renderEnvRoutes: { "/*": () => new Response("page") } as HttpRoutes });
    const render = (headers: Record<string, string>) =>
      (routes["/*"] as RouteFn)(new Request("http://10.0.0.5/", { headers: { cookie: duplicated, ...headers } }));

    const byHost = await render({ host: "app.example.com", "x-forwarded-host": "evil.example.net" });
    const byAddress = await render({ "x-forwarded-host": "app.example.com" });
    SignalContext.setHttpPeerResolver(() => ({ address: "203.0.113.9", port: 50_000 }));
    const fromStranger = await render({ host: "10.0.0.5", "x-forwarded-host": "app.example.com" });
    SignalContext.setHttpPeerResolver(() => null);
    const fromGateway = await render({ host: "akan-child", "x-forwarded-host": "app.example.com" });

    expect(byHost.headers.getSetCookie()).toEqual(sweepAt("/"));
    expect(byAddress.headers.getSetCookie()).toEqual([]);
    expect(fromStranger.headers.getSetCookie()).toEqual([]);
    expect(fromGateway.headers.getSetCookie()).toEqual(sweepAt("/"));
    expect(warnings.map((record) => record.attrs?.host)).toEqual([
      "app.example.com",
      "10.0.0.5",
      "10.0.0.5",
      "app.example.com",
    ]);
  });

  test("drops a forwarded host, scheme and port only a trusted hop may send, before any route reads them", async () => {
    const names = ["x-forwarded-host", "x-forwarded-proto", "x-forwarded-port"];
    const seen: (string | null)[][] = [];
    const routes = await buildRoutes({
      renderEnvRoutes: {
        "/*": (req: Request) => {
          seen.push(names.map((name) => req.headers.get(name)));
          return new Response("page");
        },
      } as unknown as HttpRoutes,
    });
    const forwarded = {
      "x-forwarded-host": "app.example.com",
      "x-forwarded-proto": "https",
      "x-forwarded-port": "443",
    };
    const render = () => (routes["/*"] as RouteFn)(new Request("http://10.0.0.5/", { headers: forwarded }));

    await render();
    SignalContext.setHttpPeerResolver(() => ({ address: "203.0.113.9", port: 50_000 }));
    await render();
    SignalContext.setHttpPeerResolver(() => ({ address: "10.0.0.2", port: 50_000 }));
    await render();
    SignalContext.setHttpPeerResolver(() => null);
    await render();

    const dropped = [null, null, null];
    const kept = ["app.example.com", "https", "443"];
    expect(seen).toEqual([dropped, dropped, kept, kept]);
  });

  test("answers a host no browser could address with no sweep and a cut-down warning", async () => {
    const routes = await buildRoutes({ renderEnvRoutes: { "/*": () => new Response("page") } as HttpRoutes });
    const host = `${"a.".repeat(1000)}example.com`;
    SignalContext.setHttpPeerResolver(() => null);

    const answer = await (routes["/*"] as RouteFn)(
      new Request("http://app.example.com/a/b/c/d/e/f/g/h/i/j/k", {
        headers: { cookie: duplicated, "x-forwarded-host": host },
      }),
    );

    expect(answer.headers.getSetCookie()).toEqual([]);
    expect(warnings.map((record) => record.attrs?.host)).toEqual([host.slice(0, 100)]);
  });

  test("copies a response whose headers refuse a write, and keeps its body streaming", async () => {
    class LockedHeaders extends Headers {
      override append(): void {
        throw new TypeError("immutable");
      }
    }
    const routes = await buildRoutes({
      renderEnvRoutes: {
        "/*": () => {
          const stream = new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode("streamed"));
              controller.close();
            },
          });
          const response = new Response(stream, { status: 202, headers: { "x-page": "1" } });
          Object.defineProperty(response, "headers", { value: new LockedHeaders(response.headers) });
          return response;
        },
      } as HttpRoutes,
    });

    const answer = await (routes["/*"] as RouteFn)(
      new Request("http://app.example.com/", { headers: { cookie: duplicated } }),
    );

    expect(answer.status).toBe(202);
    expect(answer.headers.get("x-page")).toBe("1");
    expect(answer.headers.getSetCookie()).toEqual(sweepAt("/"));
    expect(answer.body).toBeInstanceOf(ReadableStream);
    expect(await answer.text()).toBe("streamed");
  });

  test("leaves builtins, the socket upgrade and a jar without duplicates alone", async () => {
    const routes = await buildRoutes({
      routes: { "/ping": () => new Response("api") } as HttpRoutes,
      builtinRoutes: { "/mcp": { POST: () => new Response("mcp") } } as unknown as HttpRoutes,
      upgradeAppWs: () => true,
    });

    const mcp = await (routes["/mcp"] as unknown as MethodRoutes).POST?.(
      new Request("http://app.example.com/mcp", { method: "POST", headers: { cookie: duplicated } }),
    );
    const upgrade = (routes["/api/ws"] as (req: Request) => Response | undefined)(
      new Request("http://app.example.com/api/ws", { headers: { cookie: duplicated } }),
    );
    const single = await (routes["/api/ping"] as RouteFn)(
      new Request("http://app.example.com/api/ping", { headers: { cookie: "jwt:test=own; jwt:other=x; theme=a" } }),
    );

    expect(mcp?.headers.getSetCookie()).toEqual([]);
    expect(upgrade).toBeUndefined();
    expect(single.headers.getSetCookie()).toEqual([]);
    expect(warnings).toEqual([]);
  });
});

describe("ApiRouter endpoint responses over a real socket", () => {
  test("opens a socket for a handshake and answers a plain GET on the same path 426", async () => {
    let server: Bun.Server<unknown> | undefined;
    const routes = await buildRoutes({ upgradeAppWs: (req, data) => server?.upgrade(req, { data }) ?? false });
    server = Bun.serve({ port: 0, routes: routes as never, websocket: { message: () => undefined } });
    try {
      const plain = await fetch(`http://localhost:${server.port}/api/ws`);
      expect(plain.status).toBe(426);
      expect(plain.headers.get("upgrade")).toBe("websocket");

      const socket = new WebSocket(`ws://localhost:${server.port}/api/ws`);
      const opened = await new Promise<boolean>((resolve) => {
        socket.addEventListener("open", () => resolve(true));
        socket.addEventListener("error", () => resolve(false));
      });
      socket.close();
      expect(opened).toBe(true);
    } finally {
      server.stop(true);
    }
  });

  test("compresses a signal endpoint's JSON, and leaves the decoded body identical", async () => {
    const payload = { rows: Array.from({ length: 200 }, (_, i) => ({ id: i, title: "repeated title" })) };
    const server = Bun.serve({
      port: 0,
      routes: (await buildRoutes({ routes: { "/rows": () => Response.json(payload) } as HttpRoutes })) as never,
    });

    const compressed = await fetch(`http://localhost:${server.port}/api/rows`, {
      headers: { "accept-encoding": "br" },
    });
    const plain = await fetch(`http://localhost:${server.port}/api/rows`, {
      headers: { "accept-encoding": "identity" },
    });

    expect(compressed.headers.get("content-encoding")).toBe("br");
    expect(plain.headers.get("content-encoding")).toBeNull();
    // Bun's fetch decodes the body but keeps the header, so this is the wire size against the decoded one.
    const wireBytes = Number(compressed.headers.get("content-length"));
    expect(wireBytes).toBeLessThan(JSON.stringify(payload).length / 10);
    expect(await compressed.json()).toEqual(payload);
    expect(await plain.json()).toEqual(payload);
    server.stop(true);
  });

  test("compresses a render route's HTML on the way out, and leaves it plain for a caller that takes no encoding", async () => {
    const html = `<!doctype html><html><body>${"<p>rendered</p>".repeat(500)}</body></html>`;
    const server = Bun.serve({
      port: 0,
      routes: (await buildRoutes({
        renderEnvRoutes: {
          "/*": () => new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } }),
        } as HttpRoutes,
      })) as never,
    });
    try {
      const wire = await fetch(`http://localhost:${server.port}/en`, {
        headers: { "accept-encoding": "br" },
        decompress: false,
      });
      const plain = await fetch(`http://localhost:${server.port}/en`, { headers: { "accept-encoding": "identity" } });

      expect(wire.headers.get("content-encoding")).toBe("br");
      const wireBytes = Buffer.from(await wire.arrayBuffer());
      expect(wireBytes.byteLength).toBeLessThan(html.length / 10);
      expect(brotliDecompressSync(wireBytes).toString()).toBe(html);
      expect(plain.headers.get("content-encoding")).toBeNull();
      expect(await plain.text()).toBe(html);
    } finally {
      server.stop(true);
    }
  });
});
