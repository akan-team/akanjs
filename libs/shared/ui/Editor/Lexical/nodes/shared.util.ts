"use client";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useLexicalEditable } from "@lexical/react/useLexicalEditable";
import { useLexicalNodeSelection } from "@lexical/react/useLexicalNodeSelection";
import { mergeRegister } from "@lexical/utils";
import {
  $getNodeByKey,
  $getSelection,
  $isNodeSelection,
  CLICK_COMMAND,
  COMMAND_PRIORITY_LOW,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
} from "lexical";
import { useCallback, useEffect } from "react";
import type { MediaAlign } from "./shared.type";

export const ALIGN_TO_JUSTIFY: Record<MediaAlign, string> = {
  left: "justify-start",
  center: "justify-center",
  right: "justify-end",
};

/**
 * Selection + lifecycle wiring shared by every decorator media component.
 *
 * - Click on the node's DOM selects it (node selection).
 * - Backspace/Delete removes it while selected.
 * - `update` runs a writable mutation against the node by key.
 *
 * Only active while the editor is editable, so read-only renders stay inert.
 */
export const useMediaNode = (nodeKey: NodeKey) => {
  const [editor] = useLexicalComposerContext();
  const editable = useLexicalEditable();
  const [isSelected, setSelected, clearSelection] = useLexicalNodeSelection(nodeKey);

  const onDelete = useCallback(
    (event: KeyboardEvent) => {
      if (!isSelected || !$isNodeSelection($getSelection())) return false;
      event.preventDefault();
      $getNodeByKey(nodeKey)?.remove();
      return true;
    },
    [isSelected, nodeKey],
  );

  useEffect(() => {
    if (!editable) return;
    return mergeRegister(
      editor.registerCommand(
        CLICK_COMMAND,
        (event: MouseEvent) => {
          const dom = editor.getElementByKey(nodeKey);
          if (dom !== null && event.target instanceof Node && dom.contains(event.target)) {
            if (!event.shiftKey) clearSelection();
            setSelected(true);
            return true;
          }
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(KEY_DELETE_COMMAND, onDelete, COMMAND_PRIORITY_LOW),
      editor.registerCommand(KEY_BACKSPACE_COMMAND, onDelete, COMMAND_PRIORITY_LOW),
    );
  }, [editor, editable, nodeKey, clearSelection, setSelected, onDelete]);

  const removeNode = useCallback(() => {
    editor.update(() => $getNodeByKey(nodeKey)?.remove());
  }, [editor, nodeKey]);

  return { editor: editor as LexicalEditor, editable, isSelected, setSelected, removeNode };
};

/**
 * Runs a writable mutation against the node identified by `nodeKey`. `merge`
 * folds the change into the previous history entry (used for continuous resize
 * drags so a single drag is one undo step). Callers guard the node type.
 */
export const updateNodeByKey = (
  editor: LexicalEditor,
  nodeKey: NodeKey,
  updater: (node: LexicalNode) => void,
  merge = false,
) => {
  editor.update(
    () => {
      const node = $getNodeByKey(nodeKey);
      if (node !== null) updater(node);
    },
    merge ? { tag: "history-merge" } : undefined,
  );
};
