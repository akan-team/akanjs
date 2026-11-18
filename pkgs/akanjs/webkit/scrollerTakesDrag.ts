type DragAxis = "x" | "y";

const isScrollable = (overflow: string) => overflow === "auto" || overflow === "scroll";

const isReversed = (style: CSSStyleDeclaration, axis: DragAxis) =>
  axis === "y"
    ? style.flexDirection === "column-reverse"
    : (style.flexDirection === "row-reverse") !== (style.direction === "rtl");

const takes = (node: Element, style: CSSStyleDeclaration, axis: DragAxis, movement: number) => {
  if (!isScrollable(axis === "x" ? style.overflowX : style.overflowY)) return false;
  const span = axis === "x" ? node.scrollWidth - node.clientWidth : node.scrollHeight - node.clientHeight;
  if (span < 1) return false;
  //? A reversed scroller (column-reverse, rtl) counts its offset down from 0 at its end, not up from 0 at its start.
  const offset = Math.abs(axis === "x" ? node.scrollLeft : node.scrollTop);
  const fromStart = isReversed(style, axis) ? span - offset : offset;
  return movement > 0 ? fromStart >= 1 : span - fromStart >= 1;
};

export const scrollerTakesDrag = (
  target: EventTarget | null,
  frame: Element | null,
  axis: DragAxis,
  movement: number,
) => {
  for (let node = target instanceof Element ? target : null; node; node = node.parentElement) {
    if (takes(node, getComputedStyle(node), axis, movement)) return true;
    if (node === frame) return false;
  }
  return false;
};
