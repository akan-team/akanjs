"use client";
import { type Context, createContext } from "react";

/**
 * A React context interned on `globalThis`, for the reason `AgenticSurface.shared` is: an app does not get one
 * copy of this package. An akan build inlines it into every client bundle that reaches it — four of them in this
 * repo's own docs app — and a context is identified by object identity, so a `ScopeContext.Provider` rendered by
 * `Agent.Zone` in one copy is invisible to the `st.tool` reading it from another.
 *
 * That failure is silent, which is what makes it worth a global: the read falls back to the context's default, so
 * the tool registers at the root scope instead of the zone's, the zone session filters it out as belonging to a
 * different view, and the model is handed the built-ins with nothing thrown and nothing logged.
 *
 * Every context this package owns goes through here. Adding one the plain way would work in the monorepo — one
 * copy, one object — and fail only once bundled, which is exactly the bug this replaced.
 */
export const sharedContext = <T>(name: string, initial: T): Context<T> => {
  const key = Symbol.for(`useAgentic.context.${name}`);
  const holder = globalThis as typeof globalThis & { [slot: symbol]: Context<T> | undefined };
  const existing = holder[key];
  if (existing) return existing;
  const created = createContext(initial);
  holder[key] = created;
  return created;
};
