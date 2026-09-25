"use client";
import { usePage } from "akanjs/client";
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
import { agentSessionOf } from "./agentSessionOf";
import { Guide } from "./Guide";
import type { PersistOption } from "./sessionHistory";
import type { BuiltinOption } from "./sessionView";

export interface ZoneProps {
  className?: string;
  /** Names the zone; the scope id and the `data-agent-zone` container both derive from it. */
  id: string;
  label?: string;
  /** Zone-scoped guidance — a mounted Guide, so the root agent reads it too (ancestor rule), a sibling zone never does. */
  instructions?: string;
  runner?: AgentRunner;
  maxTurns?: number;
  /** When this zone's conversation summarizes itself — same contract as the chat's own `compact`. */
  compact?: CompactOptions;
  /**
   * Which of the runtime's own tools this zone's agent gets — all of them by default, `false` none, an array
   * exactly the ones it names. `builtins={["readScreen", "readState"]}` is how a zone that must not leave the
   * screen stops being able to: the tools are withheld, not discouraged, so a prompt cannot talk the model past it.
   */
  builtins?: BuiltinOption;
  /**
   * Keeps this zone's transcript across reloads, keyed by the zone's scope path — web storage by default, or a
   * `SessionHistory` of the app's own to keep it anywhere else, a server included.
   */
  persist?: PersistOption | SessionHistory;
  /** Called after a compaction replaced messages with one summary — where a host syncs its own watermark. */
  onCompact?: AgentSessionOptions["onCompact"];
  /**
   * Runs this zone on a session the app built instead of one of its own, and the app then owns it: unmounting the
   * zone leaves it running. Read once at mount, like every other session option here.
   */
  session?: AgentSession;
  /** Hands the session out once it exists, for a page or store that wants to send into it or watch it. */
  onSession?: (session: AgentSession) => void;
  children: ReactNode;
}

/**
 * A zone agent: one subtree with its own conversation over a scoped view of the same surface. Everything mounted
 * inside — hook tools, `st.use` subscriptions, guides — belongs to this zone's session *and* to the root agent:
 * zones are views, never walls. An `Agent.Chat` mounted inside binds to this session automatically, so two zones
 * on one screen run two conversations in parallel, each seeing only its own subtree.
 *
 * **Everything a zone publishes is named `<id>.<name>`.** Instructions that name a tool must carry the prefix —
 * a bare name is a tool that does not exist, and the model calling it spends a turn on `Unknown tool`. Build the
 * name from the id rather than writing it twice, and read `Agent.Context`'s Assemble to see the published list.
 */
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
    });
  const session = held.current;
  useEffect(
    // A session the zone built ends with the zone: nothing renders its approvals once this is unmounted. One the
    // app handed in is the app's, and outlives this mount — aborting it would end a turn the page is still driving.
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
