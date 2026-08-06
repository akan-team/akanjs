import { getDefaultInjectRegistry } from "akanjs/service";
import { AkanResponse, WebProxyRunner } from "../proxy";
import type { HttpRoutes, WebsocketRoutes } from "../types";

describe("ApiRouter.buildRoutes", () => {
  test("keeps the global prefix by default", async () => {
    process.env.AKAN_PUBLIC_APP_NAME = "test";
    const { ApiRouter } = await import("./apiRouter");
    const routes = ApiRouter.buildRoutes({
      prefix: "/api",
      websocketPrefix: "/ws",
      routes: { "/admin/ping": () => new Response("ok") } as HttpRoutes,
      renderEnvRoutes: {},
      upgradeAppWs: () => false,
    });

    expect(Object.keys(routes)).toContain("/api/admin/ping");
  });

  test("allows selected endpoints to skip the global prefix", async () => {
    process.env.AKAN_PUBLIC_APP_NAME = "test";
    const { ApiRouter } = await import("./apiRouter");
    const routes = ApiRouter.buildRoutes({
      prefix: "/api",
      websocketPrefix: "/ws",
      routes: { "/sitemap.xml": () => new Response("ok") } as HttpRoutes,
      routeOptions: { "/sitemap.xml": { globalPrefix: false } },
      renderEnvRoutes: { "/*": () => new Response("fallback") } as HttpRoutes,
      upgradeAppWs: () => false,
    });

    expect(Object.keys(routes)).toContain("/sitemap.xml");
    expect(Object.keys(routes)).not.toContain("/api/sitemap.xml");
  });

  test("keeps builtin routes before render catch-all without API prefix", async () => {
    process.env.AKAN_PUBLIC_APP_NAME = "test";
    const { ApiRouter } = await import("./apiRouter");
    const routes = ApiRouter.buildRoutes({
      prefix: "/api",
      websocketPrefix: "/ws",
      routes: { "/ping": () => new Response("api") } as HttpRoutes,
      builtinRoutes: { "/openapi.json": () => Response.json({ openapi: "3.1.0" }) } as HttpRoutes,
      renderEnvRoutes: { "/*": () => new Response("fallback") } as HttpRoutes,
      upgradeAppWs: () => false,
    });

    expect(Object.keys(routes)).toContain("/openapi.json");
    expect(Object.keys(routes)).not.toContain("/api/openapi.json");
    expect(await (await (routes["/openapi.json"] as () => Response)()).json()).toEqual({ openapi: "3.1.0" });
  });

  test("wraps only render routes with the web proxy runner", async () => {
    process.env.AKAN_PUBLIC_APP_NAME = "test";
    const { ApiRouter } = await import("./apiRouter");
    class RewriteRenderProxy {
      static refName = "rewriteRenderProxy";
      use() {
        return AkanResponse.rewrite("http://localhost/rendered", { request: { headers: { "x-proxy": "1" } } });
      }
    }
    const routes = ApiRouter.buildRoutes({
      prefix: "/api",
      websocketPrefix: "/ws",
      routes: { "/ping": () => Response.json("api") } as HttpRoutes,
      builtinRoutes: { "/openapi.json": () => Response.json({ openapi: "3.1.0" }) } as HttpRoutes,
      renderEnvRoutes: {
        "/*": (req) => Response.json({ url: req.url, proxy: req.headers.get("x-proxy") }),
      } as HttpRoutes,
      upgradeAppWs: () => false,
      webProxyRunner: new WebProxyRunner([RewriteRenderProxy]),
    });

    expect(await (await (routes["/api/ping"] as () => Response)()).json()).toBe("api");
    expect(await (await (routes["/openapi.json"] as () => Response)()).json()).toEqual({ openapi: "3.1.0" });
    const renderResponse = await (routes["/*"] as (req: Request) => Response | Promise<Response>)(
      new Request("http://localhost/dashboard"),
    );
    expect(await renderResponse.json()).toEqual({ url: "http://localhost/rendered", proxy: "1" });
  });
});

describe("ApiRouter.buildWebsocketHandlers", () => {
  test("dispatches app websocket messages and returns route errors", async () => {
    process.env.AKAN_PUBLIC_APP_NAME = "test";
    const { ApiRouter } = await import("./apiRouter");
    const sent: string[] = [];
    const loggerErrors: string[] = [];
    const ws = {
      data: {},
      send: (message: string) => sent.push(message),
    } as unknown as Bun.ServerWebSocket<unknown>;
    const handlers = ApiRouter.buildWebsocketHandlers({
      wsRoutes: {
        echo: async (_ws, data, event) => ({ event, data }),
      } as WebsocketRoutes,
      registry: getDefaultInjectRegistry(),
      hmrHub: null,
      hmrState: null,
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
    expect(JSON.parse(sent[1] ?? "{}").error).toBe('WebSocket route "missing" is not registered');
    expect(loggerErrors).toEqual(['WebSocket route "missing" is not registered']);
  });

  test("keeps HMR websocket traffic separate from app signal routes", async () => {
    process.env.AKAN_PUBLIC_APP_NAME = "test";
    const { ApiRouter } = await import("./apiRouter");
    const sent: string[] = [];
    let attached = false;
    let detached = false;
    const ws = {
      data: { kind: "akan-hmr" },
      send: (message: string) => sent.push(message),
    } as unknown as Bun.ServerWebSocket<unknown>;
    const handlers = ApiRouter.buildWebsocketHandlers({
      wsRoutes: {
        hmrShouldNotRun: () => {
          throw new Error("should not run");
        },
      } as WebsocketRoutes,
      registry: getDefaultInjectRegistry(),
      hmrHub: {
        attach: () => {
          attached = true;
        },
        detach: () => {
          detached = true;
        },
      } as never,
      hmrState: { state: { buildId: 7, cssAssets: {} } },
      logger: { error: () => undefined } as never,
    });

    handlers.open?.(ws);
    await handlers.message?.(ws, JSON.stringify({ key: "hmrShouldNotRun" }));
    handlers.close?.(ws);

    expect(attached).toBe(true);
    expect(detached).toBe(true);
    expect(JSON.parse(sent[0] ?? "{}")).toEqual({ type: "hello", buildId: 7, cssAssets: {} });
    expect(sent).toHaveLength(1);
  });
});

describe("ApiRouter websocket authentication", () => {
  test("hands the handshake credential to the upgrade instead of dropping it", async () => {
    process.env.AKAN_PUBLIC_APP_NAME = "test";
    const { ApiRouter } = await import("./apiRouter");
    const { AppWsData } = await import("./appWsData");
    let upgradeData: InstanceType<typeof AppWsData> | null = null;
    const routes = ApiRouter.buildRoutes({
      prefix: "/api",
      websocketPrefix: "/ws",
      routes: {} as HttpRoutes,
      renderEnvRoutes: {},
      upgradeAppWs: (_req, data) => {
        upgradeData = data;
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
    expect(upgradeData?.headers.get("authorization")).toBe("Bearer handshake-token");
    expect(upgradeData?.cookies.get("jwt")).toBe("cookie-token");
  });

  test("applies an auth frame before the frames queued behind it and acks the revoked rooms", async () => {
    process.env.AKAN_PUBLIC_APP_NAME = "test";
    const { ApiRouter } = await import("./apiRouter");
    const { AppWsData } = await import("./appWsData");
    const { websocketAuthContract } = await import("akanjs/common");
    const sent: string[] = [];
    const seenCredentials: (string | null)[] = [];
    const ws = {
      data: AppWsData.fromRequest(new Request("http://localhost/api/ws")),
      send: (message: string) => sent.push(message),
    } as unknown as Bun.ServerWebSocket<unknown>;
    const handlers = ApiRouter.buildWebsocketHandlers({
      wsRoutes: {
        room: (socket: Bun.ServerWebSocket<unknown>) => {
          seenCredentials.push(AppWsData.of(socket).headers.get("authorization"));
          return { ok: true };
        },
      } as unknown as WebsocketRoutes,
      registry: getDefaultInjectRegistry(),
      hmrHub: null,
      hmrState: null,
      logger: { error: () => undefined } as never,
    });

    const auth = handlers.message?.(ws, JSON.stringify(websocketAuthContract.makeRequest("signed-in-token")));
    const subscribe = handlers.message?.(ws, JSON.stringify({ key: "room", data: [], subscribe: true }));
    await Promise.all([auth, subscribe]);

    expect(seenCredentials).toEqual(["Bearer signed-in-token"]);
    expect(JSON.parse(sent[0] ?? "{}")).toEqual({ type: "auth", revokedRooms: [] });
    expect(AppWsData.of(ws).account).toBeUndefined();
  });

  test("signing out over the socket clears the credential it was upgraded with", async () => {
    process.env.AKAN_PUBLIC_APP_NAME = "test";
    const { ApiRouter } = await import("./apiRouter");
    const { AppWsData } = await import("./appWsData");
    const { websocketAuthContract } = await import("akanjs/common");
    const ws = {
      data: AppWsData.fromRequest(new Request("http://localhost/api/ws", { headers: { cookie: "jwt=cookie-token" } })),
      send: () => undefined,
    } as unknown as Bun.ServerWebSocket<unknown>;
    AppWsData.of(ws).account = { role: "user" };
    const handlers = ApiRouter.buildWebsocketHandlers({
      wsRoutes: {} as WebsocketRoutes,
      registry: getDefaultInjectRegistry(),
      hmrHub: null,
      hmrState: null,
      logger: { error: () => undefined } as never,
    });

    await handlers.message?.(ws, JSON.stringify(websocketAuthContract.makeRequest(null)));

    expect(AppWsData.of(ws).cookies.has("jwt")).toBe(false);
    expect(AppWsData.of(ws).account).toBeUndefined();
  });
});
