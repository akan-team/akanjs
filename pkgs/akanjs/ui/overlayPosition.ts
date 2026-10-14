"use client";
import { clamp } from "akanjs/common";
import { type RefObject, useCallback, useEffect, useLayoutEffect, useState } from "react";

const TRIGGER_GAP = 4;
const VIEWPORT_MARGIN = 8;
const POINTER_INSET = 16;

export interface OverlayPosition {
  top: number;
  left: number;
  above: boolean;
  /** The trigger's centre relative to the panel's left edge, held clear of the panel's rounded corners. */
  anchorOffset: number;
  anchorWidth: number;
}

const useMeasureWhileOpen = (opened: boolean, measure: () => void, panelRef: RefObject<HTMLElement | null>) => {
  useEffect(() => {
    if (!opened) return;
    // Capture phase: the trigger may sit in a scroll container, whose scroll never reaches window by bubbling.
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    // A panel placed above is anchored by its bottom edge, so its top moves whenever it resizes.
    const panel = panelRef.current;
    const observer = panel ? new ResizeObserver(measure) : null;
    if (panel && observer) observer.observe(panel);
    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
      observer?.disconnect();
    };
  }, [opened, measure, panelRef]);
};

// Placed here, not by CSS: in its own tree a panel is clipped by every `overflow` ancestor, and `fixed` in place is
// clipped by the modal surface's transform.
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
    // Dropping same-value writes is also what keeps the ResizeObserver below from re-entering.
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
  useMeasureWhileOpen(opened, measure, panelRef);

  return position;
};

export type OverlaySide = "top" | "right" | "bottom" | "left";

export interface AnchoredPosition {
  top: number;
  left: number;
  /** The side the panel landed on: the asked one, or its opposite when that has more room. */
  side: OverlaySide;
  /** The trigger's centre along the panel's edge, held clear of its corners, for the pointer. */
  arrowOffset: number;
}

const oppositeSide = { top: "bottom", bottom: "top", left: "right", right: "left" } as const;

/** Like {@link useOverlayPosition}, for a panel centred on any side of its trigger, as a tooltip is. */
export const useAnchoredPosition = ({
  opened,
  triggerRef,
  panelRef,
  side,
  gap = TRIGGER_GAP + 2,
}: {
  opened: boolean;
  triggerRef: RefObject<HTMLElement | null>;
  panelRef: RefObject<HTMLElement | null>;
  side: OverlaySide;
  gap?: number;
}) => {
  const [position, setPosition] = useState<AnchoredPosition | null>(null);

  const measure = useCallback(() => {
    const trigger = triggerRef.current?.getBoundingClientRect();
    const panel = panelRef.current;
    if (!trigger || !panel) return;
    const { offsetHeight: height, offsetWidth: width } = panel;
    const room = {
      top: trigger.top - gap - VIEWPORT_MARGIN,
      bottom: window.innerHeight - trigger.bottom - gap - VIEWPORT_MARGIN,
      left: trigger.left - gap - VIEWPORT_MARGIN,
      right: window.innerWidth - trigger.right - gap - VIEWPORT_MARGIN,
    };
    const vertical = side === "top" || side === "bottom";
    const need = vertical ? height : width;
    const landed = room[side] >= need || room[side] >= room[oppositeSide[side]] ? side : oppositeSide[side];
    const centerX = (trigger.left + trigger.right) / 2;
    const centerY = (trigger.top + trigger.bottom) / 2;
    const next: AnchoredPosition = vertical
      ? {
          top: landed === "top" ? trigger.top - gap - height : trigger.bottom + gap,
          left: clamp(centerX - width / 2, VIEWPORT_MARGIN, window.innerWidth - VIEWPORT_MARGIN - width),
          side: landed,
          arrowOffset: 0,
        }
      : {
          top: clamp(centerY - height / 2, VIEWPORT_MARGIN, window.innerHeight - VIEWPORT_MARGIN - height),
          left: landed === "left" ? trigger.left - gap - width : trigger.right + gap,
          side: landed,
          arrowOffset: 0,
        };
    next.arrowOffset = vertical
      ? clamp(centerX - next.left, POINTER_INSET / 2, width - POINTER_INSET / 2)
      : clamp(centerY - next.top, POINTER_INSET / 2, height - POINTER_INSET / 2);
    setPosition((prev) =>
      prev &&
      prev.top === next.top &&
      prev.left === next.left &&
      prev.side === next.side &&
      prev.arrowOffset === next.arrowOffset
        ? prev
        : next,
    );
  }, [gap, panelRef, side, triggerRef]);

  useLayoutEffect(() => {
    if (opened) measure();
    else setPosition(null);
  }, [opened, measure]);
  useMeasureWhileOpen(opened, measure, panelRef);

  return position;
};
