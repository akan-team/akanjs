"use client";
import { ReactNode, useEffect, useMemo, useState } from "react";

import type { PageProps } from "./Page";

const setFetchedData = (target: (props: any) => ReactNode | null, data: unknown, pathname: string) => {
  const fetchedData =
    (Reflect.getMetadata("fetchedData", target as object) as { [key: string]: unknown } | undefined) ?? {};
  Reflect.defineMetadata("fetchedData", { ...fetchedData, [pathname]: data }, target as object);
};
const getFetchedData = (target: (props: any) => ReactNode | null, pathname: string): unknown => {
  const data = (Reflect.getMetadata("fetchedData", target as object) as { [key: string]: unknown } | undefined) ?? {};
  return data[pathname] ?? null;
};

export const PageCSR = <Return,>({ of, loader, render, loading, noCache = false }: PageProps<Return>) => {
  const fetchData = useMemo(() => {
    const cachedData = getFetchedData(of, location.pathname) as Return;
    if (!noCache && cachedData) return cachedData;
    else return loader();
  }, [location.pathname]);
  const [fetchState, setFetchState] = useState<{ fulfilled: boolean; value: Return | null }>(
    fetchData instanceof Promise ? { fulfilled: false, value: null } : { fulfilled: true, value: fetchData as Return }
  );
  useEffect(() => {
    if (fetchState.fulfilled || !(fetchData instanceof Promise)) return;
    void (async () => {
      try {
        const ret = await fetchData;
        setFetchState({ fulfilled: true, value: ret });
        setFetchedData(of, ret, location.pathname);
      } catch (err) {
        // onError?.(content);
      }
    })();
  }, []);
  if (!fetchState.fulfilled || !fetchState.value) return loading ? loading() : null;
  else return <>{render(fetchState.value)}</>;
};
