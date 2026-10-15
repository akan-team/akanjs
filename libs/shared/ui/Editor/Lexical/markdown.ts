import { $createHorizontalRuleNode, $isHorizontalRuleNode, HorizontalRuleNode } from "@lexical/extension";
import {
  BOLD_ITALIC_STAR,
  BOLD_ITALIC_UNDERSCORE,
  BOLD_STAR,
  BOLD_UNDERSCORE,
  CHECK_LIST,
  CODE,
  type ElementTransformer,
  HEADING,
  HIGHLIGHT,
  INLINE_CODE,
  ITALIC_STAR,
  ITALIC_UNDERSCORE,
  LINK,
  type MultilineElementTransformer,
  ORDERED_LIST,
  QUOTE,
  STRIKETHROUGH,
  type Transformer,
  UNORDERED_LIST,
} from "@lexical/markdown";
import type { LexicalNode } from "lexical";
import { type EditorFeature, transformersOf } from "./feature";
import { MENTION } from "./markdownMention";
import { MermaidNode } from "./nodes/MermaidNode";
import { $createMermaidNode, $isMermaidNode, defaultMermaidCode } from "./nodes/mermaidNode.util";

/**
 * Horizontal-rule markdown transformer (`---`, `***`, `___`). `@lexical/markdown`
 * ships no HR transformer, so we add one (mirrors the Lexical playground).
 */
const HR: ElementTransformer = {
  dependencies: [HorizontalRuleNode],
  export: (node: LexicalNode) => ($isHorizontalRuleNode(node) ? "---" : null),
  regExp: /^(---|\*\*\*|___)\s?$/,
  replace: (parentNode, _children, _match, isImport) => {
    const line = $createHorizontalRuleNode();
    // If it's the last block, insert before so the trailing paragraph stays; else replace.
    if (isImport || parentNode.getNextSibling() != null) {
      parentNode.replace(line);
    } else {
      parentNode.insertBefore(line);
    }
    line.selectNext();
  },
  type: "element",
};

/**
 * ```` ```mermaid ```` fence → a Mermaid diagram block.
 *
 * Must sit before `CODE` in the transformer list: `CODE`'s start pattern also
 * matches a `mermaid` info string, and the first matching multiline transformer
 * wins. `regExpEnd.optional` is what makes the typed form work at all —
 * `registerMarkdownShortcuts` skips any multiline transformer with a mandatory
 * end match (same reason `CODE` marks its own closing fence optional).
 */
const MERMAID: MultilineElementTransformer = {
  dependencies: [MermaidNode],
  export: (node: LexicalNode) => ($isMermaidNode(node) ? `\`\`\`mermaid\n${node.getCode()}\n\`\`\`` : null),
  regExpStart: /^[ \t]*```mermaid/,
  regExpEnd: { optional: true, regExp: /^[ \t]*```$/ },
  replace: (parentNode, children, _startMatch, _endMatch, linesInBetween, isImport) => {
    // The two callers hand over different things. On import `parentNode` is the
    // root container and the body arrives as `linesInBetween`, so the node is
    // appended (never `replace`d — that would swap out the root). While typing
    // it is the paragraph holding the fence, with only the trailing text as
    // `children`, so an empty fence falls back to the sample diagram.
    if (isImport) {
      const code = linesInBetween?.join("\n").trim();
      if (!code) return false;
      parentNode.append($createMermaidNode({ code }));
      return;
    }
    const typed = children
      ?.map((child) => child.getTextContent())
      .join("")
      .trim();
    const diagram = $createMermaidNode({ code: typed || defaultMermaidCode });
    // If it's the last block, insert before so the trailing paragraph stays; else replace.
    if (parentNode.getNextSibling() != null) parentNode.replace(diagram);
    else parentNode.insertBefore(diagram);
    diagram.selectNext();
  },
  type: "multiline-element",
};

/**
 * Every capability of the Akan editor: the shortcuts a person types it with, the clause of the agent's markdown
 * dialect that writes it, and — for a node that means something with no text of its own — the word the agent's
 * overwrite guard counts it by. Everything the editor's `features` prop switches off is read off this one table.
 * `underline` has neither shortcut nor markdown (use ⌘U); it is here only for its `key`.
 *
 * **Order is load-bearing, twice over.** Element and multiline transformers must precede text-format,
 * which must precede text-match; and within a kind the earlier entry wins a tie — MERMAID before CODE
 * because `CODE`'s start pattern also matches a `mermaid` info string, and MENTION before LINK because
 * `@[x](mention:…)` and `[x](…)` end at the same index, where `findOutermostTextMatchTransformer` falls
 * back to array position.
 */
export const akanFeatures: readonly EditorFeature[] = [
  { key: "divider", nodeType: "horizontalrule", transformers: [HR], syntax: "`---` dividers" },
  { key: "heading", nodeType: "heading", transformers: [HEADING], syntax: "`#` headings" },
  { key: "quote", nodeType: "quote", transformers: [QUOTE], syntax: "`>` quotes" },
  {
    key: "mermaid",
    nodeType: "akan-mermaid",
    label: "diagram",
    transformers: [MERMAID],
    syntax: "```mermaid diagrams",
  },
  { key: "code", nodeType: "code", transformers: [CODE], syntax: "``` code fences" },
  { key: "table", nodeType: "table", syntax: "`| a | b |` tables over a `| --- | --- |` row" },
  {
    key: "list",
    nodeType: "list",
    transformers: [UNORDERED_LIST, ORDERED_LIST, CHECK_LIST],
    syntax: "`-` and `1.` lists, `- [ ]` checklists",
  },
  {
    key: "emphasis",
    transformers: [
      BOLD_ITALIC_STAR,
      BOLD_ITALIC_UNDERSCORE,
      BOLD_STAR,
      BOLD_UNDERSCORE,
      ITALIC_STAR,
      ITALIC_UNDERSCORE,
    ],
    syntax: "**bold** and *italic*",
  },
  { key: "strikethrough", transformers: [STRIKETHROUGH], syntax: "~~strikethrough~~" },
  { key: "inlineCode", transformers: [INLINE_CODE], syntax: "`inline code`" },
  { key: "highlight", transformers: [HIGHLIGHT], syntax: "==highlight==" },
  { key: "underline" },
  // Before LINK — the two end at the same index and the outermost-match tie-break falls back to array
  // order, so behind it every mention would import as a link to `mention:…`. See `markdownMention.ts`.
  {
    key: "mention",
    nodeType: "akan-mention",
    transformers: [MENTION],
    plain: true,
    syntax: "`@[label](mention:model/id)` mentions, whose ids come from `searchMentions`",
  },
  { key: "link", nodeType: "link", transformers: [LINK], syntax: "[links](url)" },
  { key: "image", nodeType: "akan-image", label: "image", syntax: "`![alt](url)` images on a line of their own" },
  { key: "video", nodeType: "akan-video", label: "video" },
  { key: "file", nodeType: "akan-file", label: "file" },
  { key: "embed", nodeType: "akan-embed", label: "embed" },
  { key: "excalidraw", nodeType: "akan-excalidraw", label: "drawing" },
  { key: "callout", nodeType: "akan-callout" },
  { key: "collapsible", nodeType: "akan-collapsible" },
];

export const akanTransformers: Transformer[] = transformersOf(akanFeatures);
