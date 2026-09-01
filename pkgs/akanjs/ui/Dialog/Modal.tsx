"use client";
import { cn, usePage } from "akanjs/client";
import { useBodyScrollLock, useEscapeKey } from "akanjs/webkit";
import { type ReactNode, useCallback, useContext, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BiX } from "react-icons/bi";
import { buttonRecipe } from "../Button";
import { useOverlayLayerProps } from "../overlayLayer";

import { DialogContext } from "./context";

export interface ModalProps {
  className?: string;
  bodyClassName?: string;
  confirmClose?: boolean;
  children?: ReactNode;
  onCancel?: () => void;
}
export const Modal = ({ className, bodyClassName, confirmClose, children, onCancel }: ModalProps) => {
  const { open, setOpen, registerDismiss, title, action } = useContext(DialogContext);
  const { l } = usePage();
  const ref = useRef<HTMLDivElement>(null);
  const focusedElementRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const contentId = useId();
  // Read through the portal-to-be: whichever dismissable scope rendered this modal owns it.
  const overlayLayerProps = useOverlayLayerProps();
  // Resolved in an effect rather than at render: the first client pass has to match the server's, which
  // portalled nothing, or a dialog opened by `defaultOpen` hydrates as a mismatch.
  const [portalElement, setPortalElement] = useState<HTMLElement | null>(null);

  const requestClose = useCallback(() => {
    if (confirmClose && !window.confirm(l("base.confirmClose"))) return;
    setOpen(false);
    onCancel?.();
  }, [confirmClose, l, onCancel, setOpen]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    setPortalElement(document.body);
  }, []);

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
      className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-4"
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        requestClose();
      }}
    >
      <div
        ref={ref}
        // Focus moves here on open so the tab order starts inside the dialog, but this container is not a
        // control — drawing a keyboard ring around the whole surface only reads as a glitch. Controls
        // inside keep their own rings, which is where the focus indicator belongs.
        className={cn(
          "relative flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-box border border-border bg-card text-card-foreground shadow-lg outline-none",
          className,
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={contentId}
        tabIndex={-1}
      >
        <button
          aria-label="Close"
          className={buttonRecipe({ variant: "ghost", size: "icon" }, "absolute top-3 right-3 z-10 size-8")}
          onClick={() => requestClose()}
          type="button"
        >
          <BiX className="text-xl" />
        </button>
        {title ? (
          <div
            className="shrink-0 border-border border-b py-3.5 pr-14 pl-5 font-semibold text-base leading-snug"
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
    </div>,
    portalElement,
  );
};
