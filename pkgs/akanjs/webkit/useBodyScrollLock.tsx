"use client";
import { useEffect } from "react";

/**
 * One count shared by every overlay, because two can cover the page at once — a dialog opened from a
 * dialog, a legacy modal beside a new one. A per-component flag would let the first one to unmount give
 * scrolling back while the other is still up.
 */
let lockCount = 0;
let previousOverflow = "";

/** Hold `document.body` unscrollable while `active`. */
export const useBodyScrollLock = (active: boolean) => {
  useEffect(() => {
    if (!active || typeof document === "undefined") return;
    lockCount += 1;
    if (lockCount === 1) {
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    return () => {
      lockCount -= 1;
      if (lockCount === 0) {
        document.body.style.overflow = previousOverflow;
        previousOverflow = "";
      }
    };
  }, [active]);
};
