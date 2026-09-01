/**
 * Builds stored editor `content` from plain text — the inverse of `extractTextFromContent`.
 *
 * The shape is Lexical's own `EditorState.toJSON()` output for a document of paragraphs, field for
 * field: `parseEditorState` rejects a node missing `version`, and `isSerializedEditorState` rejects
 * anything that is not `{ root: { children } }`, so none of these keys is decorative.
 *
 * Exists so a caller holding only a string — an agent tool, an import, a migration — can write a
 * field that `Editor.Rich` and `Editor.Content` will render.
 */
export const contentFromText = (text: string) => ({
  root: {
    children: text.split("\n").map((line) => ({
      children: line ? [{ detail: 0, format: 0, mode: "normal", style: "", text: line, type: "text", version: 1 }] : [],
      direction: null,
      format: "",
      indent: 0,
      type: "paragraph",
      version: 1,
      textFormat: 0,
      textStyle: "",
    })),
    direction: null,
    format: "",
    indent: 0,
    type: "root",
    version: 1,
  },
});
