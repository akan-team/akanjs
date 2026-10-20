import { type PathRoute, RouteGuards, router } from "akanjs/client";

interface GuardedLocation {
  pathRoute: PathRoute;
  params: Record<string, string>;
  searchParams: Record<string, string | string[]>;
}

/**
 * A CSR navigation's route guards, run once per location before any of its layers draws. On the client a guard
 * refuses by moving the router — `router.redirect` and `getSelf`'s `router.replace` return there instead of
 * throwing — so a move made while one ran ends the chain.
 */
export class CsrGuards {
  static readonly #runs = new WeakMap<GuardedLocation, Promise<boolean>>();

  static declared({ pathRoute }: GuardedLocation): boolean {
    return CsrGuards.#rendersOf(pathRoute).some((render) => !!render?.guard);
  }

  /** `false` when a guard sent the visitor elsewhere: the location's layers draw nothing. */
  static of(location: GuardedLocation): Promise<boolean> {
    const kept = CsrGuards.#runs.get(location);
    if (kept) return kept;
    const run = CsrGuards.#run(location);
    CsrGuards.#runs.set(location, run);
    //? Only an admitting run is kept: a refused or failed one runs again when its cached page is back on screen (signed
    //? in by then) or its layer is retried.
    const forget = () => CsrGuards.#runs.delete(location);
    run.then((admitted) => (admitted ? undefined : forget()), forget);
    return run;
  }

  static async #run({ pathRoute, params, searchParams }: GuardedLocation): Promise<boolean> {
    const navigations = router.navigationCount();
    for (const render of CsrGuards.#rendersOf(pathRoute)) {
      if (!render?.guard) continue;
      try {
        await render.guard({ params, searchParams });
      } catch (error) {
        if (router.navigationCount() !== navigations) return false;
        const refusal = RouteGuards.refusalOf(error);
        if ((refusal as { digest?: unknown } | null)?.digest !== "AKAN_NOT_FOUND") throw refusal;
        router.notFound();
        return false;
      }
      if (router.navigationCount() !== navigations) return false;
    }
    return true;
  }

  static #rendersOf(pathRoute: PathRoute) {
    return [...pathRoute.renderRootLayouts, ...pathRoute.renderLayouts, pathRoute.renderPage];
  }
}
