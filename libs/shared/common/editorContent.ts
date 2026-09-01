/**
 * Stored rich-text `content` — the envelope of Lexical's `EditorState.toJSON()`.
 *
 * Names the shape without enforcing it: the column stays an opaque `Any`, so rows written before the Lexical
 * cutover still hold a legacy Slate/Yoopta value or the `[]` default. Readers that must survive those go through
 * `extractTextFromContent` / `collectMentions`, which take `unknown` on purpose.
 *
 * The envelope is all that is declarable. Node keys are per type (`tag`, `listType`, `fileId`, `refId`, …) and
 * lexical adds to them across versions; `children` cannot be optional because the framework's schema mapping
 * keeps `?` only on types that include `null` (`PurifiedWithObjectToId`, akanjs/constant/purify.ts).
 */
export interface EditorNode {
  type: string;
  version: number;
}

export interface EditorContent {
  root: EditorNode;
}
