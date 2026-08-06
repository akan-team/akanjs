import { getRequestStore } from "akanjs/fetch";
import type { ReactNode } from "react";

interface ServerPortalStore {
  capture: (id: string, children: ReactNode) => void;
  read: (id: string) => ReactNode;
}

declare global {
  var __AKAN_SERVER_PORTAL_STORE__: ServerPortalStore | undefined;
}

export const createServerPortalStore = (): ServerPortalStore => {
  const portals = new Map<string, ReactNode[]>();
  return {
    capture: (id, children) => {
      const current = portals.get(id) ?? [];
      current.push(children);
      portals.set(id, current);
    },
    read: (id) => portals.get(id) ?? null,
  };
};

export const setActiveServerPortalStore = (store: ServerPortalStore): void => {
  const requestStore = getRequestStore() as ({ serverPortalStore?: ServerPortalStore } & object) | undefined;
  if (requestStore) {
    requestStore.serverPortalStore = store;
    return;
  }
  globalThis.__AKAN_SERVER_PORTAL_STORE__ = store;
};

const getActiveServerPortalStore = (): ServerPortalStore | undefined => {
  const requestStore = getRequestStore() as ({ serverPortalStore?: ServerPortalStore } & object) | undefined;
  return requestStore?.serverPortalStore ?? globalThis.__AKAN_SERVER_PORTAL_STORE__;
};

export const captureServerPortal = (id: string, children: ReactNode): boolean => {
  const store = getActiveServerPortalStore();
  if (!store) return false;
  store.capture(id, children);
  return true;
};

export const ServerPortalOutlet = ({ id }: { id: string }) => {
  const serverPortal = getActiveServerPortalStore();
  return <>{serverPortal?.read(id)}</>;
};
