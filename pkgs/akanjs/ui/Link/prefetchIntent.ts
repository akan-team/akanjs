import { Href, router } from "akanjs/client";
import { type FocusEvent, type PointerEvent, type TouchEvent, useEffect, useRef } from "react";

export type LinkPrefetch = boolean | "hover" | "viewport";

interface PrefetchIntentHandlers {
  onPointerEnter?: (event: PointerEvent<HTMLAnchorElement>) => void;
  onPointerLeave?: (event: PointerEvent<HTMLAnchorElement>) => void;
  onFocus?: (event: FocusEvent<HTMLAnchorElement>) => void;
  onTouchStart?: (event: TouchEvent<HTMLAnchorElement>) => void;
}

//? Long enough that a pointer crossing a menu on its way elsewhere asks for nothing.
const hoverDelayMs = 65;

class ViewportPrefetch {
  static #observer: IntersectionObserver | null = null;
  static #prefetchOf = new Map<Element, () => void>();

  static observe(element: Element, prefetch: () => void) {
    if (typeof IntersectionObserver === "undefined") return () => undefined;
    ViewportPrefetch.#observer ??= new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        ViewportPrefetch.#prefetchOf.get(entry.target)?.();
        ViewportPrefetch.#unobserve(entry.target);
      }
    });
    ViewportPrefetch.#prefetchOf.set(element, prefetch);
    ViewportPrefetch.#observer.observe(element);
    return () => ViewportPrefetch.#unobserve(element);
  }

  static #unobserve(element: Element) {
    ViewportPrefetch.#prefetchOf.delete(element);
    ViewportPrefetch.#observer?.unobserve(element);
  }
}

//? Production only, as a dev server compiles each route on its first request, and a hover would compile pages unasked.
export const usePrefetchIntent = (href: string, mode: LinkPrefetch, handlers: PrefetchIntentHandlers) => {
  const ref = useRef<HTMLAnchorElement>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const enabled =
    mode !== false && process.env.NODE_ENV === "production" && !href.startsWith("#") && !Href.isExternal(href);
  useEffect(() => {
    if (!enabled || mode !== "viewport" || !ref.current) return;
    return ViewportPrefetch.observe(ref.current, () => router.prefetch(href));
  }, [enabled, mode, href]);
  useEffect(() => () => clearTimeout(hoverTimer.current), []);
  if (!enabled) return { ref };
  const prefetch = () => router.prefetch(href);
  return {
    ref,
    onPointerEnter: (event: PointerEvent<HTMLAnchorElement>) => {
      handlers.onPointerEnter?.(event);
      if (event.pointerType === "touch") return;
      clearTimeout(hoverTimer.current);
      hoverTimer.current = setTimeout(prefetch, hoverDelayMs);
    },
    onPointerLeave: (event: PointerEvent<HTMLAnchorElement>) => {
      handlers.onPointerLeave?.(event);
      clearTimeout(hoverTimer.current);
    },
    onFocus: (event: FocusEvent<HTMLAnchorElement>) => {
      handlers.onFocus?.(event);
      prefetch();
    },
    onTouchStart: (event: TouchEvent<HTMLAnchorElement>) => {
      handlers.onTouchStart?.(event);
      prefetch();
    },
  };
};
