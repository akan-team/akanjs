"use client";
import { useCallback, useRef } from "react";

export const useThrottle = (func: (...args: any) => any, delay = 200, deps: any[] = []) => {
  const throttleSeed = useRef<NodeJS.Timeout | null>(null);
  const throttleFunction = useCallback(
    (...args) => {
      if (throttleSeed.current) return;
      func(...(args as object[]));
      throttleSeed.current = setTimeout(() => {
        throttleSeed.current = null;
      }, delay);
    },
    [func, delay, ...(deps as object[])]
  );
  return throttleFunction;
};
