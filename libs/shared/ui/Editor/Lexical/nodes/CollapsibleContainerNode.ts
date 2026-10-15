import {
  $createParagraphNode,
  $isDecoratorNode,
  $isElementNode,
  type DOMConversionMap,
  type DOMConversionOutput,
  type EditorConfig,
  ElementNode,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
  type ParagraphNode,
} from "lexical";

import {
  $createCollapsibleContainerNode,
  $createCollapsibleContentNode,
  $createCollapsibleTitleNode,
  $isCollapsibleTitleNode,
  containerClass,
  type SerializedCollapsibleContainerNode,
} from "./collapsible.util";

/**
 * A toggle block, after the Lexical playground's collapsible: a `<details>` holding exactly a title and a content
 * block — the shape `CollapsiblePlugin`'s transform repairs. The open state lives on the node and follows the
 * native toggle, so it is saved with the document.
 */
export class CollapsibleContainerNode extends ElementNode {
  __open: boolean;

  static override getType(): string {
    return "akan-collapsible";
  }

  static override clone(node: CollapsibleContainerNode): CollapsibleContainerNode {
    return new CollapsibleContainerNode(node.__open, node.__key);
  }

  static override importJSON(serialized: SerializedCollapsibleContainerNode): CollapsibleContainerNode {
    return $createCollapsibleContainerNode(serialized.open).updateFromJSON(serialized);
  }

  static override importDOM(): DOMConversionMap {
    return { details: () => ({ conversion: CollapsibleContainerNode.#fromDetails, priority: 1 }) };
  }

  // A web page's `<details>` keeps its body beside the `<summary>`, not inside a content block of its own.
  static #fromDetails(dom: HTMLElement): DOMConversionOutput {
    return {
      node: $createCollapsibleContainerNode((dom as HTMLDetailsElement).open),
      after: (children: LexicalNode[]) => {
        const title = children.find($isCollapsibleTitleNode) ?? $createCollapsibleTitleNode();
        const content = $createCollapsibleContentNode();
        let line: ParagraphNode | null = null;
        for (const child of children) {
          if (child === title) continue;
          if (($isElementNode(child) || $isDecoratorNode(child)) && !child.isInline()) {
            content.append(child);
            line = null;
            continue;
          }
          if (!line) {
            line = $createParagraphNode();
            content.append(line);
          }
          line.append(child);
        }
        if (!content.getChildrenSize()) content.append($createParagraphNode());
        return [title, content];
      },
    };
  }

  constructor(open = false, key?: NodeKey) {
    super(key);
    this.__open = open;
  }

  override exportJSON(): SerializedCollapsibleContainerNode {
    return { ...super.exportJSON(), type: "akan-collapsible", version: 1, open: this.__open };
  }

  override createDOM(_config: EditorConfig, editor: LexicalEditor): HTMLElement {
    const dom = document.createElement("details");
    dom.className = containerClass;
    dom.open = this.__open;
    // The native toggle updates the DOM first; mirror it into the model so the open state persists (edit mode only).
    dom.addEventListener("toggle", () => {
      if (!editor.isEditable()) return;
      const open = editor.getEditorState().read(() => this.getOpen());
      if (open !== dom.open) editor.update(() => (this.getWritable().__open = dom.open));
    });
    return dom;
  }

  override updateDOM(prevNode: CollapsibleContainerNode, dom: HTMLDetailsElement): boolean {
    if (prevNode.__open !== this.__open) dom.open = this.__open;
    return false;
  }

  setOpen(open: boolean): void {
    this.getWritable().__open = open;
  }

  getOpen(): boolean {
    return this.getLatest().__open;
  }

  toggleOpen(): void {
    this.setOpen(!this.getOpen());
  }

  override canBeEmpty(): boolean {
    return false;
  }

  override canIndent(): boolean {
    return false;
  }
}
