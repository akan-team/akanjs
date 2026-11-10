"use client";
import { Href, router } from "akanjs/client";
import { type FocusEvent, type PointerEvent, useEffect, useRef } from "react";
import { ViewportPrefetch } from "./viewportPrefetch";

export type LinkPrefetch = boolean | "hover" | "viewport";

interface PrefetchIntentHandlers {
  onPointerEnter?: (event: PointerEvent<HTMLAnchorElement>) => void;
  onPointerLeave?: (event: PointerEvent<HTMLAnchorElement>) => void;
  onPointerDown?: (event: PointerEvent<HTMLAnchorElement>) => void;
  onPointerCancel?: (event: PointerEvent<HTMLAnchorElement>) => void;
  onFocus?: (event: FocusEvent<HTMLAnchorElement>) => void;
  onBlur?: (event: FocusEvent<HTMLAnchorElement>) => void;
}

//? Long enough that a pointer crossing a menu, or a Tab passing through a nav bar, asks for nothing.
const intentDelayMs = 65;

//? No touchstart intent: a scroll that starts on a link touches it too, and a tap reaches its click ~100 ms later.
export const usePrefetchIntent = (href: string, mode: LinkPrefetch, handlers: PrefetchIntentHandlers) => {
  const ref = useRef<HTMLAnchorElement>(null);
  const intentTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pressed = useRef(false);
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
      //? A touch, or a pen out of hover range, leaves as it lifts, before the tap's focus arrives.
      if (event.pointerType === "mouse") pressed.current = false;
      forgo();
    },
    onPointerDown: (event: PointerEvent<HTMLAnchorElement>) => {
      handlers.onPointerDown?.(event);
      pressed.current = true;
      forgo();
    },
    //? A press the browser takes over for a scroll ends here, with no click and no focus to follow it.
    onPointerCancel: (event: PointerEvent<HTMLAnchorElement>) => {
      handlers.onPointerCancel?.(event);
      pressed.current = false;
      forgo();
    },
    onFocus: (event: FocusEvent<HTMLAnchorElement>) => {
      handlers.onFocus?.(event);
      //? A press focuses the link it lands on, mouse before the click and touch after the lift: that is not a Tab.
      if (!pressed.current) intend();
    },
    onBlur: (event: FocusEvent<HTMLAnchorElement>) => {
      handlers.onBlur?.(event);
      pressed.current = false;
      forgo();
    },
  };
};
