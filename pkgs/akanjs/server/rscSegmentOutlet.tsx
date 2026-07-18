"use client";

import { type ReactNode, use, useSyncExternalStore } from "react";

type RscSegmentThenable = PromiseLike<ReactNode>;

interface RscSegmentOutletStore {
  entries: Map<string, RscSegmentThenable>;
  listeners: Map<string, Set<() => void>>;
}

declare global {
  var __AKAN_RSC_SEGMENT_OUTLET_STORE__: RscSegmentOutletStore | undefined;
}

function getStore(): RscSegmentOutletStore {
  globalThis.__AKAN_RSC_SEGMENT_OUTLET_STORE__ ??= {
    entries: new Map(),
    listeners: new Map(),
  };
  return globalThis.__AKAN_RSC_SEGMENT_OUTLET_STORE__;
}

function subscribeSegment(segmentKey: string, listener: () => void): () => void {
  const store = getStore();
  let listeners = store.listeners.get(segmentKey);
  if (!listeners) {
    listeners = new Set();
    store.listeners.set(segmentKey, listeners);
  }
  listeners.add(listener);
  return () => {
    listeners?.delete(listener);
    if (listeners?.size === 0) store.listeners.delete(segmentKey);
  };
}

function getSegmentThenable(segmentKey: string): RscSegmentThenable | null {
  return getStore().entries.get(segmentKey) ?? null;
}

export function hasAkanSegmentOutlet(segmentKey: string): boolean {
  return Boolean(getStore().listeners.get(segmentKey)?.size);
}

export function commitAkanSegmentOutletPatch(segmentKey: string, thenable: RscSegmentThenable): boolean {
  if (!hasAkanSegmentOutlet(segmentKey)) return false;
  const store = getStore();
  store.entries.set(segmentKey, thenable);
  for (const listener of store.listeners.get(segmentKey) ?? []) listener();
  return true;
}

export function resetAkanSegmentOutletPatches(): void {
  const store = getStore();
  store.entries.clear();
  for (const listeners of store.listeners.values()) {
    for (const listener of listeners) listener();
  }
}

export function AkanSegmentOutlet({ segmentKey, children }: { segmentKey: string; children: ReactNode }): ReactNode {
  const patchedThenable = useSyncExternalStore(
    (listener) => subscribeSegment(segmentKey, listener),
    () => getSegmentThenable(segmentKey),
    () => null,
  );
  return patchedThenable ? use(patchedThenable) : children;
}
