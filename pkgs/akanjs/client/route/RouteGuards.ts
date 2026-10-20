import type { RouteGuard, RouteGuardProps, RouteRender } from "../csrTypes";
import { AkanNotFoundError } from "../router";

/** Runs a route's `.guard()` stages: the root layout's first, the page's last, each before any layout body. */
export class RouteGuards {
  /** The first refusal stops the chain and is thrown: a redirect, a not-found, or the error a guard leaked. */
  static async run(renders: (RouteRender | undefined)[], props: RouteGuardProps): Promise<void> {
    for (const render of renders) {
      if (!render?.guard) continue;
      try {
        await render.guard(props);
      } catch (error) {
        throw RouteGuards.refusalOf(error);
      }
    }
  }

  /** Whether MCP may list the screen to this caller: a guard that reads an argument leaves the verdict to the call. */
  static async admits(renders: (RouteRender | undefined)[], props: RouteGuardProps): Promise<boolean> {
    for (const render of renders) {
      if (!render?.guard) continue;
      try {
        await render.guard({ ...props, listing: true });
      } catch (error) {
        if (!RouteGuards.isArgPending(error)) return false;
      }
    }
    return true;
  }

  // Security: a signal answers another account's record with 403 or 404, and both read as not-found here so that a
  // screen never tells a visitor which records exist.
  static refusalOf(error: unknown): unknown {
    const status = (error as { statusCode?: unknown } | null)?.statusCode;
    return status === 403 || status === 404 ? new AkanNotFoundError() : error;
  }

  // By digest: the pages bundle carries its own copy of the error classes.
  static isArgPending(error: unknown): boolean {
    return (error as { digest?: unknown } | null)?.digest === "AKAN_ROUTE_ARG_PENDING";
  }

  /** One guard running each of `guards` in order, or none when no guard is given. */
  static compose(...guards: (RouteGuard | undefined)[]): RouteGuard | undefined {
    const chain = guards.filter((guard): guard is RouteGuard => !!guard);
    if (chain.length <= 1) return chain[0];
    return async (props) => {
      for (const guard of chain) await guard(props);
    };
  }
}
