import { describe, expect, test } from "bun:test";
import { CodeTuiEditor } from "./CodeTuiEditor";

const editorOf = (text: string, caret = text.length) => {
  const editor = new CodeTuiEditor();
  editor.set(text, caret);
  return editor;
};

describe("CodeTuiEditor", () => {
  test("typing and deleting move the caret with the text", () => {
    const editor = new CodeTuiEditor();
    editor.insert("hello");
    editor.left();
    editor.insert("X");
    expect(editor.text).toBe("hellXo");
    expect(editor.caret).toBe(5);
    editor.backspace();
    expect(editor.text).toBe("hello");
  });

  test("a pasted block keeps its newlines and lands as one insert", () => {
    const editor = new CodeTuiEditor();
    editor.insert("fix this:\r  at foo\r  at bar");
    expect(editor.text).toBe("fix this:\n  at foo\n  at bar");
  });

  test("backspace removes one Korean character, not one code unit", () => {
    const editor = editorOf("안녕하세요");
    editor.backspace();
    expect(editor.text).toBe("안녕하세");
  });

  test("an emoji outside the BMP is one character to the caret", () => {
    const editor = editorOf("hi 🙂");
    editor.backspace();
    expect(editor.text).toBe("hi ");
  });

  test("wraps by display width, so a Korean line breaks where it is drawn", () => {
    // Ten columns of Korean is five syllables; a length-based wrap would fit ten and overflow the pane.
    const { rows } = editorOf("안녕하세요반갑습니다").layout(10);
    expect(rows.map((row) => row.text)).toEqual(["안녕하세요", "반갑습니다"]);
  });

  test("every row knows its own offset across both kinds of break", () => {
    // "abcdef" soft-wraps at 4; the newline before "gh" is a hard break that consumes a character.
    const { rows } = editorOf("abcdef\ngh").layout(4);
    expect(rows).toEqual([
      { text: "abcd", at: 0 },
      { text: "ef", at: 4 },
      { text: "gh", at: 7 },
    ]);
  });

  test("up and down move a screen row, not a stored line", () => {
    const editor = editorOf("abcdefghi", 6);
    expect(editor.layout(4)).toMatchObject({ row: 1, col: 2 });
    editor.move(-1, 4);
    expect(editor.caret).toBe(2);
    expect(editor.move(-1, 4)).toBe(false);
    editor.move(1, 4);
    expect(editor.caret).toBe(6);
  });

  test("moving up through Korean keeps the column instead of drifting", () => {
    const editor = editorOf("안녕하세요반갑습니다", 8);
    expect(editor.layout(10)).toMatchObject({ row: 1, col: 6 });
    editor.move(-1, 10);
    // Column 6 on the row above is after three syllables, not after six code units.
    expect(editor.caret).toBe(3);
  });

  test("down from the last row reports that there is nowhere to go", () => {
    const editor = editorOf("one line");
    expect(editor.move(1, 40)).toBe(false);
  });

  test("home and end act on the visual row", () => {
    const editor = editorOf("abcdefghi", 7);
    editor.homeOfRow(4);
    expect(editor.caret).toBe(4);
    editor.endOfRow(4);
    expect(editor.caret).toBe(8);
  });

  test("word deletion takes the word and the space it sat behind", () => {
    const editor = editorOf("add a comment module");
    editor.deleteWord();
    expect(editor.text).toBe("add a comment");
  });

  test("an empty buffer still lays out one row, so the caret has somewhere to sit", () => {
    expect(new CodeTuiEditor().layout(40)).toEqual({ rows: [{ text: "", at: 0 }], row: 0, col: 0 });
  });
  test("the continuation backslash a terminal sends with shift+enter does not land in the prompt", () => {
    const editor = new CodeTuiEditor();
    editor.insert("first\\");
    editor.newline();
    editor.insert("second");
    expect(editor.text).toBe("first\nsecond");
  });

  test("only the one immediately before the break goes", () => {
    const editor = new CodeTuiEditor();
    editor.insert("a\\\\");
    editor.newline();
    expect(editor.text).toBe("a\\\n");
  });

  test("a newline typed with nothing before it is still a newline", () => {
    const editor = new CodeTuiEditor();
    editor.newline();
    expect(editor.text).toBe("\n");
  });

  test("a pasted backslash before a newline is kept", () => {
    const editor = new CodeTuiEditor();
    editor.insert("const re = /\\\n/;");
    expect(editor.text).toBe("const re = /\\\n/;");
  });
});
