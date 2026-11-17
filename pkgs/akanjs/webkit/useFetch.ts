"use client";
import { isThenable } from "akanjs/common";
import { startTransition, useEffect, useMemo, useState } from "react";

export const useFetch = <Return>(
  fnOrPromise: Promise<Return> | Return,
  {
    onError,
    keepPrevious = false,
  }: {
    onError?: (err: string) => void;
    /** While a new promise is pending, answer the last settled value instead of `null`. */
    keepPrevious?: boolean;
  } = {},
): { fulfilled: boolean; value: Return | null } => {
  const [settled, setSettled] = useState<{ source: unknown; value: Return } | null>(null);
  useEffect(() => {
    if (!isThenable(fnOrPromise)) return;
    let cancelled = false;
    void (async () => {
      try {
        const ret = await fnOrPromise;
        if (cancelled) return;
        const next = { source: fnOrPromise, value: ret };
        //? Outside a transition, a newer value whose streams are still pending sends Suspense boundaries already
        //? drawn back to their fallbacks: a native app's refresh blanked the page it kept, as a web one's does not.
        if (keepPrevious) startTransition(() => setSettled(next));
        else setSettled(next);
      } catch (err) {
        if (cancelled) return;
        const content = `Error: ${typeof err === "string" ? err : (err as Error).message}`;
        onError?.(content);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fnOrPromise]);
  if (!isThenable(fnOrPromise)) {
    return { fulfilled: true, value: fnOrPromise as Return };
  }
  return settled?.source === fnOrPromise
    ? { fulfilled: true, value: settled.value }
    : { fulfilled: false, value: keepPrevious ? (settled?.value ?? null) : null };
};

/** Calls `factory` once per `deps` change, so a re-render does not start another request. */
export const useFetchFn = <Return>(
  factory: () => Promise<Return> | Return,
  deps: unknown[] = [],
  options: { onError?: (err: string) => void } = {},
): { fulfilled: boolean; value: Return | null } => {
  const memoized = useMemo(factory, deps);
  return useFetch(memoized, options);
};
