"use client";
import { useCallback, useEffect, useRef } from "react";

export const useDebounce = <Args extends unknown[], Return>(
  callback: (...args: Args) => Return,
  _states: unknown[] = [],
  wait = 100,
) => {
  const savedCallback = useRef(callback);
  const pending = useRef<{ timer: ReturnType<typeof setTimeout>; args: Args } | null>(null);
  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);
  const flush = useCallback(() => {
    const call = pending.current;
    if (!call) return;
    clearTimeout(call.timer);
    pending.current = null;
    savedCallback.current(...call.args);
  }, []);
  // A call pending at unmount runs then, never later; dropping it would lose the last input (a typed filter).
  useEffect(() => flush, []);
  return useCallback(
    (...args: Args) => {
      if (pending.current) clearTimeout(pending.current.timer);
      pending.current = { timer: setTimeout(flush, wait), args };
    },
    [wait],
  );
};
