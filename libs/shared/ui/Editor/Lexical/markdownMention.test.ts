import { describe, expect, it } from "bun:test";
import { LinkNode } from "@lexical/link";
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
  ITALIC_STAR,
  LINK,
  type Transformer,
} from "@lexical/markdown";
import { $getRoot, createEditor, type LexicalEditor } from "lexical";

import { MENTION, mentionToken } from "./markdownMention";
import { rememberMention } from "./mentionCache";
import { MentionNode } from "./nodes/MentionNode";

// `lexical` core plus `@lexical/{markdown,link}` only — see `markdownTable.test.ts` for why the real
// `AKAN_TRANSFORMERS` cannot be imported. MENTION before LINK is the ordering `AKAN_FEATURES` encodes.
const transformers: Transformer[] = [ITALIC_STAR, MENTION, LINK];

const makeEditor = () =>
  createEditor({
    namespace: "akan-test",
    nodes: [MentionNode, LinkNode],
    onError: (error) => {
      throw error;
    },
  });

const importMarkdown = (markdown: string) => {
  const editor = makeEditor();
  editor.update(() => $convertFromMarkdownString(markdown, transformers), { discrete: true });
  return editor;
};

const exportMarkdown = (editor: LexicalEditor) =>
  editor.getEditorState().read(() => $convertToMarkdownString(transformers));

const mentionIn = (editor: LexicalEditor) =>
  editor.getEditorState().read(() => {
    const found = $getRoot()
      .getAllTextNodes()
      .find((node): node is MentionNode => node instanceof MentionNode);
    return found?.getPayload();
  });

describe("markdown mention", () => {
  describe("mentionToken", () => {
    it("escapes a bracket so a title containing one cannot close the token early", () => {
      const token = mentionToken({ refName: "ticket", refId: "t1", label: "Fix [urgent] crash" });
      expect(token).toBe("@[Fix [urgent\\] crash](mention:ticket/t1)");
      expect(mentionIn(importMarkdown(token))?.label).toBe("Fix [urgent] crash");
    });

    it("collapses a newline in the label, which would otherwise split the line", () => {
      expect(mentionToken({ refName: "ticket", refId: "t1", label: "two\nlines" })).toBe(
        "@[two lines](mention:ticket/t1)",
      );
    });
  });

  describe("import", () => {
    it("builds a chip mid-sentence, leaving the surrounding text alone", () => {
      const editor = importMarkdown("cc @[Kangmin](mention:user/u1) please review");
      expect(mentionIn(editor)).toMatchObject({ refName: "user", refId: "u1", label: "Kangmin" });
      expect(editor.getEditorState().read(() => $getRoot().getTextContent())).toBe("cc Kangmin please review");
    });

    it("beats LINK, whose pattern ends at the same index", () => {
      const editor = importMarkdown("@[Kangmin](mention:user/u1)");
      expect(editor.getEditorState().read(() => $getRoot().getAllTextNodes()[0] instanceof MentionNode)).toBe(true);
    });

    it("still reads an ordinary link", () => {
      const editor = importMarkdown("[docs](https://akanjs.com)");
      expect(exportMarkdown(editor)).toBe("[docs](https://akanjs.com)");
    });

    it("keeps a label containing emphasis markers whole rather than italicising inside the chip", () => {
      const editor = importMarkdown("@[Fix *urgent* crash](mention:ticket/t2)");
      expect(mentionIn(editor)?.label).toBe("Fix *urgent* crash");
    });

    it("restores the href and avatar from the cache the search filled", () => {
      rememberMention({
        refName: "ticket",
        refId: "t9",
        label: "Deploy flaky",
        href: "/ticket?ticketId=t9",
        imageUrl: "https://cdn.akan.io/a.png",
      });
      expect(mentionIn(importMarkdown("@[Deploy flaky](mention:ticket/t9)"))).toMatchObject({
        href: "/ticket?ticketId=t9",
        imageUrl: "https://cdn.akan.io/a.png",
      });
    });

    it("still yields a working chip when the cache never saw the mention", () => {
      expect(mentionIn(importMarkdown("@[Unknown](mention:ticket/never-searched)"))).toMatchObject({
        refName: "ticket",
        refId: "never-searched",
        label: "Unknown",
        href: null,
        imageUrl: null,
      });
    });
  });

  describe("export", () => {
    it("round-trips the token unchanged", () => {
      const markdown = "cc @[Kangmin](mention:user/u1) please review";
      expect(exportMarkdown(importMarkdown(markdown))).toBe(markdown);
    });

    it("keeps refName and refId across the round-trip, which is what collectMentions reads", () => {
      const once = importMarkdown("@[Old title](mention:bizDoc/b3)");
      const twice = importMarkdown(exportMarkdown(once));
      expect(mentionIn(twice)).toMatchObject({ refName: "bizDoc", refId: "b3" });
    });
  });
});
