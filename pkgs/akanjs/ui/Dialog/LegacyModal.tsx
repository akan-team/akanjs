"use client";
import { useDrag } from "@use-gesture/react";
import { cn, usePage } from "akanjs/client";
import { animated } from "akanjs/ui";
import { useBodyScrollLock, useEscapeKey } from "akanjs/webkit";
import { type ReactNode, useCallback, useContext, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BiX } from "react-icons/bi";
import { config, useSpring } from "react-spring";
import { buttonRecipe } from "../Button";
import { useOverlayLayerProps } from "../overlayLayer";

import { DialogContext } from "./context";

const MODAL_MARGIN = 0; // px
const OPACITY = { START: 0, END: 1 };

const interpolate = (o: number, i: number, t: number) => {
  return o + (i - o) * t;
};

export interface LegacyModalProps {
  className?: string;
  bodyClassName?: string;
  confirmClose?: boolean;
  children?: ReactNode;
  onCancel?: () => void;
}
/**
 * Previous modal skin, kept for screens built around its motion: spring open/close and a drag-to-dismiss
 * sheet on touch. New work composes {@link Modal}, which draws the same slots with no animation.
 */
export const LegacyModal = ({ className, bodyClassName, confirmClose, children, onCancel }: LegacyModalProps) => {
  const { open, setOpen, registerDismiss, title, action } = useContext(DialogContext);
  const { l } = usePage();
  const ref = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closingRef = useRef(false);
  const focusedElementRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const contentId = useId();
  // Read through the portal-to-be: whichever dismissable scope rendered this modal owns it.
  const overlayLayerProps = useOverlayLayerProps();
  const [{ translate }, api] = useSpring(() => ({ translate: 1 }));
  const [portalElement, setPortalElement] = useState<HTMLElement | null>(null);
  const [isMounted, setIsMounted] = useState(open);
  const [showBackground, setShowBackground] = useState(false);

  const openModal = useCallback(
    async ({ canceled }: { canceled?: boolean } = {}) => {
      closingRef.current = false;
      setIsMounted(true);
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
      closeTimerRef.current = setTimeout(() => {
        setShowBackground(true);
      }, 100);
      await Promise.all(api.start({ translate: 0, immediate: false, config: canceled ? config.wobbly : config.stiff }));
    },
    [api],
  );

  const closeModal = useCallback(
    async ({
      velocity = 0,
      confirmClose,
      notifyCancel = true,
    }: {
      velocity?: number;
      confirmClose?: boolean;
      notifyCancel?: boolean;
    }) => {
      if (closingRef.current) return;
      if (confirmClose && !window.confirm(l("base.confirmClose"))) {
        return;
      }

      closingRef.current = true;
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
      closeTimerRef.current = setTimeout(() => {
        setShowBackground(false);
      }, 100);
      await Promise.all(api.start({ translate: 1, immediate: false, config: { ...config.stiff, velocity } }));
      setIsMounted(false);
      setOpen(false);
      if (notifyCancel) onCancel?.();
      closingRef.current = false;
    },
    [api, l, onCancel, setOpen],
  );

  const requestClose = useCallback(
    (options?: { velocity?: number }) => {
      void closeModal({ velocity: options?.velocity, confirmClose });
    },
    [closeModal, confirmClose],
  );

  const bind = useDrag(
    ({ last, velocity: [, vy], direction: [, dy], offset: [, oy], movement: [, my], cancel, canceled }) => {
      if (!ref.current) return;
      const height = Math.max((ref.current.clientHeight || MODAL_MARGIN) - MODAL_MARGIN, 1);
      if (my > 70) cancel();
      if (last) {
        if (my > height * 0.5 || (vy > 0.5 && dy > 0)) requestClose({ velocity: vy / height });
        else void openModal({ canceled });
      } else void api.start({ translate: oy / height, immediate: true });
    },
    { from: () => [0, translate.get()], filterTaps: true, bounds: { top: 0 }, rubberband: true },
  );

  const opacity = translate.to((t) => {
    return interpolate(OPACITY.END, OPACITY.START, t);
  });
  const translateY = translate.to((t) => {
    return `${t * 100}%`;
  });

  useEffect(() => {
    if (typeof document === "undefined") return;
    setPortalElement(document.body);
  }, []);

  useEffect(() => {
    if (open) {
      void openModal();
    }
  }, [open, openModal]);

  useEffect(() => {
    if (!open && isMounted) {
      void closeModal({ notifyCancel: false });
    }
  }, [closeModal, isMounted, open]);

  useBodyScrollLock(isMounted);

  useEffect(() => {
    if (!isMounted || !portalElement || typeof document === "undefined") return;

    focusedElementRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    queueMicrotask(() => {
      ref.current?.focus();
    });

    return () => {
      if (focusedElementRef.current && document.contains(focusedElementRef.current)) {
        focusedElementRef.current.focus();
      }
      focusedElementRef.current = null;
    };
  }, [isMounted, portalElement]);

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

  useEscapeKey(isMounted, requestClose);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  if (!isMounted || !portalElement) return null;

  return createPortal(
    <>
      <div
        {...overlayLayerProps}
        className={cn("fixed inset-0 z-10", showBackground && "animate-fadeIn bg-black/50 backdrop-blur-sm")}
      />
      <div
        {...overlayLayerProps}
        className="fixed inset-0 z-10 flex items-center justify-center p-4"
        onClick={(event) => {
          if (event.target !== event.currentTarget) return;
          requestClose();
        }}
      >
        <animated.div
          ref={ref}
          style={{ translateY, opacity }}
          // Focus moves here on open so the tab order starts inside the dialog, but this container is
          // not a control — drawing a keyboard ring around the whole surface only reads as a glitch.
          // Controls inside keep their own rings, which is where the focus indicator belongs.
          className={cn(
            "relative flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-box border border-border bg-card text-card-foreground shadow-2xl shadow-black/25 outline-none",
            className,
          )}
          role="dialog"
          aria-modal="true"
          aria-labelledby={title ? titleId : undefined}
          aria-describedby={contentId}
          tabIndex={-1}
        >
          <animated.div
            {...bind()}
            className={cn(
              "flex shrink-0 touch-pan-y flex-col",
              title && "border-border/70 border-b bg-card/80 backdrop-blur-sm",
            )}
          >
            <div className="flex justify-center pt-2 md:hidden">
              <div className="h-1 w-10 rounded-full bg-foreground/15" />
            </div>
            <div className="flex items-start gap-3 px-5 pt-4 pb-3">
              <div className="min-w-0 flex-1 font-semibold text-lg leading-snug" id={titleId}>
                {title}
              </div>
              <button
                aria-label="Close"
                className={buttonRecipe(
                  { variant: "ghost", size: "icon" },
                  "-mt-1 -mr-2 size-8 shrink-0 rounded-full text-foreground/45 hover:text-foreground",
                )}
                onClick={() => requestClose()}
                type="button"
              >
                <BiX className="text-2xl" />
              </button>
            </div>
          </animated.div>
          <div
            className={cn("min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-5 pt-4 pb-5", bodyClassName)}
            id={contentId}
          >
            {children}
          </div>
          {action ? <div className="shrink-0 border-border/70 border-t bg-muted/30 px-5 py-4">{action}</div> : null}
        </animated.div>
      </div>
    </>,
    portalElement,
  );
};
