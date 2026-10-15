import { describe, expect, it } from "bun:test";
import { ListItemNode, ListNode } from "@lexical/list";
import { $createParagraphNode, $createTextNode, $getRoot, $parseSerializedNode, createEditor } from "lexical";

import { $exportDeep } from "./draggableBlockPlugin.util";

const makeEditor = () =>
  createEditor({
    namespace: "akan-test",
    nodes: [ListNode, ListItemNode],
    onError: (error) => {
      throw error;
    },
  });

describe("$exportDeep", () => {
  it("copies a block with everything inside it, which is what Duplicate inserts", async () => {
    const { $createListItemNode, $createListNode } = await import("@lexical/list");
    const editor = makeEditor();
    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        root.append($createParagraphNode().append($createTextNode("bold").toggleFormat("bold")));
        root.append(
          $createListNode("bullet").append(
            $createListItemNode().append($createTextNode("one")),
            $createListItemNode().append($createTextNode("two")),
          ),
        );
      },
      { discrete: true },
    );
    editor.update(
      () => {
        for (const block of $getRoot().getChildren()) block.insertAfter($parseSerializedNode($exportDeep(block)));
      },
      { discrete: true },
    );
    const [paragraph, paragraphCopy] = editor.getEditorState().toJSON().root.children;
    expect(paragraphCopy).toEqual(paragraph);
    // ListNode's own transform folds a list into the same-type list right before it, so the items join it.
    expect(editor.getEditorState().read(() => $getRoot().getTextContent())).toBe(
      "bold\n\nbold\n\none\n\ntwo\n\none\n\ntwo",
    );
  });
});
