"use client";
import { cn, usePage } from "akanjs/client";
import { useBodyScrollLock, useEscapeKey } from "akanjs/webkit";
import { type ReactNode, useCallback, useContext, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BiX } from "react-icons/bi";
import { buttonRecipe } from "../Button";
import { OverlayPortalProvider, overlayZ, useOverlayLayerProps, useOverlayPortal } from "../overlayLayer";
import { SheetHandle } from "../SheetHandle";
import { useDismissDrag } from "../useDismissDrag";

import { isSheetNow, type ModalSurfaceProps, modalSurfaceOf } from "./modalSurface";
import { DialogContext } from "./Provider";

//? A distance, not a share of the panel as a bottom sheet takes: a share of a full-screen sheet is most of the screen.
const DISMISS_DRAG_PX = 120;

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
  const overlayLayerProps = useOverlayLayerProps();
  const portalElement = useOverlayPortal();
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const [dragY, setDragY] = useState(0);
  const surface = modalSurfaceOf(presentation, placement);

  const requestClose = useCallback(() => {
    if (confirmClose && !window.confirm(l("base.confirmClose"))) return;
    setOpen(false);
    onCancel?.();
  }, [confirmClose, l, onCancel, setOpen]);

  const bindDismissDrag = useDismissDrag({
    threshold: () => DISMISS_DRAG_PX,
    flickSpeed: 0.5,
    enabled: () => isSheetNow(presentation, placement),
    onDrag: (y) => setDragY(Math.max(0, y)),
    onRelease: ({ dismiss }) => {
      setDragY(0);
      if (dismiss) requestClose();
    },
    gesture: { axis: "y", filterTaps: true },
  });
  const dragProps = presentation === "dialog" ? {} : bindDismissDrag();

  useBodyScrollLock(open);
  useEscapeKey(open, requestClose);

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

  if (!open || !portalElement) return null;

  return createPortal(
    <div
      {...overlayLayerProps}
      ref={setRoot}
      className={cn("fixed inset-0 flex bg-black/40", surface.root)}
      style={{ zIndex: overlayZ.modal }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        requestClose();
      }}
    >
      <OverlayPortalProvider value={root}>
        <div
          ref={ref}
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
          {/* The dismissal is on the slot, not on the button inside it, so a replacement needs no wiring — a
            click on whatever the caller put here bubbles to exactly one handler. */}
          {closeButton === false ? null : (
            <div className={cn("absolute right-3 z-10", surface.close)} onClick={() => requestClose()}>
              {closeButton ?? (
                <button
                  aria-label="Close"
                  className={buttonRecipe({ variant: "ghost", size: "icon" }, "size-8")}
                  type="button"
                >
                  <BiX className="text-xl" />
                </button>
              )}
            </div>
          )}
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
