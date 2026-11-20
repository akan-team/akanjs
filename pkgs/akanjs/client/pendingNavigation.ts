"use client";
import { useSyncExternalStore } from "react";

export interface PendingNavigationEntry {
  href: string;
  //? False while nothing is asked of the server: a page replayed from the client cache, or a prefetch that has arrived.
  waits: boolean;
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
    store.entry = entry;
    for (const listener of [...store.listeners]) listener();
  }

  static begin(href: string): PendingNavigationEntry {
    const entry = { href, waits: false };
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
