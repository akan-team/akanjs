import { CodeTuiLines } from "./CodeTuiLines";

export interface CodeTuiEditorRow {
  text: string;
  /** Offset of this row's first character in the buffer. */
  at: number;
}

export interface CodeTuiEditorLayout {
  rows: CodeTuiEditorRow[];
  /** Visual row of the caret, and its column in display cells. */
  row: number;
  col: number;
}

/** Moves by drawn row, and columns are display cells, so a caret crossing Hangul rows does not drift. */
export class CodeTuiEditor {
  #text = "";
  #caret = 0;

  get text() {
    return this.#text;
  }

  get caret() {
    return this.#caret;
  }

  get isEmpty() {
    return !this.#text.length;
  }

  set(text: string, caret = text.length) {
    this.#text = text;
    this.#caret = Math.max(0, Math.min(caret, text.length));
  }

  clear() {
    this.set("");
  }

  /** Leaves the caret after the inserted text. */
  replace(from: number, to: number, text: string) {
    this.set(this.#text.slice(0, from) + text + this.#text.slice(to), from + text.length);
  }

  /** The whitespace-delimited token the caret sits in, as a range. */
  token(): { from: number; to: number; text: string } {
    const before = this.#text.slice(0, this.#caret);
    const from = Math.max(before.lastIndexOf(" "), before.lastIndexOf("\n")) + 1;
    const after = /\s/.exec(this.#text.slice(this.#caret));
    const to = after ? this.#caret + (after.index ?? 0) : this.#text.length;
    return { from, to, text: this.#text.slice(from, to) };
  }

  /** A keystroke or a whole paste; newlines are kept, CR and CRLF normalized to LF. */
  insert(text: string) {
    const clean = text.replace(/\r\n?/g, "\n");
    this.set(this.#text.slice(0, this.#caret) + clean + this.#text.slice(this.#caret), this.#caret + clean.length);
  }

  /** Drops a backslash before the caret: terminals bind shift+enter as the shell continuation `\` + return. */
  newline() {
    if (this.#text.slice(0, this.#caret).endsWith("\\"))
      this.set(this.#text.slice(0, this.#caret - 1) + this.#text.slice(this.#caret), this.#caret - 1);
    this.insert("\n");
  }

  backspace() {
    if (!this.#caret) return;
    const at = CodeTuiEditor.#prev(this.#text, this.#caret);
    this.set(this.#text.slice(0, at) + this.#text.slice(this.#caret), at);
  }

  deleteForward() {
    if (this.#caret >= this.#text.length) return;
    const at = CodeTuiEditor.#next(this.#text, this.#caret);
    this.set(this.#text.slice(0, this.#caret) + this.#text.slice(at), this.#caret);
  }

  /** The word before the caret, and the run of spaces it sat behind. */
  deleteWord() {
    const before = this.#text.slice(0, this.#caret);
    const at = before.replace(/\s*\S*$/, "").length;
    this.set(before.slice(0, at) + this.#text.slice(this.#caret), at);
  }

  deleteToLineStart() {
    const at = this.#text.lastIndexOf("\n", Math.max(0, this.#caret - 1)) + 1;
    this.set(this.#text.slice(0, at) + this.#text.slice(this.#caret), at);
  }

  left() {
    this.#caret = CodeTuiEditor.#prev(this.#text, this.#caret);
  }

  right() {
    this.#caret = CodeTuiEditor.#next(this.#text, this.#caret);
  }

  wordLeft() {
    this.#caret = this.#text.slice(0, this.#caret).replace(/\s*\S*$/, "").length;
  }

  wordRight() {
    const rest = /^\s*\S*/.exec(this.#text.slice(this.#caret))?.[0] ?? "";
    this.#caret = Math.min(this.#text.length, this.#caret + rest.length);
  }

  /** Moves one visual row, keeping the column; false when there is no row that way. */
  move(direction: -1 | 1, width: number) {
    const { rows, row, col } = this.layout(width);
    const target = rows[row + direction];
    if (!target) return false;
    this.#caret = target.at + CodeTuiEditor.#indexAt(target.text, col);
    return true;
  }

  homeOfRow(width: number) {
    const { rows, row } = this.layout(width);
    this.#caret = rows[row]?.at ?? 0;
  }

  endOfRow(width: number) {
    const { rows, row } = this.layout(width);
    const current = rows[row];
    this.#caret = current ? current.at + current.text.length : this.#text.length;
  }

  layout(width: number): CodeTuiEditorLayout {
    const room = Math.max(4, width);
    const rows: CodeTuiEditorRow[] = [];
    let at = 0;
    for (const line of this.#text.split("\n")) {
      // Character wrap, not word wrap: an editor must never move text the writer placed.
      for (const text of line ? CodeTuiLines.chunks(line, room) : [""]) {
        rows.push({ text, at });
        at += text.length;
      }
      at += 1;
    }
    if (!rows.length) rows.push({ text: "", at: 0 });
    // At a soft wrap the caret belongs to the new row, which is where the next character will be drawn.
    let row = 0;
    for (let index = 0; index < rows.length; index += 1) if ((rows[index]?.at ?? 0) <= this.#caret) row = index;
    const current = rows[row] ?? { text: "", at: 0 };
    return { rows, row, col: CodeTuiLines.width(current.text.slice(0, Math.max(0, this.#caret - current.at))) };
  }

  static #indexAt(row: string, col: number) {
    let at = 0;
    for (const char of row) {
      if (CodeTuiLines.width(row.slice(0, at + char.length)) > col) break;
      at += char.length;
    }
    return at;
  }

  static #prev(text: string, at: number) {
    if (at <= 0) return 0;
    return at - ([...text.slice(0, at)].at(-1)?.length ?? 1);
  }

  static #next(text: string, at: number) {
    if (at >= text.length) return text.length;
    return at + ([...text.slice(at)][0]?.length ?? 1);
  }
}
