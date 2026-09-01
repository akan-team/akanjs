"use client";
import { type ReactNode, useRef } from "react";
import { AgenticSurface } from "./AgenticSurface";
import { AgentSession, type AgentSessionOptions } from "./AgentSession";
import { SurfaceContext } from "./surfaceContext";
import type { AgentRunner } from "./types";
import { SessionContext } from "./useAgent";

export interface AgentProviderProps extends AgentSessionOptions {
  surface?: AgenticSurface;
  session?: AgentSession;
  runner?: AgentRunner;
  children: ReactNode;
}

/**
 * Scopes a subtree onto one surface and, when a runner or session is given, one conversation.
 *
 * Without a provider, hooks land on `AgenticSurface.shared` — a provider exists to isolate, or to hold the session
 * `useAgent` reads.
 */
export const AgentProvider = ({ surface, session, runner, children, ...options }: AgentProviderProps) => {
  const held = useRef<{ surface: AgenticSurface; session: AgentSession | null } | null>(null);
  if (!held.current) {
    const sessionSurface = session?.surface;
    // A session may run over a zone view; the registration context still needs a real surface behind it.
    const heldSurface =
      surface ?? (sessionSurface instanceof AgenticSurface ? sessionSurface : undefined) ?? new AgenticSurface();
    held.current = {
      surface: heldSurface,
      session: session ?? (runner ? new AgentSession(heldSurface, runner, options) : null),
    };
  }
  return (
    <SurfaceContext.Provider value={held.current.surface}>
      <SessionContext.Provider value={held.current.session}>{children}</SessionContext.Provider>
    </SurfaceContext.Provider>
  );
};
