import type { AkanHeadSnapshotV1 } from "./csrTypes";

/** What a partial commit put on screen under the layouts the last full commit rendered, until the next full one. */
export interface RscRoutePatch {
  href: string;
  /** The page's part of the head; the layouts' part is the one the last full commit rendered. */
  head: AkanHeadSnapshotV1;
}

interface RscRoutePatchStore {
  current: RscRoutePatch | null;
  listeners: Set<() => void>;
  heads: Map<() => void, string>;
}

declare global {
  var __AKAN_RSC_ROUTE_PATCH__: RscRoutePatchStore | undefined;
}

const routePatchStore = () => {
  globalThis.__AKAN_RSC_ROUTE_PATCH__ ??= { current: null, listeners: new Set(), heads: new Map() };
  return globalThis.__AKAN_RSC_ROUTE_PATCH__;
};

export const readRscRoutePatch = () => routePatchStore().current;

export const writeRscRoutePatch = (patch: RscRoutePatch | null) => {
  const store = routePatchStore();
  if (store.current === patch) return;
  store.current = patch;
  for (const listener of [...store.listeners, ...store.heads.keys()]) listener();
};

/**
 * `head` counts the listener as a mounted route head, the only head a partial commit can swap, showing the layouts'
 * head the server keyed so.
 */
export const subscribeRscRoutePatch = (listener: () => void, { head }: { head?: string } = {}) => {
  const store = routePatchStore();
  if (head === undefined) store.listeners.add(listener);
  else store.heads.set(listener, head);
  return () => {
    store.listeners.delete(listener);
    store.heads.delete(listener);
  };
};

export const hasRscRouteHead = () => routePatchStore().heads.size > 0;

export const rscRouteHeadKey = () => [...routePatchStore().heads.values()].at(-1) ?? null;
