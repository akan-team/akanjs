"use client";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { st } from "@libs/shared/client";
import { RichEditor, RichMarkdownReader, type RichNodeLike } from "@libs/shared/common";
import { Int } from "akanjs/base";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $parseSerializedNode,
  type LexicalNode,
  type SerializedLexicalNode,
} from "lexical";

import { useAgentField } from "../agentField";
import { nodeLabelsOf, syntaxOf } from "../feature";
import { type FeatureAllowance, FeatureFilter } from "../featureFilter";
import { recallMention } from "../mentionCache";
import { $spliceRichBlocks, type RichBlockOp, richBlockOps } from "./agentRichPlugin.command";
import {
  countSentence,
  isEmptyRichContent,
  labelledNodesOf,
  revealBlocks,
  richBlockListing,
  richBlocksOf,
} from "./agentRichPlugin.util";

const $nodeOf = (block: RichNodeLike): LexicalNode => {
  try {
    return $parseSerializedNode(block as SerializedLexicalNode);
  } catch {
    // An island spelled wrong keeps its words rather than failing the whole write with it.
    const text = RichEditor.extractTextFromContent([block]).trim();
    return text ? $createParagraphNode().append($createTextNode(text)) : $createParagraphNode();
  }
};

const $blocksOf = (markdown: string, allowance: FeatureAllowance) =>
  FeatureFilter.blocks(RichMarkdownReader.read(markdown).root.children, allowance, recallMention).map($nodeOf);

/**
 * Publishes this editor's field to the agent: one markdown write for the whole field, and a read/edit
 * pair that addresses its top-level blocks.
 *
 * Markdown, not the stored JSON: `st.tool` arguments are scalars, and a model authoring Lexical's tree
 * directly would trip `parseEditorState`, which `resolveEditorState` and `ExternalValuePlugin` both
 * swallow — a malformed write would empty the document with no error anywhere.
 *
 * The dialect is the one `RichText` speaks everywhere else, read by `RichMarkdownReader` — so what an agent
 * reads from the store or from MCP, it can write back here unchanged, `akan-node` islands included. What it
 * writes is then brought down to this field's `features` by `FeatureFilter`, the same vocabulary the person
 * typing has, and a node no plugin here registers is left out rather than breaking the document.
 *
 * The whole-field write refuses a field that already holds content unless the caller says the user asked to
 * replace it; the block ops are the way in otherwise, since they leave every other block untouched.
 *
 * Every conversion runs against the live editor rather than against the stored value, which buys three
 * things: `HistoryPlugin` picks it up so ⌘Z undoes an agent edit, `OnChangePlugin` carries it to the store
 * through the same path a keystroke takes, and it is not subject to `ExternalValuePlugin`'s
 * skip-while-focused guard — so a write lands even with the caret in the box.
 */
export const AgentRichPlugin = () => {
  const [editor] = useLexicalComposerContext();
  const { name, blockBase, features, content, commit } = useAgentField();
  const labels = nodeLabelsOf(features);
  const allowance = FeatureFilter.allowanceOf(features);

  st.tool(name, {
    guard: (args) => {
      if (isEmptyRichContent(content(), labels) || args.replaceAll === true) return true;
      const found = labelledNodesOf(content(), labels);
      return [
        `This field already holds content${found.length ? `, including ${countSentence(found)}` : ""}.`,
        "Edit it by block instead; pass replaceAll: true only when the user asked to replace it,",
        "and keep every ```akan-node block exactly as read.",
      ].join(" ");
    },
  })
    .desc(
      [
        "Replace this rich-text field with markdown.",
        `Understood: ${syntaxOf(features)}.`,
        "Anything else is an ```akan-node block holding one node as JSON — keep each exactly as read.",
      ].join(" "),
    )
    .arg("markdown", String)
    .opt("replaceAll", Boolean)
    .exec(async (markdown) => {
      let written: string[] = [];
      await commit(() => {
        const root = $getRoot();
        root.clear();
        root.append(...$blocksOf(markdown, allowance));
        if (!root.getChildrenSize()) root.append($createParagraphNode());
        written = root.getChildrenKeys();
      });
      await revealBlocks(editor, written);
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
        "Change one top-level block of this field, leaving the rest of the document exactly as it is.",
        "`markdown` may span several blocks. Returns the fresh listing, so the indices it reports are current.",
      ].join(" "),
    )
    .arg("op", String, { oneOf: richBlockOps })
    .opt("index", Int)
    .opt("markdown", String)
    .exec(async (op, index, markdown) => {
      let written: string[] = [];
      await commit(() => {
        const blocks = op === "remove" ? [] : $blocksOf(markdown ?? "", allowance);
        $spliceRichBlocks(op, index ?? 0, blocks);
        written = blocks.map((block) => block.getKey());
      });
      await revealBlocks(editor, written);
      return richBlockListing(content());
    });
  return null;
};
