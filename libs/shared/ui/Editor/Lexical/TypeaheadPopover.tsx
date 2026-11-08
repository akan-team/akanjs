"use client";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { cn } from "akanjs/client";
import { type ReactNode, useEffect, useLayoutEffect, useRef } from "react";

/**
 * The `anchorClassName` of a `LexicalTypeaheadMenuPlugin` whose menu is a `TypeaheadPopover`.
 *
 * Lexical appends that anchor to `<body>` with no z-index, so without one the menu renders under any positioned
 * overlay hosting the editor (Modal, BottomSheet). It is also absolutely positioned below the caret and sized to
 * it, so a caret on the last line of the screen pushed it past the bottom and grew the page; collapsed, it never
 * reaches past the caret.
 */
export const typeaheadAnchorClassName = "z-[9999] h-0! w-0!";

const caretGap = 4;
const viewportMargin = 8;
const maxMenuHeight = 320;

// A collapsed range at an element boundary measures as an empty rect, so the element it sits in stands in for it.
const caretRectIn = (rootElement: HTMLElement): DOMRect | null => {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return null;
  const range = selection.getRangeAt(0);
  if (!rootElement.contains(range.startContainer)) return null;
  const rect = range.getBoundingClientRect();
  if (rect.height) return rect;
  const container = range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement;
  return container?.getBoundingClientRect() ?? null;
};

// A composer marks its box with this attribute to have its typeahead menus span the box, as a chat app's do.
export const typeaheadFrameOf = (rootElement: HTMLElement | null) =>
  rootElement?.closest<HTMLElement>("[data-typeahead-frame]") ?? null;

interface TypeaheadPopoverProps {
  className?: string;
  children: ReactNode;
}

/**
 * A typeahead menu's box, fixed to the viewport and placed beside the caret: below it, or above it when there is
 * more room there, its height clamped to the room it got.
 *
 * Lexical's own placement keeps the menu in document flow under the caret and flips it up only when the editor
 * itself is tall enough to hold it, so in a one-line composer pinned to the bottom of a page it hung off the
 * screen and scrolled the whole page. Fixed, it never adds to the document's height.
 *
 * The `contents` wrapper is what Lexical measures as the menu (`containerDiv.firstChild`): with no box of its own it
 * measures zero, so Lexical never moves its anchor to make room, and this placement is the only one.
 */
export const TypeaheadPopover = ({ className, children }: TypeaheadPopoverProps) => {
  const [editor] = useLexicalComposerContext();
  const ref = useRef<HTMLDivElement>(null);

  const place = () => {
    const menu = ref.current;
    const rootElement = editor.getRootElement();
    // Kept where it was when the caret is not in this editor — a click on a row holds the selection, a blur does not.
    const caret = menu && rootElement ? caretRectIn(rootElement) : null;
    if (!menu || !caret) return;
    const frame = typeaheadFrameOf(rootElement)?.getBoundingClientRect() ?? null;
    const anchor = frame ?? caret;
    const viewport = window.visualViewport;
    const top = viewport?.offsetTop ?? 0;
    const left = viewport?.offsetLeft ?? 0;
    const bottom = top + (viewport?.height ?? window.innerHeight);
    const right = left + (viewport?.width ?? window.innerWidth);
    const below = bottom - anchor.bottom - caretGap - viewportMargin;
    const above = anchor.top - top - caretGap - viewportMargin;
    const borders = menu.offsetHeight - menu.clientHeight;
    const wanted = Math.min(menu.scrollHeight + borders, maxMenuHeight);
    const upward = wanted > below && above > below;
    const height = Math.max(Math.min(wanted, upward ? above : below), 0);
    if (frame) menu.style.width = `${frame.width}px`;
    const width = menu.offsetWidth;
    menu.style.maxHeight = `${height}px`;
    menu.style.top = `${upward ? anchor.top - caretGap - height : anchor.bottom + caretGap}px`;
    menu.style.left = `${Math.max(left + viewportMargin, Math.min(anchor.left, right - viewportMargin - width))}px`;
    menu.style.visibility = "visible";
  };
  const placeRef = useRef(place);
  placeRef.current = place;

  // Every render: the rows it was handed decide its height.
  useLayoutEffect(() => placeRef.current());

  useEffect(() => {
    const onViewportChange = (event: Event) => {
      // The menu scrolling its own rows moves nothing it is placed against.
      if (event.target instanceof Node && ref.current?.contains(event.target)) return;
      placeRef.current();
    };
    window.addEventListener("scroll", onViewportChange, true);
    window.addEventListener("resize", onViewportChange);
    window.visualViewport?.addEventListener("resize", onViewportChange);
    window.visualViewport?.addEventListener("scroll", onViewportChange);
    return () => {
      window.removeEventListener("scroll", onViewportChange, true);
      window.removeEventListener("resize", onViewportChange);
      window.visualViewport?.removeEventListener("resize", onViewportChange);
      window.visualViewport?.removeEventListener("scroll", onViewportChange);
    };
  }, []);

  return (
    <div className="contents">
      <div
        ref={ref}
        className={cn(
          "invisible fixed top-0 left-0 max-h-80 overflow-y-auto rounded-md border border-foreground/10 bg-background p-1 shadow-lg",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
};
