import type { PathRoute, RouteRender } from "akanjs/client";

/**
 * Whether a page's layers are drawn, by page key (`CsrStack.keyOf`): each layer reports while it shows its loading
 * fallback. A page switched in place waits on this, out of sight, so it never swaps in a shell of fallbacks.
 */
export class CsrPageReadiness {
  static readonly #pages = new Map<string, Map<string, boolean>>();

  static report(pageKey: string, layerId: string, isLoading: boolean) {
    const layers = CsrPageReadiness.#pages.get(pageKey) ?? new Map<string, boolean>();
    layers.set(layerId, isLoading);
    CsrPageReadiness.#pages.set(pageKey, layers);
  }

  static drop(pageKey: string, layerId: string) {
    const layers = CsrPageReadiness.#pages.get(pageKey);
    if (!layers) return;
    layers.delete(layerId);
    if (!layers.size) CsrPageReadiness.#pages.delete(pageKey);
  }

  static isAsync(render?: RouteRender) {
    return Boolean(render?.isAsync || render?.render?.constructor.name === "AsyncFunction");
  }

  /** Whether a page shows a fallback before it is drawn: only an async render or a guard makes a layer wait. */
  static drawsLater({ renderLayouts, renderPage }: Pick<PathRoute, "renderLayouts" | "renderPage">) {
    return [...(renderLayouts ?? []), renderPage].some((render) => CsrPageReadiness.isAsync(render) || !!render?.guard);
  }

  /** `false` until a layer of the page has reported, and while any of them shows its fallback. */
  static isDrawn(pageKey: string) {
    const layers = CsrPageReadiness.#pages.get(pageKey);
    return !!layers?.size && ![...layers.values()].some(Boolean);
  }
}
