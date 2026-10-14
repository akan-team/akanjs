"use client";
import { breakpointQuery } from "akanjs/client";
import { useVisualViewportFrame } from "akanjs/webkit";
import type { CSSProperties } from "react";

// A padding inset alone leaves a full-screen panel's header panned off the top on iOS, which pans the visual viewport
// to the focused field and so can report no keyboard; below `sm` the panel is pinned to the visible rectangle instead.
export const useKeyboardFrame = (): CSSProperties | undefined => {
  const { keyboardHeight, height, offsetTop } = useVisualViewportFrame();
  if (typeof window === "undefined") return undefined;
  if (window.matchMedia(breakpointQuery("sm", { below: true })).matches)
    return height < window.innerHeight ? { top: offsetTop, bottom: "auto", height } : undefined;
  return keyboardHeight ? { paddingBottom: keyboardHeight } : undefined;
};
