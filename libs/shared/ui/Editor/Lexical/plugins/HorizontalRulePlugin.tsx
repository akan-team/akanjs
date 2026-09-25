"use client";
import { $createHorizontalRuleNode, $isHorizontalRuleNode, INSERT_HORIZONTAL_RULE_COMMAND } from "@lexical/extension";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $insertNodeToNearestRoot, mergeRegister } from "@lexical/utils";
import {
  $createNodeSelection,
  $getNodeFromDOMNode,
  $getSelection,
  $isNodeSelection,
  $isRangeSelection,
  $setSelection,
  addClassNamesToElement,
  CLICK_COMMAND,
  COMMAND_PRIORITY_EDITOR,
  COMMAND_PRIORITY_LOW,
  isDOMNode,
  type NodeKey,
  removeClassNamesFromElement,
} from "lexical";
import { useEffect } from "react";

/**
 * Divider (`<hr>`) behavior for the legacy `LexicalComposer` tree.
 *
 * Replaces the deprecated `@lexical/react` `HorizontalRulePlugin` **and** the
 * deprecated `HorizontalRuleNode`'s React decorator: upstream now ships this as
 * `HorizontalRuleExtension`, which only mounts through the extension API that
 * this editor does not use. So the pure `HorizontalRuleNode` from
 * `@lexical/extension` is registered in `config.ts` (it draws the `<hr>` itself),
 * and the three behaviors that used to live in the React decorator are
 * registered here instead:
 *
 * - `INSERT_HORIZONTAL_RULE_COMMAND` inserts a divider at the caret.
 * - Clicking a divider selects it (shift-click extends the node selection).
 * - The selected divider carries `theme.hrSelected`.
 */
export const HorizontalRulePlugin = () => {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const selectedClassName = editor._config.theme.hrSelected ?? "selected";
    // Keys currently carrying the class, so a deselect knows what to clean up
    // without walking every divider in the document.
    const classed = new Set<NodeKey>();

    return mergeRegister(
      editor.registerCommand(
        INSERT_HORIZONTAL_RULE_COMMAND,
        () => {
          const selection = $getSelection();
          if (!$isRangeSelection(selection)) return false;
          $insertNodeToNearestRoot($createHorizontalRuleNode());
          return true;
        },
        COMMAND_PRIORITY_EDITOR,
      ),
      editor.registerCommand(
        CLICK_COMMAND,
        (event: MouseEvent) => {
          if (!isDOMNode(event.target)) return false;
          const node = $getNodeFromDOMNode(event.target);
          if (!$isHorizontalRuleNode(node)) return false;
          const selection = $getSelection();
          // Read before swapping the selection out — `isSelected()` answers
          // against whatever selection is current, so a re-click on a selected
          // divider would otherwise re-add instead of toggling off.
          const wasSelected = node.isSelected();
          const nodeSelection = event.shiftKey && $isNodeSelection(selection) ? selection : $createNodeSelection();
          if (nodeSelection !== selection) $setSelection(nodeSelection);
          const key = node.getKey();
          if (wasSelected) nodeSelection.delete(key);
          else nodeSelection.add(key);
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerUpdateListener(() => {
        editor.getEditorState().read(() => {
          const selection = $getSelection();
          const selected = new Set<NodeKey>();
          if ($isNodeSelection(selection)) {
            for (const node of selection.getNodes()) {
              if ($isHorizontalRuleNode(node)) selected.add(node.getKey());
            }
          }
          for (const key of classed) {
            if (selected.has(key)) continue;
            const dom = editor.getElementByKey(key);
            if (dom) removeClassNamesFromElement(dom, selectedClassName);
            classed.delete(key);
          }
          for (const key of selected) {
            if (classed.has(key)) continue;
            const dom = editor.getElementByKey(key);
            if (dom) addClassNamesToElement(dom, selectedClassName);
            classed.add(key);
          }
        });
      }),
    );
  }, [editor]);

  return null;
};
