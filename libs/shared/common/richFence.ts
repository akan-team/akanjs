import { RichEditor } from "./richEditor";
import { RichNode, type RichNodeLike } from "./richNode";

interface FenceLine {
  block: RichNodeLike;
  nodes: RichNodeLike[];
  text: string;
}

/**
 * ``` fences written as plain lines, read the way `RichMarkdownReader` reads them.
 *
 * A chat composer breaks a line with ⇧↩, so a fence typed there is literal text in a paragraph — the editor's
 * markdown shortcut converts one only on ↩ or a space right after the opener. `fold` turns those lines into the
 * code block the person meant before the message is sent; `isOpen` is what tells ↩ to break the line instead.
 */
export class RichFence {
  static readonly #opener = /^[ \t]*(`{3,})([\w-]*)[ \t]*$/;
  static readonly #closer = /^[ \t]*(`{3,})[ \t]*$/;
  static readonly #oneLine = /^[ \t]*(`{3,})([^`](?:.*[^`])?)\1[ \t]*$/;

  static isCloser(line: string) {
    return RichFence.#closer.test(line);
  }

  /** Whether the text ends inside a fence an opener started and no closer has ended yet. */
  static isOpen(lines: readonly string[]) {
    let fence = 0;
    for (const line of lines) {
      if (fence) fence = RichFence.#closes(line, fence) ? 0 : fence;
      else fence = RichFence.#opener.exec(line)?.[1].length ?? 0;
    }
    return fence > 0;
  }

  /**
   * Every run of paragraphs with its literal fences turned into code blocks, and a closing fence left on the last
   * line of a code block dropped. An unclosed fence runs to the end of its run, as in the reader. Content with
   * nothing to fold comes back as the same object.
   */
  static fold<Content>(content: Content): Content {
    if (!RichNode.isDocument(content)) return content;
    const children: RichNodeLike[] = [];
    let run: RichNodeLike[] = [];
    let changed = false;
    const flush = () => {
      const folded = RichFence.#foldRun(run);
      children.push(...(folded ?? run));
      changed ||= !!folded;
      run = [];
    };
    for (const block of content.root.children ?? []) {
      if (RichNode.isNode(block) && block.type === "paragraph" && Array.isArray(block.children)) {
        run.push(block);
        continue;
      }
      flush();
      const closed = RichNode.isNode(block) && block.type === "code" ? RichFence.#withoutCloser(block) : null;
      children.push(closed ?? block);
      changed ||= !!closed;
    }
    flush();
    return changed ? ({ ...content, root: { ...content.root, children } } as Content) : content;
  }

  static #closes(line: string, fence: number) {
    const closer = RichFence.#closer.exec(line);
    return !!closer && closer[1].length >= fence;
  }

  static #foldRun(blocks: RichNodeLike[]): RichNodeLike[] | null {
    const lines = blocks.flatMap(RichFence.#linesOf);
    const out: RichNodeLike[] = [];
    let prose: FenceLine[] = [];
    let folded = false;
    const emitProse = () => {
      for (const block of blocks) {
        const own = prose.filter((line) => line.block === block);
        if (own.length) out.push(RichFence.#paragraphOf(block, own));
      }
      prose = [];
    };
    for (let at = 0; at < lines.length; at += 1) {
      const { text } = lines[at];
      const oneLine = RichFence.#oneLine.exec(text);
      const opener = oneLine ? null : RichFence.#opener.exec(text);
      if (!oneLine && !opener) {
        prose.push(lines[at]);
        continue;
      }
      emitProse();
      folded = true;
      if (oneLine) {
        out.push(RichFence.#code(oneLine[2].trim(), ""));
        continue;
      }
      const fence = opener?.[1].length ?? 3;
      let end = at + 1;
      while (end < lines.length && !RichFence.#closes(lines[end].text, fence)) end += 1;
      const body = lines.slice(at + 1, end).map((line) => line.text);
      out.push(RichFence.#code(body.join("\n"), opener?.[2] ?? ""));
      at = end;
    }
    emitProse();
    return folded ? out : null;
  }

  static #linesOf(block: RichNodeLike): FenceLine[] {
    const lines: FenceLine[] = [];
    let nodes: RichNodeLike[] = [];
    for (const node of block.children ?? []) {
      if (RichNode.isNode(node) && node.type === "linebreak") {
        lines.push({ block, nodes, text: RichEditor.extractTextFromContent(nodes) });
        nodes = [];
      } else nodes.push(node);
    }
    lines.push({ block, nodes, text: RichEditor.extractTextFromContent(nodes) });
    return lines;
  }

  static #paragraphOf(block: RichNodeLike, lines: FenceLine[]): RichNodeLike {
    const children = lines.flatMap((line, idx) =>
      idx ? [{ type: "linebreak", version: 1 }, ...line.nodes] : line.nodes,
    );
    return { ...block, children };
  }

  static #code(code: string, language: string): RichNodeLike {
    return RichNode.block("code", code ? [RichNode.text(code)] : [], language ? { language } : {});
  }

  static #withoutCloser(code: RichNodeLike): RichNodeLike | null {
    const children = code.children ?? [];
    const lastBreak = children.findLastIndex((child) => RichNode.isNode(child) && child.type === "linebreak");
    if (lastBreak < 0 || !RichFence.isCloser(RichEditor.extractTextFromContent(children.slice(lastBreak + 1))))
      return null;
    return { ...code, children: children.slice(0, lastBreak) };
  }
}
