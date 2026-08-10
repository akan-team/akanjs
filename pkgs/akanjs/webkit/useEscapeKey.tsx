"use client";
import { useEffect, useRef } from "react";

/**
 * Escape belongs to the topmost dismissable surface only.
 *
 * A per-component `window` listener cannot know that: every open surface hears the same keydown, so a
 * dialog opened from another dialog took both down at once, and a confirm popover inside a modal would
 * have closed the modal under it. One shared stack keeps the order surfaces actually opened in and
 * hands the key to the last one.
 */
const stack: (() => void)[] = [];

const onKeyDown = (event: KeyboardEvent) => {
  if (event.key !== "Escape") return;
  const topmost = stack.at(-1);
  if (!topmost) return;
  event.preventDefault();
  topmost();
};

/**
 * Close `onEscape` on Escape while `active`, but only while this surface is the topmost active one.
 * The callback is read through a ref, so a fresh closure per render does not reshuffle the stack.
 */
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
