import { AkanError } from "akanjs/base";
import { DevtoolsAccess, type DevtoolsEnv } from "../devtools/devtoolsAccess";
import { type DevSurface, DevSurfaces } from "./devSurfaces";

type Env = Record<string, string | undefined>;

export class DevSurfacePolicy {
  static readonly #mounted = new WeakSet<object>();

  // `akan start` outranks a stray NODE_ENV=production (a Bun-loaded `.env`, a CI default): its artifact has no
  // routes manifest, so production mode would throw on every request.
  static isDevBuild(env: Env = process.env): boolean {
    return env.NODE_ENV !== "production" || env.AKAN_COMMAND_TYPE === "start";
  }

  static opens(surface: DevSurface, env: DevtoolsEnv = {}): boolean {
    if (surface.gate === "devtools") return DevtoolsAccess.modeOf(env) !== "closed";
    const setting = surface.productionSetting;
    return DevSurfacePolicy.isDevBuild() || (!!setting && process.env[setting] === "1");
  }

  static anyOpens(env: DevtoolsEnv = {}): boolean {
    return DevSurfaces.all.some((surface) => DevSurfacePolicy.opens(surface, env));
  }

  static mark<T>(route: T): T {
    if (route && (typeof route === "object" || typeof route === "function")) DevSurfacePolicy.#mounted.add(route);
    return route;
  }

  static checkReserved(owner: string, routes: Iterable<readonly [string, unknown]>): void {
    for (const [key, route] of routes) {
      if (!DevSurfaces.isReserved(key) || DevSurfaces.isProductionRoute(key)) continue;
      if (route && (typeof route === "object" || typeof route === "function") && DevSurfacePolicy.#mounted.has(route))
        continue;
      throw new AkanError(
        "invalidConfig",
        `${owner} registers ${key}, under ${DevSurfaces.reservedPrefixes.join(", ")}, which the framework keeps for its own routes. Give an app or lib endpoint another path; inside akanjs, mount a dev route through DevRoutes.mount with an entry in DevSurfaces, or add a production route to DevSurfaces.productionRoutes (server/routing/devSurfaces.ts).`,
      );
    }
  }
}
