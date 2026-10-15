import { describe, expect, it } from "bun:test";
import { RichEditor } from "./richEditor";
import { RichNode } from "./richNode";
import { RichTrim } from "./richTrim";

const text = (value: string, format = 0) => RichNode.text(value, format);
const linebreak = () => ({ type: "linebreak", version: 1 });
const paragraph = (...children: object[]) => RichNode.paragraph(children);
const doc = (...children: object[]) => RichNode.root(children);
const mention = () => RichNode.mention({ refName: "user", id: "u1", name: "hana" });
const image = () => ({ type: "akan-image", src: "https://example.com/a.png", altText: "", version: 1 });
const code = (...lines: string[]) =>
  RichNode.block(
    "code",
    lines.flatMap((line, idx) => (idx ? [linebreak(), text(line)] : [text(line)])),
  );

const plain = (content: unknown) => RichEditor.extractTextFromContent(content);

describe("RichTrim.trim", () => {
  it("strips leading and trailing spaces inside the edge text nodes", () => {
    const trimmed = RichTrim.trim(doc(paragraph(text("   hello world  "))));
    expect(plain(trimmed)).toBe("hello world\n");
  });

  it("drops leading and trailing line breaks and empty paragraphs", () => {
    const content = doc(
      paragraph(),
      paragraph(text("  ")),
      paragraph(linebreak(), text(" hello"), linebreak(), linebreak()),
      paragraph(),
      paragraph(linebreak()),
    );
    const trimmed = RichTrim.trim(content);
    expect(trimmed.root.children).toHaveLength(1);
    expect(plain(trimmed)).toBe("hello\n");
  });

  it("reads markdown-built content the same way", () => {
    expect(plain(RichTrim.trim(RichEditor.contentFromText("  \n\nhello\n\n  ")))).toBe("hello\n");
  });

  it("turns whitespace-only content into an empty document", () => {
    const trimmed = RichTrim.trim(doc(paragraph(text(" \t ")), paragraph(linebreak()), paragraph()));
    expect(trimmed.root.children).toEqual([RichNode.paragraph([])]);
    expect(RichTrim.isBlank(trimmed)).toBe(true);
  });

  it("keeps blank lines and spaces between the first and last line", () => {
    const trimmed = RichTrim.trim(
      doc(paragraph(), paragraph(text("first  line ")), paragraph(), paragraph(text("  last")), paragraph()),
    );
    expect(plain(trimmed)).toBe("first  line \n\n  last\n");
  });

  it("keeps a leading mention and a trailing image", () => {
    const trimmed = RichTrim.trim(doc(paragraph(mention(), text(" hi  ")), image()));
    expect(trimmed.root.children).toHaveLength(2);
    expect(trimmed.root.children[0]).toEqual(paragraph(mention(), text(" hi  ")));
    expect(trimmed.root.children[1]).toEqual(image());
  });

  it("stops at a mention on either edge of a single line", () => {
    const trimmed = RichTrim.trim(doc(paragraph(linebreak(), mention(), linebreak())));
    expect(trimmed.root.children).toEqual([paragraph(mention())]);
  });

  it("trims Korean text, including an ideographic space", () => {
    expect(plain(RichTrim.trim(doc(paragraph(text("　 안녕하세요 반갑습니다 \n")))))).toBe("안녕하세요 반갑습니다\n");
  });

  it("keeps a code block's indentation at either edge", () => {
    const block = code("  if (x) {", "    run();", "  }  ");
    const trimmed = RichTrim.trim(doc(paragraph(), block, paragraph(text(" "))));
    expect(trimmed.root.children).toEqual([block]);
  });

  it("keeps the spaces of inline code on an edge", () => {
    const trimmed = RichTrim.trim(doc(paragraph(text("  x = 1  ", 16))));
    expect(trimmed.root.children).toEqual([paragraph(text("  x = 1  ", 16))]);
  });

  it("returns a value that is not a document as it is", () => {
    const legacy: unknown[] = [];
    expect(RichTrim.trim(legacy)).toBe(legacy);
  });
});

describe("RichTrim.isBlank", () => {
  it("is false for a document holding only a mention or an image", () => {
    expect(RichTrim.isBlank(doc(paragraph(mention())))).toBe(false);
    expect(RichTrim.isBlank(doc(image()))).toBe(false);
  });

  it("is true for an empty legacy value", () => {
    expect(RichTrim.isBlank([])).toBe(true);
  });
});
