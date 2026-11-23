"use client";

import { type ReactNode, use, useCallback, useLayoutEffect } from "react";
import { RouteHead } from "../client/route/RouteHead";
import { readRscRoutePatch, subscribeRscRoutePatch, writeRscRoutePatch } from "../client/rscRoutePatch";
import { useTransitionStore } from "../webkit/useTransitionStore";
import type { AkanHeadSnapshotV1 } from "./routeState";

//? The build registers this one module as the runtime's client reference, so the composer names the export here.
export { AkanPressLoading } from "./rscPressLoading";

type RscSegmentThenable = PromiseLike<ReactNode>;

interface RscSegmentOutletStore {
  entries: Map<string, RscSegmentThenable>;
  listeners: Map<string, Set<() => void>>;
  drawn: Map<string, RscSegmentThenable | null>;
  drawWaiters: WeakMap<RscSegmentThenable, () => void>;
}

declare global {
  var __AKAN_RSC_SEGMENT_OUTLET_STORE__: RscSegmentOutletStore | undefined;
}

function getStore(): RscSegmentOutletStore {
  globalThis.__AKAN_RSC_SEGMENT_OUTLET_STORE__ ??= {
    entries: new Map(),
    listeners: new Map(),
    drawn: new Map(),
    drawWaiters: new WeakMap(),
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

export function whenAkanSegmentOutletDraws(segmentKey: string, thenable: RscSegmentThenable, done: () => void): void {
  const store = getStore();
  if (store.drawn.get(segmentKey) === thenable) done();
  else store.drawWaiters.set(thenable, done);
}

export function resetAkanSegmentOutletPatches(): void {
  const store = getStore();
  store.entries.clear();
  for (const listeners of store.listeners.values()) {
    for (const listener of listeners) listener();
  }
  writeRscRoutePatch(null);
}

export function AkanSegmentOutlet({ segmentKey, children }: { segmentKey: string; children: ReactNode }): ReactNode {
  const patchedThenable = useTransitionStore(
    useCallback((listener: () => void) => subscribeSegment(segmentKey, listener), [segmentKey]),
    useCallback(() => getStore().entries.get(segmentKey) ?? null, [segmentKey]),
  );
  useLayoutEffect(() => {
    const { drawn, drawWaiters } = getStore();
    drawn.set(segmentKey, patchedThenable);
    if (!patchedThenable) return;
    drawWaiters.get(patchedThenable)?.();
    drawWaiters.delete(patchedThenable);
  }, [segmentKey, patchedThenable]);
  useLayoutEffect(() => () => void getStore().drawn.delete(segmentKey), [segmentKey]);
  return patchedThenable ? use(patchedThenable) : children;
}

const subscribeRouteHead = (listener: () => void) => subscribeRscRoutePatch(listener, { head: true });

const renderHeadSnapshot = (snapshot: AkanHeadSnapshotV1): ReactNode =>
  snapshot.nodes.map((node, index) => {
    const key = `${node.tag}:${index}`;
    if (node.tag === "title") return <title key={key}>{node.text ?? ""}</title>;
    if (node.tag === "meta") return <meta key={key} {...node.attrs} />;
    return <link key={key} {...node.attrs} />;
  });

//? Rendered by React rather than written into the DOM: React owns these hoisted tags, so a node swapped behind its
//? back is one the next full commit updates or removes while detached, leaving the old page's head on screen.
export function AkanRouteHead({ layouts, page }: { layouts: AkanHeadSnapshotV1; page: AkanHeadSnapshotV1 }): ReactNode {
  const patch = useTransitionStore(subscribeRouteHead, readRscRoutePatch);
  return renderHeadSnapshot(RouteHead.mergeSnapshots([layouts.nodes, (patch?.head ?? page).nodes]));
}
