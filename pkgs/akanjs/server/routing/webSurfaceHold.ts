import { GatewayStatusPage } from "../gateway/gatewayStatusPage";
import type { NonNullHttpRoutes } from "./apiRouter";
import type { HostAllowlist } from "./hostAllowlist";

type RouteValue = NonNullHttpRoutes[keyof NonNullHttpRoutes];
export type HoldHandler = (
  req: Request,
  server: Bun.Server<unknown>,
) => Response | Promise<Response | undefined> | undefined;

export class WebSurfaceHold {
  readonly #arrival = Promise.withResolvers<void>();
  #pending = true;
  #failure: string | null = null;

  get pending() {
    return this.#pending;
  }

  open() {
    if (!this.#pending) return;
    this.#pending = false;
    this.#arrival.resolve();
  }

  fail(reason: string) {
    if (!this.#pending) return;
    this.#pending = false;
    this.#failure = reason;
    this.#arrival.resolve();
  }

  //? Bun drops a response its server is stopped on before the next macrotask, so the held 503s go out first.
  async settle(reason: string) {
    this.fail(reason);
    await this.#arrival.promise;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }

  route(table: () => NonNullHttpRoutes | null): HoldHandler {
    return async (req, server) => {
      await this.#arrival.promise;
      const routes = table();
      if (this.#failure !== null || !routes) return this.#unavailable(req);
      return await WebSurfaceHold.dispatch(routes, req, server);
    };
  }

  //? An unplaceable Host is held, not refused: the hosts the artifact declares are not known until it is written.
  guard(routes: NonNullHttpRoutes, allowlist: HostAllowlist | null, held: HoldHandler): NonNullHttpRoutes {
    if (!allowlist) return routes;
    const guarded =
      (handler: HoldHandler): HoldHandler =>
      (req, server) => {
        if (allowlist.allows(req)) return handler(req, server);
        return this.#pending ? held(req, server) : allowlist.refuse();
      };
    return Object.fromEntries(
      Object.entries(routes).map(([path, route]) => [path, WebSurfaceHold.#mapRoute(route, guarded)]),
    ) as NonNullHttpRoutes;
  }

  //? Bun's order: exact path, then the longest `/*` prefix; a method map missing the method falls through to the next.
  static dispatch(routes: NonNullHttpRoutes, req: Request, server: Bun.Server<unknown>) {
    const { pathname } = new URL(req.url);
    const wildcards = Object.keys(routes)
      .filter((key) => key.endsWith("*") && pathname.startsWith(key.slice(0, -1)))
      .sort((a, b) => b.length - a.length);
    const candidates = Object.hasOwn(routes, pathname) ? [pathname, ...wildcards] : wildcards;
    for (const key of candidates) {
      const handler = WebSurfaceHold.#handlerOf(routes[key as keyof NonNullHttpRoutes], req.method);
      if (handler) return handler(req, server);
    }
    return new Response("Not Found", { status: 404 });
  }

  static #handlerOf(route: RouteValue, method: string): HoldHandler | null {
    if (route instanceof Response) return () => route.clone();
    if (typeof route === "function") return route as HoldHandler;
    if (!route || typeof route !== "object") return null;
    const handler = (route as Record<string, unknown>)[method];
    if (handler instanceof Response) return () => handler.clone();
    return typeof handler === "function" ? (handler as HoldHandler) : null;
  }

  static #mapRoute(route: RouteValue, wrap: (handler: HoldHandler) => HoldHandler): RouteValue {
    if (route instanceof Response) return wrap(() => route.clone()) as RouteValue;
    if (typeof route === "function") return wrap(route as HoldHandler) as RouteValue;
    if (!route || typeof route !== "object") return route;
    return Object.fromEntries(
      Object.entries(route).map(([method, handler]) => [
        method,
        handler instanceof Response
          ? wrap(() => handler.clone())
          : typeof handler === "function"
            ? wrap(handler as HoldHandler)
            : handler,
      ]),
    ) as RouteValue;
  }

  #unavailable(req: Request) {
    const detail = `The web surface did not start: ${this.#failure ?? "the server stopped"}`;
    if (req.headers.get("accept")?.includes("text/html"))
      return new Response(
        GatewayStatusPage.html({
          heading: "Web surface did not start",
          detail,
          note: "The first base build did not finish here — this page reloads itself as soon as a server answers.",
        }),
        { status: 503, headers: GatewayStatusPage.headers("text/html; charset=utf-8") },
      );
    const headers = { "cache-control": "no-store" };
    if (!req.headers.get("accept")?.includes("application/json")) return new Response(detail, { status: 503, headers });
    return Response.json(
      { error: "base.error.serverUnavailable", statusCode: 503, data: { status: 503 }, details: detail },
      { status: 503, headers },
    );
  }
}
