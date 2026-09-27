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

describe("RichEditor.extractTextWithoutMentions", () => {
  it("멘션 글자를 뺀다 — 나머지 문장은 그대로다", () => {
    const content = textDoc([textNode("먼지 입자가 빛에 반짝인다."), textMention("신제품 운동화")]);
    expect(RichEditor.extractTextWithoutMentions(content).trim()).toBe("먼지 입자가 빛에 반짝인다.");
  });

  it("문장 가운데 있어도 그 자리만 빠진다", () => {
    const content = textDoc([textNode("바닥의 "), textMention("운동화"), textNode(" 클로즈업.")]);
    expect(RichEditor.extractTextWithoutMentions(content).trim()).toBe("바닥의  클로즈업.");
  });

  it("멘션이 없으면 원래 것과 같다", () => {
    const content = textDoc([textNode("스포트라이트가 내리쬔다.")]);
    expect(RichEditor.extractTextWithoutMentions(content)).toBe(RichEditor.extractTextFromContent(content));
  });

  /* 사람이 읽는 자리(미리보기·검색)는 누가 불렸는지 보이는 편이 낫다 — 그쪽은 안 바뀌어야 한다. */
  it("원래 함수는 멘션을 그대로 둔다", () => {
    const content = textDoc([textNode("바닥의 "), textMention("운동화")]);
    expect(RichEditor.extractTextFromContent(content).trim()).toBe("바닥의 @운동화");
  });

  it("빈 값·이상한 값에도 안 터진다", () => {
    expect(RichEditor.extractTextWithoutMentions(null)).toBe("");
    expect(RichEditor.extractTextWithoutMentions([])).toBe("");
    expect(RichEditor.extractTextWithoutMentions("문자열")).toBe("");
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

describe("RichEditor.appendMention", () => {
  it("마지막 문단 끝에 멘션과 한 칸을 붙인다", () => {
    const content = RichEditor.contentFromText("먼지 입자가 빛에 반짝인다.");
    const mentioned = RichEditor.appendMention(content, { refName: "videoObj", id: "o1", name: "운동화" });
    expect(RichEditor.extractTextFromContent(mentioned).trim()).toBe("먼지 입자가 빛에 반짝인다.@운동화");
    expect(RichEditor.extractTextWithoutMentions(mentioned).trim()).toBe("먼지 입자가 빛에 반짝인다.");
    expect(RichEditor.collectMentions(mentioned)).toEqual([{ refName: "videoObj", refId: "o1" }]);
  });

  it("마지막 블록이 문단이 아니면 새 문단을 연다", () => {
    const content = { root: { type: "root", version: 1, children: [{ type: "quote", version: 1, children: [] }] } };
    const mentioned = RichEditor.appendMention(content, { refName: "videoCharacter", id: "c1", name: "주인공" });
    const children = (mentioned.root as { children: { type: string }[] }).children;
    expect(children.at(-1)?.type).toBe("paragraph");
    expect(RichEditor.collectMentions(mentioned)).toEqual([{ refName: "videoCharacter", refId: "c1" }]);
  });

  it("빈 값이면 root 를 새로 세운다", () => {
    const mentioned = RichEditor.appendMention(null, { refName: "file", id: "f1", name: "콘티.png" });
    expect((mentioned.root as { type: string }).type).toBe("root");
    expect(RichEditor.extractTextWithoutMentions(mentioned).trim()).toBe("");
    expect(RichEditor.collectMentions(mentioned)).toEqual([{ refName: "file", refId: "f1" }]);
  });
});

describe("RichEditor.contentFromMentionText", () => {
  it("문장 가운데의 토큰을 그 자리에 칩으로 앉힌다", () => {
    const content = RichEditor.contentFromMentionText("바닥의 @[운동화](mention:videoObj/o1) 클로즈업.");
    expect(RichEditor.extractTextWithoutMentions(content).trim()).toBe("바닥의  클로즈업.");
    expect(RichEditor.collectMentions(content)).toEqual([{ refName: "videoObj", refId: "o1" }]);
  });

  /* 토큰 문법에 href 가 없다 — 모델마다 있는 라우트를 지어내면 칩이 없는 화면으로 이동한다. */
  it("링크 없는 참조로 만든다", () => {
    const content = RichEditor.contentFromMentionText("@[운동화](mention:videoObj/o1)");
    const [chip] = (content.root.children[0] as { children: { type: string; href?: unknown }[] }).children;
    expect(chip.type).toBe("akan-mention");
    expect(chip.href).toBeUndefined();
  });

  it("한 줄의 두 토큰을 모두 읽는다", () => {
    const content = RichEditor.contentFromMentionText(
      "@[지현](mention:videoCharacter/c1) 이 @[운동화](mention:videoObj/o1) 를 집는다",
    );
    expect(RichEditor.collectMentions(content)).toEqual([
      { refName: "videoCharacter", refId: "c1" },
      { refName: "videoObj", refId: "o1" },
    ]);
    expect(RichEditor.extractTextWithoutMentions(content).trim()).toBe("이  를 집는다");
  });

  it("한 줄이 한 문단이고, 빈 줄은 빈 문단으로 남는다", () => {
    const content = RichEditor.contentFromMentionText("첫 줄\n\n둘째 줄");
    expect((content.root.children as unknown[]).length).toBe(3);
    expect(RichEditor.extractTextFromContent(content).trim()).toBe("첫 줄\n\n둘째 줄");
  });

  it("라벨에 이스케이프된 `]` 를 되돌린다", () => {
    const token = RichEditor.mentionToken({ refName: "videoScene", refId: "s1", label: "숨은 방 [열쇠]" });
    expect(token).toBe("@[숨은 방 [열쇠\\]](mention:videoScene/s1)");
    const content = RichEditor.contentFromMentionText(token);
    expect(RichEditor.collectMentions(content)).toEqual([{ refName: "videoScene", refId: "s1" }]);
    expect(RichEditor.extractTextFromContent(content).trim()).toBe("@숨은 방 [열쇠]");
  });

  it("멘션이 아닌 `@` 는 글자로 남는다", () => {
    const content = RichEditor.contentFromMentionText("@[x](mention:broken) @일반");
    expect(RichEditor.collectMentions(content)).toEqual([]);
    expect(RichEditor.extractTextFromContent(content).trim()).toBe("@[x](mention:broken) @일반");
  });
});

describe("RichEditor.contentFromMarkdown", () => {
  const blocks = (markdown: string) =>
    (RichEditor.contentFromMarkdown(markdown).root as { children: { type: string }[] }).children;

  it("gives an empty document one empty paragraph", () => {
    expect(blocks("")).toEqual([
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

describe("RichEditor.extractMentionText", () => {
  it("칩을 토큰으로 되돌린다 — contentFromMentionText 의 역이다", () => {
    const body = "바닥의 @[운동화](mention:videoObj/6a1f) 클로즈업.";
    expect(RichEditor.extractMentionText(RichEditor.contentFromMentionText(body)).trim()).toBe(body);
  });

  it("멘션이 없으면 본문 그대로다", () => {
    const content = textDoc([textNode("스포트라이트가 내리쬔다.")]);
    expect(RichEditor.extractMentionText(content)).toBe(RichEditor.extractTextFromContent(content));
  });
});
