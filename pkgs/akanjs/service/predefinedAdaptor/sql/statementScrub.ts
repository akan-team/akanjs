const DOLLAR_TAG = /\$(?:[A-Za-z_\u0080-\uffff][\w\u0080-\uffff]*)?\$/y;
const PARAMETER = /\$\d+/y;
const WORD = /[A-Za-z_\u0080-\uffff][\w$\u0080-\uffff]*/y;
const NUMBER = /(?:0[xX][\da-fA-F_]*|(?:\d[\d_]*(?:\.[\d_]*)?|\.\d[\d_]*)(?:[eE][+-]?\d[\d_]*)?)[\w$\u0080-\uffff]*/y;
const WORD_START = /^[A-Za-z_\u0080-\uffff]$/;
const STRING_PREFIX = /^[EeBbXxNn]$/;
const OPERAND_ENDS = /^[)\]]$/;
const KEYWORDS =
  /^(?:select|where|and|or|not|in|by|on|set|then|else|when|case|limit|offset|values|between|like|ilike|is|having|return|returning|as|from|using|union|all|distinct)$/i;
const isDigit = (ch: string | undefined) => ch !== undefined && ch >= "0" && ch <= "9";

export class StatementScrub {
  readonly #text: string;
  #at = 0;
  #out = "";
  #operand = false;

  constructor(text: string) {
    this.#text = text;
  }

  static of(text: string): string {
    return new StatementScrub(text).#scan();
  }

  #scan(): string {
    const text = this.#text;
    while (this.#at < text.length) {
      const ch = text[this.#at];
      const next = text[this.#at + 1];
      if (ch === "-" && next === "-") this.#lineComment();
      else if (ch === "/" && next === "*") this.#blockComment();
      else if (ch === "'") this.#string(false);
      else if (ch === '"') this.#identifier();
      else if (ch === "$") this.#dollar();
      else if (this.#startsNumber(this.#at)) this.#number();
      else if ((ch === "-" || ch === "+") && !this.#operand && this.#startsNumber(this.#at + 1)) {
        this.#at += 1;
        this.#number();
      } else if (WORD_START.test(ch)) this.#word();
      else {
        this.#out += ch;
        this.#at += 1;
        if (!/\s/.test(ch)) this.#operand = OPERAND_ENDS.test(ch);
      }
    }
    return this.#out;
  }

  #startsNumber(at: number) {
    const ch = this.#text[at];
    if (isDigit(ch)) return true;
    return ch === "." && isDigit(this.#text[at + 1]) && !this.#operand;
  }

  #emit(value: string) {
    this.#out += value;
    this.#operand = true;
  }

  #lineComment() {
    const end = this.#text.indexOf("\n", this.#at);
    this.#out += " ";
    this.#at = end === -1 ? this.#text.length : end;
  }

  #blockComment() {
    const text = this.#text;
    let depth = 0;
    let at = this.#at;
    while (at < text.length) {
      if (text[at] === "/" && text[at + 1] === "*") {
        depth += 1;
        at += 2;
      } else if (text[at] === "*" && text[at + 1] === "/") {
        depth -= 1;
        at += 2;
        if (depth === 0) break;
      } else at += 1;
    }
    this.#out += " ";
    this.#at = at;
  }

  #string(escapes: boolean) {
    const text = this.#text;
    let at = this.#at + 1;
    while (at < text.length) {
      const ch = text[at];
      if (escapes && ch === "\\") at += 2;
      else if (ch === "'" && text[at + 1] === "'") at += 2;
      else if (ch === "'") break;
      else at += 1;
    }
    this.#emit("?");
    this.#at = Math.min(at + 1, text.length);
  }

  #identifier() {
    const text = this.#text;
    let at = this.#at + 1;
    while (at < text.length) {
      if (text[at] !== '"') at += 1;
      else if (text[at + 1] === '"') at += 2;
      else break;
    }
    if (at >= text.length) this.#emit("?");
    else this.#emit(text.slice(this.#at, at + 1));
    this.#at = Math.min(at + 1, text.length);
  }

  #dollar() {
    const text = this.#text;
    DOLLAR_TAG.lastIndex = this.#at;
    const tag = DOLLAR_TAG.exec(text)?.[0];
    if (tag) {
      const end = text.indexOf(tag, this.#at + tag.length);
      this.#emit("?");
      this.#at = end === -1 ? text.length : end + tag.length;
      return;
    }
    PARAMETER.lastIndex = this.#at;
    const parameter = PARAMETER.exec(text)?.[0];
    if (parameter) this.#emit(parameter);
    else this.#out += "$";
    this.#at += parameter?.length ?? 1;
  }

  #number() {
    NUMBER.lastIndex = this.#at;
    const match = NUMBER.exec(this.#text)?.[0] ?? this.#text[this.#at];
    this.#emit("?");
    this.#at += match.length;
  }

  #word() {
    WORD.lastIndex = this.#at;
    const word = WORD.exec(this.#text)?.[0] ?? this.#text[this.#at];
    const end = this.#at + word.length;
    if (STRING_PREFIX.test(word) && this.#text[end] === "'") {
      this.#at = end;
      this.#string(word === "E" || word === "e");
      return;
    }
    this.#out += word;
    this.#operand = !KEYWORDS.test(word);
    this.#at = end;
  }
}
