"use client";
import { useContext } from "react";

import { type AkanUiOverrides, UiOverrideContext } from "./context";

/**
 * Resolves the active override for a framework component in the current route
 * subtree, or `undefined` when no `_overrides.tsx` in the route's ancestry
 * declares one.
 */
export const useUiOverride = <K extends keyof AkanUiOverrides>(name: K): AkanUiOverrides[K] | undefined => {
  // Read through an untyped record so TS never materializes the union `Partial<AkanUiOverrides>[K]`.
  // With the registry's generic, conditional-typed slots (Button/Select/ToggleSelect) that union is
  // large enough to trip TS2590; the function's public in/out types stay precise.
  const overrides = useContext(UiOverrideContext) as Record<string, unknown>;
  return overrides[name] as AkanUiOverrides[K] | undefined;
};
