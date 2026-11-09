import { getEnv } from "akanjs/base";
import { AgentConfirm, DraftStore } from "akanjs/store";
import {
  AgentContext,
  AgentVisual,
  type AgentVisualOption,
  ensureStoreSurface,
  ScreenSettle,
  StoreSurfaceSource,
} from "akanjs/store/agent";
import {
  type AgenticSurface,
  type AgentRunner,
  AgentSession,
  type AgentSessionOptions,
  type ChatMessage,
  type CompactOptions,
  type MessageAttachment,
  type SessionHistory,
  type SurfaceView,
  Transcript,
} from "use-agentic";
import { fetchRunner } from "./fetchRunner";

/** A tool the akan runtime contributes to every screen, whatever that screen declares. */
export type AgentBuiltin = (typeof StoreSurfaceSource.builtins)[number];

/** `true` (the default) takes all of them, `false` none, an array exactly the ones it names. */
export type BuiltinOption = boolean | AgentBuiltin[];

export type PersistOption = boolean | { storage?: "session" | "local"; key?: string };

export interface AgentSessionSetup {
  /** Read per call, so the session's own text follows a language switched mid-conversation. */
  l: (key: string) => string;
  /** The zone's scope path, empty for the root agent; it picks both the surface view and the persistence key. */
  view?: string[];
  runner?: AgentRunner;
  instructions?: string;
  maxTurns?: number;
  compact?: CompactOptions;
  /** Every runtime tool by default, `false` none, an array exactly the ones it names. */
  builtins?: BuiltinOption;
  /** Web storage by default, or an app `SessionHistory`. */
  persist?: PersistOption | SessionHistory;
  /** Called after a compaction replaced messages with one summary. */
  onCompact?: AgentSessionOptions["onCompact"];
  /** `false` draws nothing while this session drives the page. */
  visual?: boolean | AgentVisualOption;
}

const ownHistories = new WeakMap<AgentSession, SessionHistory>();

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
  visual,
}: AgentSessionSetup): AgentSession => {
  const { surface } = ensureStoreSurface();
  const history = sessionHistoryOf(persist, view.join("."));
  const drawing = AgentVisual.sink(visual);
  const session = new AgentSession(sessionView(surface, view, builtins), runner ?? fetchRunner(), {
    buildContext: (scoped) => AgentContext.of().blocks(scoped, view),
    settle: () => ScreenSettle.wait(),
    continueAsk: () => ({ question: l("base.agentContinue"), keep: l("base.agentKeepGoing") }),
    ...(AgentConfirm.policy.afterScreenRead ? {} : { askAfterUntrusted: false }),
    ...(instructions ? { instructions } : {}),
    ...(maxTurns ? { maxTurns } : {}),
    ...(compact ? { compact } : {}),
    ...(history ? { history } : {}),
    ...(onCompact ? { onCompact } : {}),
    ...(drawing ?? {}),
  });
  if (history && history !== persist) ownHistories.set(session, history);
  return session;
};

export const ownHistoryOf = (session: AgentSession): SessionHistory | undefined => ownHistories.get(session);

// Narrowed per session (the source is shared), and from `call` too: a tool reachable by guessing is not withheld.
export const sessionView = (surface: AgenticSurface, path: string[], builtins?: BuiltinOption): SurfaceView => {
  const scoped = path.length ? surface.view(path) : surface;
  if (builtins === undefined || builtins === true) return scoped;
  const kept = new Set<string>(builtins === false ? [] : builtins);
  const names = StoreSurfaceSource.builtins as readonly string[];
  const shown = (name: string) => kept.has(name) || !names.includes(name) || surface.declares(name, path);
  return {
    snapshot: () => {
      const snapshot = scoped.snapshot();
      return { ...snapshot, tools: snapshot.tools.filter((tool) => shown(tool.name)) };
    },
    tool: (name) => (shown(name) ? scoped.tool(name) : null),
    call: async (name, args) => {
      if (!shown(name)) throw new Error(`Unknown tool: ${name}`);
      return await scoped.call(name, args);
    },
    read: (name) => scoped.read(name),
    diffSince: (before) => scoped.diffSince(before),
    subscribe: (listener) => scoped.subscribe(listener),
  };
};

// Attachment bytes and reference values never reach storage: web storage holds a few MB and a failed save is
// swallowed, so persisting them would quietly stop persisting the transcript. Pointers (url, ref, refId) stay.
const restoredValue =
  "the conversation was restored from storage, which keeps what the user pointed at but not the value it held";

const pointerOf = ({ name, mimeType, url, ref }: MessageAttachment): MessageAttachment => ({
  name,
  mimeType,
  ...(url ? { url } : {}),
  ...(ref ? { ref } : {}),
});

const withoutContent = (message: ChatMessage): ChatMessage => {
  const toolFiles = message.toolResults?.some((result) => result.attachments?.length);
  if (!message.attachments?.length && !message.references?.length && !toolFiles) return message;
  return {
    ...message,
    ...(message.attachments?.length ? { attachments: message.attachments.map(pointerOf) } : {}),
    ...(toolFiles
      ? {
          toolResults: message.toolResults?.map((result) =>
            result.attachments?.length ? { ...result, attachments: result.attachments.map(pointerOf) } : result,
          ),
        }
      : {}),
    ...(message.references?.length
      ? {
          references: message.references.map(({ refName, refId, label, path }) => ({
            refName,
            refId,
            label,
            ...(path ? { path } : {}),
            note: restoredValue,
          })),
        }
      : {}),
  };
};

const transcriptPrefix = () => `akan.agent.${getEnv().appName}`;

const ownerSegment = /^(?:[0-9a-f]{8}|anon)$/;

const namesNoOwner = (raw: string | null) => {
  try {
    const parsed = JSON.parse(raw ?? "") as { owner?: unknown; messages?: unknown } | null;
    return !!parsed && typeof parsed === "object" && parsed.owner === undefined && Array.isArray(parsed.messages);
  } catch {
    return false;
  }
};

//? Default keys read `<prefix>.<owner>[.<zone>]`; another is an app's `persist.key`, dropped only if it predates owners.
export const forgetOtherAccounts = (owner: string) => {
  if (typeof window === "undefined") return;
  const prefix = transcriptPrefix();
  for (const storage of [window.localStorage, window.sessionStorage]) {
    const isStale = (key: string | null): key is string => {
      if (!key || (key !== prefix && !key.startsWith(`${prefix}.`))) return false;
      const segment = key.slice(prefix.length + 1).split(".")[0] ?? "";
      if (ownerSegment.test(segment)) return segment !== owner;
      return namesNoOwner(storage.getItem(key));
    };
    const stale = Array.from({ length: storage.length }, (_, idx) => storage.key(idx)).filter(isStale);
    for (const key of stale) storage.removeItem(key);
  }
};

//? Security: a transcript holds what the agent read on one account's screens, so no other account loads or writes it.
export const sessionHistoryOf = (
  persist: PersistOption | SessionHistory | undefined,
  pathKey = "",
): SessionHistory | undefined => {
  if (!persist) return undefined;
  if (typeof persist === "object" && typeof (persist as SessionHistory).load === "function")
    return persist as SessionHistory;
  if (typeof window === "undefined") return undefined;
  const option = persist === true ? {} : (persist as Exclude<PersistOption, boolean>);
  const storage = option.storage === "local" ? window.localStorage : window.sessionStorage;
  const keyOf = (owner: string) => option.key ?? `${transcriptPrefix()}.${owner}${pathKey ? `.${pathKey}` : ""}`;
  let owner: string | null = null;
  const version = 1;
  const cap = 50;
  return {
    load: () => {
      owner = DraftStore.identity();
      forgetOtherAccounts(owner);
      const key = keyOf(owner);
      const raw = storage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { v?: number; owner?: string; messages?: ChatMessage[] };
      if (parsed.owner !== owner) {
        storage.removeItem(key);
        return null;
      }
      return parsed.v === version && Array.isArray(parsed.messages) ? parsed.messages : null;
    },
    save: (messages) => {
      const signedIn = DraftStore.identity();
      owner ??= signedIn;
      if (signedIn !== owner) return;
      // Cap before `sanitize`: the window may open between a tool call and its result, which a provider refuses.
      const kept = Transcript.sanitize(messages.slice(-cap)).map(withoutContent);
      storage.setItem(keyOf(owner), JSON.stringify({ v: version, owner, messages: kept }));
    },
    clear: () => {
      storage.removeItem(keyOf(owner ?? DraftStore.identity()));
      owner = null;
    },
  };
};
