"use client";
import { type ComponentType, createElement, type ReactNode } from "react";

import type { AkanUiOverrides } from "./context";
import { useUiOverride } from "./useUiOverride";

/**
 * Wraps a framework component so a matching `_overrides.tsx` entry replaces it,
 * scoped to that route subtree. Falls back to `Default` when no override is
 * active, so every existing call site keeps working untouched. The proxy erases
 * its prop type internally and re-asserts the slot's public component type on
 * the way out, so call sites stay fully typed against the slot contract.
 */
export const createOverridable = <K extends keyof AkanUiOverrides>(
  name: K,
  Default: AkanUiOverrides[K],
): AkanUiOverrides[K] => {
  // Narrow both sides to a simple component type before `??`. Combining the deferred generic union
  // `AkanUiOverrides[K]` with `??` otherwise materializes the whole slot union and trips TS2590.
  const Fallback = Default as unknown as ComponentType<Record<string, unknown>>;
  const Overridable = (props: Record<string, unknown>): ReactNode => {
    const Override = useUiOverride(name) as unknown as ComponentType<Record<string, unknown>> | undefined;
    return createElement(Override ?? Fallback, props);
  };
  return Overridable as unknown as AkanUiOverrides[K];
};
