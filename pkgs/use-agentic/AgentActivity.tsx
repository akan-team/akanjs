"use client";
import { type ReactNode, useLayoutEffect, useMemo } from "react";
import { GateContext, SurfaceContext, useAgentGate, useSurface } from "./surfaceContext";

export interface AgentActivityProps {
  active: boolean;
  children: ReactNode;
}

/**
 * Publishes what is registered below only while `active` — for a subtree kept mounted where the user cannot act on
 * it, like the page under the one on screen. Registrations stay in place, so turning it back on re-publishes them
 * without a remount. A registry that lives outside the surface reads the same gate through `useAgentGate()`.
 */
export const AgentActivity = ({ active, children }: AgentActivityProps) => {
  const surface = useSurface();
  const parent = useAgentGate();
  const gate = useMemo(() => surface.gate(active, parent), [surface, parent]);
  const gated = useMemo(() => surface.gated(gate), [surface, gate]);
  useLayoutEffect(() => gate.set(active), [gate, active]);
  return (
    <SurfaceContext.Provider value={gated}>
      <GateContext.Provider value={gate}>{children}</GateContext.Provider>
    </SurfaceContext.Provider>
  );
};
