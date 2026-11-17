"use client";
import { type Context, createContext } from "react";

import { sharedContextKey } from "./sharedContextKey";

/** Every framework context is made here: a build inlines modules into each client chunk, so a plain `createContext`
 * copy silently misses a Provider from another chunk. `use-agentic` keeps its own `useAgentic.`-prefixed twin. */
export const sharedContext = <T>(name: string, initial: T): Context<T> => {
  const key = sharedContextKey(name);
  const holder = globalThis as typeof globalThis & { [slot: symbol]: Context<T> | undefined };
  const existing = holder[key];
  if (existing) return existing;
  const created = createContext(initial);
  holder[key] = created;
  return created;
};
