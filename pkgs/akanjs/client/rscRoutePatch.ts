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
  heads: Set<() => void>;
}

declare global {
  var __AKAN_RSC_ROUTE_PATCH__: RscRoutePatchStore | undefined;
}

const routePatchStore = () => {
  globalThis.__AKAN_RSC_ROUTE_PATCH__ ??= { current: null, listeners: new Set(), heads: new Set() };
  return globalThis.__AKAN_RSC_ROUTE_PATCH__;
};

export const readRscRoutePatch = () => routePatchStore().current;

export const writeRscRoutePatch = (patch: RscRoutePatch | null) => {
  const store = routePatchStore();
  if (store.current === patch) return;
  store.current = patch;
  for (const listener of [...store.listeners, ...store.heads]) listener();
};

//? A `head` listener is a mounted route head, the only head a patch can swap; with none, the patch renders whole.
export const subscribeRscRoutePatch = (listener: () => void, { head = false }: { head?: boolean } = {}) => {
  const listeners = head ? routePatchStore().heads : routePatchStore().listeners;
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const hasRscRouteHead = () => routePatchStore().heads.size > 0;
