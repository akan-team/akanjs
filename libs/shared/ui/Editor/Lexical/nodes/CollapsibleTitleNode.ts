import {
  $createParagraphNode,
  $isElementNode,
  type DOMConversionMap,
  ElementNode,
  type RangeSelection,
  type SerializedElementNode,
} from "lexical";

import {
  $createCollapsibleTitleNode,
  $isCollapsibleContainerNode,
  $isCollapsibleContentNode,
  titleClass,
} from "./collapsible.util";

export class CollapsibleTitleNode extends ElementNode {
  static override getType(): string {
    return "akan-collapsible-title";
  }

  static override clone(node: CollapsibleTitleNode): CollapsibleTitleNode {
    return new CollapsibleTitleNode(node.__key);
  }

  static override importJSON(serialized: SerializedElementNode): CollapsibleTitleNode {
    return $createCollapsibleTitleNode().updateFromJSON(serialized);
  }

  static override importDOM(): DOMConversionMap {
    return { summary: () => ({ conversion: () => ({ node: $createCollapsibleTitleNode() }), priority: 1 }) };
  }

  override exportJSON(): SerializedElementNode {
    return { ...super.exportJSON(), type: "akan-collapsible-title", version: 1 };
  }

  override createDOM(): HTMLElement {
    const dom = document.createElement("summary");
    dom.className = titleClass;
    return dom;
  }

  override updateDOM(): false {
    return false;
  }

  /** Enter in the title drops the caret into the content's first block. */
  override insertNewAfter(_selection: RangeSelection, _restoreSelection?: boolean): null {
    const container = this.getParentOrThrow();
    if (!$isCollapsibleContainerNode(container)) return null;
    container.setOpen(true);
    const content = container.getLastChild();
    if (!$isCollapsibleContentNode(content)) return null;
    const firstChild = content.getFirstChild();
    if ($isElementNode(firstChild)) {
      firstChild.selectStart();
    } else {
      const paragraph = $createParagraphNode();
      content.append(paragraph);
      paragraph.selectStart();
    }
    return null;
  }

  override canBeEmpty(): boolean {
    return true;
  }

  override canIndent(): boolean {
    return false;
  }
}
