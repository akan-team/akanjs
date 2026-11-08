"use client";
import { usePage } from "akanjs/client";
import type { AgentVisualOption } from "akanjs/store";
import { type ReactNode, useEffect, useMemo, useRef } from "react";
import {
  AgenticSurface,
  type AgentRunner,
  AgentScope,
  type AgentSession,
  type AgentSessionOptions,
  type CompactOptions,
  SessionContext,
  type SessionHistory,
  useScopePath,
} from "use-agentic";
import { agentSessionOf, type BuiltinOption, type PersistOption } from "./agentSessionOf";
import { Guide } from "./Guide";
import { useAccountBoundSession } from "./useAccountBoundSession";

export interface ZoneProps {
  className?: string;
  /** Names the zone; the scope id and the `data-agent-zone` container both derive from it. */
  id: string;
  label?: string;
  /** A mounted Guide: the root agent reads it too, a sibling zone never does. */
  instructions?: string;
  runner?: AgentRunner;
  maxTurns?: number;
  /** Same contract as the chat's own `compact`. */
  compact?: CompactOptions;
  /** Every runtime tool by default, `false` none, an array exactly the ones it names. */
  builtins?: BuiltinOption;
  /** Keyed by the zone's scope path; web storage by default, or an app `SessionHistory`. */
  persist?: PersistOption | SessionHistory;
  /** Called after a compaction replaced messages with one summary. */
  onCompact?: AgentSessionOptions["onCompact"];
  /** On by default; `false` draws nothing, `{ cursor: false }` / `{ reveal: false }` turn one effect off. */
  visual?: boolean | AgentVisualOption;
  /** An app-built session the app keeps owning: unmounting leaves it running. Read once at mount. */
  session?: AgentSession;
  /** Called once the session exists. */
  onSession?: (session: AgentSession) => void;
  children: ReactNode;
}

/** Everything a zone publishes is named `<id>.<name>`, so instructions naming a tool must carry the prefix. */
export const Zone = ({
  className,
  id,
  label,
  instructions,
  runner,
  maxTurns,
  compact,
  builtins,
  persist,
  onCompact,
  visual = true,
  session: provided,
  onSession,
  children,
}: ZoneProps) => {
  const { l } = usePage();
  const parent = useScopePath();
  const path = useMemo(() => AgenticSurface.childPath(parent, id), [parent.join("."), id]);
  const translate = useRef(l);
  translate.current = l;
  const held = useRef<AgentSession | null>(null);
  held.current ??=
    provided ??
    agentSessionOf({
      l: (key) => translate.current(key),
      view: path,
      runner,
      maxTurns,
      compact,
      builtins,
      persist,
      onCompact,
      visual,
    });
  const session = held.current;
  useAccountBoundSession(session === provided ? null : session);
  useEffect(
    // Unmounted, nothing renders an owned session's approvals; a provided one belongs to the app.
    () => (provided ? undefined : () => session.abort()),
    [],
  );
  useEffect(() => {
    onSession?.(session);
  }, [session]);
  return (
    <AgentScope id={id} kind="zone" label={label}>
      <SessionContext.Provider value={session}>
        <div className={className} data-agent-zone={path.join(".")}>
          {instructions ? <Guide instructions={instructions} /> : null}
          {children}
        </div>
      </SessionContext.Provider>
    </AgentScope>
  );
};
