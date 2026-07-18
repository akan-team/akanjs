"use client";

import { useYooptaEditor } from "@yoopta/editor";
import { BlockOptions, DragHandle, useBlockActions } from "@yoopta/ui";
import { useEffect, useRef, useState } from "react";
import { MdAdd, MdDragIndicator } from "react-icons/md";

interface HoverState {
  blockId: string;
  order: number;
  top: number;
  height: number;
  left: number;
}

export const BlockActions = () => {
  const editor = useYooptaEditor();
  const { duplicateBlock, deleteBlock } = useBlockActions();
  const [hover, setHover] = useState<HoverState | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelHide = () => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  };

  const scheduleHide = () => {
    cancelHide();
    hideTimerRef.current = setTimeout(() => {
      if (!menuOpen) setHover(null);
    }, 250);
  };

  useEffect(() => {
    const root = editor.refElement;
    if (!root) return;

    const onMove = (event: MouseEvent) => {
      if (menuOpen) return;
      const rootRect = root.getBoundingClientRect();
      const blocks = root.querySelectorAll<HTMLElement>("[data-yoopta-block-id]");
      for (const el of blocks) {
        const rect = el.getBoundingClientRect();
        if (event.clientY >= rect.top && event.clientY <= rect.bottom) {
          const blockId = el.getAttribute("data-yoopta-block-id");
          if (!blockId) return;
          const block = editor.getBlock({ id: blockId });
          cancelHide();
          setHover({
            blockId,
            order: block?.meta.order ?? 0,
            top: rect.top - rootRect.top,
            height: rect.height,
            left: rect.left - rootRect.left,
          });
          return;
        }
      }
    };

    const onLeave = () => scheduleHide();

    root.addEventListener("mousemove", onMove);
    root.addEventListener("mouseleave", onLeave);
    return () => {
      root.removeEventListener("mousemove", onMove);
      root.removeEventListener("mouseleave", onLeave);
      cancelHide();
    };
  }, [editor, menuOpen]);

  if (!hover) return null;

  return (
    <div
      contentEditable={false}
      className="absolute z-40 flex items-center"
      style={{ top: hover.top, left: hover.left, height: hover.height, transform: "translateX(-100%)", marginLeft: -4 }}
      onMouseDown={(event) => event.preventDefault()}
      onMouseEnter={cancelHide}
      onMouseLeave={scheduleHide}
    >
      <span aria-hidden className="absolute top-0 right-0 h-full w-2 translate-x-full" />
      <div className="flex items-center gap-0.5 rounded-md border border-base-content/10 bg-base-100 p-0.5 shadow-lg">
        <button
          type="button"
          title="Add block below"
          className="btn btn-xs btn-ghost min-h-7 px-1 text-base"
          onClick={() => editor.insertBlock("Paragraph", { at: hover.order + 1, focus: true })}
        >
          <MdAdd />
        </button>
        <BlockOptions open={menuOpen} onOpenChange={setMenuOpen}>
          <BlockOptions.Trigger asChild>
            <DragHandle
              blockId={hover.blockId}
              className="btn btn-xs btn-ghost min-h-7 cursor-grab px-1 text-base active:cursor-grabbing"
            >
              <MdDragIndicator />
            </DragHandle>
          </BlockOptions.Trigger>
          <BlockOptions.Content className="z-50 min-w-36 rounded-md border border-base-content/10 bg-base-100 p-1 text-base-content shadow-xl">
            <BlockOptions.Group>
              <BlockOptions.Item onSelect={() => duplicateBlock(hover.blockId)}>Duplicate</BlockOptions.Item>
              <BlockOptions.Item variant="destructive" onSelect={() => deleteBlock(hover.blockId)}>
                Delete
              </BlockOptions.Item>
            </BlockOptions.Group>
          </BlockOptions.Content>
        </BlockOptions>
      </div>
    </div>
  );
};
