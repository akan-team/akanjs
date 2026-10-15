"use client";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $parseSerializedNode,
  COMMAND_PRIORITY_CRITICAL,
  SELECTION_INSERT_CLIPBOARD_NODES_COMMAND,
  type SerializedLexicalNode,
} from "lexical";
import { useEffect } from "react";

import type { EditorFeature } from "../feature";
import { FeatureFilter } from "../featureFilter";
import { $exportDeep } from "./draggableBlockPlugin.util";

interface PasteFilterPluginProps {
  features: readonly EditorFeature[];
}

/**
 * Brings what a paste or a drop would insert down to the field's `features`, the same way an agent's write is:
 * a table pasted off a web page into a field with no tables arrives as its cells' text, not as a table nobody
 * there can edit, see a control for, or find in the agent's overwrite guard.
 */
export const PasteFilterPlugin = ({ features }: PasteFilterPluginProps) => {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    const allowance = FeatureFilter.allowanceOf(features);
    return editor.registerCommand(
      SELECTION_INSERT_CLIPBOARD_NODES_COMMAND,
      ({ nodes, selection }) => {
        const pasted = nodes.map($exportDeep);
        const kept = FeatureFilter.nodes(pasted, allowance);
        if (JSON.stringify(kept) === JSON.stringify(pasted)) return false;
        if (kept.length) selection.insertNodes(kept.map((node) => $parseSerializedNode(node as SerializedLexicalNode)));
        return true;
      },
      COMMAND_PRIORITY_CRITICAL,
    );
  }, [editor, features]);
  return null;
};
