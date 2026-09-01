"use client";
import { cn, usePage } from "akanjs/client";
import { useEscapeKey } from "akanjs/webkit";
import { type ButtonHTMLAttributes, type ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BiMessageRoundedError } from "react-icons/bi";
import { buttonRecipe } from "./Button";
import { overlayZ, useOverlayLayerProps } from "./overlayLayer";
import { useOverlayPosition } from "./overlayPosition";
import { createOverridable, useUiRecipe } from "./UiOverride";

// The pointer is a 12px square rotated 45°, so half of it reaches past the panel edge on the aimed side.
const POINTER_HALF = 6;
const TRIGGER_GAP = POINTER_HALF + 2;

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean;
};

export interface PopconfirmProps {
  /** Confirmation title. */
  title: string;
  /** Optional detailed confirmation message. */
  description?: ReactNode;
  /** Called when the user confirms. */
  onConfirm?: () => void;
  /** Props forwarded to the OK button. */
  okButtonProps?: ButtonProps;
  /** Props forwarded to the cancel button. */
  cancelButtonProps?: ButtonProps;
  /** Custom OK button text. */
  okText?: string;
  /** Custom cancel button text. */
  cancelText?: string;
  /** Trigger content. */
  children?: ReactNode;
  /** Additional classes for the trigger wrapper. */
  triggerClassName?: string;
  /** Additional classes for the popover arrow/decorator. */
  decoClassName?: string;
}

export const DefaultPopconfirm = ({
  title,
  description,
  onConfirm,
  okButtonProps,
  cancelButtonProps,
  okText,
  cancelText,
  children,
  triggerClassName,
  decoClassName,
}: PopconfirmProps) => {
  const { l } = usePage();
  const recipe = useUiRecipe("button") ?? buttonRecipe;
  const [isConfirming, setIsConfirming] = useState(false);
  // Resolved in an effect rather than at render, so the first client pass portals exactly what the server did.
  const [portal, setPortal] = useState<HTMLElement | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // Read through the portal-to-be: whichever dismissable scope rendered this popover owns it.
  const overlayLayerProps = useOverlayLayerProps();
  const position = useOverlayPosition({
    opened: isConfirming,
    triggerRef,
    panelRef,
    align: "end",
    gap: TRIGGER_GAP,
  });

  const handleConfirm = () => {
    setIsConfirming(false);
    onConfirm?.();
  };
  const handleCancel = () => {
    setIsConfirming(false);
  };
  useEscapeKey(isConfirming, handleCancel);
  useEffect(() => {
    setPortal(document.body);
  }, []);

  const panel = (
    <>
      <div
        {...overlayLayerProps}
        className="fixed inset-0"
        style={{ zIndex: overlayZ.popconfirmScrim }}
        onClick={handleCancel}
      />
      <div
        {...overlayLayerProps}
        className="w-64 animate-fadeIn rounded-box border border-border bg-popover p-4 text-popover-foreground shadow-xl"
        // Inline, because a computed position cannot be a class.
        style={{
          position: "fixed",
          zIndex: overlayZ.popconfirm,
          top: position?.top ?? 0,
          left: position?.left ?? 0,
          visibility: position ? undefined : "hidden",
        }}
        ref={panelRef}
        role="dialog"
      >
        <div
          className={cn(
            "absolute size-3 rotate-45 border-border bg-popover",
            // The two borders drawn are the outer corner, so they must follow the side the panel landed on.
            position?.above ? "-bottom-1.5 border-r border-b" : "-top-1.5 border-t border-l",
            decoClassName,
          )}
          style={decoClassName ? undefined : { left: (position?.anchorOffset ?? 0) - POINTER_HALF }}
        />
        <div className="flex gap-2">
          <BiMessageRoundedError className="mt-0.5 shrink-0 text-lg text-warning" />
          <div className="min-w-0">
            <p className="font-semibold text-sm leading-snug">{title}</p>
            {description ? <div className="mt-1 text-foreground/70 text-sm leading-snug">{description}</div> : null}
          </div>
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <button
            className={recipe({ variant: "ghost", size: "xs" })}
            onClick={handleCancel}
            type="button"
            {...cancelButtonProps}
          >
            {cancelText ?? l("base.cancel")}
          </button>
          <button
            className={recipe({ variant: "primary", size: "xs" })}
            onClick={handleConfirm}
            type="button"
            {...okButtonProps}
          >
            {okText ?? l("base.ok")}
          </button>
        </div>
      </div>
    </>
  );
  return (
    <div className="relative inline-block" ref={triggerRef}>
      <div
        className={cn("trigger", triggerClassName)}
        onClick={(e) => {
          e.stopPropagation();
          setIsConfirming(true);
        }}
      >
        {children}
      </div>
      {isConfirming && portal ? createPortal(panel, portal) : null}
    </div>
  );
};

/**
 * Confirmation popover. Resolves to a route-scoped override when a
 * `page/**\/_overrides.tsx` in the route's ancestry declares one, otherwise
 * renders {@link DefaultPopconfirm}.
 */
export const Popconfirm = createOverridable("Popconfirm", DefaultPopconfirm);
