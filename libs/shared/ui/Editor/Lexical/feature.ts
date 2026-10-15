import type { Transformer } from "@lexical/markdown";
import type { RichNodeLike } from "@libs/shared/common";

/** A serialized node as the label walk sees it — stored JSON, never a live `LexicalNode`. */
export type EditorNodeLike = RichNodeLike;

/** Node type → what to call one of those nodes in a sentence. */
export interface EditorNodeLabels {
  [nodeType: string]: string;
}

/**
 * The vocabulary of the editor's `features` prop — every capability a field can be given or denied.
 *
 * One key per built-in feature, so switching a capability off takes it out of the markdown
 * shortcuts, the slash menu, the floating toolbar, the plugin that implements it, what an agent's write
 * may put there, and the agent's syntax sentence in one word. A feature contributed through `plugins`
 * carries no key: passing the plugin is already the opt-in.
 */
export const editorFeatureKeys = [
  "heading",
  "quote",
  "list",
  "code",
  "divider",
  "table",
  "callout",
  "collapsible",
  "image",
  "video",
  "file",
  "embed",
  "mermaid",
  "excalidraw",
  "emphasis",
  "strikethrough",
  "inlineCode",
  "highlight",
  "underline",
  "link",
  "mention",
] as const;

export type EditorFeatureKey = (typeof editorFeatureKeys)[number];

/**
 * One editor capability, declared once: the typing shortcuts, the agent's syntax clause and the word the
 * agent's overwrite guard counts it by are all read off a table of these.
 *
 * Pure on purpose — it holds the `Transformer` *type* and never a transformer. The table itself lives
 * in `markdown.ts`, which reaches `MermaidNode` → `@libs/util/ui` → the util store, and so cannot be
 * imported from a test at all.
 */
export interface EditorFeature {
  /** The word the `features` prop switches this on by. Absent on a plugin's own feature, which is on whenever its plugin is. */
  key?: EditorFeatureKey;
  /** Serialized node `type`. Absent for a text format, which is no node of its own. */
  nodeType?: string;
  /** What to call one such node in a sentence, for a node that means something with no text of its own. */
  label?: string;
  /** The markdown shortcuts a person types it with. */
  transformers?: readonly Transformer[];
  /** One clause of the markdown dialect (`RichMarkdownReader`) the agent is told it may write. */
  syntax?: string;
  /** Carries no formatting of its own, so a field offering nothing else is still a plain textarea. See {@link isPlainOnly}. */
  plain?: boolean;
}

/**
 * The features `keys` names, in table order — `undefined` being every one of them, the editor's default.
 *
 * Order survives the filter, which the two ties documented in `markdown.ts` depend on: a subset that
 * keeps both MERMAID and CODE, or both MENTION and LINK, keeps them in the order that settles them.
 */
export const featuresOf = (
  features: readonly EditorFeature[],
  keys: readonly EditorFeatureKey[] | undefined,
): readonly EditorFeature[] =>
  keys ? features.filter((feature) => feature.key && keys.includes(feature.key)) : features;

/**
 * True when nothing enabled can make the document richer than text.
 *
 * Such a field is a textarea, and pasting into it should be one too: HTML off a web page would
 * otherwise arrive as headings and tables the field has no way to produce, edit, or show a control for.
 */
export const isPlainOnly = (features: readonly EditorFeature[]) => features.every((feature) => feature.plain);

/** Flattened in declaration order, which is what settles a tie between two transformers (see `markdown.ts`). */
export const transformersOf = (features: readonly EditorFeature[]): Transformer[] =>
  features.flatMap((feature) => [...(feature.transformers ?? [])]);

/** The nodes worth naming when an agent is about to overwrite them — later features win a shared node type. */
export const nodeLabelsOf = (features: readonly EditorFeature[]): EditorNodeLabels =>
  Object.fromEntries(
    features.flatMap(({ nodeType, label }) => (nodeType && label ? [[nodeType, label] as const] : [])),
  );

/** The markdown the agent may write, as one comma-joined clause list. */
export const syntaxOf = (features: readonly EditorFeature[]) =>
  features.flatMap((feature) => (feature.syntax ? [feature.syntax] : [])).join(", ");
