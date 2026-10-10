"use client";
import { cn, usePage } from "akanjs/client";
import { useEscapeKey } from "akanjs/webkit";
import { type ButtonHTMLAttributes, type ReactNode, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BiMessageRoundedError } from "react-icons/bi";
import { buttonRecipe } from "./Button";
import { overlayZ, useOverlayLayerProps, useOverlayPortal } from "./overlayLayer";
import { useOverlayPosition } from "./overlayPosition";
import { createOverridable, useUiRecipe } from "./UiOverride";

// The pointer is a 12px square rotated 45°, so half of it reaches past the panel edge on the aimed side.
const POINTER_HALF = 6;
const TRIGGER_GAP = POINTER_HALF + 2;

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean;
};

export interface PopconfirmProps {
  title: ReactNode;
  description?: ReactNode;
  /** `false` draws none. */
  icon?: ReactNode | false;
  /** Replaces both buttons; a replacement owns the confirm and the dismiss. */
  actions?: ReactNode;
  onConfirm?: () => void;
  okButtonProps?: ButtonProps;
  cancelButtonProps?: ButtonProps;
  okText?: ReactNode;
  cancelText?: ReactNode;
  children?: ReactNode;
  triggerClassName?: string;
  /** Classes for the pointer; setting it drops the pointer's computed offset. */
  decoClassName?: string;
}

export const DefaultPopconfirm = ({
  title,
  description,
  icon,
  actions,
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
  const portal = useOverlayPortal();
  const triggerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
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
          {icon === false ? null : (icon ?? <BiMessageRoundedError className="mt-0.5 shrink-0 text-lg text-warning" />)}
          <div className="min-w-0">
            <p className="font-semibold text-sm leading-snug">{title}</p>
            {description ? <div className="mt-1 text-foreground/70 text-sm leading-snug">{description}</div> : null}
          </div>
        </div>
        <div className="mt-3 flex justify-end gap-2">
          {actions ?? (
            <>
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
            </>
          )}
        </div>
      </div>
    </>
  );
  return (
    <div className="relative inline-block" ref={triggerRef}>
      {/* Keeps an enclosing dropdown open: the panel is anchored to this row, which a closed menu hides. */}
      <div
        className={cn("trigger", triggerClassName)}
        data-dropdown-keep-open
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

export const Popconfirm = createOverridable("Popconfirm", DefaultPopconfirm);
