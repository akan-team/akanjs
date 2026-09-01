import { getEnv } from "akanjs/base";
import { type ChatMessage, type SessionHistory, Transcript } from "use-agentic";

export type PersistOption = boolean | { storage?: "session" | "local"; key?: string };

/**
 * Attachment content never reaches storage. Web storage is a few megabytes per origin, one screenshot fills a
 * chunk of it, and `AgentSession` swallows a failed save — so persisting the bytes would quietly stop persisting
 * the transcript itself. The name and type stay so a restored conversation still reads as what happened, and a
 * `url` stays because a pointer is not content; the server then tells the model the content is gone rather than
 * letting it answer from the filename.
 */
const withoutContent = (message: ChatMessage): ChatMessage =>
  message.attachments?.length
    ? {
        ...message,
        attachments: message.attachments.map(({ name, mimeType, url }) => ({
          name,
          mimeType,
          ...(url ? { url } : {}),
        })),
      }
    : message;

/**
 * Maps the `persist` prop onto a `SessionHistory` over web storage. Session storage is the default on purpose:
 * surviving a refresh is the whole ask, and a transcript that dies with the tab never lingers on a shared machine
 * or collides across tabs. `"local"` is the explicit opt-up. The envelope is versioned so a wire change discards
 * stale transcripts instead of replaying them, and only the newest messages are kept under the cap — which is
 * why the cap is applied *before* the pairing repair: the window it keeps can start between a tool call and the
 * result answering it, and a transcript restored in that state is refused by the provider on its first turn.
 */
export const sessionHistoryOf = (
  persist: PersistOption | SessionHistory | undefined,
  pathKey = "",
): SessionHistory | undefined => {
  if (!persist) return undefined;
  // A host that brought its own store is handed straight back: `load` is what only a `SessionHistory` has, and the
  // web-storage branch below is exactly the thing such a host is replacing, window or no window.
  if (typeof persist === "object" && typeof (persist as SessionHistory).load === "function")
    return persist as SessionHistory;
  if (typeof window === "undefined") return undefined;
  const option = persist === true ? {} : (persist as Exclude<PersistOption, boolean>);
  const storage = option.storage === "local" ? window.localStorage : window.sessionStorage;
  const key = option.key ?? `akan.agent.${getEnv().appName}${pathKey ? `.${pathKey}` : ""}`;
  const version = 1;
  const cap = 50;
  return {
    load: () => {
      const raw = storage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { v?: number; messages?: ChatMessage[] };
      return parsed.v === version && Array.isArray(parsed.messages) ? parsed.messages : null;
    },
    save: (messages) => {
      const kept = Transcript.sanitize(messages.slice(-cap)).map(withoutContent);
      storage.setItem(key, JSON.stringify({ v: version, messages: kept }));
    },
    clear: () => {
      storage.removeItem(key);
    },
  };
};
