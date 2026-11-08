"use client";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $isTableCellNode } from "@lexical/table";
import { $findMatchingParent, mergeRegister } from "@lexical/utils";
import {
  $getSelection,
  $isParagraphNode,
  $isRangeSelection,
  $isRootNode,
  BLUR_COMMAND,
  COMMAND_PRIORITY_LOW,
  FOCUS_COMMAND,
} from "lexical";
import { useEffect } from "react";

// Spelled out again in the Editor's `[&_[data-line-hint]]` classes: Tailwind cannot read an interpolated selector.
const lineHintAttribute = "data-line-hint";

const $hintedParagraphKey = () => {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return null;
  const node = selection.anchor.getNode();
  if (!$isParagraphNode(node) || !node.isEmpty()) return null;
  const parent = node.getParent();
  // The same shape `$canShowPlaceholder` admits, where the editor's own placeholder is already on this line.
  if ($isRootNode(parent) && parent.getChildrenSize() === 1 && node.getIndent() === 0) return null;
  if ($findMatchingParent(node, $isTableCellNode)) return null;
  return node.getKey();
};

interface LineHintPluginProps {
  hint: string;
}

export const LineHintPlugin = ({ hint }: LineHintPluginProps) => {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    let hinted: HTMLElement | null = null;
    let focused = editor.getRootElement() === document.activeElement;
    // Lexical's mutation observer ignores attribute changes, so the mark never reads back into the state; a paragraph
    // re-created by reconciliation loses it, hence the repaint on every update.
    const paint = () => {
      const key = focused && !editor.isComposing() ? editor.getEditorState().read($hintedParagraphKey) : null;
      const element = key ? editor.getElementByKey(key) : null;
      if (hinted && hinted !== element) hinted.removeAttribute(lineHintAttribute);
      element?.setAttribute(lineHintAttribute, hint);
      hinted = element;
    };
    paint();
    return mergeRegister(
      editor.registerUpdateListener(paint),
      editor.registerCommand(
        FOCUS_COMMAND,
        () => {
          focused = true;
          paint();
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        BLUR_COMMAND,
        () => {
          focused = false;
          paint();
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
      () => hinted?.removeAttribute(lineHintAttribute),
    );
  }, [editor, hint]);
  return null;
};
