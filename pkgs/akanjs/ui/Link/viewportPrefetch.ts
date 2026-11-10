interface ViewportLink {
  prefetch: () => () => void;
  withdraw?: () => void;
}

//? Watched for good, not to a first sighting: a link the full queue turned away, or withdrawn as it left, asks again
//? when it comes back into view.
export class ViewportPrefetch {
  static #observer: IntersectionObserver | null = null;
  static #links = new Map<Element, ViewportLink>();

  static observe(element: Element, prefetch: () => () => void) {
    if (typeof IntersectionObserver === "undefined") return () => undefined;
    ViewportPrefetch.#observer ??= new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const link = ViewportPrefetch.#links.get(entry.target);
        if (!link) continue;
        link.withdraw?.();
        link.withdraw = entry.isIntersecting ? link.prefetch() : undefined;
      }
    });
    ViewportPrefetch.#links.set(element, { prefetch });
    ViewportPrefetch.#observer.observe(element);
    return () => ViewportPrefetch.#unobserve(element);
  }

  static #unobserve(element: Element) {
    ViewportPrefetch.#links.get(element)?.withdraw?.();
    ViewportPrefetch.#links.delete(element);
    ViewportPrefetch.#observer?.unobserve(element);
  }
}
