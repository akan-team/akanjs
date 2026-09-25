import { AgentContext, ensureStoreSurface, ScreenSettle } from "akanjs/store";
import {
  type AgentRunner,
  AgentSession,
  type AgentSessionOptions,
  type CompactOptions,
  type SessionHistory,
} from "use-agentic";
import { fetchRunner } from "./fetchRunner";
import { type PersistOption, sessionHistoryOf } from "./sessionHistory";
import { type BuiltinOption, sessionView } from "./sessionView";

export interface AgentSessionSetup {
  /** Read per call rather than captured, so text the session builds follows a language switched mid-conversation. */
  l: (key: string) => string;
  /** The zone's scope path, empty for the root agent — it picks both the surface view and the persistence key. */
  view?: string[];
  runner?: AgentRunner;
  instructions?: string;
  maxTurns?: number;
  compact?: CompactOptions;
  /**
   * Which of the runtime's own tools this session gets: all of them by default, none with `false`, exactly the
   * ones an array names. A zone whose conversation must stay on one screen takes `navigate` and `goBack` off it.
   */
  builtins?: BuiltinOption;
  /** Web storage by default; a `SessionHistory` puts the transcript wherever the app keeps it, including a server. */
  persist?: PersistOption | SessionHistory;
  /** Called after a compaction replaced messages with one summary — where a host syncs its own watermark. */
  onCompact?: AgentSessionOptions["onCompact"];
}

/**
 * The one place a chat session is wired to the akan runtime. Chat and Zone both build one, and building it twice
 * is how a zone came to be the only surface with no `compact` option — an option added on one side of a copy.
 */
export const agentSessionOf = ({
  l,
  view = [],
  runner,
  instructions,
  maxTurns,
  compact,
  builtins,
  persist,
  onCompact,
}: AgentSessionSetup): AgentSession => {
  const { surface } = ensureStoreSurface();
  const history = sessionHistoryOf(persist, view.join("."));
  return new AgentSession(sessionView(surface, view, builtins), runner ?? fetchRunner(), {
    buildContext: (scoped) => AgentContext.of().blocks(scoped, view),
    settle: () => ScreenSettle.wait(),
    continueAsk: () => ({ question: l("base.agentContinue"), keep: l("base.agentKeepGoing") }),
    ...(instructions ? { instructions } : {}),
    ...(maxTurns ? { maxTurns } : {}),
    ...(compact ? { compact } : {}),
    ...(history ? { history } : {}),
    ...(onCompact ? { onCompact } : {}),
  });
};
