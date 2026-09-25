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
import { isLossyTable, tableTransformer } from "./markdownTable";
import { MermaidNode } from "./nodes/MermaidNode";
import { $createMermaidNode, $isMermaidNode, DEFAULT_MERMAID_CODE } from "./nodes/mermaidNode.util";

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
    const diagram = $createMermaidNode({ code: typed || DEFAULT_MERMAID_CODE });
    // If it's the last block, insert before so the trailing paragraph stays; else replace.
    if (parentNode.getNextSibling() != null) parentNode.replace(diagram);
    else parentNode.insertBefore(diagram);
    diagram.selectNext();
  },
  type: "multiline-element",
};

/**
 * Every capability of the Akan editor, against the markdown that carries it.
 *
 * A feature with `transformers` survives a markdown round-trip; one without is destroyed by it, and
 * its `label` is the word the agent hears in the refusal. `underline` appears nowhere because it has
 * no markdown form at all (use ⌘U). `AKAN_TRANSFORMERS`, the loss labels and the agent's syntax
 * cheat-sheet are all read off this one table — see `feature.ts` for why that matters.
 *
 * **Order is load-bearing, twice over.** Element and multiline transformers must precede text-format,
 * which must precede text-match; and within a kind the earlier entry wins a tie — MERMAID before CODE
 * because `CODE`'s start pattern also matches a `mermaid` info string, and MENTION before LINK because
 * `@[x](mention:…)` and `[x](…)` end at the same index, where `findOutermostTextMatchTransformer` falls
 * back to array position.
 *
 * The lossy tail lists only nodes that can appear as a document's own child. `tablerow` / `tablecell`
 * and the collapsible title/content are absent because they only ever sit under a parent already
 * counted. A node contributed through `plugins` declares its own entry — see `EditorPlugin.features`.
 */
export const AKAN_FEATURES: readonly EditorFeature[] = [
  { nodeType: "horizontalrule", transformers: [HR], syntax: "`---` dividers" },
  { nodeType: "heading", transformers: [HEADING], syntax: "`#` headings" },
  { nodeType: "quote", transformers: [QUOTE], syntax: "`>` quotes" },
  { nodeType: "akan-mermaid", transformers: [MERMAID], syntax: "```mermaid diagrams" },
  { nodeType: "code", transformers: [CODE], syntax: "``` code fences" },
  // After CODE so a pipe inside a fence is never read as a row: `$importMultiline` consumes a fence
  // whole and skips its lines, and the multiline transformers are tried in this order.
  {
    nodeType: "table",
    label: "merged table cell",
    transformers: [tableTransformer(() => AKAN_TRANSFORMERS)],
    lossyWhen: isLossyTable,
    syntax: "`| a | b |` tables over a `| --- | --- |` row",
  },
  {
    nodeType: "list",
    transformers: [UNORDERED_LIST, ORDERED_LIST, CHECK_LIST],
    syntax: "`-` and `1.` lists, `- [ ]` checklists",
  },
  {
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
  { transformers: [STRIKETHROUGH], syntax: "~~strikethrough~~" },
  { transformers: [INLINE_CODE], syntax: "`inline code`" },
  { transformers: [HIGHLIGHT], syntax: "==highlight==" },
  // Before LINK — the two end at the same index and the outermost-match tie-break falls back to array
  // order, so behind it every mention would import as a link to `mention:…`. See `markdownMention.ts`.
  {
    nodeType: "akan-mention",
    transformers: [MENTION],
    syntax: "`@[label](mention:model/id)` mentions, whose ids come from `searchMentions`",
  },
  { nodeType: "link", transformers: [LINK], syntax: "[links](url)" },
  { nodeType: "akan-image", label: "image" },
  { nodeType: "akan-video", label: "video" },
  { nodeType: "akan-file", label: "file" },
  { nodeType: "akan-embed", label: "embed" },
  { nodeType: "akan-excalidraw", label: "drawing" },
  { nodeType: "akan-callout", label: "callout" },
  { nodeType: "akan-collapsible", label: "toggle" },
];

export const AKAN_TRANSFORMERS: Transformer[] = transformersOf(AKAN_FEATURES);
