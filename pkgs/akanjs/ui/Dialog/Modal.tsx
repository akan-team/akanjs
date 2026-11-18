"use client";
import { cn, usePage } from "akanjs/client";
import {
  isPageKeyboardAvoidance,
  useBodyScrollLock,
  useEscapeKey,
  usePageActivity,
  useVisualViewportFrame,
} from "akanjs/webkit";
import { type ReactNode, useCallback, useContext, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BiX } from "react-icons/bi";
import { buttonRecipe } from "../Button";
import { OverlayPortalProvider, overlayZ, useOverlayLayerProps, useOverlayPortal } from "../overlayLayer";
import { SheetHandle } from "../SheetHandle";
import { useDismissDrag } from "../useDismissDrag";
import { useLeave } from "../useLeave";

import { isSheetNow, type ModalSurfaceProps, modalSurfaceOf } from "./modalSurface";
import { DialogContext } from "./Provider";

//? A distance, not a share of the panel as a bottom sheet takes: a share of a full-screen sheet is most of the screen.
const DISMISS_DRAG_PX = 120;

interface CloseSlotProps {
  className: string;
  closeButton?: ReactNode | false;
  onClose: () => void;
}
//? The dismissal is on the slot, not on the button inside it, so a replacement needs no wiring: a click on whatever
//? the caller put here bubbles to exactly one handler.
const CloseSlot = ({ className, closeButton, onClose }: CloseSlotProps) => {
  if (closeButton === false) return null;
  return (
    <div className={cn("absolute right-3 z-10", className)} onClick={onClose}>
      {closeButton ?? (
        <button aria-label="Close" className={buttonRecipe({ variant: "ghost", size: "icon" }, "size-8")} type="button">
          <BiX className="text-xl" />
        </button>
      )}
    </div>
  );
};

export interface ModalProps extends ModalSurfaceProps {
  className?: string;
  bodyClassName?: string;
  confirmClose?: boolean;
  /** The dismiss control, drawn in the corner slot that closes the dialog. `false` draws none. */
  closeButton?: ReactNode | false;
  children?: ReactNode;
  onCancel?: () => void;
}
export const Modal = ({
  className,
  bodyClassName,
  confirmClose,
  closeButton,
  children,
  onCancel,
  presentation = "dialog",
  placement = "center",
}: ModalProps) => {
  const { open, setOpen, registerDismiss, title, action } = useContext(DialogContext);
  const { l } = usePage();
  const ref = useRef<HTMLDivElement>(null);
  const focusedElementRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const contentId = useId();
  const overlayLayerProps = useOverlayLayerProps(true);
  const portalElement = useOverlayPortal();
  //? It portals out of its page, so the `inert` on a page the CSR stack keeps drawn underneath never reaches it.
  const isCurrentPage = usePageActivity() === "current";
  const isActive = open && isCurrentPage;
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const [dragY, setDragY] = useState(0);
  const { drawn, leaving } = useLeave(open, ref);
  const surface = modalSurfaceOf(presentation, placement);
  //? Where the iOS shell no longer pans to a focused field, the dialog itself ends at the keys.
  const { keyboardHeight } = useVisualViewportFrame();
  const keyboardInset = isPageKeyboardAvoidance()
    ? {
        paddingBottom: keyboardHeight,
        transition: "padding-bottom var(--akan-keyboard-duration, 0ms) var(--akan-keyboard-easing, ease)",
      }
    : null;

  const requestClose = useCallback(() => {
    if (confirmClose && !window.confirm(l("base.confirmClose"))) return false;
    setOpen(false);
    onCancel?.();
    return true;
  }, [confirmClose, l, onCancel, setOpen]);

  const dismissDrag = useDismissDrag({
    threshold: () => DISMISS_DRAG_PX,
    flickSpeed: 0.5,
    enabled: () => isSheetNow(presentation, placement),
    onDrag: (y) => setDragY(Math.max(0, y)),
    //? A dismissing drag keeps its offset, so the leave animation carries the panel on from where the finger let go.
    onRelease: ({ dismiss }) => {
      if (!dismiss || !requestClose()) setDragY(0);
    },
    gesture: { axis: "y", filterTaps: true },
  });
  const dragProps = presentation === "dialog" ? {} : dismissDrag.bind();

  useBodyScrollLock(isActive);
  useEscapeKey(isActive, requestClose);

  useEffect(() => {
    if (!open || !portalElement) return;
    focusedElementRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    ref.current?.focus();
    return () => {
      if (focusedElementRef.current && document.contains(focusedElementRef.current)) focusedElementRef.current.focus();
      focusedElementRef.current = null;
    };
  }, [open, portalElement]);

  const latestClose = useRef(requestClose);
  latestClose.current = requestClose;
  useEffect(() => {
    registerDismiss(() => {
      latestClose.current();
    });
    return () => {
      registerDismiss(null);
    };
  }, [registerDismiss]);

  useEffect(() => {
    if (!leaving) setDragY(0);
  }, [leaving]);

  if (!drawn || !portalElement) return null;

  return createPortal(
    <div
      {...overlayLayerProps}
      ref={setRoot}
      data-leaving={leaving ? "" : undefined}
      className={cn(
        "fixed inset-0 flex bg-black/40 transition-[background-color] duration-200 data-leaving:pointer-events-none data-leaving:bg-transparent",
        surface.root,
      )}
      style={{ zIndex: overlayZ.modal, visibility: isCurrentPage ? undefined : "hidden", ...keyboardInset }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        requestClose();
      }}
    >
      {dismissDrag.driver}
      <OverlayPortalProvider value={root}>
        <div
          ref={ref}
          data-leaving={leaving ? "" : undefined}
          // Focused on open so tabbing starts inside, but it is no control, so it draws no focus ring.
          className={cn(
            "relative flex w-full flex-col overflow-hidden bg-card text-card-foreground shadow-lg outline-none",
            surface.panel,
            dragY === 0 && "transition-transform",
            className,
          )}
          style={dragY ? { transform: `translateY(${dragY}px)` } : undefined}
          role="dialog"
          aria-modal="true"
          aria-labelledby={title ? titleId : undefined}
          aria-describedby={contentId}
          tabIndex={-1}
        >
          <CloseSlot className={surface.close} closeButton={closeButton} onClose={() => requestClose()} />
          {presentation === "dialog" ? null : (
            <SheetHandle {...dragProps} className={cn("touch-none pt-2", surface.handle)} />
          )}
          {title ? (
            <div
              {...dragProps}
              className={cn(
                "shrink-0 border-border border-b py-3.5 pr-14 pl-5 font-semibold text-base leading-snug",
                presentation !== "dialog" && "touch-none",
              )}
              id={titleId}
            >
              {title}
            </div>
          ) : null}
          <div className={cn("min-h-0 flex-1 overflow-y-auto px-5 py-4", bodyClassName)} id={contentId}>
            {children}
          </div>
          {action ? (
            <div className="flex shrink-0 justify-end gap-2 border-border border-t px-5 py-3">{action}</div>
          ) : null}
        </div>
      </OverlayPortalProvider>
    </div>,
    portalElement,
  );
};
