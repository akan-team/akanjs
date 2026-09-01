import type { Klass, LexicalEditor, LexicalNode } from "lexical";
import type { ReactNode } from "react";

import type { EditorFeature } from "./feature";
import type { MentionSource } from "./mention.type";

/** Slash-menu section a plugin option is filed under (mirrors the built-in groups). */
export type EditorSlashGroup = "text" | "list" | "media" | "structure" | "reference";

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
 * - `features` — what markdown can and cannot carry about those nodes. Without an
 *   entry a plugin node is invisible to the agent's overwrite guard, which would
 *   then let a whole-field markdown write destroy it without saying so.
 * - `slashOptions` — merged into the slash menu's option set.
 * - `mentionSources` — mentionable domain models for the `@` menu. Unlike `nodes`
 *   these are re-read on every render, because `MentionNode` is registered with
 *   the editor itself and only the search behavior arrives here.
 * - `render` — returns extra plugin components rendered inside `<LexicalComposer>`
 *   (e.g. a mutation listener for cleanup on node deletion). May freely use
 *   `useLexicalComposerContext` and the host lib's own hooks/stores.
 */
export interface EditorPlugin {
  nodes?: readonly Klass<LexicalNode>[];
  features?: readonly EditorFeature[];
  slashOptions?: readonly EditorSlashOption[];
  mentionSources?: readonly MentionSource[];
  render?: () => ReactNode;
}

/** Flatten every plugin's node classes for `createEditorConfig`. */
export const collectPluginNodes = (plugins: readonly EditorPlugin[] | undefined): Klass<LexicalNode>[] =>
  (plugins ?? []).flatMap((plugin) => [...(plugin.nodes ?? [])]);

/** Flatten every plugin's markdown capabilities for the agent's loss guard and syntax list. */
export const collectPluginFeatures = (plugins: readonly EditorPlugin[] | undefined): EditorFeature[] =>
  (plugins ?? []).flatMap((plugin) => [...(plugin.features ?? [])]);

/** Flatten every plugin's slash-menu options for `SlashMenuPlugin`. */
export const collectPluginSlashOptions = (plugins: readonly EditorPlugin[] | undefined): EditorSlashOption[] =>
  (plugins ?? []).flatMap((plugin) => [...(plugin.slashOptions ?? [])]);

/** Flatten every plugin's mentionable models for `MentionPlugin`. */
export const collectPluginMentionSources = (plugins: readonly EditorPlugin[] | undefined): MentionSource[] =>
  (plugins ?? []).flatMap((plugin) => [...(plugin.mentionSources ?? [])]);
