"use client";
import { type ReactNode, Suspense, type Usable, use, useDeferredValue } from "react";
import { StreamBoundary, type StreamError } from "./StreamBoundary";

interface StreamDeferredProps<Value> {
  of: PromiseLike<Value>;
  fallback: ReactNode;
  error?: StreamError;
  keyOf: (thenable: object) => string;
  children: (value: Value) => ReactNode;
}
export const StreamDeferred = <Value,>({ of, fallback, error, keyOf, children }: StreamDeferredProps<Value>) => {
  const shown = useDeferredValue(of);
  return (
    <StreamBoundary resetKey={keyOf(shown)} error={error}>
      <Suspense fallback={fallback}>
        <Resolve of={shown}>{children}</Resolve>
      </Suspense>
    </StreamBoundary>
  );
};

interface ResolveProps<Value> {
  of: PromiseLike<Value>;
  children: (value: Value) => ReactNode;
}
const Resolve = <Value,>({ of, children }: ResolveProps<Value>) => children(use(of as Usable<Value>));
