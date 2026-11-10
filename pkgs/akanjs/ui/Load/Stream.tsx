import type { PromiseOrObject } from "akanjs/base";
import { isThenable } from "akanjs/common";
import { type ReactNode, Suspense, type Usable, use } from "react";
import { StreamBoundary } from "./StreamBoundary";

interface StreamProps<Value> {
  of: PromiseOrObject<Value>;
  /** Rendered while `of` is pending. Only a thenable `of` gets a boundary, so a resolved one never shows it. */
  fallback?: ReactNode;
  /** Rendered in place of the value when `of` rejects; a short localized notice by default. */
  error?: ReactNode;
  children: (value: Value) => ReactNode;
}

//? A number, not the thenable: a server-graph Stream hands it to a client component, and a thenable may not serialize.
const resetKeys = new WeakMap<object, number>();
let lastResetKey = 0;
const resetKeyOf = (thenable: object) => {
  const known = resetKeys.get(thenable);
  if (known !== undefined) return known;
  lastResetKey += 1;
  resetKeys.set(thenable, lastResetKey);
  return lastResetKey;
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
