import { describe, expect, it } from "bun:test";
import { RichEditor } from "./richEditor";

const mention = (refName: string, refId: string, label: string) => ({
  type: "akan-mention",
  text: `@${label}`,
  refName,
  refId,
  label,
  format: 0,
  detail: 1,
  mode: "token",
  style: "",
  version: 1,
});

const doc = (...children: unknown[]) => ({
  root: { type: "root", format: "", indent: 0, version: 1, direction: null, children },
});

describe("RichEditor.collectMentions", () => {
  it("collects mentions from nested blocks", () => {
    const content = doc(
      { type: "paragraph", children: [{ type: "text", text: "cc " }, mention("admin", "a1", "kangmin")] },
      {
        type: "akan-callout",
        children: [
          {
            type: "list",
            children: [{ type: "listitem", children: [mention("user", "u1", "hana")] }],
          },
        ],
      },
    );

    expect(RichEditor.collectMentions(content)).toEqual([
      { refName: "admin", refId: "a1" },
      { refName: "user", refId: "u1" },
    ]);
  });

  it("de-duplicates repeated references but keeps distinct models with the same id", () => {
    const content = doc(
      { type: "paragraph", children: [mention("admin", "a1", "kangmin"), mention("admin", "a1", "kangmin")] },
      { type: "paragraph", children: [mention("user", "a1", "hana")] },
    );

    expect(RichEditor.collectMentions(content)).toEqual([
      { refName: "admin", refId: "a1" },
      { refName: "user", refId: "a1" },
    ]);
  });

  it("returns [] for wiped, legacy, or garbage content", () => {
    expect(RichEditor.collectMentions(null)).toEqual([]);
    expect(RichEditor.collectMentions(undefined)).toEqual([]);
    expect(RichEditor.collectMentions([])).toEqual([]);
    expect(RichEditor.collectMentions("string")).toEqual([]);
    expect(RichEditor.collectMentions({ "block-1": { type: "Paragraph" } })).toEqual([]);
    expect(
      RichEditor.collectMentions(doc({ type: "paragraph", children: [{ type: "text", text: "@notAMention" }] })),
    ).toEqual([]);
  });

  it("ignores a mention node missing its ref fields", () => {
    expect(
      RichEditor.collectMentions(doc({ type: "paragraph", children: [{ type: "akan-mention", text: "@ghost" }] })),
    ).toEqual([]);
  });
});

const textNode = (value: string) => ({ type: "text", text: value, version: 1 });
const textMention = (label: string) => ({
  type: "akan-mention",
  text: `@${label}`,
  refName: "videoObj",
  refId: "6a950544d6109ed679667ac9",
  label,
  version: 1,
});
const textDoc = (children: object[]) => ({
  root: { type: "root", version: 1, children: [{ type: "paragraph", version: 1, children }] },
});

describe("RichEditor.extractTextFromContent", () => {
  /* 사람이 읽는 자리(미리보기·검색)는 누가 불렸는지 보이는 편이 낫다 — 멘션은 글자로 남는다. */
  it("멘션을 그대로 둔다", () => {
    const content = textDoc([textNode("바닥의 "), textMention("운동화")]);
    expect(RichEditor.extractTextFromContent(content).trim()).toBe("바닥의 @운동화");
  });

  it("keeps line breaks, tabs and block boundaries as whitespace", () => {
    const content = doc(
      { type: "paragraph", children: [textNode("line one"), { type: "linebreak" }, textNode("line two")] },
      { type: "code", children: [textNode("a"), { type: "tab" }, textNode("b")] },
      { type: "akan-callout", children: [textNode("note")] },
      { type: "paragraph", children: [textNode("after")] },
    );
    expect(RichEditor.extractTextFromContent(content)).toBe("line one\nline two\na\tb\nnote\nafter\n");
  });

  it("빈 값·이상한 값에도 안 터진다", () => {
    expect(RichEditor.extractTextFromContent(null)).toBe("");
    expect(RichEditor.extractTextFromContent([])).toBe("");
    expect(RichEditor.extractTextFromContent("문자열")).toBe("");
    expect(RichEditor.extractTextFromContent([null, 1])).toBe("");
    expect(RichEditor.extractTextFromContent(doc(null, { type: "paragraph", children: [null, textNode("ok")] }))).toBe(
      "ok\n",
    );
  });
});

/*
 * 채팅 컴포저는 전송 후 초안을 지우는 대신 `contentFromText("")` 로 덮는다 — Editor 의
 * ExternalValuePlugin 은 value 가 `{ root: { type: "root" } }` 모양이 아니면 아무것도 하지 않아서
 * undefined 를 주면 에디터가 방금 보낸 본문을 그대로 들고 있기 때문이다. 그 대신 "비었는가" 판정이
 * 객체 존재 여부에서 본문 텍스트로 옮겨간다.
 */
describe("RichEditor.contentFromText", () => {
  it("빈 문서는 유효한 root 모양이면서 본문이 비어 있다", () => {
    const empty = RichEditor.contentFromText("");
    expect(empty.root.type).toBe("root");
    expect(RichEditor.extractTextFromContent(empty).trim()).toBe("");
  });

  it("본문이 있으면 비어 있지 않다", () => {
    expect(RichEditor.extractTextFromContent(RichEditor.contentFromText("안녕")).trim()).toBe("안녕");
  });
});

describe("RichEditor.contentFromMarkdown", () => {
  const blocks = (markdown: string) =>
    (RichEditor.contentFromMarkdown(markdown).root as { children: { type: string }[] }).children;

  it("gives an empty document one empty paragraph", () => {
    expect(blocks("") as unknown[]).toEqual([
      { children: [], direction: null, format: "", indent: 0, type: "paragraph", version: 1 },
    ]);
  });

  it("reads a horizontal rule, which the editor's own transformer set adds", () => {
    expect(blocks("above\n\n---\n\nbelow").map((block) => block.type)).toEqual([
      "paragraph",
      "horizontalrule",
      "paragraph",
    ]);
    expect(blocks("***")[0].type).toBe("horizontalrule");
    expect(blocks("___")[0].type).toBe("horizontalrule");
  });

  it("keeps markdown syntax literal inside a code span and a code fence", () => {
    expect(RichEditor.extractTextFromContent(RichEditor.contentFromMarkdown("`**not bold**`")).trim()).toBe(
      "**not bold**",
    );
    expect(RichEditor.extractTextFromContent(RichEditor.contentFromMarkdown("```\n# not a heading\n```")).trim()).toBe(
      "# not a heading",
    );
  });

  it("round-trips a mention through collectMentions", () => {
    expect(RichEditor.collectMentions(RichEditor.contentFromMarkdown("cc @[Kim](mention:user/u1)"))).toEqual([
      { refName: "user", refId: "u1" },
    ]);
  });

  it("extracts the plain text a searchable mirror stores", () => {
    const text = RichEditor.extractTextFromContent(
      RichEditor.contentFromMarkdown("## Progress\n\n- **API** done\n- db pending"),
    );
    expect(text).toContain("Progress");
    expect(text).toContain("API");
    expect(text).toContain("db pending");
  });

  it("leaves an unterminated code fence as a code block rather than losing the rest", () => {
    const [block] = blocks("```ts\nconst a = 1;");
    expect(block.type).toBe("code");
    expect(RichEditor.extractTextFromContent(RichEditor.contentFromMarkdown("```ts\nconst a = 1;"))).toContain(
      "const a = 1;",
    );
  });
});
