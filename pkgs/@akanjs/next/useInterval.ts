"use client";
import { useEffect, useRef } from "react";

export const useInterval = (callback: (() => void) | (() => Promise<void>), delay: number) => {
  const savedCallback = useRef<(() => void) | (() => Promise<void>) | null>(null);
  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);
  useEffect(() => {
    const tick = () => {
      void savedCallback.current?.();
    };

    const id = setInterval(tick, delay);
    return () => {
      clearInterval(id);
    };
  }, [delay]);
  return savedCallback;
};
