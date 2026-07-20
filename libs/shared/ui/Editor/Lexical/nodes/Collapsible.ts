import {
  $createParagraphNode,
  $isElementNode,
  type EditorConfig,
  ElementNode,
  type LexicalEditor,
  type NodeKey,
  type RangeSelection,
  type SerializedElementNode,
} from "lexical";
import {
  $createCollapsibleContainerNode,
  $createCollapsibleContentNode,
  $createCollapsibleTitleNode,
  $isCollapsibleContainerNode,
  $isCollapsibleContentNode,
  CONTAINER_CLASS,
  CONTENT_CLASS,
  type SerializedCollapsibleContainerNode,
  TITLE_CLASS,
} from "./collapsible.util";

/**
 * Accordion / toggle blocks, ported from the Lexical playground collapsible
 * plugin and adapted to Akan conventions (Tailwind/daisyUI classes applied
 * directly in `createDOM`, no global CSS).
 *
 * A collapsible is a container of exactly two children:
 *   `CollapsibleContainerNode` (`<details>`)
 *     ├─ `CollapsibleTitleNode`   (`<summary>` — editable heading text)
 *     └─ `CollapsibleContentNode` (`<div>`     — editable body blocks)
 *
 * Open/closed state lives on the container (`__open`) and round-trips through
 * serialization; the native `<details>` toggle syncs it back into the model via
 * a listener wired in `createDOM`. Structure integrity (always [title, content])
 * is enforced by a transform in `CollapsiblePlugin`.
 */

// ── Container ──────────────────────────────────────────────────────────────

export class CollapsibleContainerNode extends ElementNode {
  __open: boolean;

  static override getType(): string {
    return "akan-collapsible";
  }

  static override clone(node: CollapsibleContainerNode): CollapsibleContainerNode {
    return new CollapsibleContainerNode(node.__open, node.__key);
  }

  static override importJSON(serialized: SerializedCollapsibleContainerNode): CollapsibleContainerNode {
    return $createCollapsibleContainerNode(serialized.open);
  }

  constructor(open: boolean, key?: NodeKey) {
    super(key);
    this.__open = open;
  }

  override exportJSON(): SerializedCollapsibleContainerNode {
    return { ...super.exportJSON(), type: "akan-collapsible", version: 1, open: this.__open };
  }

  override createDOM(_config: EditorConfig, editor: LexicalEditor): HTMLElement {
    const dom = document.createElement("details");
    dom.className = CONTAINER_CLASS;
    dom.open = this.__open;
    // The native <details> toggle updates the DOM directly; mirror that back into
    // the model so the open state persists (edit mode only).
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

// ── Title ──────────────────────────────────────────────────────────────────

export class CollapsibleTitleNode extends ElementNode {
  static override getType(): string {
    return "akan-collapsible-title";
  }

  static override clone(node: CollapsibleTitleNode): CollapsibleTitleNode {
    return new CollapsibleTitleNode(node.__key);
  }

  static override importJSON(): CollapsibleTitleNode {
    return $createCollapsibleTitleNode();
  }

  override exportJSON(): SerializedElementNode {
    return { ...super.exportJSON(), type: "akan-collapsible-title", version: 1 };
  }

  override createDOM(): HTMLElement {
    const dom = document.createElement("summary");
    dom.className = TITLE_CLASS;
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

// ── Content ──────────────────────────────────────────────────────────────────

export class CollapsibleContentNode extends ElementNode {
  static override getType(): string {
    return "akan-collapsible-content";
  }

  static override clone(node: CollapsibleContentNode): CollapsibleContentNode {
    return new CollapsibleContentNode(node.__key);
  }

  static override importJSON(): CollapsibleContentNode {
    return $createCollapsibleContentNode();
  }

  override exportJSON(): SerializedElementNode {
    return { ...super.exportJSON(), type: "akan-collapsible-content", version: 1 };
  }

  override createDOM(): HTMLElement {
    const dom = document.createElement("div");
    dom.className = CONTENT_CLASS;
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
