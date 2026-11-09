"use client";
import { Href, router } from "akanjs/client";
import { type FocusEvent, type PointerEvent, useEffect, useRef } from "react";

export type LinkPrefetch = boolean | "hover" | "viewport";

interface PrefetchIntentHandlers {
  onPointerEnter?: (event: PointerEvent<HTMLAnchorElement>) => void;
  onPointerLeave?: (event: PointerEvent<HTMLAnchorElement>) => void;
  onPointerDown?: (event: PointerEvent<HTMLAnchorElement>) => void;
  onFocus?: (event: FocusEvent<HTMLAnchorElement>) => void;
  onBlur?: (event: FocusEvent<HTMLAnchorElement>) => void;
}

//? Long enough that a pointer crossing a menu, or a Tab passing through a nav bar, asks for nothing.
const intentDelayMs = 65;

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

//? No touchstart intent: a scroll that starts on a link touches it too, and a tap reaches its click ~100 ms later.
export const usePrefetchIntent = (href: string, mode: LinkPrefetch, handlers: PrefetchIntentHandlers) => {
  const ref = useRef<HTMLAnchorElement>(null);
  const intentTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const enabled = mode !== false && !href.startsWith("#") && !Href.isExternal(href);
  useEffect(() => {
    if (!enabled || mode !== "viewport" || !ref.current) return;
    return ViewportPrefetch.observe(ref.current, () => router.prefetch(href, { priority: "low" }));
  }, [enabled, mode, href]);
  useEffect(() => () => clearTimeout(intentTimer.current), []);
  if (!enabled) return { ref };
  const intend = () => {
    clearTimeout(intentTimer.current);
    intentTimer.current = setTimeout(() => router.prefetch(href), intentDelayMs);
  };
  const forgo = () => clearTimeout(intentTimer.current);
  return {
    ref,
    onPointerEnter: (event: PointerEvent<HTMLAnchorElement>) => {
      handlers.onPointerEnter?.(event);
      if (event.pointerType !== "touch") intend();
    },
    onPointerLeave: (event: PointerEvent<HTMLAnchorElement>) => {
      handlers.onPointerLeave?.(event);
      forgo();
    },
    onPointerDown: (event: PointerEvent<HTMLAnchorElement>) => {
      handlers.onPointerDown?.(event);
      forgo();
    },
    onFocus: (event: FocusEvent<HTMLAnchorElement>) => {
      handlers.onFocus?.(event);
      intend();
    },
    onBlur: (event: FocusEvent<HTMLAnchorElement>) => {
      handlers.onBlur?.(event);
      forgo();
    },
  };
};
