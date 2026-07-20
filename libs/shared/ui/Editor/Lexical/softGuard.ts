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
