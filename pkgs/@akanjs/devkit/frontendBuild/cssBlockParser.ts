export interface CssDeclaration {
  kind: "declaration";
  property: string;
  value: string;
}

export interface CssBlock {
  kind: "block";
  prelude: string;
  atRule: string | null;
  nodes: CssNode[];
}

export type CssNode = CssDeclaration | CssBlock;

export class CssBlockParser {
  readonly #css: string;
  readonly #stack: CssBlock[] = [{ kind: "block", prelude: "", atRule: null, nodes: [] }];
  #pendingParts: string[] = [];
  #segmentStart = 0;
  #parenDepth = 0;

  constructor(css: string) {
    this.#css = css;
  }

  static parse(css: string): CssBlock {
    return new CssBlockParser(css).#run();
  }

  static walk<T>(root: CssBlock, context: T, visit: (node: CssNode, context: T) => T | null) {
    const stack = [{ nodes: root.nodes, idx: 0, context }];
    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      const node = frame.nodes[frame.idx];
      if (!node) {
        stack.pop();
        continue;
      }
      frame.idx += 1;
      const childContext = visit(node, frame.context);
      if (node.kind === "block" && childContext !== null)
        stack.push({ nodes: node.nodes, idx: 0, context: childContext });
    }
  }

  #run(): CssBlock {
    const css = this.#css;
    let idx = 0;
    while (idx < css.length) {
      const char = css[idx];
      if (char === "/" && css[idx + 1] === "*") {
        this.#pendingParts.push(css.slice(this.#segmentStart, idx));
        const end = css.indexOf("*/", idx + 2);
        idx = end === -1 ? css.length : end + 2;
        this.#segmentStart = idx;
        continue;
      }
      if (char === "\\") {
        idx += 2;
        continue;
      }
      if (char === '"' || char === "'") {
        idx = this.#skipString(idx);
        continue;
      }
      if (char === "(") this.#parenDepth += 1;
      else if (char === ")") this.#parenDepth = Math.max(0, this.#parenDepth - 1);
      else if (char === "{") this.#openBlock(idx);
      else if (char === "}") this.#closeBlock(idx);
      //? A `;` inside parentheses belongs to the value, as in an unquoted `url(data:image/png;base64,…)`.
      else if (char === ";" && this.#parenDepth === 0) this.#endStatement(idx);
      idx += 1;
    }
    this.#endStatement(css.length);
    return this.#stack[0];
  }

  get #current(): CssBlock {
    return this.#stack[this.#stack.length - 1];
  }

  // An unterminated string ends at the newline, as the CSS tokenizer's bad-string does.
  #skipString(start: number): number {
    const css = this.#css;
    const quote = css[start];
    let idx = start + 1;
    while (idx < css.length) {
      const char = css[idx];
      if (char === "\\") idx += 2;
      else if (char === quote) return idx + 1;
      else if (char === "\n") return idx;
      else idx += 1;
    }
    return css.length;
  }

  #takeSegment(end: number): string {
    const text = this.#pendingParts.join("") + this.#css.slice(this.#segmentStart, end);
    this.#pendingParts = [];
    this.#segmentStart = end + 1;
    return text.trim();
  }

  #openBlock(idx: number) {
    const prelude = this.#takeSegment(idx);
    const block: CssBlock = { kind: "block", prelude, atRule: CssBlockParser.#atRuleOf(prelude), nodes: [] };
    this.#current.nodes.push(block);
    this.#stack.push(block);
    this.#parenDepth = 0;
  }

  #closeBlock(idx: number) {
    this.#endStatement(idx);
    if (this.#stack.length > 1) this.#stack.pop();
    this.#parenDepth = 0;
  }

  #endStatement(idx: number) {
    const text = this.#takeSegment(idx);
    if (!text || text.startsWith("@")) return;
    const colon = text.indexOf(":");
    if (colon <= 0) return;
    const property = text.slice(0, colon).trim();
    if (!/^[\w-]+$/.test(property)) return;
    this.#current.nodes.push({ kind: "declaration", property, value: text.slice(colon + 1).trim() });
  }

  static #atRuleOf(prelude: string): string | null {
    return prelude.match(/^@[\w-]+/)?.[0].toLowerCase() ?? null;
  }
}
