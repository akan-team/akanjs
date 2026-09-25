"use client";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $findMatchingParent, mergeRegister } from "@lexical/utils";
import { clsx } from "akanjs/client";
import { $getSelection, $isRangeSelection, COMMAND_PRIORITY_LOW, SELECTION_CHANGE_COMMAND } from "lexical";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { $isCalloutNode, type CalloutVariant } from "../nodes/calloutNode.util";
import { updateNodeByKey } from "../nodes/shared.util";
import type { CalloutPickerState } from "./calloutPlugin.type";

/** The 5 callout variants as color swatches for the floating picker. */
const VARIANT_SWATCHES: { key: CalloutVariant; className: string; title: string }[] = [
  { key: "default", className: "bg-base-content/40", title: "Default" },
  { key: "info", className: "bg-info", title: "Info" },
  { key: "success", className: "bg-success", title: "Success" },
  { key: "warning", className: "bg-warning", title: "Warning" },
  { key: "error", className: "bg-error", title: "Error" },
];

/**
 * Shows a small variant picker anchored to the callout the caret is inside, so
 * a callout can be recolored across all 5 variants after insertion. Follows the
 * same selection-driven, body-portaled pattern as `FloatingToolbarPlugin`.
 */
export const CalloutPlugin = () => {
  const [editor] = useLexicalComposerContext();
  const [state, setState] = useState<CalloutPickerState | null>(null);

  const refresh = useCallback(() => {
    editor.getEditorState().read(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return setState(null);
      const callout = $findMatchingParent(selection.anchor.getNode(), $isCalloutNode);
      if (!$isCalloutNode(callout)) return setState(null);
      const dom = editor.getElementByKey(callout.getKey());
      if (!dom) return setState(null);
      setState({ rect: dom.getBoundingClientRect(), nodeKey: callout.getKey(), variant: callout.getVariant() });
    });
  }, [editor]);

  useEffect(() => {
    return mergeRegister(
      editor.registerUpdateListener(() => refresh()),
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          refresh();
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
    );
  }, [editor, refresh]);

  useEffect(() => {
    if (!state) return;
    const onViewportChange = () => refresh();
    window.addEventListener("scroll", onViewportChange, true);
    window.addEventListener("resize", onViewportChange);
    return () => {
      window.removeEventListener("scroll", onViewportChange, true);
      window.removeEventListener("resize", onViewportChange);
    };
  }, [state, refresh]);

  if (!state) return null;

  return createPortal(
    <div
      style={{
        position: "fixed",
        top: state.rect.top + 6,
        left: state.rect.right - 8,
        transform: "translateX(-100%)",
        zIndex: 50,
      }}
      className="flex items-center gap-1 rounded-md border border-base-content/15 bg-base-100 p-1 shadow-lg"
      onMouseDown={(event) => event.preventDefault()}
    >
      {VARIANT_SWATCHES.map((swatch) => (
        <button
          key={swatch.key}
          type="button"
          title={swatch.title}
          aria-label={`Callout: ${swatch.title}`}
          className={clsx(
            "h-4 w-4 rounded-full transition-transform hover:scale-110",
            swatch.className,
            state.variant === swatch.key && "ring-2 ring-base-content/50 ring-offset-1 ring-offset-base-100",
          )}
          onClick={() =>
            updateNodeByKey(editor, state.nodeKey, (node) => {
              if ($isCalloutNode(node)) node.setVariant(swatch.key);
            })
          }
        />
      ))}
    </div>,
    document.body,
  );
};
