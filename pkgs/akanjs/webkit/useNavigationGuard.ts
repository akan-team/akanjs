"use client";
import { type NavigationGuard, router } from "akanjs/client";
import { useEffect, useRef } from "react";
import { usePageActivity } from "./usePageActivity";

/**
 * `router.addNavigationGuard(guard)` for a page: held only while the page is the current one, and always asking the
 * latest `guard`. A page kept under the next one for a swipe back stays mounted, and a guard it kept would hold
 * that next page too.
 */
export const useNavigationGuard = (guard: NavigationGuard) => {
  const guardRef = useRef(guard);
  useEffect(() => {
    guardRef.current = guard;
  });
  const isCurrent = usePageActivity() === "current";
  useEffect(() => {
    if (!isCurrent) return;
    return router.addNavigationGuard((navigation) => guardRef.current(navigation));
  }, [isCurrent]);
};
