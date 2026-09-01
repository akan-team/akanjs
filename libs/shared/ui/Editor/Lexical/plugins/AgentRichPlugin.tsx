"use client";
import { $convertFromMarkdownString, $generateNodesFromMarkdownString } from "@lexical/markdown";
import { st } from "@libs/shared/client";
import { Int } from "akanjs/base";
import { $createParagraphNode, $isDecoratorNode, $isElementNode, type LexicalNode } from "lexical";

import { useAgentField } from "../agentField";
import { lossesOf, syntaxOf } from "../feature";
import { AKAN_TRANSFORMERS } from "../markdown";
import { $spliceRichBlocks, type RichBlockOp, richBlockOps } from "./agentRichPlugin.command";
import { isEmptyRichContent, lossSentence, lossyNodesOf, richBlockListing, richBlocksOf } from "./agentRichPlugin.util";

const isBlockNode = (node: LexicalNode) => ($isElementNode(node) || $isDecoratorNode(node)) && !node.isInline();

/** Markdown as root-level blocks. An inline node cannot sit under the root, so it gets a paragraph of its own. */
const $blocksFromMarkdown = (markdown: string) =>
  $generateNodesFromMarkdownString(markdown, AKAN_TRANSFORMERS).map((node) =>
    isBlockNode(node) ? node : $createParagraphNode().append(node),
  );

/**
 * Publishes this editor's field to the agent: one markdown write for the whole field, and a read/edit
 * pair that addresses its top-level blocks.
 *
 * Markdown, not the stored JSON: `st.tool` arguments are scalars, and a model authoring Lexical's tree
 * directly would trip `parseEditorState`, which `resolveEditorState` and `ExternalValuePlugin` both
 * swallow — a malformed write would empty the document with no error anywhere. Markdown also arrives
 * through `AKAN_TRANSFORMERS`, the curated node set the person's own typing goes through.
 *
 * The whole-field write refuses a document that already holds content, because markdown export is lossy
 * for every node class outside `AKAN_FEATURES`' transformer set; the block ops are the way in after that,
 * since they convert only the fragment the caller wrote and leave every other block untouched.
 *
 * Every conversion runs against the live editor rather than against the stored value, which buys three
 * things: `HistoryPlugin` picks it up so ⌘Z undoes an agent edit, `OnChangePlugin` carries it to the store
 * through the same path a keystroke takes, and it is not subject to `ExternalValuePlugin`'s
 * skip-while-focused guard — so a write lands even with the caret in the box.
 */
export const AgentRichPlugin = () => {
  const { name, blockBase, features, content, commit } = useAgentField();
  const losses = lossesOf(features);

  st.tool(name, {
    guard: (args) => {
      if (isEmptyRichContent(content(), losses) || args.replaceAll === true) return true;
      const found = lossyNodesOf(content(), losses);
      return found.length
        ? `This field already holds content, including ${lossSentence(
            found,
          )} that markdown cannot carry. Edit it by block instead, or pass replaceAll: true to lose them.`
        : "This field already holds text. Edit it by block instead, or pass replaceAll: true to overwrite it.";
    },
  })
    .desc(
      [
        "Replace this rich-text field with markdown.",
        `Understood: ${syntaxOf(features)}.`,
        `Not carried: ${Object.values(losses)
          .map(({ label }) => `${label}s`)
          .join(", ")}.`,
      ].join(" "),
    )
    .arg("markdown", String)
    .opt("replaceAll", Boolean)
    .exec(async (markdown) => {
      await commit(() => {
        $convertFromMarkdownString(markdown, AKAN_TRANSFORMERS);
      });
    });

  st.tool(blockBase ? `read${blockBase}` : null, { settle: false })
    .desc(
      "List this field's top-level blocks as `index type text`. Read before editing by block — an index shifts under insert and remove.",
    )
    .exec(() => richBlockListing(content()));

  st.tool(blockBase ? `edit${blockBase}` : null, {
    guard: (args) => {
      const op = args.op as RichBlockOp;
      if (op !== "remove" && !String(args.markdown ?? "").trim()) return `"${op}" needs the markdown to write.`;
      if (op === "append") return true;
      const count = richBlocksOf(content()).length;
      if (!count) return "This field is empty. Append instead, or write the whole field at once.";
      if (typeof args.index !== "number") return `"${op}" needs the index of the block. Read the blocks first.`;
      const last = op === "insert" ? count : count - 1;
      return args.index >= 0 && args.index <= last
        ? true
        : `This field has ${count} blocks, so "${op}" takes an index of 0 to ${last}.`;
    },
  })
    .desc(
      [
        "Change one top-level block of this field, leaving the rest of the document exactly as it is —",
        "the only way to edit a field holding anything the whole-field write cannot carry.",
        "`markdown` may span several blocks. Returns the fresh listing, so the indices it reports are current.",
      ].join(" "),
    )
    .arg("op", String, { oneOf: richBlockOps })
    .opt("index", Int)
    .opt("markdown", String)
    .exec(async (op, index, markdown) => {
      await commit(() => {
        $spliceRichBlocks(op, index ?? 0, op === "remove" ? [] : $blocksFromMarkdown(markdown ?? ""));
      });
      return richBlockListing(content());
    });
  return null;
};
