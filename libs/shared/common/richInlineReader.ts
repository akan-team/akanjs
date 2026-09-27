import { MentionGrammar } from "./mentionGrammar";
import { RichNode } from "./richNode";

interface InlineNode {
  type: string;
  text?: string;
  format?: unknown;
  detail?: unknown;
  mode?: unknown;
  style?: unknown;
}

export class RichInlineReader {
  static readonly formatBits = { bold: 1, italic: 2, strike: 4, code: 16, highlight: 128 } as const;

  /*
   * Precedence order, earliest match wins and ties go to the first rule listed: an escape and a code span are
   * literal, so they have to be claimed before `**` inside them is read as emphasis. Every emphasis body steps
   * over `\x` as one unit, so an escaped delimiter never closes the span it sits in.
   */
  static readonly #rules = [
    { kind: "escape", pattern: /\\([!-/:-@[-`{-~])/ },
    { kind: "code", pattern: /`([^`\n]+)`/ },
    { kind: "mention", pattern: MentionGrammar.pattern },
    { kind: "autolink", pattern: /<((?:https?|mailto):[^\s<>]+)>/ },
    { kind: "link", pattern: /\[((?:\\.|[^\]\\])*)\]\((?:<([^<>\s]+)>|([^()\s]+))(?:\s+"((?:\\.|[^"\\])*)")?\)/ },
    { kind: "bold", pattern: /\*\*((?:\\[\s\S]|[^\\])+?)\*\*/ },
    { kind: "strike", pattern: /~~((?:\\[\s\S]|[^\\])+?)~~/ },
    { kind: "highlight", pattern: /==((?:\\[\s\S]|[^\\])+?)==/ },
    // `_` never opens inside a word, so `snake_case_name` stays one literal word as CommonMark reads it.
    {
      kind: "italic",
      pattern: /\*((?:\\.|[^\\*\n])+)\*|(?<![\p{L}\p{N}_\\])_((?:\\.|[^\\_\n])+)_(?![\p{L}\p{N}_])/u,
    },
  ] as const;

  static read(text: string, format = 0): object[] {
    return RichInlineReader.#merge(RichInlineReader.#read(text, format));
  }

  /**
   * Soft line breaks stay inside one block, as `linebreak` nodes — the shape the editor's import produces. A line
   * holding only a backslash is an empty one, since a blank line would end the block.
   */
  static readLines(lines: string[]): object[] {
    return lines.flatMap((line, idx) => {
      const inline = RichInlineReader.read(line.trim() === "\\" ? "" : line);
      return idx ? [{ type: "linebreak", version: 1 }, ...inline] : inline;
    });
  }

  static #read(text: string, format: number): InlineNode[] {
    if (!text) return [];
    let found: { at: number; kind: string; match: RegExpExecArray } | null = null;
    for (const rule of RichInlineReader.#rules) {
      const match = rule.pattern.exec(text);
      if (!match || (found && match.index >= found.at)) continue;
      found = { at: match.index, kind: rule.kind, match };
    }
    if (!found) return [RichNode.text(text, format)];
    const { at, kind, match } = found;
    const before = at ? [RichNode.text(text.slice(0, at), format)] : [];
    const after = RichInlineReader.#read(text.slice(at + match[0].length), format);
    return [...before, ...RichInlineReader.#node(kind, match, format), ...after];
  }

  static #node(kind: string, match: RegExpExecArray, format: number): InlineNode[] {
    const bits = RichInlineReader.formatBits;
    switch (kind) {
      case "escape":
        return [RichNode.text(match[1], format)];
      case "code":
        return [RichNode.text(match[1], format | bits.code)];
      case "mention": {
        const [, label, refName, refId] = match;
        return [RichNode.mention({ refName, id: refId, name: MentionGrammar.unescape(label) })];
      }
      case "autolink":
        return [
          RichNode.block("autolink", [RichNode.text(match[1], format)], {
            isUnlinked: false,
            rel: null,
            target: null,
            title: null,
            url: match[1],
          }),
        ];
      case "link":
        return [RichInlineReader.#link(match, format)];
      case "bold":
        return RichInlineReader.#read(match[1], format | bits.bold);
      case "strike":
        return RichInlineReader.#read(match[1], format | bits.strike);
      case "highlight":
        return RichInlineReader.#read(match[1], format | bits.highlight);
      default:
        return RichInlineReader.#read(match[1] ?? match[2], format | bits.italic);
    }
  }

  // `[text](<url>)` is an autolink whose text is not its url — the editor detected it, so it is no ordinary link.
  static #link(match: RegExpExecArray, format: number) {
    const [, label, autolink, url, title] = match;
    const children = RichInlineReader.read(label, format);
    if (autolink)
      return RichNode.block("autolink", children, {
        isUnlinked: false,
        rel: null,
        target: null,
        title: null,
        url: autolink,
      });
    return RichNode.block("link", children, {
      rel: null,
      target: null,
      title: title === undefined ? null : title.replace(/\\(.)/g, "$1"),
      url,
    });
  }

  /** An escape splits a run of text in two; the editor would merge them back, so the reader does it first. */
  static #merge(nodes: InlineNode[]) {
    return nodes.reduce<InlineNode[]>((merged, node) => {
      const last = merged.at(-1);
      if (
        last?.type === "text" &&
        node.type === "text" &&
        last.format === node.format &&
        last.detail === node.detail &&
        last.mode === node.mode &&
        last.style === node.style
      )
        merged[merged.length - 1] = { ...last, text: `${last.text}${node.text}` };
      else merged.push(node);
      return merged;
    }, []);
  }
}
