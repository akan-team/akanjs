import { describe, expect, it } from "bun:test";
import { CodeNode } from "@lexical/code";
import { LinkNode } from "@lexical/link";
import { ListItemNode, ListNode } from "@lexical/list";
import {
  $convertFromMarkdownString,
  BOLD_STAR,
  CHECK_LIST,
  CODE,
  HEADING,
  HIGHLIGHT,
  INLINE_CODE,
  ITALIC_STAR,
  LINK,
  ORDERED_LIST,
  QUOTE,
  STRIKETHROUGH,
  type Transformer,
  UNORDERED_LIST,
} from "@lexical/markdown";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { createEditor } from "lexical";

import { RichEditor } from "../../../common/richEditor";
import { MENTION } from "./markdownMention";
import { MentionNode } from "./nodes/MentionNode";

/*
 * `AKAN_TRANSFORMERS` cannot be imported here — it reaches MermaidNode and through it the util store, the
 * same reason `markdownTable.test.ts` rebuilds its own list. So this set is the subset of the editor's
 * vocabulary that core plus `@lexical/{markdown,link,list,rich-text,code}` can express. The horizontal
 * rule is the app's own transformer and is therefore covered by the unit test, not by this one.
 */
const transformers: Transformer[] = [
  HEADING,
  QUOTE,
  CHECK_LIST,
  UNORDERED_LIST,
  ORDERED_LIST,
  CODE,
  BOLD_STAR,
  ITALIC_STAR,
  STRIKETHROUGH,
  HIGHLIGHT,
  INLINE_CODE,
  MENTION,
  LINK,
];

const referenceOf = (markdown: string) => {
  const editor = createEditor({
    namespace: "contentFromMarkdown-parity",
    nodes: [HeadingNode, QuoteNode, ListNode, ListItemNode, CodeNode, LinkNode, MentionNode],
    onError: (error) => {
      throw error;
    },
  });
  editor.update(() => $convertFromMarkdownString(markdown, transformers), { discrete: true });
  return editor.getEditorState().toJSON();
};

/*
 * Two keys are dropped before comparing, and both are the editor's bookkeeping rather than the document:
 * `$` holds node state (the bullet marker it would re-export), and a mention's `text`/`href`/`imageUrl` are
 * overwritten on import — `MentionNode.importJSON` re-reads `text` from `label`, and the other two are
 * filled by whichever mention source resolves the chip.
 */
const normalize = (node: unknown): unknown => {
  if (Array.isArray(node)) return node.map(normalize);
  if (!node || typeof node !== "object") return node;
  const { $: _state, ...rest } = node as Record<string, unknown>;
  if (rest.type === "akan-mention") {
    const { text: _text, href: _href, imageUrl: _image, ...mention } = rest;
    return mention;
  }
  return Object.fromEntries(Object.entries(rest).map(([key, value]) => [key, normalize(value)]));
};

const cases: [string, string][] = [
  ["a plain paragraph", "just some text"],
  ["soft line breaks inside one paragraph", "line one\nline two"],
  ["every heading level", "# h1\n\n## h2\n\n### h3\n\n#### h4\n\n##### h5\n\n###### h6"],
  ["a quote spanning two lines", "> first\n> second"],
  ["a bullet list", "- one\n- two\n- three"],
  ["an ordered list that does not start at one", "3. three\n4. four"],
  ["a fenced code block with a language", "```ts\nconst a = 1;\n```"],
  ["a fenced code block without a language", "```\nplain\n```"],
  ["bold, italic, strikethrough and inline code", "**b** and *i* and ~~s~~ and `c`"],
  ["nested emphasis", "**bold *and italic* inside**"],
  ["a link carrying formatted text", "a [link **bold**](https://x.com) here"],
  ["a mention", "hi @[Kim](mention:user/u1) there"],
  ["a heading followed by a list and a paragraph", "## Progress\n\n- shipped\n- pending\n\nthat is all"],
  ["a checklist", "- [x] done\n- [ ] todo"],
  ["a highlight", "a ==hot== word"],
];

describe("RichEditor.contentFromMarkdown parity with the editor's own markdown import", () => {
  for (const [title, markdown] of cases) {
    it(`matches the editor for ${title}`, () => {
      expect(normalize(RichEditor.contentFromMarkdown(markdown))).toEqual(normalize(referenceOf(markdown)));
    });
  }
});
