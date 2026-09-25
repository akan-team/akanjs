"use client";
import { type RefObject, useCallback, useEffect, useLayoutEffect, useState } from "react";

const TRIGGER_GAP = 4;
const VIEWPORT_MARGIN = 8;
const POINTER_INSET = 16;

export interface OverlayPosition {
  top: number;
  left: number;
  /** Placed above the trigger, because there was no room below. */
  above: boolean;
  /** The trigger's centre relative to the panel's left edge, held clear of the panel's rounded corners. */
  anchorOffset: number;
  /** The trigger's own width, for a panel that lines up with the control it drops out of. */
  anchorWidth: number;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));

/**
 * Places a portalled panel against its trigger in viewport coordinates.
 *
 * A panel positioned inside its own tree is clipped by every `overflow` ancestor it has — the modal
 * surface, the modal's scrolling body, a table's scroll container, the dropdown menu a row verb sits in —
 * so overlay panels portal out to `document.body` and are placed here instead of by CSS.
 * `position: fixed` in place would not do it either: a fixed element inside a transformed ancestor is laid
 * out and clipped by that ancestor, and the modal surface animates a transform.
 */
export const useOverlayPosition = ({
  opened,
  triggerRef,
  panelRef,
  align,
  gap = TRIGGER_GAP,
}: {
  opened: boolean;
  triggerRef: RefObject<HTMLElement | null>;
  panelRef: RefObject<HTMLElement | null>;
  align: "start" | "end";
  /** Distance from the trigger. Raise it for a panel whose pointer sticks out past its own edge. */
  gap?: number;
}) => {
  const [position, setPosition] = useState<OverlayPosition | null>(null);

  const measure = useCallback(() => {
    const trigger = triggerRef.current?.getBoundingClientRect();
    const panel = panelRef.current;
    if (!trigger || !panel) return;
    const { offsetHeight: height, offsetWidth: width } = panel;
    const spaceBelow = window.innerHeight - trigger.bottom - gap - VIEWPORT_MARGIN;
    const spaceAbove = trigger.top - gap - VIEWPORT_MARGIN;
    const above = spaceBelow < height && spaceAbove > spaceBelow;
    const left = clamp(
      align === "start" ? trigger.left : trigger.right - width,
      VIEWPORT_MARGIN,
      window.innerWidth - VIEWPORT_MARGIN - width,
    );
    const next = {
      top: clamp(
        above ? trigger.top - gap - height : trigger.bottom + gap,
        VIEWPORT_MARGIN,
        window.innerHeight - VIEWPORT_MARGIN - height,
      ),
      left,
      above,
      anchorOffset: clamp((trigger.left + trigger.right) / 2 - left, POINTER_INSET, width - POINTER_INSET),
      anchorWidth: trigger.width,
    };
    // Same-value writes are dropped rather than re-rendering, which is also what keeps the size observer
    // below from re-entering: the width it hands the panel measures back to the position it came from.
    setPosition((prev) =>
      prev &&
      prev.top === next.top &&
      prev.left === next.left &&
      prev.above === next.above &&
      prev.anchorOffset === next.anchorOffset &&
      prev.anchorWidth === next.anchorWidth
        ? prev
        : next,
    );
  }, [align, gap, panelRef, triggerRef]);

  useLayoutEffect(() => {
    if (opened) measure();
  }, [opened, measure]);

  useEffect(() => {
    if (!opened) return;
    // Capture phase: the trigger may sit in a scroll container, whose scroll never reaches window by bubbling.
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    // A panel that eases open, or one whose list a search narrows, is a different size each frame — and a
    // panel placed above its trigger is anchored by its bottom edge, so its top moves as it grows.
    const panel = panelRef.current;
    const observer = panel ? new ResizeObserver(measure) : null;
    if (panel && observer) observer.observe(panel);
    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
      observer?.disconnect();
    };
  }, [opened, measure, panelRef]);

  return position;
};
