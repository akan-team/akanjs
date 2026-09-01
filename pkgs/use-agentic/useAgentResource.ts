"use client";
import { useEffect, useRef } from "react";
import { useScopePath, useSurface } from "./surfaceContext";

export interface AgentResourceMeta {
  description?: string;
  serialize?: (value: unknown) => unknown;
  report?: boolean;
}

/**
 * Publishes a read-only view of any value the component already holds — derived totals, statuses, labels.
 *
 * A falsy name declares nothing: hooks run either way, so a component whose publication is conditional keeps a
 * constant hook count instead of branching around the call.
 */
export const useAgentResource = (name: string | null, value: unknown, meta: AgentResourceMeta = {}): void => {
  const surface = useSurface();
  const scope = useScopePath();
  const live = useRef({ value, meta });
  live.current = { value, meta };
  const scopeKey = scope.join(".");
  useEffect(() => {
    if (!name) return;
    const { meta: declared } = live.current;
    return surface.registerResource(scope, {
      name,
      description: declared.description,
      report: declared.report,
      read: () => {
        const { value: current, meta: currentMeta } = live.current;
        return currentMeta.serialize ? currentMeta.serialize(current) : current;
      },
    });
  }, [surface, scopeKey, name]);
};
