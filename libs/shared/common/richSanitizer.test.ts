import { describe, expect, it } from "bun:test";

import { RichNode } from "./richNode";
import { RichSanitizer } from "./richSanitizer";
import { RichText } from "./richText";

const doc = (...children: unknown[]) => ({ root: { type: "root", version: 1, children } });
const text = (value: string) => ({ type: "text", version: 1, text: value });
const paragraph = (...children: unknown[]) => ({ type: "paragraph", version: 1, children });
const rootChildren = (value: unknown) => (value as { root: { children: unknown[] } }).root.children;

describe("RichSanitizer.sanitize", () => {
  it("hands a clean document back as the same object", () => {
    const clean = doc(
      paragraph(text("a "), { type: "link", url: "https://a.com", children: [text("link")] }),
      { type: "akan-image", src: "https://cdn.a.com/i.png" },
      { type: "akan-mention", refName: "user", refId: "u1", label: "Kim", href: "/user/u1", imageUrl: "/api/a.png" },
    );
    expect(RichSanitizer.sanitize(clean)).toBe(clean);
  });

  it("drops a child that is not a node", () => {
    const value = doc(null, paragraph(null, 3, text("kept"), [text("nested array")]), "string");
    expect(RichSanitizer.sanitize(value)).toEqual(doc(paragraph(text("kept"))));
  });

  it("keeps a link's text when its target is refused", () => {
    const value = doc(paragraph({ type: "link", url: "javascript:alert(1)", children: [text("click")] }, text(" me")));
    expect(RichSanitizer.sanitize(value)).toEqual(doc(paragraph(text("click"), text(" me"))));
  });

  it("drops a media node whose source is refused, and keeps one with no source yet", () => {
    const value = doc(
      { type: "akan-image", src: "javascript:x" },
      { type: "akan-video", src: "data:video/mp4;base64,AA" },
      { type: "akan-file", src: "file:///etc/passwd" },
      { type: "akan-image", src: "" },
    );
    expect(RichSanitizer.sanitize(value)).toEqual(doc({ type: "akan-image", src: "" }));
  });

  it("keeps an http image, which is what local blob storage serves", () => {
    const local = doc({ type: "akan-image", src: "http://localhost:8282/api/localFile/getBlob/i.png" });
    expect(RichSanitizer.sanitize(local)).toBe(local);
  });

  it("empties an embed that names no allowed player, and canonicalizes one that does", () => {
    const [foreign, youtube] = rootChildren(
      RichSanitizer.sanitize(
        doc(
          { type: "akan-embed", url: "javascript:x", embedUrl: "https://evil.com/frame", provider: "youtube" },
          { type: "akan-embed", url: "https://youtu.be/dQw4w9WgXcQ", embedUrl: "https://youtu.be/dQw4w9WgXcQ" },
        ),
      ),
    );
    expect(foreign).toMatchObject({ type: "akan-embed", url: "", embedUrl: "" });
    expect((foreign as { provider?: unknown }).provider).toBeUndefined();
    expect(youtube).toMatchObject({ embedUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ", provider: "youtube" });
  });

  it("clears a mention's href that leaves the site and an avatar that is no image url", () => {
    const value = doc(
      paragraph({ type: "akan-mention", refName: "user", refId: "u1", href: "//evil.com", imageUrl: "javascript:x" }),
    );
    expect(RichSanitizer.sanitize(value)).toEqual(
      doc(paragraph({ type: "akan-mention", refName: "user", refId: "u1", href: null, imageUrl: null })),
    );
  });

  it("cuts a subtree nested past the depth any editor writes", () => {
    let node: object = text("deep");
    for (let depth = 0; depth < RichNode.maxDepth * 3; depth += 1) node = { type: "akan-callout", children: [node] };
    const sanitized = RichSanitizer.sanitize(doc(node));
    let depth = 0;
    let at = rootChildren(sanitized)[0] as { children?: unknown[] } | undefined;
    while (at?.children?.length) {
      at = at.children[0] as { children?: unknown[] };
      depth += 1;
    }
    expect(depth).toBeLessThanOrEqual(RichNode.maxDepth);
  });

  it("leaves what is not a document alone, but drops a non-node from a legacy array", () => {
    const blockMap = { "block-1": { type: "Paragraph" } };
    expect(RichSanitizer.sanitize(blockMap)).toBe(blockMap);
    expect(RichSanitizer.sanitize("markdown")).toBe("markdown");
    expect(RichSanitizer.sanitize([null, { type: "paragraph" }])).toEqual([{ type: "paragraph" }]);
  });
});

describe("RichText", () => {
  it("sanitizes markdown an agent writes, at the moment it is read", () => {
    const parsed = JSON.stringify(RichText.parseValue("see [x](javascript:alert) here\n\n![i](javascript:y)"));
    expect(parsed).not.toContain("javascript");
    expect(parsed).toContain("see ");
  });

  it("sanitizes a document on its way to storage", () => {
    const stored = RichText.serializeValue(doc(paragraph({ type: "link", url: "vbscript:x", children: [text("t")] })));
    expect(stored).toEqual(doc(paragraph(text("t"))));
  });

  it("accepts what old rows hold and refuses a value posing as a document", () => {
    expect(RichText.validate("markdown")).toBe(true);
    expect(RichText.validate([])).toBe(true);
    expect(RichText.validate({})).toBe(true);
    expect(RichText.validate({ "block-1": { type: "Paragraph" } })).toBe(true);
    expect(RichText.validate(doc())).toBe(true);
    expect(RichText.validate({ root: null })).toBe(false);
    expect(RichText.validate({ root: { type: "paragraph" } })).toBe(false);
    expect(RichText.validate([null])).toBe(false);
    expect(RichText.validate(3)).toBe(false);
  });

  it("loads a value posing as a document as its text, so hydration never throws on one", () => {
    const loaded = RichText.parseValue({ root: { type: "paragraph", children: [text("old body")] } } as never);
    expect(RichText.validate(loaded)).toBe(true);
    expect(JSON.stringify(loaded)).toContain("old body");
    expect(RichText.validate(RichText.parseValue({ root: null } as never))).toBe(true);
  });
});
