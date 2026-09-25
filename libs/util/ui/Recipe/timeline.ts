/**
 * Vertical timeline. Plain class constants rather than a recipe: daisyUI's timeline styles children
 * the markup names itself (`timeline-start` / `-middle` / `-end` / `-box` and the bare `<hr>` rails),
 * so the shape is a set of slots, not one element with variants.
 *
 * Only the vertical layout is reproduced — both call sites use `timeline-vertical`, and the
 * horizontal one swaps every row/column in daisyUI's grid, so guessing it here would be untested code.
 *
 * Geometry is daisyUI's own: each `li` is a 3×3 grid whose middle cell holds the marker, `start` and
 * `end` span the full height in columns 1 and 3, and the rails are the .25rem bars in column 2.
 */
export const timelineClass = "relative flex flex-col";

export const timelineItemClass =
  "relative grid shrink-0 grid-cols-[0_auto_minmax(0,1fr)] grid-rows-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center justify-items-center [&>hr:first-child]:col-start-2 [&>hr:first-child]:row-start-1 [&>hr:last-child]:col-start-2 [&>hr:last-child]:row-start-3 [&>hr]:h-full [&>hr]:w-1 [&>hr]:border-none [&>hr]:bg-border";

/** `grid-area: 1/1/4/2; place-self: center flex-end` */
export const timelineStartClass = "col-start-1 row-span-3 row-start-1 m-1 justify-self-end self-center";

/** `grid-row-start: 2; grid-column-start: 2` */
export const timelineMiddleClass = "col-start-2 row-start-2";

/** `grid-area: 1/3/4/4; place-self: center flex-start` */
export const timelineEndClass = "col-start-3 row-span-3 row-start-1 m-1 justify-self-start self-center";

/** `.timeline-box` — the bordered bubble the end slot usually wraps its text in. */
export const timelineBoxClass = "rounded-box border border-border bg-background px-4 py-2 text-xs shadow-sm";
