"use client";
import type { AgentPrompt, AgentPrompts } from "akanjs/store";
import { useState } from "react";
import { type ChatCommand, ChatCommands } from "./ChatCommands";
import type { MenuRow } from "./Menu";

interface SlashMenuSetup {
  draft: string;
  prompts: AgentPrompts | null;
  l: (key: string) => string;
  onCommand: (command: ChatCommand) => void;
  onPrompt: (prompt: AgentPrompt) => void;
}

/** Only a bare `/name` opens the menu: once an argument is being typed, the list has nothing left to offer. */
const slashQuery = /^\/[A-Za-z0-9_-]*$/;

/**
 * The `/` menu's rows and which one the keys are on. Built from this chat's own commands first and the app's
 * `prompt()` endpoints after, with a prompt whose name a built-in already holds dropped rather than listed twice.
 */
export const useSlashMenu = ({ draft, prompts, l, onCommand, onPrompt }: SlashMenuSetup) => {
  const [cursor, setCursor] = useState(0);
  const [hidden, setHidden] = useState(false);
  const query = !hidden && slashQuery.test(draft) ? draft : "";
  const rows: MenuRow[] = query
    ? [
        ...ChatCommands.list(l)
          .filter((command) => `/${command.name}`.startsWith(query))
          .map((command) => ({
            name: command.name,
            description: command.description,
            pick: () => onCommand(command),
          })),
        ...(prompts?.list() ?? [])
          .filter((prompt) => `/${prompt.name}`.startsWith(query) && !ChatCommands.find(prompt.name, l))
          .map((prompt) => ({
            name: prompt.name,
            description: prompt.description,
            hint: prompt.args.map((arg) => `<${arg.name}>`).join(" "),
            pick: () => onPrompt(prompt),
          })),
      ]
    : [];
  const selected = Math.min(cursor, Math.max(rows.length - 1, 0));
  return {
    rows,
    selected,
    /** Reset when the draft is written to: a new query has a new first row, and Escape only hides the old one. */
    reopen: () => {
      setHidden(false);
      setCursor(0);
    },
    hide: () => setHidden(true),
    move: (delta: number) => setCursor(Math.max(0, Math.min(selected + delta, rows.length - 1))),
    at: () => rows[selected],
  };
};
