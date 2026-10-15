"use client";
import { $isLinkNode, TOGGLE_LINK_COMMAND } from "@lexical/link";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $findMatchingParent } from "@lexical/utils";
import { usePage } from "@libs/shared/client";
import { RichUrl } from "@libs/shared/common";
import { buttonRecipe, inputRecipe } from "@libs/util/ui";
import { cn } from "akanjs/client";
import {
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_LOW,
  FORMAT_TEXT_COMMAND,
  KEY_MODIFIER_COMMAND,
  type TextFormatType,
} from "lexical";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { EditorFeatureKey } from "../feature";
import { editorOverlayLayer, useSelectionAnchor } from "../selectionAnchor";
import { formatFeatures, type GuardedFormat } from "../textFormat";
import type { ToolbarState } from "./floatingToolbarPlugin.type";

const marks = [
  { format: "bold", label: "B", title: "shared.editor-bold" },
  { format: "italic", label: "I", title: "shared.editor-italic" },
  { format: "underline", label: "U", title: "shared.editor-underline" },
  { format: "strikethrough", label: "S", title: "shared.editor-strike" },
  { format: "code", label: "</>", title: "shared.editor-inlineCode" },
] as const satisfies readonly { format: GuardedFormat; label: string; title: string }[];

type Mark = (typeof marks)[number];

/**
 * Selection-anchored formatting toolbar. Appears above a non-empty text
 * selection with mark toggles (bold/italic/underline/strike/code) and inline
 * link editing. Hidden while collapsed, unfocused, or mid-IME-composition so it
 * never flickers during Korean input.
 *
 * Each control is gated on the feature it applies, so a field given none of them renders no toolbar
 * at all and the caller never has to switch `toolbar` off by hand to match its `features`.
 */
export const FloatingToolbarPlugin = ({ features }: { features: ReadonlySet<EditorFeatureKey> }) => {
  const [editor] = useLexicalComposerContext();
  const [linkEditing, setLinkEditing] = useState(false);
  const shownMarks = useMemo(() => marks.filter((mark) => features.has(formatFeatures[mark.format])), [features]);
  const canLink = features.has("link");

  const state = useSelectionAnchor<ToolbarState>(() => {
    // Never surface the toolbar while a composition is in flight.
    if (editor.isComposing()) return undefined;
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
    )
      return null;
    const formats = new Set<TextFormatType>();
    for (const { format } of shownMarks) if (selection.hasFormat(format)) formats.add(format);
    const linkParent = $findMatchingParent(selection.anchor.getNode(), $isLinkNode);
    const linkUrl = linkParent && $isLinkNode(linkParent) ? linkParent.getURL() : null;
    return { rect: nativeSelection.getRangeAt(0).getBoundingClientRect(), formats, linkUrl };
  });

  useEffect(() => {
    if (!state) setLinkEditing(false);
  }, [state]);

  // ⌘K / Ctrl+K opens inline link editing when there's a selection.
  useEffect(
    () =>
      editor.registerCommand(
        KEY_MODIFIER_COMMAND,
        (event: KeyboardEvent) => {
          if (!canLink || event.key.toLowerCase() !== "k" || !(event.metaKey || event.ctrlKey)) return false;
          const selection = $getSelection();
          if (!$isRangeSelection(selection) || selection.isCollapsed()) return false;
          event.preventDefault();
          setLinkEditing(true);
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
    [editor, canLink],
  );

  if (!state || (!shownMarks.length && !canLink)) return null;

  return createPortal(
    <FloatingToolbar
      state={state}
      marks={shownMarks}
      canLink={canLink}
      linkEditing={linkEditing}
      onToggleMark={(format) => editor.dispatchCommand(FORMAT_TEXT_COMMAND, format)}
      onStartLinkEdit={() => setLinkEditing(true)}
      onCancelLinkEdit={() => setLinkEditing(false)}
      onSubmitLink={(url) => {
        const safe = RichUrl.typedLink(url);
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
  marks: readonly Mark[];
  canLink: boolean;
  linkEditing: boolean;
  onToggleMark: (format: TextFormatType) => void;
  onStartLinkEdit: () => void;
  onCancelLinkEdit: () => void;
  onSubmitLink: (url: string) => boolean;
  onRemoveLink: () => void;
}

const toolbarHeight = 40;
const toolbarGap = 8;

export const FloatingToolbar = ({
  state,
  marks,
  canLink,
  linkEditing,
  onToggleMark,
  onStartLinkEdit,
  onCancelLinkEdit,
  onSubmitLink,
  onRemoveLink,
}: FloatingToolbarProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const [invalid, setInvalid] = useState(false);
  const { l } = usePage();

  // Above the selection, or below it when the selection sits at the top of the viewport.
  const above = state.rect.top - toolbarHeight - toolbarGap;
  const top = above >= toolbarGap ? above : state.rect.bottom + toolbarGap;
  const center = state.rect.left + state.rect.width / 2;

  // Its width is known only once drawn, so the horizontal clamp lands after layout and before paint.
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const half = element.offsetWidth / 2;
    element.style.left = `${Math.min(Math.max(center, toolbarGap + half), window.innerWidth - toolbarGap - half)}px`;
  });

  return (
    <div
      ref={ref}
      className={cn(
        "fixed flex items-center gap-1 rounded-md border border-foreground/10 bg-background p-1 shadow-lg",
        editorOverlayLayer,
      )}
      style={{ top, left: center, transform: "translateX(-50%)" }}
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
          {marks.map((mark) => (
            <button
              key={mark.format}
              type="button"
              title={l(mark.title)}
              className={buttonRecipe({ variant: "ghost", size: "xs" }, [
                "min-h-7 px-2 font-mono",
                state.formats.has(mark.format) && "bg-muted text-foreground",
              ])}
              onClick={() => onToggleMark(mark.format)}
            >
              {mark.label}
            </button>
          ))}
          {canLink ? (
            <>
              {marks.length ? <span className="mx-1 h-5 w-px bg-foreground/20" /> : null}
              <button
                type="button"
                title={l("shared.editor-linkShortcut")}
                className={buttonRecipe({ variant: "ghost", size: "xs" }, [
                  "min-h-7 px-2",
                  state.linkUrl && "bg-muted text-foreground",
                ])}
                onClick={onStartLinkEdit}
              >
                {l("shared.editor-link")}
              </button>
            </>
          ) : null}
          {canLink && state.linkUrl ? (
            <button
              type="button"
              title={l("shared.editor-removeLink")}
              className={buttonRecipe({ variant: "ghost", size: "xs" }, "min-h-7 px-2")}
              onClick={onRemoveLink}
            >
              {l("shared.editor-unlink")}
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
  const { l } = usePage();
  return (
    <div className="flex items-center gap-1">
      <input
        autoFocus
        type="url"
        value={url}
        placeholder="https://…"
        className={inputRecipe({ size: "xs" }, ["w-52", invalid && "border-destructive"])}
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
      <button
        type="button"
        className={buttonRecipe({ variant: "primary", size: "xs" }, "min-h-7")}
        onClick={() => onSubmit(url.trim())}
      >
        {l("shared.editor-ok")}
      </button>
    </div>
  );
};
