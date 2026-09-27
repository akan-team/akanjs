import { Rich, RichContent } from "./index_";
import { StaticContent } from "./StaticContent";

export const Editor = {
  Rich,
  RichContent,
  StaticContent,
};

export { ContentHtml } from "./contentHtml.util";
export type { EditorCollab } from "./Lexical/Editor";
export type { EditorFeature, EditorFeatureKey } from "./Lexical/feature";
export { editorFeatureKeys } from "./Lexical/feature";
export { focusEditorPlugin } from "./Lexical/focus";
export { mentionEditorPlugin } from "./Lexical/mention";
export type { MentionCandidate, MentionSource } from "./Lexical/mention.type";
export type { EditorPlugin, EditorSlashGroup, EditorSlashOption } from "./Lexical/plugin";
export { hasEditorContent } from "./Lexical/softGuard";
export { submitEditorPlugin } from "./Lexical/submit";
