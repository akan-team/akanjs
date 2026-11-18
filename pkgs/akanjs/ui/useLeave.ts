"use client";
import { type RefObject, useLayoutEffect, useState } from "react";

const LEAVE_CAP_MS = 600;

//? Only a running, finite animation is waited on: an entrance long played out or a spinner inside would hold it forever.
const leavingAnimationsOf = (element: Element | null) =>
  (element?.getAnimations?.() ?? []).filter((animation) => {
    if (animation.playState === "finished") return false;
    const endTime = animation.effect?.getComputedTiming().endTime;
    return typeof endTime === "number" && Number.isFinite(endTime);
  });

/**
 * Keeps an overlay drawn after `open` turns false for as long as the animation its `data-leaving` styles start on
 * `ref`'s element plays, and unmounts it at once when there is none.
 */
export const useLeave = (open: boolean, ref: RefObject<Element | null>) => {
  const [drawn, setDrawn] = useState(open);
  if (open && !drawn) setDrawn(true);
  const leaving = drawn && !open;
  useLayoutEffect(() => {
    if (!leaving) return;
    const animations = leavingAnimationsOf(ref.current);
    if (!animations.length) {
      setDrawn(false);
      return;
    }
    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      setDrawn(false);
    };
    const cap = window.setTimeout(settle, LEAVE_CAP_MS);
    void Promise.allSettled(animations.map((animation) => animation.finished)).then(settle);
    return () => {
      settled = true;
      window.clearTimeout(cap);
    };
  }, [leaving]);
  return { drawn, leaving };
};
