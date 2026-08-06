import type { Klass, LexicalEditor, LexicalNode } from "lexical";
import type { ReactNode } from "react";

/** Slash-menu section a plugin option is filed under (mirrors the built-in groups). */
export type EditorSlashGroup = "text" | "list" | "media" | "structure";

/** A slash-menu entry contributed by an {@link EditorPlugin}. */
export interface EditorSlashOption {
  /** Stable identity for the menu row. */
  key: string;
  label: string;
  description: string;
  /** Defaults to `"structure"` when omitted. */
  group?: EditorSlashGroup;
  /** Widen search matching beyond the label. */
  keywords?: string[];
  run: (editor: LexicalEditor) => void;
}

/**
 * An external extension to the Akan editor, supplied through the `plugins` prop.
 *
 * It lets a consuming lib/app contribute custom nodes, slash-menu entries, and
 * plugin components **without** the shared editor depending on that lib (the
 * dependency points the other way). The PageBlock nested-page node is the sole
 * user today: `social` defines the node/renderer and injects it here.
 *
 * - `nodes` — registered at editor creation. Lexical requires node classes up
 *   front, so these are read **once at mount**; changing them later is ignored.
 * - `slashOptions` — merged into the slash menu's option set.
 * - `render` — returns extra plugin components rendered inside `<LexicalComposer>`
 *   (e.g. a mutation listener for cleanup on node deletion). May freely use
 *   `useLexicalComposerContext` and the host lib's own hooks/stores.
 */
export interface EditorPlugin {
  nodes?: readonly Klass<LexicalNode>[];
  slashOptions?: readonly EditorSlashOption[];
  render?: () => ReactNode;
}

/** Flatten every plugin's node classes for `createEditorConfig`. */
export const collectPluginNodes = (plugins: readonly EditorPlugin[] | undefined): Klass<LexicalNode>[] =>
  (plugins ?? []).flatMap((plugin) => [...(plugin.nodes ?? [])]);

/** Flatten every plugin's slash-menu options for `SlashMenuPlugin`. */
export const collectPluginSlashOptions = (plugins: readonly EditorPlugin[] | undefined): EditorSlashOption[] =>
  (plugins ?? []).flatMap((plugin) => [...(plugin.slashOptions ?? [])]);
