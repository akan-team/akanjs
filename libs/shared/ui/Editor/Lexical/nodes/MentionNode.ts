import { type EditorConfig, type LexicalEditor, TextNode } from "lexical";

import { MENTION_CHIP, MENTION_CHIP_AVATAR } from "../theme";
import { $createMentionNode, type MentionPayload, type SerializedMentionNode } from "./mentionNode.util";

const MENTION_CHIP_CLASSES = MENTION_CHIP.split(" ");
const MENTION_CHIP_AVATAR_CLASSES = MENTION_CHIP_AVATAR.split(" ");

// XXX: the url() below is interpolated into a style property — anything that could
// close the quoted url and append further declarations must never reach it.
const cssSafeUrl = (url: string | null) => (url && !/["'()\\\s]/.test(url) ? url : null);

const applyChip = (dom: HTMLElement, node: MentionNode) => {
  dom.classList.add(...MENTION_CHIP_CLASSES);
  dom.dataset.mentionRef = node.__refName;
  dom.dataset.mentionId = node.__refId;
  if (node.__href) dom.dataset.mentionHref = node.__href;
  else delete dom.dataset.mentionHref;
  const avatarUrl = cssSafeUrl(node.__imageUrl);
  if (avatarUrl) {
    dom.style.setProperty("--mention-avatar", `url("${avatarUrl}")`);
    dom.classList.add(...MENTION_CHIP_AVATAR_CLASSES);
  } else {
    dom.style.removeProperty("--mention-avatar");
    dom.classList.remove(...MENTION_CHIP_AVATAR_CLASSES);
  }
};

/**
 * An inline reference to a domain model, rendered as the label (avatar + name).
 *
 * A `TextNode` rather than a `DecoratorNode` on purpose: `createDOM` alone paints
 * the chip, so read-only content renders it with no plugin wiring — which is the
 * only option for `Editor.RichContent`, mounted from server components that cannot
 * pass node classes. For the same reason the node stores nothing but strings: the
 * lib that inserted the mention resolved the label/href once, and the node never
 * looks anything up again.
 *
 * The element stays a `<span>` (the tag comes from `TextNode.__format`); navigation
 * runs off `data-mention-href` in `MentionLinkPlugin`.
 */
export class MentionNode extends TextNode {
  __refName: string;
  __refId: string;
  __label: string;
  __href: string | null;
  __imageUrl: string | null;

  static override getType(): string {
    return "akan-mention";
  }

  static override clone(node: MentionNode): MentionNode {
    return new MentionNode(
      {
        refName: node.__refName,
        refId: node.__refId,
        label: node.__label,
        href: node.__href,
        imageUrl: node.__imageUrl,
      },
      node.__text,
      node.__key,
    );
  }

  static override importJSON(serialized: SerializedMentionNode): MentionNode {
    return $createMentionNode(serialized).updateFromJSON({ ...serialized, text: serialized.label });
  }

  constructor(payload: MentionPayload, text?: string, key?: string) {
    super(text ?? payload.label, key);
    this.__refName = payload.refName;
    this.__refId = payload.refId;
    this.__label = payload.label;
    this.__href = payload.href ?? null;
    this.__imageUrl = payload.imageUrl ?? null;
  }

  /** The strings the chip was built from — what a markdown export writes and a re-import restores. */
  getPayload(): MentionPayload {
    const self = this.getLatest();
    return {
      refName: self.__refName,
      refId: self.__refId,
      label: self.__label,
      href: self.__href,
      imageUrl: self.__imageUrl,
    };
  }

  override exportJSON(): SerializedMentionNode {
    return {
      ...super.exportJSON(),
      type: "akan-mention",
      version: 1,
      refName: this.__refName,
      refId: this.__refId,
      label: this.__label,
      href: this.__href,
      imageUrl: this.__imageUrl,
    };
  }

  override createDOM(config: EditorConfig, editor?: LexicalEditor): HTMLElement {
    const dom = super.createDOM(config, editor);
    applyChip(dom, this);
    return dom;
  }

  override updateDOM(prevNode: this, dom: HTMLElement, config: EditorConfig): boolean {
    if (super.updateDOM(prevNode, dom, config)) return true;
    applyChip(dom, this);
    return false;
  }

  override canInsertTextBefore(): boolean {
    return false;
  }

  override canInsertTextAfter(): boolean {
    return false;
  }
}
