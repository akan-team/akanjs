import { RichUrl } from "@libs/shared/common";
import { resolveServerUrl } from "akanjs/client";
import { type EditorConfig, type LexicalEditor, TextNode } from "lexical";

import { mentionChip, mentionChipAvatar, mentionChipLink } from "../theme";
import { $createMentionNode, type MentionPayload, type SerializedMentionNode } from "./mentionNode.util";

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
  static readonly #chipClasses = mentionChip.split(" ");
  static readonly #linkClasses = mentionChipLink.split(" ");
  static readonly #avatarClasses = mentionChipAvatar.split(" ");

  // XXX: the url() below is interpolated into a style property — anything that could
  // close the quoted url and append further declarations must never reach it.
  static #cssSafeUrl(url: string | null) {
    return url && !/["'()\\\s]/.test(url) ? url : null;
  }

  static #applyChip(dom: HTMLElement, node: MentionNode) {
    dom.classList.add(...MentionNode.#chipClasses);
    dom.dataset.mentionRef = node.__refName;
    dom.dataset.mentionId = node.__refId;
    // Only a path on this site: the chip navigates with `router.push`, and a stored url is anyone's to write.
    const href = RichUrl.internalPath(node.__href);
    if (href) {
      dom.dataset.mentionHref = href;
      dom.classList.add(...MentionNode.#linkClasses);
    } else {
      delete dom.dataset.mentionHref;
      dom.classList.remove(...MentionNode.#linkClasses);
    }
    const avatarUrl = MentionNode.#cssSafeUrl(node.__imageUrl ? resolveServerUrl(node.__imageUrl) : null);
    if (avatarUrl) {
      dom.style.setProperty("--mention-avatar", `url("${avatarUrl}")`);
      dom.classList.add(...MentionNode.#avatarClasses);
    } else {
      dom.style.removeProperty("--mention-avatar");
      dom.classList.remove(...MentionNode.#avatarClasses);
    }
  }

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

  constructor(payload: MentionPayload = { refName: "", refId: "", label: "" }, text?: string, key?: string) {
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
    MentionNode.#applyChip(dom, this);
    return dom;
  }

  override updateDOM(prevNode: this, dom: HTMLElement, config: EditorConfig): boolean {
    if (super.updateDOM(prevNode, dom, config)) return true;
    MentionNode.#applyChip(dom, this);
    return false;
  }

  override canInsertTextBefore(): boolean {
    return false;
  }

  override canInsertTextAfter(): boolean {
    return false;
  }
}
