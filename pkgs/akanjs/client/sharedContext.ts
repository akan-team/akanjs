"use client";
import { type Context, createContext } from "react";

/**
 * A React context interned on `globalThis`, which is how every context this framework owns must be made.
 *
 * An akan build does not give an app one copy of `akanjs`: it inlines each reachable module into every client
 * chunk that reaches it — four copies of the agent runtime in this repo's own docs app. A context is identified
 * by object identity, so a Provider mounted from one copy is invisible to a consumer holding another, and the
 * consumer silently reads the context's default instead.
 *
 * Silently is the whole problem. `UiOverrideContext` was a plain `createContext`, so a route's `_overrides.tsx`
 * bound its slots in the chunk holding the generated provider and every overridable component in another chunk
 * kept rendering the framework default — no throw, no warning, and only *some* slots affected, which reads like
 * a bug in the app's own component. The same shape cost a zone every tool it declared.
 *
 * The rule is therefore mechanical rather than case-by-case: a context whose Provider and consumers can be
 * bundled apart is every context worth having, so all of them go through here. A test fails if one does not.
 *
 * `use-agentic` carries its own twin under a `useAgentic.` prefix, deliberately — it ships as a standalone
 * package and cannot import this one. The prefixes keep the two namespaces from ever meeting.
 */
export const sharedContext = <T>(name: string, initial: T): Context<T> => {
  const key = Symbol.for(`akanjs.context.${name}`);
  const holder = globalThis as typeof globalThis & { [slot: symbol]: Context<T> | undefined };
  const existing = holder[key];
  if (existing) return existing;
  const created = createContext(initial);
  holder[key] = created;
  return created;
};
