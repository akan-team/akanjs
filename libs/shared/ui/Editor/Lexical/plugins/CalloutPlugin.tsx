"use client";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $findMatchingParent } from "@lexical/utils";
import { usePage } from "@libs/shared/client";
import { cn } from "akanjs/client";
import { $getSelection, $isRangeSelection } from "lexical";
import { createPortal } from "react-dom";

import { $isCalloutNode, type CalloutVariant } from "../nodes/calloutNode.util";
import { updateNodeByKey } from "../nodes/shared.util";
import { editorOverlayLayer, useSelectionAnchor } from "../selectionAnchor";
import type { CalloutPickerState } from "./calloutPlugin.type";

const variantSwatches = [
  { key: "default", className: "bg-foreground/40", title: "shared.editor-calloutDefault" },
  { key: "info", className: "bg-info", title: "shared.editor-calloutInfo" },
  { key: "success", className: "bg-success", title: "shared.editor-calloutSuccess" },
  { key: "warning", className: "bg-warning", title: "shared.editor-calloutWarning" },
  { key: "error", className: "bg-destructive", title: "shared.editor-calloutError" },
] as const satisfies readonly { key: CalloutVariant; className: string; title: string }[];

/**
 * Shows a small variant picker anchored to the callout the caret is inside, so
 * a callout can be recolored across all 5 variants after insertion.
 */
export const CalloutPlugin = () => {
  const [editor] = useLexicalComposerContext();
  const { l } = usePage();
  const state = useSelectionAnchor<CalloutPickerState>(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) return null;
    const callout = $findMatchingParent(selection.anchor.getNode(), $isCalloutNode);
    if (!$isCalloutNode(callout)) return null;
    const dom = editor.getElementByKey(callout.getKey());
    return dom ? { rect: dom.getBoundingClientRect(), nodeKey: callout.getKey(), variant: callout.getVariant() } : null;
  });

  if (!state) return null;

  return createPortal(
    <div
      style={{ top: state.rect.top + 6, left: state.rect.right - 8, transform: "translateX(-100%)" }}
      className={cn(
        "fixed flex items-center gap-1 rounded-md border border-foreground/15 bg-background p-1 shadow-lg",
        editorOverlayLayer,
      )}
      onMouseDown={(event) => event.preventDefault()}
    >
      {variantSwatches.map((swatch) => (
        <button
          key={swatch.key}
          type="button"
          title={l(swatch.title)}
          aria-label={l("shared.editor-calloutVariant", { variant: l(swatch.title) })}
          className={cn(
            "h-4 w-4 rounded-full transition-transform hover:scale-110",
            swatch.className,
            state.variant === swatch.key && "ring-2 ring-foreground/50 ring-offset-1 ring-offset-background",
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
