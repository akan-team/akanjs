"use client";
import { useSyncExternalStore } from "react";

export interface PendingNavigationEntry {
  href: string;
  //? The page on screen when it began; `null` when its starter did not say.
  from: string | null;
  //? Back or Forward, which a `.loading()` shown at the press leaves to the page on screen.
  traversal: boolean;
  //? False while nothing is asked of the server: a page replayed from the client cache, or a prefetch that has arrived.
  waits: boolean;
  left?: { promise: Promise<void>; resolve: () => void };
}

interface PendingNavigationStore {
  entry: PendingNavigationEntry | null;
  listeners: Set<() => void>;
}

declare global {
  var __AKAN_PENDING_NAVIGATION__: PendingNavigationStore | undefined;
}

export class PendingNavigation {
  //? On `globalThis`: the RSC client that starts a navigation and the components reading it are separate bundles.
  static #store(): PendingNavigationStore {
    globalThis.__AKAN_PENDING_NAVIGATION__ ??= { entry: null, listeners: new Set() };
    return globalThis.__AKAN_PENDING_NAVIGATION__;
  }

  static #set(entry: PendingNavigationEntry | null) {
    const store = PendingNavigation.#store();
    const previous = store.entry;
    store.entry = entry;
    if (previous !== entry) previous?.left?.resolve();
    for (const listener of [...store.listeners]) listener();
  }

  static begin(
    href: string,
    { from = null, traversal = false }: { from?: string | null; traversal?: boolean } = {},
  ): PendingNavigationEntry {
    const entry: PendingNavigationEntry = { href, from, traversal, waits: false };
    PendingNavigation.#set(entry);
    return entry;
  }

  static wait(entry: PendingNavigationEntry) {
    if (entry.waits || PendingNavigation.#store().entry !== entry) return;
    entry.waits = true;
    PendingNavigation.#set(entry);
  }

  //? A navigation another one overtook ends later than that one began, and must leave its entry alone.
  static end(entry: PendingNavigationEntry) {
    if (PendingNavigation.#store().entry === entry) PendingNavigation.#set(null);
  }

  static clear() {
    if (PendingNavigation.#store().entry) PendingNavigation.#set(null);
  }

  static get(): string | null {
    const { entry } = PendingNavigation.#store();
    return entry?.waits ? entry.href : null;
  }

  static target(): string | null {
    return PendingNavigation.#store().entry?.href ?? null;
  }

  static entry(): PendingNavigationEntry | null {
    return PendingNavigation.#store().entry;
  }

  /** Settles once `entry` is no longer the navigation in flight: it was drawn, it failed, or another began. */
  static left(entry: PendingNavigationEntry): Promise<void> {
    if (!entry.left) {
      let resolve = () => {};
      const promise = new Promise<void>((done) => {
        resolve = done;
      });
      entry.left = { promise, resolve };
      if (PendingNavigation.#store().entry !== entry) resolve();
    }
    return entry.left.promise;
  }

  static subscribe(listener: () => void) {
    const { listeners } = PendingNavigation.#store();
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  static use<Value extends string | boolean | null>(select: (href: string | null) => Value): Value {
    return useSyncExternalStore(
      PendingNavigation.subscribe,
      () => select(PendingNavigation.get()),
      () => select(null),
    );
  }
}
