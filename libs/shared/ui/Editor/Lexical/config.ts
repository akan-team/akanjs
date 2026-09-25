import { CodeHighlightNode, CodeNode } from "@lexical/code";
import { HorizontalRuleNode } from "@lexical/extension";
import { AutoLinkNode, LinkNode } from "@lexical/link";
import { ListItemNode, ListNode } from "@lexical/list";
import type { InitialConfigType } from "@lexical/react/LexicalComposer";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { TableCellNode, TableNode, TableRowNode } from "@lexical/table";
import type { Klass, LexicalEditor, LexicalNode } from "lexical";

import { CalloutNode } from "./nodes/CalloutNode";
import { CollapsibleContainerNode, CollapsibleContentNode, CollapsibleTitleNode } from "./nodes/Collapsible";
import { EmbedNode } from "./nodes/EmbedNode";
import { ExcalidrawNode } from "./nodes/ExcalidrawNode";
import { FileNode } from "./nodes/FileNode";
import { ImageNode } from "./nodes/ImageNode";
import { MentionNode } from "./nodes/MentionNode";
import { MermaidNode } from "./nodes/MermaidNode";
import { VideoNode } from "./nodes/VideoNode";
import { isSerializedEditorState } from "./softGuard";
import { akanEditorTheme } from "./theme";

export { isSerializedEditorState } from "./softGuard";

/**
 * Custom node classes registered with every Akan editor instance.
 *
 * Phase 0 registers the standard rich-text node set so serialization round-trips
 * cover headings/lists/quotes/code/links even before their edit UIs land. Phase 3
 * appends the custom decorator/element media nodes (Image, Video, File, Embed,
 * Callout); Phase 3b adds Table, the collapsible/accordion trio, Excalidraw, and
 * Mermaid. This array is the single registration point for the whole editor.
 *
 * `HorizontalRuleNode` comes from `@lexical/extension`, not the deprecated
 * `@lexical/react` subclass; the local `HorizontalRulePlugin` supplies the
 * insert command and click-selection that subclass used to carry.
 *
 * `MentionNode` is registered here rather than injected through `plugins` so that
 * read-only renders — mounted from server components that cannot pass node classes
 * — reconstruct mention chips instead of dropping them.
 */
export const AKAN_EDITOR_NODES: readonly Klass<LexicalNode>[] = [
  HeadingNode,
  QuoteNode,
  ListNode,
  ListItemNode,
  LinkNode,
  AutoLinkNode,
  CodeNode,
  CodeHighlightNode,
  HorizontalRuleNode,
  ImageNode,
  VideoNode,
  FileNode,
  EmbedNode,
  CalloutNode,
  TableNode,
  TableRowNode,
  TableCellNode,
  CollapsibleContainerNode,
  CollapsibleTitleNode,
  CollapsibleContentNode,
  ExcalidrawNode,
  MermaidNode,
  MentionNode,
];

const EDITOR_NAMESPACE = "akan";

export interface CreateEditorConfigOptions {
  /** Whether the editor accepts input. `false` yields a read-only render. */
  editable: boolean;
  /** Persisted content — a Lexical `SerializedEditorState`, or legacy/garbage that fails safe to empty. */
  initialJson?: unknown;
  /** Extra node classes contributed by `plugins` (must be known at creation). */
  extraNodes?: readonly Klass<LexicalNode>[];
  /** Telemetry / error surface. Defaults to `console.error`; never throws (keeps the editor alive). */
  onError?: (error: Error) => void;
}

/**
 * Build the `initialConfig` for `<LexicalComposer>`.
 *
 * - `editorState` is a lazy initializer that parses `initialJson` and falls back
 *   to an empty document on any failure (soft guard).
 * - `onError` logs (and forwards to a caller-supplied handler) but does not
 *   throw, so a single bad node cannot take down the whole editor.
 */
export const createEditorConfig = ({
  editable,
  initialJson,
  extraNodes,
  onError,
}: CreateEditorConfigOptions): InitialConfigType => ({
  namespace: EDITOR_NAMESPACE,
  editable,
  theme: akanEditorTheme,
  nodes: [...AKAN_EDITOR_NODES, ...(extraNodes ?? [])],
  editorState: resolveEditorState(initialJson),
  onError: (error) => {
    // Surface for telemetry but keep the editor mounted (fail-safe philosophy).
    // eslint-disable-next-line no-console
    console.error("[akan-editor]", error);
    onError?.(error);
  },
});

/**
 * Returns a lazy initializer for `initialConfig.editorState`, or `null` (empty
 * document) when `initialJson` is absent or not a valid Lexical state.
 */
const resolveEditorState = (initialJson: unknown): InitialConfigType["editorState"] => {
  if (!isSerializedEditorState(initialJson)) return null;
  return (editor: LexicalEditor) => {
    try {
      editor.setEditorState(editor.parseEditorState(initialJson));
    } catch {
      // Corrupt but root-shaped JSON — leave the editor at its empty default.
    }
  };
};
