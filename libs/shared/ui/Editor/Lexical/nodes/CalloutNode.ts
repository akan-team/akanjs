import { $createParagraphNode, ElementNode, type LexicalNode, type RangeSelection } from "lexical";

import { CALLOUT_VARIANTS, type CalloutVariant } from "../theme";
import { $createCalloutNode, type SerializedCalloutNode } from "./calloutNode.util";

/**
 * A callout: a block container of editable text with a colored variant skin
 * (default/info/success/warning/error). Unlike the media nodes it is an
 * `ElementNode` (its children are real, editable Lexical nodes), so its variant
 * is reflected purely through the DOM class in `createDOM`/`updateDOM`; the
 * variant switcher lives in `CalloutPlugin`.
 */
export class CalloutNode extends ElementNode {
  __variant: CalloutVariant;

  static override getType(): string {
    return "akan-callout";
  }

  static override clone(node: CalloutNode): CalloutNode {
    return new CalloutNode(node.__variant, node.__key);
  }

  static override importJSON(serialized: SerializedCalloutNode): CalloutNode {
    const node = $createCalloutNode(serialized.variant);
    node.setFormat(serialized.format);
    node.setIndent(serialized.indent);
    node.setDirection(serialized.direction);
    return node;
  }

  constructor(variant: CalloutVariant = "info", key?: string) {
    super(key);
    this.__variant = variant;
  }

  override exportJSON(): SerializedCalloutNode {
    return { ...super.exportJSON(), type: "akan-callout", version: 1, variant: this.__variant };
  }

  override createDOM(): HTMLElement {
    const div = document.createElement("div");
    div.className = CALLOUT_VARIANTS[this.__variant];
    return div;
  }

  override updateDOM(prevNode: CalloutNode, dom: HTMLElement): boolean {
    if (prevNode.__variant !== this.__variant) dom.className = CALLOUT_VARIANTS[this.__variant];
    return false;
  }

  /** Enter at the end exits the callout into a fresh paragraph below (like a quote). */
  override insertNewAfter(_selection: RangeSelection, restoreSelection?: boolean): LexicalNode {
    const paragraph = $createParagraphNode();
    const direction = this.getDirection();
    paragraph.setDirection(direction);
    this.insertAfter(paragraph, restoreSelection);
    return paragraph;
  }

  /** Backspace at the start unwraps the callout to a paragraph. */
  override collapseAtStart(): boolean {
    const paragraph = $createParagraphNode();
    for (const child of this.getChildren()) paragraph.append(child);
    this.replace(paragraph);
    return true;
  }

  override canBeEmpty(): boolean {
    return true;
  }

  override canIndent(): boolean {
    return false;
  }

  setVariant(variant: CalloutVariant): void {
    this.getWritable().__variant = variant;
  }

  getVariant(): CalloutVariant {
    return this.getLatest().__variant;
  }
}
