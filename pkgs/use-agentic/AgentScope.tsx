"use client";
import { type ReactNode, useEffect, useMemo } from "react";
import { AgenticSurface } from "./AgenticSurface";
import { ScopeContext, useScopePath, useSurface } from "./surfaceContext";

export interface AgentScopeProps {
  id: string;
  label?: string;
  kind?: string;
  children: ReactNode;
}

/** Namespaces every tool and resource registered below it, so list items can reuse local names. */
export const AgentScope = ({ id, label, kind, children }: AgentScopeProps) => {
  const surface = useSurface();
  const parent = useScopePath();
  const path = useMemo(() => AgenticSurface.childPath(parent, id), [parent, id]);
  useEffect(() => surface.openScope(parent, { id, label, kind }), [surface, path.join("."), label, kind]);
  return <ScopeContext.Provider value={path}>{children}</ScopeContext.Provider>;
};
