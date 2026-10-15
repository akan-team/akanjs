import { RichEditor } from "./richEditor";
import { RichNode, type RichNodeLike } from "./richNode";

interface TrimNode extends RichNodeLike {
  format?: unknown;
}

type Side = "start" | "end";

export class RichTrim {
  static readonly #inlineBlocks: ReadonlySet<string> = new Set(["paragraph", "heading", "quote"]);
  // Lexical's IS_CODE text format bit: inline code keeps its spaces the way a code block does.
  static readonly #codeFormat = 16;

  static trim<Content>(content: Content): Content {
    if (!RichNode.isDocument(content)) return content;
    const blocks = content.root.children ?? [];
    let start = 0;
    let end = blocks.length;
    while (start < end && RichTrim.#isBlankBlock(blocks[start])) start += 1;
    while (end > start && RichTrim.#isBlankBlock(blocks[end - 1])) end -= 1;
    const kept = blocks.slice(start, end);
    const children = kept.length
      ? kept.map((block, idx) => {
          const leading = idx === 0 ? RichTrim.#trimEdge(block, "start") : block;
          return idx === kept.length - 1 ? RichTrim.#trimEdge(leading, "end") : leading;
        })
      : [RichNode.paragraph([])];
    return { ...content, root: { ...content.root, children } } as Content;
  }

  static isBlank(content: unknown) {
    if (!RichNode.isDocument(content)) return !RichEditor.extractTextFromContent(content).trim();
    return (content.root.children ?? []).every(RichTrim.#isBlankBlock);
  }

  static #isBlankBlock(block: unknown) {
    if (!RichNode.isNode(block) || !block.type || !RichTrim.#inlineBlocks.has(block.type)) return false;
    return (block.children ?? []).every(RichTrim.#isBlankInline);
  }

  static #isBlankInline(node: unknown) {
    if (!RichNode.isNode(node)) return false;
    if (node.type === "linebreak" || node.type === "tab") return true;
    return RichTrim.#isPlainText(node) && !node.text?.trim();
  }

  static #isPlainText(node: TrimNode) {
    if (node.type !== "text" || typeof node.text !== "string") return false;
    return typeof node.format !== "number" || (node.format & RichTrim.#codeFormat) === 0;
  }

  static #trimEdge(block: RichNodeLike, side: Side): RichNodeLike {
    if (!block.type || !RichTrim.#inlineBlocks.has(block.type) || !Array.isArray(block.children)) return block;
    const children = [...block.children];
    for (;;) {
      const idx = side === "start" ? 0 : children.length - 1;
      const child = children[idx];
      if (!child) break;
      if (RichTrim.#isBlankInline(child)) {
        children.splice(idx, 1);
        continue;
      }
      if (RichTrim.#isPlainText(child)) {
        const text = String(child.text);
        children[idx] = { ...child, text: side === "start" ? text.trimStart() : text.trimEnd() };
      }
      break;
    }
    return { ...block, children };
  }
}
