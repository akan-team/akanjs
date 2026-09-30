import { dayjs } from "akanjs/base";
import { type Logger, websocketAuthContract, websocketHeartbeatContract } from "akanjs/common";
import type { InjectRegistry, LiveRegistry } from "akanjs/service";
import { CrossSiteGuard, isExceptionLike, SignalContext, SignalFailure, type WebsocketReqData } from "akanjs/signal";
import { compressResponse } from "../contentEncoding";
import type { HmrWsData, HmrWsHub } from "../hmr/wsHub";
import { copyBunRequestFields, type WebProxyRunner } from "../proxy";
import { SignalResolver } from "../resolver";
import type { HttpRoutes, SignalRouteOptions, WebsocketRoutes } from "../types";
import { AppWsData } from "./appWsData";
import type { HostAllowlist } from "./hostAllowlist";

export interface HmrStateSource {
  readonly state: {
    buildId: number;
    cssAssets?: Record<string, { cssUrl: string; cssRelPath: string }>;
    csrGeneration?: number;
    ssrGeneration?: number;
    ssrEpoch?: number;
  };
  /** Called before each hello: brings what the state says about the dev registries up to what is on disk. */
  refresh?: () => void;
  /** Sent right after hello: the build statuses failing now, which the socket connected too late to hear. */
  errors?: () => { phase: string }[];
}

export type NonNullHttpRoutes = NonNullable<HttpRoutes>;

export interface ApiRouteInputs {
  prefix: string;
  websocketPrefix: string;
  routes: HttpRoutes;
  builtinRoutes?: HttpRoutes;
  routeOptions?: Record<string, SignalRouteOptions>;
  renderEnvRoutes: HttpRoutes;
  upgradeAppWs: (req: Request, data: AppWsData) => boolean;
  webProxyRunner?: WebProxyRunner | null;
  hostAllowlist?: HostAllowlist | null;
}

type RouteValue = NonNullHttpRoutes[keyof NonNullHttpRoutes];
type RouteHandler = (req: Request) => Response | Promise<Response | undefined> | undefined;

export interface WebsocketHandlersInputs {
  wsRoutes: WebsocketRoutes;
  registry: InjectRegistry;
  live?: LiveRegistry;
  hmrHub: HmrWsHub | null;
  hmrState: HmrStateSource | null;
  logger: Logger;
  onDrain?: () => void;
}

type WsTaggedData = { kind?: string };

export class ApiRouter {
  // Render-env (CSR/SSR) routes merge last so they can catch-all `/*`.
  static buildRoutes({
    prefix,
    websocketPrefix,
    routes,
    builtinRoutes,
    routeOptions,
    renderEnvRoutes,
    upgradeAppWs,
    webProxyRunner,
    hostAllowlist,
  }: ApiRouteInputs): NonNullHttpRoutes {
    const endpointEntries = Object.entries(routes ?? {}).map(
      ([p, handler]) =>
        [
          ApiRouter.applyGlobalPrefix(prefix, p, routeOptions?.[p]),
          ApiRouter.#corsRoute(ApiRouter.#compressRoute(handler)),
        ] as const,
    );
    const builtinEntries = Object.entries(builtinRoutes ?? {}).map(
      ([path, handler]) => [path, ApiRouter.#compressRoute(handler)] as const,
    );
    const endpointPaths = new Set([...endpointEntries.map(([path]) => path), ...builtinEntries.map(([path]) => path)]);
    const routeTable = {
      [`${prefix}${websocketPrefix}` as "/api/ws"]: (req) => {
        //? A socket has no CORS: a page on another site that opens one reads every room it may subscribe to, and it
        //? carries the SameSite=None auth cookie. The browser only sends Origin; the server is the one to refuse it.
        try {
          CrossSiteGuard.assertOrigin(req, new URL(req.url), "websocket");
        } catch {
          return new Response("Forbidden", { status: 403 });
        }
        const upgraded = upgradeAppWs(req, AppWsData.fromRequest(req));
        if (upgraded) return;
        return new Response("Failed to upgrade to WebSocket", { status: 500 });
      },
      ...Object.fromEntries(endpointEntries),
      ...Object.fromEntries(builtinEntries),
      ...(renderEnvRoutes ?? {}),
    } as NonNullHttpRoutes;
    const served = webProxyRunner
      ? ApiRouter.#wrapRoutesWithWebProxy(routeTable, webProxyRunner, prefix, endpointPaths)
      : routeTable;
    return hostAllowlist ? ApiRouter.#guardHosts(served, hostAllowlist) : served;
  }

  static buildWebsocketHandlers({
    wsRoutes,
    registry,
    live,
    hmrHub,
    hmrState,
    logger,
    onDrain,
  }: WebsocketHandlersInputs): Bun.WebSocketHandler<WsTaggedData> {
    return {
      // The only signal that a backpressured socket has caught up, so a parked frame retries here or on a timer.
      drain: () => onDrain?.(),
      open: (ws) => {
        // HMR and app sockets share this upgrade; HMR ones are tagged `kind: "akan-hmr"` at upgrade time.
        const data = ws.data as WsTaggedData | undefined;
        if (data?.kind === "akan-hmr" && hmrHub && hmrState) {
          hmrHub.attach(ws as unknown as Bun.ServerWebSocket<HmrWsData>);
          hmrState.refresh?.();
          const errors = hmrState.errors?.() ?? [];
          ws.send(
            JSON.stringify({
              type: "hello",
              buildId: hmrState.state.buildId,
              cssAssets: hmrState.state.cssAssets,
              csrGeneration: hmrState.state.csrGeneration,
              ssrGeneration: hmrState.state.ssrGeneration,
              ssrEpoch: hmrState.state.ssrEpoch,
              ...(hmrState.errors ? { failingPhases: errors.map((status) => status.phase) } : {}),
            }),
          );
          for (const status of errors) ws.send(JSON.stringify(status));
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
            if (msg.key === websocketAuthContract.key) {
              // Must stay synchronous: the next frame (e.g. a subscribe) has to see the new credential.
              AppWsData.applyCredential(AppWsData.of(ws), websocketAuthContract.readJwt(msg.data));
              const revokedRooms = await SignalResolver.revalidateWsRooms(ws, registry, live);
              ws.send(JSON.stringify(websocketAuthContract.makeAck(revokedRooms)));
              return;
            }
            if (msg.key === websocketHeartbeatContract.key) {
              ws.send(JSON.stringify(websocketHeartbeatContract.makeAck()));
              return;
            }
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
          if (!SignalContext.wasReported(error)) {
            logger.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
          }
          // The same generalization the HTTP 500 makes: a socket frame is no less readable by the caller.
          ws.send(JSON.stringify({ ...SignalFailure.body(error), at: dayjs() }));
        }
      },
      close: (ws) => {
        const data = ws.data as WsTaggedData | undefined;
        if (data?.kind === "akan-hmr" && hmrHub) {
          hmrHub.detach(ws as unknown as Bun.ServerWebSocket<HmrWsData>);
          return;
        }
        SignalResolver.handleWsClose(ws, registry, live);
      },
    };
  }

  static applyGlobalPrefix(prefix: string, path: string, options?: SignalRouteOptions): string {
    if (options?.globalPrefix === false) return ApiRouter.#normalizeRoutePath(path);
    return ApiRouter.joinRoutePath(prefix, path);
  }

  static joinRoutePath(prefix: string, path: string): string {
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
          : ApiRouter.#mapRoute(route, (handler) => async (req) => {
              const result = await runner.run(req);
              if (result.response) return result.response;
              return await handler(copyBunRequestFields(result.request, req));
            }),
      ]),
    ) as NonNullHttpRoutes;
  }

  static #guardHosts(routes: NonNullHttpRoutes, allowlist: HostAllowlist): NonNullHttpRoutes {
    return Object.fromEntries(
      Object.entries(routes).map(([path, route]) => [
        path,
        ApiRouter.#mapRoute(route, (handler) => (req) => (allowlist.allows(req) ? handler(req) : allowlist.refuse())),
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

  // Signal routes only: web bodies stream and `compressResponse` buffers. Behind the gateway this sees
  // `Accept-Encoding: identity` (Bun's fetch decodes any Content-Encoding), so the gateway compresses instead.
  static #compressRoute(route: RouteValue): RouteValue {
    return ApiRouter.#mapRoute(route, (handler) => async (req) => {
      const response = await handler(req);
      return response ? await compressResponse(req, response) : response;
    });
  }

  // Signal routes are method maps, so the preflight answers with exactly the verbs the path serves.
  static #corsRoute(route: RouteValue): RouteValue {
    if (!route || typeof route !== "object" || route instanceof Response || "OPTIONS" in route) return route;
    const methods = Object.keys(route);
    const answered = ApiRouter.#mapRoute(route, (handler) => async (req) => {
      const response = await handler(req);
      return response ? CrossSiteGuard.withCors(req, response) : response;
    });
    return { ...(answered as object), OPTIONS: (req: Request) => CrossSiteGuard.preflight(req, methods) } as RouteValue;
  }

  //? A static Response is cloned per request once wrapped: a handler hands the same body out only once.
  static #mapRoute(route: RouteValue, wrap: (handler: RouteHandler) => RouteHandler): RouteValue {
    if (typeof route === "function") return wrap(route as RouteHandler) as RouteValue;
    if (route instanceof Response) return wrap(() => route.clone()) as RouteValue;
    if (!route || typeof route !== "object") return route;
    return Object.fromEntries(
      Object.entries(route).map(([method, handler]) => [
        method,
        typeof handler === "function"
          ? wrap(handler as RouteHandler)
          : handler instanceof Response
            ? wrap(() => handler.clone())
            : handler,
      ]),
    ) as RouteValue;
  }
}
