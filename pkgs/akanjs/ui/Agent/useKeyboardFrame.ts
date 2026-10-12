"use client";
import { useVisualViewportFrame } from "akanjs/webkit";
import type { CSSProperties } from "react";

// A padding inset alone leaves a full-screen panel's header panned off the top on iOS, which pans the visual viewport
// to the focused field; below `sm` the panel is pinned to the visible rectangle instead.
export const useKeyboardFrame = (): CSSProperties | undefined => {
  const { keyboardHeight, height, offsetTop } = useVisualViewportFrame();
  if (!keyboardHeight) return undefined;
  if (window.matchMedia("(width < 40rem)").matches) return { top: offsetTop, bottom: "auto", height };
  return { paddingBottom: keyboardHeight };
};
