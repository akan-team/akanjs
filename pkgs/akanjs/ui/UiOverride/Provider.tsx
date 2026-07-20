"use client";
import { type ReactNode, useContext, useMemo } from "react";

import { type AkanUiOverrides, UiOverrideContext } from "./context";

export interface UiOverrideProviderProps {
  /** Override map for this subtree; merged over any ancestor overrides. */
  value?: Partial<AkanUiOverrides>;
  children?: ReactNode;
}

/**
 * Supplies route-scoped UI overrides. Merges its own `value` over the overrides
 * inherited from ancestors so the closest declaration wins, matching nested
 * `_overrides.tsx` resolution. `routeTreeBuilder` mounts one of these per route
 * node once the `_overrides.tsx` convention is wired.
 */
export const UiOverrideProvider = ({ value, children }: UiOverrideProviderProps) => {
  const parent = useContext(UiOverrideContext);
  const merged = useMemo(() => ({ ...parent, ...value }), [parent, value]);
  return <UiOverrideContext.Provider value={merged}>{children}</UiOverrideContext.Provider>;
};
