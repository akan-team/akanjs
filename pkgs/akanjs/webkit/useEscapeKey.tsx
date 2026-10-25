"use client";
import { useEffect, useRef } from "react";

// One stack for every surface: per-component listeners all hear one Escape and close nested surfaces together.
const stack: (() => void)[] = [];

const onKeyDown = (event: KeyboardEvent) => {
  if (event.key !== "Escape" || event.defaultPrevented) return;
  const topmost = stack.at(-1);
  if (!topmost) return;
  event.preventDefault();
  topmost();
};

/** Calls `onEscape` on Escape while `active` and this surface is the topmost active one. */
export const useEscapeKey = (active: boolean, onEscape: () => void) => {
  const callbackRef = useRef(onEscape);
  useEffect(() => {
    callbackRef.current = onEscape;
  });
  useEffect(() => {
    if (!active) return;
    const entry = () => callbackRef.current();
    stack.push(entry);
    if (stack.length === 1) window.addEventListener("keydown", onKeyDown);
    return () => {
      const index = stack.lastIndexOf(entry);
      if (index !== -1) stack.splice(index, 1);
      if (stack.length === 0) window.removeEventListener("keydown", onKeyDown);
    };
  }, [active]);
};
