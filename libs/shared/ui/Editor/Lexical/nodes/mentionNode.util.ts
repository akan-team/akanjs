import {
  $applyNodeReplacement,
  $createTextNode,
  $getSelection,
  $isRangeSelection,
  type LexicalNode,
  type NodeKey,
  type SerializedTextNode,
  type Spread,
  type TextNode,
} from "lexical";
import { rememberMention } from "../mentionCache";
import { MentionNode } from "./MentionNode";

export interface MentionPayload {
  /** Which domain model is referenced — `"admin"`, `"user"`, … */
  refName: string;
  refId: string;
  /** Display name without the leading `@`; a snapshot taken when the mention was inserted. */
  label: string;
  href?: string | null;
  /** Avatar snapshot; renders a circular image on the chip when present. */
  imageUrl?: string | null;
  key?: NodeKey;
}

export type SerializedMentionNode = Spread<
  { refName: string; refId: string; label: string; href: string | null; imageUrl: string | null },
  SerializedTextNode
>;

export const $createMentionNode = (payload: MentionPayload): MentionNode => {
  // Every mention the editor builds is recorded, because the markdown token carries no href or avatar
  // and a round-trip would otherwise hand back a chip that no longer links anywhere. See `mentionCache`.
  rememberMention(payload);
  // token mode deletes the chip as one unit; directionless keeps it out of RTL/LTR resolution.
  return $applyNodeReplacement(new MentionNode(payload).setMode("token").toggleDirectionless());
};

export const $isMentionNode = (node: LexicalNode | null | undefined): node is MentionNode =>
  node instanceof MentionNode;

/**
 * Swaps the typeahead's trigger text (`@que` / `/admin`) for a chip and parks the
 * caret after a trailing space, so the next keystroke starts a fresh text node
 * instead of being swallowed by the mention.
 */
export const $insertMention = (payload: MentionPayload, nodeToRemove?: TextNode | null) => {
  const mention = $createMentionNode(payload);
  if (nodeToRemove) nodeToRemove.replace(mention);
  else {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) return;
    selection.insertNodes([mention]);
  }
  const space = $createTextNode(" ");
  mention.insertAfter(space);
  space.select(1, 1);
};
