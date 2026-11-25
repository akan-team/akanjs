"use client";
import { type ReactNode, useEffect, useMemo, useState } from "react";

import { LoadingMark } from "./LoadingMark";
import type { PageProps } from "./Page";

const CacheMap = new WeakMap<object, Record<string, unknown>>();

const setFetchedData = (target: (props: unknown) => ReactNode | null, data: unknown, pathname: string) => {
  const fetchedData = CacheMap.get(target) ?? {};
  CacheMap.set(target, { ...fetchedData, [pathname]: data });
};
const getFetchedData = (target: (props: unknown) => ReactNode | null, pathname: string): unknown => {
  const data = CacheMap.get(target) ?? {};
  return data[pathname] ?? null;
};

export const PageCSR = <Return,>({ of, loader, render, loading, noCache = false }: PageProps<Return>) => {
  const fetchData = useMemo(() => {
    const cachedData = getFetchedData(of, location.pathname) as Return;
    if (!noCache && cachedData) return cachedData;
    else return loader();
  }, [location.pathname]);
  const [fetchState, setFetchState] = useState<{ fulfilled: boolean; value: Return | null }>(
    fetchData instanceof Promise ? { fulfilled: false, value: null } : { fulfilled: true, value: fetchData as Return },
  );
  useEffect(() => {
    if (fetchState.fulfilled || !(fetchData instanceof Promise)) return;
    void (async () => {
      try {
        const ret = await fetchData;
        setFetchState({ fulfilled: true, value: ret });
        setFetchedData(of, ret, location.pathname);
      } catch {
        // A failed load keeps the loading state; this wrapper has no error surface.
      }
    })();
  }, []);
  if (!fetchState.fulfilled) return <LoadingMark>{loading?.()}</LoadingMark>;
  if (!fetchState.value) return loading ? loading() : null;
  else return <>{render(fetchState.value)}</>;
};
