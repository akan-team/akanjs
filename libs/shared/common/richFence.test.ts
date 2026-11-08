import { describe, expect, it } from "bun:test";
import { RichEditor } from "./richEditor";
import { RichFence } from "./richFence";
import { RichNode } from "./richNode";

const text = (value: string, format = 0) => RichNode.text(value, format);
const linebreak = () => ({ type: "linebreak", version: 1 });
const paragraph = (...children: object[]) => RichNode.paragraph(children);
const doc = (...children: object[]) => RichNode.root(children);
const lines = (...values: string[]) =>
  values.flatMap((value, idx) => (idx ? [linebreak(), text(value)] : [text(value)]));
const blocksOf = (content: unknown) => (content as ReturnType<typeof doc>).root.children as { type: string }[];

describe("RichFence.isOpen", () => {
  it("is open after an opener and closed again by a closer at least as long", () => {
    expect(RichFence.isOpen(["hi", "```ts"])).toBe(true);
    expect(RichFence.isOpen(["```", "const a = 1;"])).toBe(true);
    expect(RichFence.isOpen(["```", "x", "```"])).toBe(false);
    expect(RichFence.isOpen(["````", "```"])).toBe(true);
  });

  it("is not opened by backticks inside a sentence or a one-line fence", () => {
    expect(RichFence.isOpen(["use ``` to fence"])).toBe(false);
    expect(RichFence.isOpen(["```const a = 1```"])).toBe(false);
  });
});

describe("RichFence.fold", () => {
  it("folds a fence typed with line breaks into one code block", () => {
    const folded = RichFence.fold(doc(paragraph(...lines("```", "ㅁㄴㅇ", "```"))));
    expect(blocksOf(folded)).toEqual([RichNode.block("code", [text("ㅁㄴㅇ")])]);
  });

  it("keeps the language and the prose on either side, each in its own paragraph", () => {
    const folded = RichFence.fold(
      doc(paragraph(...lines("before", "```ts", "const a = 1;", "  run();", "```", "after"))),
    );
    expect(blocksOf(folded)).toEqual([
      paragraph(text("before")),
      RichNode.block("code", [text("const a = 1;\n  run();")], { language: "ts" }),
      paragraph(text("after")),
    ]);
  });

  it("folds a fence spread over paragraphs", () => {
    const folded = RichFence.fold(
      doc(paragraph(text("```")), paragraph(text("a")), paragraph(), paragraph(text("```"))),
    );
    expect(blocksOf(folded)).toEqual([RichNode.block("code", [text("a\n")])]);
  });

  it("folds a one-line fence", () => {
    expect(blocksOf(RichFence.fold(doc(paragraph(text("```npm i```")))))).toEqual([
      RichNode.block("code", [text("npm i")]),
    ]);
  });

  it("runs an unclosed fence to the end, as the markdown reader does", () => {
    const folded = RichFence.fold(doc(paragraph(...lines("```", "a", "b"))));
    expect(RichEditor.extractTextFromContent(folded)).toBe("a\nb\n");
    expect(blocksOf(folded)[0].type).toBe("code");
  });

  it("drops a closing fence left on the last line of a code block", () => {
    const code = RichNode.block("code", [text("a"), linebreak(), text("```")]);
    expect(blocksOf(RichFence.fold(doc(code)))).toEqual([RichNode.block("code", [text("a")])]);
  });

  it("returns content with no fence as the same object, formats and all", () => {
    const content = doc(paragraph(text("ㅇㅇ", 1), text(" "), text("ㅇㅇㅇㅇ", 3)));
    expect(RichFence.fold(content)).toBe(content);
  });
});
