"use client";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useLexicalEditable } from "@lexical/react/useLexicalEditable";
import { buttonRecipe } from "@libs/util/ui";
import { cn } from "akanjs/client";
import type { NodeKey } from "lexical";
import type { JSX } from "react";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AiOutlineEdit, AiOutlinePartition } from "react-icons/ai";
import {
  $isMermaidNode,
  DEFAULT_MERMAID_CODE,
  type MermaidRender,
  RESET_WIDTH,
  renderMermaid,
} from "./mermaidNode.util";
import { MediaFrame, MediaMenuButton } from "./shared";
import type { MediaAlign } from "./shared.type";
import { updateNodeByKey, useDarkTheme } from "./shared.util";

/** Debounce for the modal's live preview, so every keystroke isn't a full mermaid parse. */
const PREVIEW_DEBOUNCE_MS = 300;

interface MermaidComponentProps {
  nodeKey: NodeKey;
  code: string;
  width: number;
  align: MediaAlign;
}

export const MermaidComponent = ({ nodeKey, code, width, align }: MermaidComponentProps) => {
  const [editor] = useLexicalComposerContext();
  const editable = useLexicalEditable();
  const dark = useDarkTheme();
  const [open, setOpen] = useState(false);
  // The rendered source is carried alongside the result: the previous diagram
  // stays on screen while a new one renders (no flicker), and the width
  // adoption below can tell whether the intrinsic size it sees is still current.
  const [render, setRender] = useState<(MermaidRender & { code: string }) | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!code.trim()) {
      setRender(null);
      setError(null);
      return;
    }
    let cancelled = false;
    void renderMermaid(code, dark).then(
      (next) => {
        if (cancelled) return;
        setRender({ ...next, code });
        setError(null);
      },
      (reason: Error) => {
        if (cancelled) return;
        setRender(null);
        setError(reason.message);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [code, dark]);

  const setWidth = useCallback(
    (nextWidth: number, merge = false) =>
      updateNodeByKey(
        editor,
        nodeKey,
        (node) => {
          if ($isMermaidNode(node)) node.setWidth(nextWidth);
        },
        merge,
      ),
    [editor, nodeKey],
  );

  // Adopt the diagram's intrinsic width once (capped), so it resizes from a sane
  // origin. Gated on the render matching the current source — right after an edit
  // the previous diagram is still on screen, and adopting *its* width is exactly
  // how a wide diagram ends up pinned at the old narrow one's size.
  useEffect(() => {
    if (width || !render?.width || render.code !== code) return;
    setWidth(Math.min(render.width, RESET_WIDTH), true);
  }, [width, render, code, setWidth]);

  const saveCode = (next: string) => {
    updateNodeByKey(editor, nodeKey, (node) => {
      if (!$isMermaidNode(node) || node.getCode() === next) return;
      node.setCode(next);
      // Drop the width so the effect above refits the block. A flowchart and a
      // sequence diagram differ wildly in natural width, and a stale one leaves
      // the new diagram squeezed under a floating menu that covers it.
      node.setWidth(0);
    });
    setOpen(false);
  };

  return (
    <>
      <MediaFrame
        nodeKey={nodeKey}
        align={align}
        width={width}
        height={render?.height ?? 0}
        minWidth={160}
        onSetAlign={(nextAlign) =>
          updateNodeByKey(editor, nodeKey, (node) => {
            if ($isMermaidNode(node)) node.setAlign(nextAlign);
          })
        }
        onResize={(nextWidth) => setWidth(nextWidth, true)}
        // Reset to `0`, not `RESET_WIDTH`: that re-arms the adoption effect below,
        // so the diagram snaps back to its own natural size. Matters after an edit
        // swaps a narrow flowchart for a wide sequence diagram — the stale width
        // would otherwise keep squeezing it.
        onReset={() => setWidth(0)}
        extraActions={
          editable ? (
            <MediaMenuButton title="Edit" onClick={() => setOpen(true)}>
              <AiOutlineEdit />
            </MediaMenuButton>
          ) : null
        }
      >
        <MermaidFigure
          render={render}
          error={error}
          width={width}
          empty={!code.trim()}
          editable={editable}
          onEdit={() => setOpen(true)}
        />
      </MediaFrame>
      {open ? <MermaidModal code={code} dark={dark} onCancel={() => setOpen(false)} onSave={saveCode} /> : null}
    </>
  );
};

interface MermaidFigureProps {
  render: MermaidRender | null;
  error: string | null;
  width: number;
  empty: boolean;
  editable: boolean;
  onEdit: () => void;
}

/**
 * The diagram itself. Rendered SVG is injected as markup — mermaid runs with
 * `securityLevel: "strict"`, which sanitizes every label it emits.
 */
const MermaidFigure = ({ render, error, width, empty, editable, onEdit }: MermaidFigureProps) => {
  if (empty)
    return (
      <button
        type="button"
        onClick={() => {
          if (editable) onEdit();
        }}
        className="flex h-40 w-80 max-w-full flex-col items-center justify-center gap-2 rounded-md border border-foreground/20 border-dashed bg-muted/40 text-foreground/50"
      >
        <AiOutlinePartition className="text-3xl" />
        <span className="text-sm">{editable ? "Click to write a diagram" : "No diagram"}</span>
      </button>
    );

  if (error)
    return (
      <div className="max-w-full rounded-md border border-destructive/30 bg-destructive/10 p-4 text-destructive text-sm">
        <div className="font-semibold">Mermaid syntax error</div>
        <pre className="mt-1 whitespace-pre-wrap font-mono text-xs leading-5">{error}</pre>
      </div>
    );

  if (!render)
    return (
      <div className="flex h-40 w-80 max-w-full items-center justify-center rounded-md bg-muted/40 text-foreground/50 text-sm">
        Rendering diagram…
      </div>
    );

  return (
    <div
      style={{ width: width || Math.min(render.width || RESET_WIDTH, RESET_WIDTH) }}
      className="max-w-full [&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: mermaid output, sanitized by its strict security level
      dangerouslySetInnerHTML={{ __html: render.svg }}
    />
  );
};

interface MermaidModalProps {
  code: string;
  dark: boolean;
  onCancel: () => void;
  onSave: (code: string) => void;
}

/**
 * Full-screen source editor with a live preview. Portalled to `<body>` for the
 * same reason as the Excalidraw modal: a transformed or overflow-clipped
 * ancestor would otherwise trap `position: fixed` and shrink the overlay.
 */
export const MermaidModal = ({ code, dark, onCancel, onSave }: MermaidModalProps): JSX.Element | null => {
  const [draft, setDraft] = useState(code.trim() ? code : DEFAULT_MERMAID_CODE);
  const [preview, setPreview] = useState<MermaidRender | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      void renderMermaid(draft, dark).then(
        (next) => {
          if (cancelled) return;
          setPreview(next);
          setError(null);
        },
        (reason: Error) => {
          if (cancelled) return;
          setError(reason.message);
        },
      );
    }, PREVIEW_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [draft, dark]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[9999] flex flex-col bg-background text-foreground">
      <div className="flex items-center justify-between border-foreground/10 border-b px-4 py-3">
        <div className="font-semibold">Edit Mermaid</div>
        <div className="flex gap-2">
          <button type="button" className={buttonRecipe({ size: "sm", variant: "ghost" })} onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className={buttonRecipe({ size: "sm", variant: "primary" })}
            onClick={() => onSave(draft)}
          >
            Save
          </button>
        </div>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-2">
        <div className="flex min-h-0 flex-col border-foreground/10 border-b lg:border-r lg:border-b-0">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            spellCheck={false}
            className="min-h-0 flex-1 resize-none bg-muted/40 p-4 font-mono text-sm leading-6 outline-none"
            placeholder="graph TD; A --> B;"
          />
          <div
            className={cn(
              "border-foreground/10 border-t px-4 py-2 text-xs",
              error ? "bg-destructive/10 text-destructive" : "text-foreground/50",
            )}
          >
            {error ?? "Flowchart, sequence, class, state, ER, gantt, pie — any Mermaid diagram type."}
          </div>
        </div>
        <div className="min-h-0 overflow-auto p-6">
          {preview ? (
            <div
              className="mx-auto max-w-full [&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
              style={{ width: Math.min(preview.width || RESET_WIDTH, RESET_WIDTH) }}
              // biome-ignore lint/security/noDangerouslySetInnerHtml: mermaid output, sanitized by its strict security level
              dangerouslySetInnerHTML={{ __html: preview.svg }}
            />
          ) : (
            <div className="flex size-full items-center justify-center text-foreground/50">
              {error ? "Fix the syntax to see a preview." : "Rendering preview…"}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};
