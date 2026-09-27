import { RichEditor } from "@libs/shared/common";
import type { SerializedEditorState } from "lexical";

/**
 * Type guard: is `value` a Lexical `SerializedEditorState`?
 *
 * Legacy Yoopta/Slate content is a `Record<blockId, block>` with no `root`, so
 * this cleanly rejects it. Combined with the try/catch in `resolveEditorState`
 * (config.ts), it is the **soft guard** that lets any non-Lexical `value` fail
 * safe to an empty document instead of crashing the editor — see
 * editor.abstract.md.
 *
 * Kept in its own module (no `@lexical/*` imports) so it can be unit-tested
 * without loading the sibling node packages, whose dev ESM builds trip bun's
 * module loader. See [[akan-lexical-editor-bun-test]].
 */
export const isSerializedEditorState = (value: unknown): value is SerializedEditorState => {
  if (!value || typeof value !== "object") return false;
  const root = (value as { root?: unknown }).root;
  if (!root || typeof root !== "object") return false;
  return (root as { type?: unknown }).type === "root";
};

/**
 * Any stored value as a document the editor can mount, or null when there is nothing to show.
 *
 * A rich field is an `Any` column, so a writer that never went through the editor — an agent's MCP body, a
 * legacy import, a hand-written fixture — puts plain text or a legacy block map where a Lexical tree
 * belongs. The soft guard alone drops those silently: the reader gets an empty box and the next save
 * overwrites the text with an empty document. Reading their text back out is what keeps a malformed write
 * visible and recoverable.
 */
export const toSerializedEditorState = (value: unknown): SerializedEditorState | null => {
  if (isSerializedEditorState(value)) return value;
  const text = typeof value === "string" ? value : RichEditor.extractTextFromContent(value);
  return text.trim() ? (RichEditor.contentFromText(text) as unknown as SerializedEditorState) : null;
};

/** Whether `value` has anything to render — `[]`, `null` and an empty document are all nothing. */
export const hasEditorContent = (value: unknown) => {
  const children = toSerializedEditorState(value)?.root.children;
  return Array.isArray(children) && children.length > 0;
};
