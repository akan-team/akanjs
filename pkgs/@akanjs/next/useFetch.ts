"use client";
import { useEffect, useState } from "react";

export const useFetch = <Return>(
  fnOrPromise: Promise<Return> | Return,
  { onError }: { onError?: (err: string) => void } = {}
): { fulfilled: boolean; value: Return | null } => {
  const [fetchState, setFetchState] = useState<{ fulfilled: boolean; value: any }>(
    fnOrPromise instanceof Promise ? { fulfilled: false, value: null } : { fulfilled: true, value: fnOrPromise }
  );
  useEffect(() => {
    void (async () => {
      try {
        const ret = fnOrPromise instanceof Promise ? await fnOrPromise : fnOrPromise;
        setFetchState({ fulfilled: true, value: ret });
      } catch (err) {
        const content = `Error: ${typeof err === "string" ? err : (err as Error).message}`;
        onError?.(content);
        throw new Error(content);
      }
    })();
  }, []);
  return fetchState;
};
