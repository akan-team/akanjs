import { akanCodePaths } from "@akanjs/devkit/codeAgent";
import type { ExtensionAPI, InlineExtension, SessionInfo } from "@earendil-works/pi-coding-agent";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { type CodeAgentProfile, codeAgentClip, codeAgentOutputChars } from "akanjs/common";
import { Type } from "typebox";

export interface SessionToolPackOptions {
  workspaceRoot: string;
  cwd: string;
  profile: CodeAgentProfile;
  /** Excluded from results: reading your own transcript back is a way to spend a context window twice. */
  currentSessionId: () => string;
}

const snippetChars = 240;

export class SessionToolPack {
  readonly #options: SessionToolPackOptions;

  constructor(options: SessionToolPackOptions) {
    this.#options = options;
  }

  static readonly toolNames = ["session_search", "session_read"];

  names() {
    return this.#options.profile.session.crossSession ? SessionToolPack.toolNames : [];
  }

  extension(): InlineExtension | undefined {
    if (!this.names().length) return undefined;
    return { name: "akan-sessions", factory: (pi: ExtensionAPI) => this.#register(pi) };
  }

  #register(pi: ExtensionAPI) {
    pi.registerTool({
      name: "session_search",
      label: "Search sessions",
      description:
        "Search earlier coding-agent conversations in this workspace for a phrase, and get back the matching sessions with a snippet. Use it when the user refers to something decided before, or when you suspect this problem has been solved here already.",
      promptSnippet: "session_search: find earlier conversations in this workspace by phrase",
      parameters: Type.Object({
        query: Type.String({ description: "A phrase to look for, matched case-insensitively." }),
        limit: Type.Optional(Type.Number({ description: "How many sessions to return, default 5." })),
      }),
      execute: async (_id, params) => {
        const matches = await this.#search(params.query, params.limit ?? 5);
        return { content: [{ type: "text", text: matches }], details: undefined };
      },
    });
    pi.registerTool({
      name: "session_read",
      label: "Read session",
      description: "Read one earlier conversation, found with session_search, as plain text.",
      promptSnippet: "session_read: read one earlier conversation by id",
      parameters: Type.Object({ sessionId: Type.String() }),
      execute: async (_id, params) => {
        const text = await this.#read(params.sessionId);
        return { content: [{ type: "text", text }], details: undefined, isError: text.startsWith("No session") };
      },
    });
  }

  async #search(query: string, limit: number) {
    const needle = query.toLowerCase();
    const sessions = (await this.#list()).filter(
      (session) =>
        session.id !== this.#options.currentSessionId() && session.allMessagesText.toLowerCase().includes(needle),
    );
    if (!sessions.length) return `No earlier session mentions "${query}".`;
    return sessions
      .slice(0, limit)
      .map((session) => {
        const at = session.allMessagesText.toLowerCase().indexOf(needle);
        const snippet = session.allMessagesText.slice(Math.max(0, at - 80), at + snippetChars).replace(/\s+/g, " ");
        return `- ${session.id} (${session.modified.toISOString().slice(0, 10)}${session.name ? `, "${session.name}"` : ""})\n  …${snippet}…`;
      })
      .join("\n");
  }

  async #read(sessionId: string) {
    const session = (await this.#list()).find((entry) => entry.id === sessionId);
    if (!session) return `No session with id ${sessionId} in this workspace.`;
    return codeAgentClip(session.allMessagesText, codeAgentOutputChars * 2);
  }

  // This workspace's directory only: a global list would reach another checkout's conversations.
  async #list(): Promise<SessionInfo[]> {
    return await SessionManager.list(this.#options.cwd, akanCodePaths.sessionsDir(this.#options.workspaceRoot));
  }
}
