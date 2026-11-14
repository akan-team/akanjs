import { AkanError } from "akanjs/base";
import { AppHosts } from "akanjs/common";
import { SignalContext } from "../../signal/signalContext";
import { AKAN_CHILD_HOST } from "../akanAppHeaders";
import { DevtoolsAccess, type DevtoolsEnv } from "../devtools/devtoolsAccess";
import type { HttpRoutes } from "../types";
import { DevSurfacePolicy } from "./devSurfacePolicy";
import { type DevSurface, DevSurfaces } from "./devSurfaces";
import { HostAllowlist } from "./hostAllowlist";

type DevRouteTable = NonNullable<HttpRoutes>;
type RouteHandler = (req: Request, server: unknown) => unknown;

export class DevRoutes {
  static mount(routes: DevRouteTable, env: DevtoolsEnv = {}): DevRouteTable {
    const mounted: Record<string, unknown> = {};
    for (const [path, route] of Object.entries(routes)) {
      const surface = DevSurfaces.find(path);
      if (!surface)
        throw new AkanError("invalidConfig", `${path} is mounted as a dev route, but DevSurfaces does not list it`);
      if (DevSurfacePolicy.opens(surface, env))
        mounted[path] = DevSurfacePolicy.mark(DevRoutes.#guarded(path, route, surface, env));
    }
    return mounted as DevRouteTable;
  }

  //? The Host header, never x-forwarded-host, which a page may set to anything. Behind the gateway the Host is the
  //? gateway's own hop name, and the gateway checked the caller's Host before relaying.
  static admitsHost(req: Request): boolean {
    const host = (req.headers.get("host") ?? URL.parse(req.url)?.host ?? "").trim().toLowerCase();
    if (host === AKAN_CHILD_HOST) return SignalContext.isTrustedHop(req);
    return AppHosts.isRebindSafe(host);
  }

  static #guarded(path: string, route: unknown, surface: DevSurface, env: DevtoolsEnv): unknown {
    const guard =
      (handler: RouteHandler): RouteHandler =>
      (req, server) => {
        if (!DevRoutes.admitsHost(req)) return HostAllowlist.devSurfaces.refuse();
        const refusal = surface.gate === "devtools" ? DevtoolsAccess.refusalOf(req, env, path) : null;
        return refusal ?? handler(req, server);
      };
    const wrap = (value: unknown): RouteHandler => {
      if (typeof value === "function") return guard(value as RouteHandler);
      if (value instanceof Response) return guard(() => value.clone());
      throw new AkanError("invalidConfig", `${path} must be a handler, a Response or a method map to mount`);
    };
    if (route && typeof route === "object" && !(route instanceof Response))
      return Object.fromEntries(Object.entries(route).map(([method, handler]) => [method, wrap(handler)]));
    return wrap(route);
  }
}
