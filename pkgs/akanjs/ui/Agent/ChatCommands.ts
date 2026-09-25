import { AgentSession, type ChatMessage } from "use-agentic";

export interface ChatCommandContext {
  session: AgentSession;
  l: (key: string) => string;
}

export interface ChatCommand {
  name: string;
  /** Accepted but not listed: one row per command, so the menu names each thing once. */
  aliases?: string[];
  description: string;
  run: (context: ChatCommandContext) => void | Promise<void>;
}

/**
 * The chat's own slash commands, the client-side peer of `AgentPrompts`. They join the same `/` menu a prompt
 * endpoint appears in and are dispatched ahead of one: a built-in wins a name collision because the user typed it,
 * and no library's prompt may take `/new` away from them — the mirror image of the tool rule, where a component's
 * own `st.tool` shadows a built-in it means to replace.
 *
 * Output goes through `session.note`, never `send`: a command is answered by this browser, so its text belongs in
 * the transcript the user reads and nowhere in the history the model reads.
 */
export class ChatCommands {
  static list(l: (key: string) => string): ChatCommand[] {
    return [
      {
        name: "new",
        aliases: ["clear"],
        description: l("base.agentCmdNew"),
        run: async ({ session }) => {
          await session.reset();
        },
      },
      {
        name: "retry",
        description: l("base.agentCmdRetry"),
        run: async ({ session, l: t }) => {
          // Told apart because a turn in flight is not an empty transcript, and one message for both would be a lie.
          if (session.isRunning) session.note(t("base.agentBusy"));
          else if (!(await session.retry())) session.note(t("base.agentNothingToRetry"));
        },
      },
      {
        name: "compact",
        description: l("base.agentCmdCompact"),
        run: async ({ session, l: t }) => {
          if (session.isRunning) session.note(t("base.agentBusy"));
          // Keeps nothing verbatim: a user who asks for a summary is asking about the whole conversation, and the
          // turn that follows reads it in place of everything above it.
          else if (await session.compact()) session.note(t("base.agentCompacted"));
          else session.note(t("base.agentNothingToCompact"));
        },
      },
      { name: "copy", description: l("base.agentCmdCopy"), run: (context) => ChatCommands.#copy(context) },
      { name: "help", description: l("base.agentCmdHelp"), run: (context) => ChatCommands.#help(context) },
      { name: "tools", description: l("base.agentCmdTools"), run: (context) => ChatCommands.#tools(context) },
    ];
  }

  static find(name: string, l: (key: string) => string): ChatCommand | null {
    return ChatCommands.list(l).find((command) => command.name === name || command.aliases?.includes(name)) ?? null;
  }

  /** A command is user-typed, so a failure inside one lands in the transcript instead of at the page. */
  static async run(command: ChatCommand, context: ChatCommandContext) {
    try {
      await command.run(context);
    } catch (error) {
      context.session.report(error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * The conversation as markdown. The relay is stateless and the transcript lives only in this browser, so an
   * export is the only way a wrong answer can reach whoever could fix it — which is why the header carries where
   * and when it happened. Local notes are left out: they are this chat talking to itself.
   */
  static transcriptOf(messages: readonly ChatMessage[], where = ""): string {
    const lines = [`# Agent conversation`, [where, new Date().toISOString()].filter(Boolean).join(" · "), ""];
    for (const message of messages) {
      if (message.local) continue;
      // A summary wears the user's role on the wire, and an export that repeated that would read as the user
      // pasting notes they never wrote.
      lines.push(`**${message.summary ? "summary" : message.role}**`);
      if (message.text) lines.push(message.text);
      for (const attachment of message.attachments ?? [])
        lines.push(`- attached \`${attachment.name}\` (${attachment.mimeType})`);
      for (const call of message.toolCalls ?? []) lines.push(`- call \`${call.name}\` ${JSON.stringify(call.args)}`);
      for (const result of message.toolResults ?? [])
        lines.push(
          `- ${result.error ? "error" : "result"} \`${result.name}\` ${result.error ?? JSON.stringify(result.result ?? null)}`,
        );
      if (message.error) lines.push(`- failed: ${message.error}`);
      lines.push("");
    }
    return lines.join("\n").trim();
  }

  static async #copy({ session, l }: ChatCommandContext) {
    const where = typeof location === "undefined" ? "" : location.href;
    try {
      await navigator.clipboard.writeText(ChatCommands.transcriptOf(session.messages, where));
      session.note(l("base.agentCopied"));
    } catch {
      // Clipboard access is denied outside a secure context and in a background tab; the user hears about it.
      session.note(l("base.agentCopyFailed"));
    }
  }

  static #help({ session, l }: ChatCommandContext) {
    const rows = ChatCommands.list(l).map((command) => `- \`/${command.name}\` — ${command.description}`);
    session.note([l("base.agentHelpIntro"), ...rows, "", l("base.agentHelpNote")].join("\n"));
  }

  /**
   * What this screen published, read off the session's own surface — a zone chat therefore lists its zone's view.
   * `askUser` is the session's rather than the surface's, so it is added here the same way the turn adds it.
   */
  static #tools({ session, l }: ChatCommandContext) {
    const { tools, resources } = session.surface.snapshot();
    const published = tools.some((tool) => tool.name === AgentSession.askUserTool.name)
      ? [...tools]
      : [...tools, AgentSession.askUserTool];
    const rows = published
      .sort((a, b) => (a.name < b.name ? -1 : 1))
      .map((tool) => `- \`${tool.name}\`${tool.description ? ` — ${ChatCommands.#sentence(tool.description)}` : ""}`);
    const keys = resources.map((resource) => `\`${resource.name}\``).sort((a, b) => (a < b ? -1 : 1));
    session.note(
      [
        l("base.agentToolsHead"),
        ...rows,
        ...(keys.length ? ["", l("base.agentToolsState"), keys.join(", ")] : []),
      ].join("\n"),
    );
  }

  /** A tool description is written for a model and runs long; the menu row wants its first sentence. */
  static #sentence(text: string) {
    const first = text.split(/(?<=[.!?])\s/)[0].trim();
    return first.length > 120 ? `${first.slice(0, 117)}...` : first;
  }
}
