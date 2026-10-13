"use client";
import { cn } from "akanjs/client";
import { useEscapeKey } from "akanjs/webkit";
import { type CSSProperties, type ReactNode, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { overlayZ, useOverlayPortal } from "./overlayLayer";
import { type OverlaySide, useAnchoredPosition } from "./overlayPosition";
import { createOverridable } from "./UiOverride";

export interface TooltipProps {
  /** Empty renders the trigger alone. */
  content?: ReactNode;
  children: ReactNode;
  /** The preferred side; the bubble flips to the opposite one when that has more room. */
  side?: OverlaySide;
  className?: string;
  variant?: "default" | "primary" | "info";
}

const SHOW_DELAY_MS = 300;

const variantClass = {
  default: "bg-foreground text-background",
  primary: "bg-primary text-primary-foreground",
  info: "bg-info text-info-foreground",
} as const;

const arrowClass = {
  default: "bg-foreground",
  primary: "bg-primary",
  info: "bg-info",
} as const;

const arrowEdgeClass = {
  top: "-bottom-1",
  bottom: "-top-1",
  left: "-right-1",
  right: "-left-1",
} as const;

// Drawn on the overlay layer, not in place: inside an `overflow` list an in-place bubble is clipped, and its width
// widens the list's scroll area.
const DefaultTooltip = ({ content, children, side = "top", className, variant = "default" }: TooltipProps) => {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const bubbleRef = useRef<HTMLSpanElement>(null);
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tooltipId = useId();
  const portal = useOverlayPortal();
  const position = useAnchoredPosition({ opened: open, triggerRef, panelRef: bubbleRef, side });
  const cancelShow = () => {
    if (showTimer.current) clearTimeout(showTimer.current);
    showTimer.current = null;
  };
  useEffect(() => cancelShow, []);
  useEscapeKey(open, () => setOpen(false));
  if (content === undefined || content === null || content === "") return <>{children}</>;
  const landed = position?.side ?? side;
  const vertical = landed === "top" || landed === "bottom";
  const arrowStyle: CSSProperties = vertical
    ? { left: (position?.arrowOffset ?? 0) - 4 }
    : { top: (position?.arrowOffset ?? 0) - 4 };
  return (
    // `w-fit`: `inline-flex` alone still stretches in a column flex container.
    <span
      ref={triggerRef}
      className="relative inline-flex w-fit"
      aria-describedby={open ? tooltipId : undefined}
      // React bubbles these through portals: focus inside a modal the trigger opened is not on the trigger.
      onPointerEnter={(event) => {
        if (event.pointerType === "touch" || !event.currentTarget.contains(event.target as Node)) return;
        cancelShow();
        showTimer.current = setTimeout(() => setOpen(true), SHOW_DELAY_MS);
      }}
      onPointerLeave={() => {
        cancelShow();
        setOpen(false);
      }}
      onFocus={(event) => {
        if (!event.currentTarget.contains(event.target as Node)) return;
        cancelShow();
        setOpen(true);
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      {children}
      {open && portal
        ? createPortal(
            <span
              ref={bubbleRef}
              id={tooltipId}
              role="tooltip"
              className={cn(
                "pointer-events-none w-max max-w-xs animate-fadeIn rounded-field px-2 py-1 text-xs shadow-lg",
                variantClass[variant],
                className,
              )}
              style={{
                position: "fixed",
                zIndex: overlayZ.tooltip,
                top: position?.top ?? 0,
                left: position?.left ?? 0,
                visibility: position ? undefined : "hidden",
              }}
            >
              {content}
              <span
                className={cn("absolute size-2 rotate-45", arrowEdgeClass[landed], arrowClass[variant])}
                style={arrowStyle}
              />
            </span>,
            portal,
          )
        : null}
    </span>
  );
};

export const Tooltip = createOverridable("Tooltip", DefaultTooltip);
