import type { Location, RouteRender } from "akanjs/client";
import { CsrGuards } from "./CsrGuards";

/**
 * Whether a page's layers are drawn, by the entry id of the location they draw: each layer reports while it shows its
 * loading fallback. A page switched in place waits on this, out of sight, so it never swaps in a shell of fallbacks.
 */
export class CsrPageReadiness {
  //? Keyed by entry id, not `CsrStack.keyOf`: a layer reads its location with the frame's page state, where a tab bar
  //? sets `cache`, so its key would be the route's path while the navigation waiting on it holds the entry's id.
  static readonly #pages = new Map<string, Map<string, boolean>>();

  static report(entryId: string, layerId: string, isLoading: boolean) {
    const layers = CsrPageReadiness.#pages.get(entryId) ?? new Map<string, boolean>();
    layers.set(layerId, isLoading);
    CsrPageReadiness.#pages.set(entryId, layers);
  }

  static drop(entryId: string, layerId: string) {
    const layers = CsrPageReadiness.#pages.get(entryId);
    if (!layers) return;
    layers.delete(layerId);
    if (!layers.size) CsrPageReadiness.#pages.delete(entryId);
  }

  static isAsync(render?: RouteRender) {
    return Boolean(render?.isAsync || render?.render?.constructor.name === "AsyncFunction");
  }

  /**
   * Whether a page shows a fallback before it is drawn: only an async render or a guard makes a layer wait. A root
   * layout is drawn once for every page, so only its guard, asked for each page, counts.
   */
  static drawsLater(location: Location) {
    const { renderLayouts, renderPage } = location.pathRoute;
    return CsrGuards.declared(location) || [...renderLayouts, renderPage].some(CsrPageReadiness.isAsync);
  }

  /** `false` until a layer of the page has reported, and while any of them shows its fallback. */
  static isDrawn(entryId: string | undefined) {
    const layers = entryId ? CsrPageReadiness.#pages.get(entryId) : undefined;
    return !!layers?.size && ![...layers.values()].some(Boolean);
  }
}
