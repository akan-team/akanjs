import { ElementNode, type SerializedElementNode } from "lexical";

import { $createCollapsibleContentNode, contentClass } from "./collapsible.util";

export class CollapsibleContentNode extends ElementNode {
  static override getType(): string {
    return "akan-collapsible-content";
  }

  static override clone(node: CollapsibleContentNode): CollapsibleContentNode {
    return new CollapsibleContentNode(node.__key);
  }

  static override importJSON(serialized: SerializedElementNode): CollapsibleContentNode {
    return $createCollapsibleContentNode().updateFromJSON(serialized);
  }

  override exportJSON(): SerializedElementNode {
    return { ...super.exportJSON(), type: "akan-collapsible-content", version: 1 };
  }

  override createDOM(): HTMLElement {
    const dom = document.createElement("div");
    dom.className = contentClass;
    return dom;
  }

  override updateDOM(): false {
    return false;
  }

  override canBeEmpty(): boolean {
    return true;
  }

  override canIndent(): boolean {
    return false;
  }
}
