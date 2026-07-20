"use client";
import { $isLinkNode, TOGGLE_LINK_COMMAND } from "@lexical/link";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $findMatchingParent, mergeRegister } from "@lexical/utils";
import {
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_LOW,
  FORMAT_TEXT_COMMAND,
  KEY_MODIFIER_COMMAND,
  SELECTION_CHANGE_COMMAND,
  type TextFormatType,
} from "lexical";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { safeExternalUrl } from "../url";
import type { ToolbarState } from "./floatingToolbarPlugin.type";

const MARKS: { format: TextFormatType; label: string; title: string }[] = [
  { format: "bold", label: "B", title: "Bold (⌘B)" },
  { format: "italic", label: "I", title: "Italic (⌘I)" },
  { format: "underline", label: "U", title: "Underline (⌘U)" },
  { format: "strikethrough", label: "S", title: "Strikethrough" },
  { format: "code", label: "</>", title: "Inline code" },
];

/**
 * Selection-anchored formatting toolbar. Appears above a non-empty text
 * selection with mark toggles (bold/italic/underline/strike/code) and inline
 * link editing. Hidden while collapsed, unfocused, or mid-IME-composition so it
 * never flickers during Korean input.
 */
export const FloatingToolbarPlugin = () => {
  const [editor] = useLexicalComposerContext();
  const [state, setState] = useState<ToolbarState | null>(null);
  const [linkEditing, setLinkEditing] = useState(false);

  const updateToolbar = useCallback(() => {
    // Never surface the toolbar while a composition is in flight.
    if (editor.isComposing()) return;

    const selection = $getSelection();
    const nativeSelection = window.getSelection();
    const rootElement = editor.getRootElement();

    if (
      !$isRangeSelection(selection) ||
      selection.isCollapsed() ||
      !nativeSelection ||
      nativeSelection.isCollapsed ||
      !rootElement ||
      !rootElement.contains(nativeSelection.anchorNode) ||
      selection.getTextContent().trim() === ""
    ) {
      setState(null);
      setLinkEditing(false);
      return;
    }

    const domRange = nativeSelection.getRangeAt(0);
    const rect = domRange.getBoundingClientRect();

    const formats = new Set<TextFormatType>();
    for (const { format } of MARKS) if (selection.hasFormat(format)) formats.add(format);

    // Detect an enclosing link on either endpoint node.
    const node = selection.anchor.getNode();
    const linkParent = $findMatchingParent(node, $isLinkNode);
    const linkUrl = linkParent && $isLinkNode(linkParent) ? linkParent.getURL() : null;

    setState({ rect, formats, linkUrl });
  }, [editor]);

  useEffect(() => {
    const onUpdate = () => editor.getEditorState().read(updateToolbar);
    return mergeRegister(
      editor.registerUpdateListener(onUpdate),
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          editor.getEditorState().read(updateToolbar);
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
      // ⌘K / Ctrl+K opens inline link editing when there's a selection.
      editor.registerCommand(
        KEY_MODIFIER_COMMAND,
        (event: KeyboardEvent) => {
          if (event.key.toLowerCase() !== "k" || !(event.metaKey || event.ctrlKey)) return false;
          const selection = $getSelection();
          if (!$isRangeSelection(selection) || selection.isCollapsed()) return false;
          event.preventDefault();
          setLinkEditing(true);
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
    );
  }, [editor, updateToolbar]);

  // Reposition/hide on scroll & resize since the rect is viewport-relative.
  useEffect(() => {
    if (!state) return;
    const recompute = () => editor.getEditorState().read(updateToolbar);
    window.addEventListener("scroll", recompute, true);
    window.addEventListener("resize", recompute);
    return () => {
      window.removeEventListener("scroll", recompute, true);
      window.removeEventListener("resize", recompute);
    };
  }, [editor, state, updateToolbar]);

  if (!state) return null;

  return createPortal(
    <FloatingToolbar
      state={state}
      linkEditing={linkEditing}
      onToggleMark={(format) => editor.dispatchCommand(FORMAT_TEXT_COMMAND, format)}
      onStartLinkEdit={() => setLinkEditing(true)}
      onCancelLinkEdit={() => setLinkEditing(false)}
      onSubmitLink={(url) => {
        const safe = safeExternalUrl(url);
        if (!safe) return false;
        editor.dispatchCommand(TOGGLE_LINK_COMMAND, safe);
        setLinkEditing(false);
        return true;
      }}
      onRemoveLink={() => {
        editor.dispatchCommand(TOGGLE_LINK_COMMAND, null);
        setLinkEditing(false);
      }}
    />,
    document.body,
  );
};

interface FloatingToolbarProps {
  state: ToolbarState;
  linkEditing: boolean;
  onToggleMark: (format: TextFormatType) => void;
  onStartLinkEdit: () => void;
  onCancelLinkEdit: () => void;
  onSubmitLink: (url: string) => boolean;
  onRemoveLink: () => void;
}

const TOOLBAR_HEIGHT = 40;
const TOOLBAR_GAP = 8;

export const FloatingToolbar = ({
  state,
  linkEditing,
  onToggleMark,
  onStartLinkEdit,
  onCancelLinkEdit,
  onSubmitLink,
  onRemoveLink,
}: FloatingToolbarProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const [invalid, setInvalid] = useState(false);

  // Position above the selection, clamped into the viewport horizontally.
  const top = Math.max(TOOLBAR_GAP, state.rect.top - TOOLBAR_HEIGHT - TOOLBAR_GAP);
  const left = Math.max(TOOLBAR_GAP, state.rect.left + state.rect.width / 2);

  return (
    <div
      ref={ref}
      className="fixed z-50 flex items-center gap-1 rounded-md border border-base-content/10 bg-base-100 p-1 shadow-lg"
      style={{ top, left, transform: "translateX(-50%)" }}
      onMouseDown={(event) => event.preventDefault()}
    >
      {linkEditing ? (
        <LinkInput
          initial={state.linkUrl ?? ""}
          invalid={invalid}
          onSubmit={(url) => {
            if (!onSubmitLink(url)) setInvalid(true);
          }}
          onCancel={onCancelLinkEdit}
          onChange={() => setInvalid(false)}
        />
      ) : (
        <>
          {MARKS.map((mark) => (
            <button
              key={mark.format}
              type="button"
              title={mark.title}
              className={`btn btn-ghost btn-xs min-h-7 px-2 font-mono ${
                state.formats.has(mark.format) ? "btn-active" : ""
              }`}
              onClick={() => onToggleMark(mark.format)}
            >
              {mark.label}
            </button>
          ))}
          <span className="mx-1 h-5 w-px bg-base-content/20" />
          <button
            type="button"
            title="Link (⌘K)"
            className={`btn btn-ghost btn-xs min-h-7 px-2 ${state.linkUrl ? "btn-active" : ""}`}
            onClick={onStartLinkEdit}
          >
            Link
          </button>
          {state.linkUrl ? (
            <button
              type="button"
              title="Remove link"
              className="btn btn-ghost btn-xs min-h-7 px-2"
              onClick={onRemoveLink}
            >
              Unlink
            </button>
          ) : null}
        </>
      )}
    </div>
  );
};

interface LinkInputProps {
  initial: string;
  invalid: boolean;
  onSubmit: (url: string) => void;
  onCancel: () => void;
  onChange: () => void;
}

/** Inline URL input replacing the old `window.prompt` link flow. */
export const LinkInput = ({ initial, invalid, onSubmit, onCancel, onChange }: LinkInputProps) => {
  const [url, setUrl] = useState(initial);
  return (
    <div className="flex items-center gap-1">
      <input
        // eslint-disable-next-line jsx-a11y/no-autofocus -- opened by explicit user action; focus is expected.
        autoFocus
        type="url"
        value={url}
        placeholder="https://…"
        className={`input input-xs w-52 ${invalid ? "input-error" : ""}`}
        onMouseDown={(event) => event.stopPropagation()}
        onChange={(event) => {
          setUrl(event.target.value);
          onChange();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onSubmit(url.trim());
          } else if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
        }}
      />
      <button type="button" className="btn btn-primary btn-xs min-h-7" onClick={() => onSubmit(url.trim())}>
        OK
      </button>
    </div>
  );
};
