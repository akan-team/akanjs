import { MarkdownTable, type TableBlock } from "./markdownTable";

export interface MarkdownItem {
  depth: number;
  ordered: boolean;
  num: number;
  text: string;
}

export type MarkdownBlock =
  | { kind: "code"; lang?: string; text: string }
  | { kind: "heading"; level: number; text: string }
  | { kind: "list"; items: MarkdownItem[] }
  | { kind: "quote"; text: string }
  | { kind: "rule" }
  | { kind: "para"; text: string }
  | TableBlock;

const fence = /^ {0,3}(```|~~~)(.*)$/;
const heading = /^ {0,3}(#{1,6})\s+(.*)$/;
const rule = /^ {0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/;
const quote = /^ {0,3}> ?(.*)$/;
const bullet = /^(\s*)[-*+]\s+(.*)$/;
const ordered = /^(\s*)(\d{1,9})[.)]\s+(.*)$/;
const lazyLine = /^\s+\S/;

/**
 * Block scanner for assistant chat text — the CommonMark subset a model actually emits over this wire.
 */
export class MarkdownBlocks {
  static of(source: string): MarkdownBlock[] {
    return new MarkdownBlocks(source).#run();
  }

  readonly #lines: string[];
  readonly #blocks: MarkdownBlock[] = [];
  #at = 0;

  constructor(source: string) {
    this.#lines = source.replace(/\r\n?/g, "\n").split("\n");
  }

  #run() {
    while (this.#at < this.#lines.length) {
      const line = this.#lines[this.#at];
      const head = heading.exec(line);
      const fenced = fence.exec(line);
      const table = MarkdownTable.at(this.#lines, this.#at);
      if (!line.trim()) this.#at += 1;
      else if (fenced) this.#code(fenced[1], fenced[2]);
      else if (rule.test(line)) this.#take({ kind: "rule" });
      else if (head) this.#take({ kind: "heading", level: head[1].length, text: head[2] });
      else if (quote.test(line)) this.#quote();
      else if (ordered.test(line)) this.#list(true);
      else if (bullet.test(line)) this.#list(false);
      else if (table) {
        this.#blocks.push(table.block);
        this.#at = table.next;
      } else this.#para();
    }
    return this.#blocks;
  }

  #take(block: MarkdownBlock) {
    this.#blocks.push(block);
    this.#at += 1;
  }

  // An unclosed fence is the normal mid-stream state, so it runs to the end of the text: falling back to a
  // paragraph would flip the whole block from code to prose and back on the delta that closes it.
  #code(marker: string, info: string) {
    // The info string's first word is the language by CommonMark; the rest is metadata no renderer here reads.
    const lang = info.trim().split(/\s+/)[0];
    this.#at += 1;
    const body: string[] = [];
    while (this.#at < this.#lines.length) {
      const line = this.#lines[this.#at];
      this.#at += 1;
      if (line.trimStart().startsWith(marker)) break;
      body.push(line);
    }
    this.#blocks.push({ kind: "code", ...(lang ? { lang } : {}), text: body.join("\n") });
  }

  #quote() {
    const lines: string[] = [];
    while (this.#at < this.#lines.length) {
      const match = quote.exec(this.#lines[this.#at]);
      if (!match) break;
      lines.push(match[1]);
      this.#at += 1;
    }
    this.#blocks.push({ kind: "quote", text: lines.join(" ").trim() });
  }

  #list(isOrdered: boolean) {
    const items: MarkdownItem[] = [];
    while (this.#at < this.#lines.length) {
      const line = this.#lines[this.#at];
      const item = MarkdownBlocks.#item(line, isOrdered);
      const open = items.at(-1);
      if (item) items.push(item);
      else if (open && lazyLine.test(line)) open.text += ` ${line.trim()}`;
      else break;
      this.#at += 1;
    }
    this.#blocks.push({ kind: "list", items });
  }

  // The other marker is an item only where it is indented: a numbered step whose sub-points are bullets is the
  // shape a model reaches for most often, while switching marker at the margin starts a list of its own.
  static #item(line: string, isOrdered: boolean): MarkdownItem | null {
    const numbered = ordered.exec(line);
    const bulleted = bullet.exec(line);
    const other = isOrdered ? bulleted : numbered;
    const match = (isOrdered ? numbered : bulleted) ?? (other?.[1].length ? other : null);
    if (!match) return null;
    const carriesNum = match === numbered;
    return {
      depth: Math.floor(match[1].length / 2),
      ordered: carriesNum,
      num: carriesNum ? Number(match[2]) : 0,
      text: carriesNum ? match[3] : match[2],
    };
  }

  #para() {
    const lines: string[] = [];
    while (this.#at < this.#lines.length) {
      const line = this.#lines[this.#at];
      if (!line.trim() || this.#opensBlock(line) || MarkdownTable.at(this.#lines, this.#at)) break;
      lines.push(line.trim());
      this.#at += 1;
    }
    this.#blocks.push({ kind: "para", text: lines.join(" ") });
  }

  #opensBlock(line: string) {
    return [fence, heading, rule, quote, bullet, ordered].some((pattern) => pattern.test(line));
  }
}
