import type { Transformer } from "@lexical/markdown";

/** A serialized node as the loss walk sees it — stored JSON, never a live `LexicalNode`. */
export interface EditorNodeLike {
  type?: string;
  children?: readonly EditorNodeLike[];
}

/** What a markdown round-trip would destroy at one node type, and — when it depends — for which nodes. */
export interface EditorLoss {
  label: string;
  /** Absent ⇒ every node of the type is a loss. Present ⇒ only the ones it returns true for. */
  when?: (node: EditorNodeLike) => boolean;
}

export type EditorLosses = Record<string, EditorLoss>;

/**
 * One editor capability, declared once.
 *
 * Three agent-facing lists used to sit beside each other and be kept in step by hand: the transformer
 * array, the labels for what a markdown round-trip destroys, and the syntax sentence in
 * `set<Field>On<Model>`'s description. All three are now derived from a table of these, so giving a
 * feature transformers drops it out of the loss list and into the description in the same edit.
 *
 * Pure on purpose — it holds the `Transformer` *type* and never a transformer. The table itself lives
 * in `markdown.ts`, which reaches `MermaidNode` → `@libs/util/ui` → the util store, and so cannot be
 * imported from a test at all.
 */
export interface EditorFeature {
  /** Serialized node `type`, as `lossyNodesOf` tallies it. Absent for a text format, which is no node of its own. */
  nodeType?: string;
  /** What to call the loss in a sentence. Absent while markdown carries the feature whole. */
  label?: string;
  /** Markdown transformers that carry it in and out. Absent ⇒ a round-trip loses it. */
  transformers?: readonly Transformer[];
  /** Narrows the loss to the nodes it returns true for — a feature markdown carries except in some shape. */
  lossyWhen?: (node: EditorNodeLike) => boolean;
  /** One clause of the syntax cheat-sheet the agent is handed. */
  syntax?: string;
}

/** Flattened in declaration order, which is what settles a tie between two transformers (see `markdown.ts`). */
export const transformersOf = (features: readonly EditorFeature[]): Transformer[] =>
  features.flatMap((feature) => [...(feature.transformers ?? [])]);

/**
 * Node type → what a markdown round-trip would destroy there.
 *
 * A feature with transformers is absent unless it also names a `lossyWhen`, which is the only way a
 * carried feature can still report a loss — the table that markdown carries except when a cell is merged.
 */
export const lossesOf = (features: readonly EditorFeature[]): EditorLosses =>
  Object.fromEntries(
    features.flatMap(({ nodeType, label, transformers, lossyWhen }) =>
      nodeType && label && (!transformers || lossyWhen)
        ? [[nodeType, lossyWhen ? { label, when: lossyWhen } : { label }] as const]
        : [],
    ),
  );

/** The markdown the agent may write, as one comma-joined clause list. */
export const syntaxOf = (features: readonly EditorFeature[]) =>
  features.flatMap((feature) => (feature.transformers && feature.syntax ? [feature.syntax] : [])).join(", ");
