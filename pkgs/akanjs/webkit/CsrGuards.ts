import { type PathRoute, RouteDefinition, RouteGuards, router } from "akanjs/client";

interface GuardedLocation {
  entryId?: string;
  pathRoute: PathRoute;
  params: Record<string, string>;
  searchParams: Record<string, string | string[]>;
}

/**
 * A CSR navigation's route guards, run before any of its layers draws. On the client a guard refuses by moving the
 * router — `router.redirect` and `getSelf`'s `router.replace` return there instead of throwing — so a move made while
 * one ran ends the chain.
 */
export class CsrGuards {
  //? Keyed, not tied to the location object: the path context makes a new one on every render, so a layer mounting
  //? after its parent drew would run the chain again.
  static readonly #runs = new Map<string, Promise<boolean>>();
  static readonly #admitted = new Set<string>();
  static readonly #holds = new Map<string, number>();
  //? Keys whose last layer let go while their run was in flight: the run forgets itself as it settles.
  static readonly #released = new Set<string>();
  static readonly #keptRuns = 64;

  static declared({ pathRoute }: GuardedLocation): boolean {
    return CsrGuards.#rendersOf(pathRoute).some((render) => !!render?.guard);
  }

  //? By what the guards read, so a move none of them sees (a query only the page reads) keeps their verdict.
  static keyOf({ entryId, pathRoute, params, searchParams }: GuardedLocation): string {
    const reads = CsrGuards.#rendersOf(pathRoute).flatMap((render) =>
      render?.guard ? [RouteDefinition.renderArgsKey(render.guard, { params, searchParams }, { isPage: true })] : [],
    );
    return `${entryId ?? ""} ${pathRoute.path} ${reads.join(" ")}`;
  }

  /** `false` when a guard sent the visitor elsewhere: the location's layers draw nothing. */
  static of(location: GuardedLocation): Promise<boolean> {
    const key = CsrGuards.keyOf(location);
    const kept = CsrGuards.#runs.get(key);
    if (kept) return kept;
    const run = CsrGuards.#run(location);
    CsrGuards.#runs.set(key, run);
    for (const oldest of CsrGuards.#runs.keys()) {
      if (CsrGuards.#runs.size <= CsrGuards.#keptRuns) break;
      if (!CsrGuards.#holds.has(oldest)) CsrGuards.#forget(oldest);
    }
    //? Only an admitting run is kept: a refused or failed one runs again when its cached page is back on screen (signed
    //? in by then) or its layer is retried.
    const settle = (admitted: boolean) => {
      if (CsrGuards.#runs.get(key) !== run) return;
      if (admitted && !CsrGuards.#released.has(key)) CsrGuards.#admitted.add(key);
      else CsrGuards.#forget(key);
    };
    run.then(settle, () => settle(false));
    return run;
  }

  /** Whether the guards of the location `key` names let the visitor in, known without waiting. */
  static admitted(key: string): boolean {
    return CsrGuards.#admitted.has(key);
  }

  /** Whether a verdict for `key` is held or on its way. */
  static asked(key: string): boolean {
    return CsrGuards.#runs.has(key);
  }

  //? A verdict lasts while a layer of its location is on screen (a parked page's effects are cleaned up too): a page
  //? drawn again after it left asks again, since the session may have changed in between.
  static hold(key: string): () => void {
    CsrGuards.#holds.set(key, (CsrGuards.#holds.get(key) ?? 0) + 1);
    CsrGuards.#released.delete(key);
    return () => {
      const holds = (CsrGuards.#holds.get(key) ?? 1) - 1;
      if (holds > 0) {
        CsrGuards.#holds.set(key, holds);
        return;
      }
      CsrGuards.#holds.delete(key);
      //? A tick later, as StrictMode releases and holds again within one commit. A run in flight stays, so a page back
      //? before it settles asks no second time; it forgets itself as it settles unless its key is held again.
      queueMicrotask(() => {
        if (CsrGuards.#holds.has(key)) return;
        if (CsrGuards.#admitted.has(key)) CsrGuards.#forget(key);
        else if (CsrGuards.#runs.has(key)) CsrGuards.#released.add(key);
      });
    };
  }

  static #forget(key: string) {
    CsrGuards.#runs.delete(key);
    CsrGuards.#admitted.delete(key);
    CsrGuards.#released.delete(key);
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
