import { dayjs } from "akanjs/base";
import type { Logger } from "akanjs/common";
import type { InjectRegistry } from "akanjs/service";
import { Exception, type WebsocketReqData } from "akanjs/signal";
import type { HmrWsData, HmrWsHub } from "../hmr/wsHub";
import { copyBunRequestFields, type WebProxyRunner } from "../proxy";
import { SignalResolver } from "../resolver";
import type { HttpRoutes, SignalRouteOptions, WebsocketRoutes } from "../types";

/**
 * Minimal render-state view the HMR WS hello message needs.
 * `LazyHmrController` exposes this shape via `state.buildId` / `state.cssAssets`,
 * so the ws handler can greet freshly-connected clients
 * without reaching into the full controller.
 */
export interface HmrStateSource {
  readonly state: {
    buildId: number;
    cssAssets?: Record<string, { cssUrl: string; cssRelPath: string }>;
  };
}

export type NonNullHttpRoutes = NonNullable<HttpRoutes>;

export interface ApiRouteInputs {
  prefix: string;
  websocketPrefix: string;
  routes: HttpRoutes;
  builtinRoutes?: HttpRoutes;
  routeOptions?: Record<string, SignalRouteOptions>;
  renderEnvRoutes: HttpRoutes;
  /** Upgrades the incoming request into an app-signal WebSocket. */
  upgradeAppWs: (req: Request, data: { createdAt: number }) => boolean;
  webProxyRunner?: WebProxyRunner | null;
}

type RouteValue = NonNullHttpRoutes[keyof NonNullHttpRoutes];
type RouteHandler = (req: Request) => Response | Promise<Response | undefined> | undefined;

export interface WebsocketHandlersInputs {
  wsRoutes: WebsocketRoutes;
  registry: InjectRegistry;
  hmrHub: HmrWsHub | null;
  hmrState: HmrStateSource | null;
  logger: Logger;
}

type WsTaggedData = { kind?: string };
interface ExceptionLike {
  statusCode: number;
  toJSON(): object;
}

const isExceptionLike = (error: unknown): error is ExceptionLike => {
  return (
    error instanceof Exception ||
    (error instanceof Error &&
      "statusCode" in error &&
      typeof (error as { statusCode?: unknown }).statusCode === "number" &&
      typeof (error as { toJSON?: unknown }).toJSON === "function")
  );
};

export class ApiRouter {
  /**
   * Builds the full route table served by `Bun.serve`. Responsibilities:
   *   1. Expose the WS upgrade endpoint at `<prefix><websocketPrefix>`.
   *   2. Prefix every endpoint-generated route with `prefix`.
   *   3. Merge render-env routes (CSR/SSR) last so they can catch-all `/*`.
   */
  static buildRoutes({
    prefix,
    websocketPrefix,
    routes,
    builtinRoutes,
    routeOptions,
    renderEnvRoutes,
    upgradeAppWs,
    webProxyRunner,
  }: ApiRouteInputs): NonNullHttpRoutes {
    const endpointEntries = Object.entries(routes ?? {}).map(
      ([p, handler]) => [ApiRouter.#applyGlobalPrefix(prefix, p, routeOptions?.[p]), handler] as const,
    );
    const builtinEntries = Object.entries(builtinRoutes ?? {});
    const endpointPaths = new Set([...endpointEntries.map(([path]) => path), ...builtinEntries.map(([path]) => path)]);
    const routeTable = {
      [`${prefix}${websocketPrefix}` as "/api/ws"]: (req) => {
        const upgraded = upgradeAppWs(req, { createdAt: Date.now() });
        if (upgraded) return;
        return new Response("Failed to upgrade to WebSocket", { status: 500 });
      },
      ...Object.fromEntries(endpointEntries),
      ...Object.fromEntries(builtinEntries),
      ...(renderEnvRoutes ?? {}),
    } as NonNullHttpRoutes;
    return webProxyRunner
      ? ApiRouter.#wrapRoutesWithWebProxy(routeTable, webProxyRunner, prefix, endpointPaths)
      : routeTable;
  }

  /**
   * Builds the `websocket` handler config for `Bun.serve`. Multiplexes two
   * logical channels on the same upgrade port:
   *   - `kind === "akan-hmr"` — dev HMR, delegated to `HmrWsHub`.
   *   - everything else — app signal channel, dispatched via `wsRoutes`.
   */
  static buildWebsocketHandlers({
    wsRoutes,
    registry,
    hmrHub,
    hmrState,
    logger,
  }: WebsocketHandlersInputs): Bun.WebSocketHandler<WsTaggedData> {
    return {
      open: (ws) => {
        // HMR sockets live in a separate logical channel from the app's signal
        // websockets. We tag them via `data.kind === "akan-hmr"` at upgrade
        // time so the dispatcher can skip signal handling.
        const data = ws.data as WsTaggedData | undefined;
        if (data?.kind === "akan-hmr" && hmrHub && hmrState) {
          hmrHub.attach(ws as unknown as Bun.ServerWebSocket<HmrWsData>);
          ws.send(
            JSON.stringify({
              type: "hello",
              buildId: hmrState.state.buildId,
              cssAssets: hmrState.state.cssAssets,
            }),
          );
          return;
        }
        SignalResolver.handleWsOpen(ws, registry);
      },
      message: async (ws, message) => {
        const data = ws.data as WsTaggedData | undefined;
        if (data?.kind === "akan-hmr") {
          if (typeof message === "string" && typeof hmrHub?.handleMessage === "function") hmrHub.handleMessage(message);
          return;
        }
        try {
          if (typeof message === "string") {
            const msg = JSON.parse(message) as WebsocketReqData;
            if (!msg.key) throw new Error("Message key is required");
            const wsRoute = wsRoutes[msg.key];
            if (!wsRoute) throw new Error(`WebSocket route "${msg.key}" is not registered`);
            const eventType =
              typeof msg.subscribe === "boolean" ? (msg.subscribe ? "subscribe" : "unsubscribe") : "message";
            const result = await wsRoute(ws, msg.data, eventType);
            ws.send(JSON.stringify(result));
          } else throw new Error("Message is not a string");
        } catch (error) {
          if (isExceptionLike(error)) {
            ws.send(JSON.stringify({ ...error.toJSON(), timestamp: new Date().toISOString() }));
            return;
          }
          const errMsg = error instanceof Error ? error.message : String(error);
          logger.error(errMsg);
          console.error(error);
          ws.send(JSON.stringify({ error: errMsg, statusCode: 500, timestamp: new Date().toISOString(), at: dayjs() }));
        }
      },
      close: (ws) => {
        const data = ws.data as WsTaggedData | undefined;
        if (data?.kind === "akan-hmr" && hmrHub) {
          hmrHub.detach(ws as unknown as Bun.ServerWebSocket<HmrWsData>);
          return;
        }
        SignalResolver.handleWsClose(ws, registry);
      },
    };
  }

  static #applyGlobalPrefix(prefix: string, path: string, options?: SignalRouteOptions): string {
    if (options?.globalPrefix === false) return ApiRouter.#normalizeRoutePath(path);
    return ApiRouter.#joinRoutePath(prefix, path);
  }

  static #joinRoutePath(prefix: string, path: string): string {
    const normalizedPrefix = ApiRouter.#normalizeRoutePath(prefix).replace(/\/$/, "");
    const normalizedPath = ApiRouter.#normalizeRoutePath(path);
    if (normalizedPrefix === "/") return normalizedPath;
    if (normalizedPath === "/") return normalizedPrefix;
    return `${normalizedPrefix}${normalizedPath}`;
  }

  static #normalizeRoutePath(path: string): string {
    const trimmed = path.trim();
    if (!trimmed || trimmed === "/") return "/";
    return `/${trimmed.replace(/^\/+|\/+$/g, "")}`;
  }

  static #wrapRoutesWithWebProxy(
    routes: NonNullHttpRoutes,
    runner: WebProxyRunner,
    apiPrefix: string,
    endpointPaths: Set<string>,
  ): NonNullHttpRoutes {
    return Object.fromEntries(
      Object.entries(routes).map(([path, route]) => [
        path,
        endpointPaths.has(path) || ApiRouter.#isApiRoute(path, apiPrefix) || ApiRouter.#isInternalRenderRoute(path)
          ? route
          : ApiRouter.#wrapRoute(route, runner),
      ]),
    ) as NonNullHttpRoutes;
  }

  static #isApiRoute(path: string, apiPrefix: string): boolean {
    const normalized = apiPrefix.replace(/\/$/, "");
    return path === normalized || path.startsWith(`${normalized}/`);
  }

  static #isInternalRenderRoute(path: string): boolean {
    return path === "/__csr" || path === "/__rsc" || path.startsWith("/__rsc/") || path.startsWith("/_akan/");
  }

  static #wrapRoute(route: RouteValue, runner: WebProxyRunner): RouteValue {
    if (typeof route === "function") return ApiRouter.#wrapHandler(route as RouteHandler, runner) as RouteValue;
    if (route instanceof Response) return ApiRouter.#wrapHandler(() => route, runner) as RouteValue;
    if (!route || typeof route !== "object") return route;
    return Object.fromEntries(
      Object.entries(route).map(([method, handler]) => [
        method,
        typeof handler === "function" ? ApiRouter.#wrapHandler(handler as RouteHandler, runner) : handler,
      ]),
    ) as RouteValue;
  }

  static #wrapHandler(handler: RouteHandler, runner: WebProxyRunner): RouteHandler {
    return async (req) => {
      const result = await runner.run(req);
      if (result.response) return result.response;
      return await handler(copyBunRequestFields(result.request, req));
    };
  }
}
