"use client";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { DraggableBlockPlugin_EXPERIMENTAL } from "@lexical/react/LexicalDraggableBlockPlugin";
import { $createParagraphNode, $getNearestNodeFromDOMNode, $parseSerializedNode, type LexicalNode } from "lexical";
import { useCallback, useEffect, useRef, useState } from "react";
import { MdDragIndicator } from "react-icons/md";

import { DRAGGABLE_MENU_CLASS, isOnMenu } from "./draggableBlockPlugin.util";

interface DraggableBlockPluginProps {
  /** Positioned container the handle/target-line portal into (the editor wrapper). */
  anchorElem: HTMLElement;
}

/**
 * Hover-activated block handle: a drag grip that reorders top-level blocks when
 * dragged and, when clicked, opens a menu (add block below / duplicate / delete).
 * Replaces the Yoopta `BlockActions` + `SortableBlock` + `BlockDndContext` stack
 * with the single-document Lexical model, which needs no external DnD context.
 */
export const DraggableBlockPlugin = ({ anchorElem }: DraggableBlockPluginProps) => {
  const [editor] = useLexicalComposerContext();
  const menuRef = useRef<HTMLDivElement>(null);
  const targetLineRef = useRef<HTMLDivElement>(null);
  // The block DOM element the handle currently points at (updated by the plugin).
  const targetElemRef = useRef<HTMLElement | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const onElementChanged = useCallback((element: HTMLElement | null) => {
    targetElemRef.current = element;
    // Hide the actions menu whenever the handle detaches from a block.
    if (!element) setMenuOpen(false);
  }, []);

  // Resolve the hovered DOM block to its top-level Lexical node, then mutate it.
  // The top-level node may be an element (paragraph/heading/…) or a decorator
  // (e.g. the horizontal rule), so we operate at the `LexicalNode` level.
  const withTargetBlock = useCallback(
    (mutate: (block: LexicalNode) => void) => {
      const element = targetElemRef.current;
      if (!element) return;
      editor.update(() => {
        const node = $getNearestNodeFromDOMNode(element);
        if (!node) return;
        mutate(node.getTopLevelElementOrThrow());
      });
    },
    [editor],
  );

  const addBelow = useCallback(() => {
    setMenuOpen(false);
    withTargetBlock((block) => {
      const paragraph = $createParagraphNode();
      block.insertAfter(paragraph);
      paragraph.select();
    });
  }, [withTargetBlock]);

  const duplicate = useCallback(() => {
    setMenuOpen(false);
    withTargetBlock((block) => {
      // Round-trip through serialization so any block type clones faithfully.
      const clone = $parseSerializedNode(block.exportJSON());
      block.insertAfter(clone);
    });
  }, [withTargetBlock]);

  const remove = useCallback(() => {
    setMenuOpen(false);
    withTargetBlock((block) => block.remove());
  }, [withTargetBlock]);

  // Close the actions menu on any outside click.
  useEffect(() => {
    if (!menuOpen) return;
    const onDocMouseDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [menuOpen]);

  return (
    <DraggableBlockPlugin_EXPERIMENTAL
      anchorElem={anchorElem}
      menuRef={menuRef}
      targetLineRef={targetLineRef}
      onElementChanged={onElementChanged}
      isOnMenu={isOnMenu}
      menuComponent={
        // Must be absolutely anchored at 0,0 of `anchorElem`: the plugin only
        // sets `transform: translate(...)` (relative to anchorElem) + opacity,
        // and leaves positioning to CSS. The plugin fixes the handle at the
        // editor's left edge (`left = SPACE`), so the editable area carries a
        // matching left gutter (see `Editor.tsx`) for it to sit in.
        <div ref={menuRef} className={`${DRAGGABLE_MENU_CLASS} absolute top-0 -left-4.5 opacity-0`}>
          <button
            type="button"
            title="Drag to move · click for actions"
            className="flex min-h-6 cursor-grab items-center rounded px-0.5 py-0.5 text-base text-base-content/50 hover:bg-base-200 hover:text-base-content active:cursor-grabbing"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <MdDragIndicator />
          </button>
          {menuOpen ? (
            <div className="absolute top-full left-0 z-50 mt-1 min-w-36 rounded-md border border-base-content/10 bg-base-100 p-1 shadow-xl">
              <button
                type="button"
                className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-base-200"
                onClick={addBelow}
              >
                Add block below
              </button>
              <button
                type="button"
                className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-base-200"
                onClick={duplicate}
              >
                Duplicate
              </button>
              <button
                type="button"
                className="block w-full rounded px-2 py-1.5 text-left text-error text-sm hover:bg-base-200"
                onClick={remove}
              >
                Delete
              </button>
            </div>
          ) : null}
        </div>
      }
      targetLineComponent={
        <div
          ref={targetLineRef}
          // The plugin hardcodes the drop line's geometry inline for a 28px
          // content padding: `transform: translate(24px, y)` + `width: anchorW-48`.
          // Our editable gutter is only 8px (`pl-2`), so the line would start
          // 16px right of the text, leaving a left gap. We can't override just
          // the transform's X (Y is per-block/dynamic), so we counter it with a
          // margin (24px→8px = -16px) and force the width to the right edge.
          // If the `pl-*` gutter changes, retune `-ml-4` to `gutter - 24px`.
          className="pointer-events-none absolute top-0 left-0 -ml-4 h-0.5 w-[calc(100%-8px)]! bg-primary opacity-0"
          style={{ willChange: "transform" }}
        />
      }
    />
  );
};
