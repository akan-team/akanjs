import { createCommand, type LexicalCommand } from "lexical";

/** Inserts an open accordion (title + one empty body paragraph) at the caret. */
export const INSERT_COLLAPSIBLE_COMMAND: LexicalCommand<void> = createCommand("INSERT_COLLAPSIBLE_COMMAND");
