import { RichContentShape } from "./richContentShape";
import { RichInlineWriter, type WritableNode } from "./richInlineWriter";
import { RichMarkdownReader } from "./richMarkdownReader";
import { RichMarkdownTable } from "./richMarkdownTable";

interface BlockNode extends WritableNode {
  children?: BlockNode[];
  tag?: string;
  listType?: string;
  start?: number;
  checked?: boolean;
  language?: string;
  code?: string;
  width?: number;
  align?: string;
  src?: string;
  alt?: string;
}

/**
 * A Lexical document as the markdown `RichMarkdownReader` reads back into the same document.
 *
 * Every block is checked by reading its own markdown back: one that does not come back equal — an underline, an
 * indented paragraph, a merged table cell, an image with its file, a callout — is written as an
 * ```` ```akan-node ```` fence holding the node itself. So a model that reads a field, edits one sentence and
 * writes the whole field back loses nothing it did not touch, whatever the editor put there.
 */
export class RichMarkdownWriter {
  static write(content: unknown): string {
    if (typeof content === "string") return content;
    const root = (content as { root?: { children?: unknown } } | null | undefined)?.root;
    const blocks = Array.isArray(root?.children) ? (root.children as BlockNode[]) : null;
    if (!blocks?.length) return "";
    if (blocks.length === 1 && blocks[0].type === "paragraph" && !blocks[0].children?.length) return "";
    const markdown = blocks
      .map(
        (block, idx) => `${RichMarkdownWriter.#separator(blocks[idx - 1], block)}${RichMarkdownWriter.#block(block)}`,
      )
      .join("\n\n");
    const reread = (RichMarkdownReader.read(markdown).root as { children: unknown[] }).children;
    if (RichContentShape.same(reread, blocks)) return markdown;
    return blocks.map(RichMarkdownWriter.#island).join("\n\n");
  }

  // A list after a list reads back as its continuation — merged into it, or nested under it when it opens indented.
  static #separator(previous: BlockNode | undefined, block: BlockNode) {
    return previous?.type === "list" && block.type === "list" ? "<!-- -->\n\n" : "";
  }

  static #block(block: BlockNode) {
    const lossless = RichMarkdownWriter.#formsOf(block).find((markdown) => {
      const reread = (RichMarkdownReader.read(markdown).root as { children: unknown[] }).children;
      return RichContentShape.same(reread, [block]);
    });
    return lossless ?? RichMarkdownWriter.#island(block);
  }

  static #island(block: BlockNode) {
    return `\`\`\`${RichMarkdownReader.islandFence}\n${JSON.stringify(block)}\n\`\`\``;
  }

  /** Candidate markdown for a block, simplest first; none means the block has no markdown form at all. */
  static #formsOf(block: BlockNode): string[] {
    if (block.type === "table") return RichMarkdownTable.write(block);
    const markdown = RichMarkdownWriter.#markdownOf(block);
    return markdown === null ? [] : [markdown];
  }

  static #markdownOf(block: BlockNode): string | null {
    switch (block.type) {
      case "paragraph":
        return RichMarkdownWriter.#paragraph(block);
      case "heading":
        return RichMarkdownWriter.#heading(block);
      case "quote":
        return RichMarkdownWriter.#quote(block);
      case "list":
        return RichMarkdownWriter.#list(block, "");
      case "code":
        return RichMarkdownWriter.#code(block);
      case "horizontalrule":
        return "---";
      case "akan-mermaid":
        return RichMarkdownWriter.#mermaid(block);
      case "akan-image":
        return RichMarkdownWriter.#image(block);
      default:
        return null;
    }
  }

  static #paragraph(block: BlockNode) {
    if (!block.children?.length) return "<br>";
    const inline = RichInlineWriter.write(block.children);
    return inline === null ? null : inline.split("\n").map(RichMarkdownWriter.#guardLine).join("\n");
  }

  static #heading(block: BlockNode) {
    const level = Number(/^h([1-6])$/.exec(block.tag ?? "")?.[1]);
    const inline = RichInlineWriter.write(block.children ?? []);
    if (!level || inline === null || inline.includes("\n")) return null;
    return `${"#".repeat(level)} ${inline}`;
  }

  static #quote(block: BlockNode) {
    const inline = RichInlineWriter.write(block.children ?? []);
    return inline === null
      ? null
      : inline
          .split("\n")
          .map((line) => (line ? `> ${line}` : ">"))
          .join("\n");
  }

  static #list(block: BlockNode, indent: string): string | null {
    const lines: string[] = [];
    const nestedIndent = `${indent}${block.listType === "number" ? "   " : "  "}`;
    let number = block.start ?? 1;
    for (const item of block.children ?? []) {
      if (item.type !== "listitem") return null;
      const [first, ...others] = item.children ?? [];
      if (first?.type === "list" && !others.length) {
        const nested = RichMarkdownWriter.#list(first, nestedIndent);
        if (nested === null) return null;
        lines.push(nested);
        continue;
      }
      const inline = RichInlineWriter.write(item.children ?? []);
      if (inline === null) return null;
      const [head, ...rest] = inline.split("\n");
      const marker = block.listType === "number" ? `${number}.` : "-";
      const box = block.listType === "check" ? (item.checked ? " [x]" : " [ ]") : "";
      const lead = `${indent}${marker}${box}`;
      lines.push(head ? `${lead} ${RichMarkdownWriter.#guardLine(head)}` : lead);
      for (const line of rest) lines.push(`${nestedIndent}${RichMarkdownWriter.#guardLine(line)}`);
      number += 1;
    }
    return lines.join("\n");
  }

  static #code(block: BlockNode) {
    const language = block.language ?? "";
    if (language === RichMarkdownReader.islandFence || language === "mermaid" || /\s/.test(language)) return null;
    return RichMarkdownWriter.#fenced(language, RichContentShape.codeText(block));
  }

  static #mermaid(block: BlockNode) {
    const width = block.width ? ` width=${block.width}` : "";
    const align = block.align && block.align !== "center" ? ` align=${block.align}` : "";
    return RichMarkdownWriter.#fenced(`mermaid${width}${align}`, block.code ?? "");
  }

  static #fenced(info: string, text: string) {
    const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
    const fence = "`".repeat(Math.max(3, longest + 1));
    return text ? `${fence}${info}\n${text}\n${fence}` : `${fence}${info}\n${fence}`;
  }

  static #image(block: BlockNode) {
    if (!block.src || /[\s()]/.test(block.src)) return null;
    return `![${(block.alt ?? "").replace(/([\\[\]])/g, "\\$1")}](${block.src})`;
  }

  /**
   * A line of prose that would open a heading, quote, list, rule or table gets its first marker escaped, and an empty
   * one — two line breaks in a row — is written as a lone backslash, since a blank line would end the block.
   */
  static #guardLine(line: string) {
    if (!line) return "\\";
    return line
      .replace(/^( *)(#{1,6}(?=[ \t]|$)|>|\||[-+](?=[ \t]|$)|-(?=[ \t]*-[ \t]*-))/, "$1\\$2")
      .replace(/^( *)(\d{1,9})([.)])(?=[ \t]|$)/, "$1$2\\$3");
  }
}
