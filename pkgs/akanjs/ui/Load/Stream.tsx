import type { PromiseOrObject } from "akanjs/base";
import { isThenable } from "akanjs/common";
import { type ReactNode, Suspense, type Usable, use } from "react";
import { StreamBoundary, type StreamError } from "./StreamBoundary";

interface StreamProps<Value> {
  of: PromiseOrObject<Value>;
  /** Rendered while `of` is pending. Only a thenable `of` gets a boundary, so a resolved one never shows it. */
  fallback?: ReactNode;
  /**
   * Rendered in place of the value when `of` rejects; a localized notice with a retry by default. The
   * `(error, retry)` form works only where Stream renders on the client: a server one cannot hand a function over.
   */
  error?: StreamError;
  children: (value: Value) => ReactNode;
}

//? Security: a key, not the thenable. Handed to a client component, a native promise would serialize its whole
//? resolved value into the payload, fields the server-rendered children never show included.
//? Prefixed per process: a refresh another worker serves would otherwise count from the same number and keep the notice.
const resetKeyPrefix = Math.random().toString(36).slice(2, 10);
const resetKeys = new WeakMap<object, string>();
let lastResetKey = 0;
const resetKeyOf = (thenable: object) => {
  const known = resetKeys.get(thenable);
  if (known !== undefined) return known;
  lastResetKey += 1;
  const key = `${resetKeyPrefix}:${lastResetKey}`;
  resetKeys.set(thenable, key);
  return key;
};

// A resolved value renders in the SSR shell with no boundary; a thenable gets its own boundary and `use()`, so the
// server streams it (an effect would commit a skeleton). No `"use client"`: `use()` works in both graphs.
export default function Stream<Value>({ of, fallback = null, error, children }: StreamProps<Value>) {
  return isThenable(of) ? (
    <StreamBoundary resetKey={resetKeyOf(of)} error={error}>
      <Suspense fallback={fallback}>
        <Resolve of={of as PromiseLike<Value>}>{children}</Resolve>
      </Suspense>
    </StreamBoundary>
  ) : (
    children(of as Value)
  );
}

interface ResolveProps<Value> {
  of: PromiseLike<Value>;
  children: (value: Value) => ReactNode;
}
const Resolve = <Value,>({ of, children }: ResolveProps<Value>) => children(use(of as Usable<Value>));
