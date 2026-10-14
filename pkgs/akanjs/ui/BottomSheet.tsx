"use client";
import { cn } from "akanjs/client";
import { useBodyScrollLock, useEscapeKey, usePageActivity } from "akanjs/webkit";
import { forwardRef, type ReactNode, useEffect, useImperativeHandle, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BiX } from "react-icons/bi";
import { config, useSpring } from "react-spring";
import { animated } from "./animated";
import { buttonRecipe } from "./Button";
import { OverlayPortalProvider, overlayZ, useOverlayLayerProps, useOverlayPortal } from "./overlayLayer";
import { SheetHandle } from "./SheetHandle";
import { useDismissDrag } from "./useDismissDrag";

interface BottomSheetProps {
  className?: string;
  bodyClassName?: string;
  /** Left out, the sheet opens from its own trigger and handle. */
  open?: boolean;
  /** Called once when the person dismisses the sheet: the backdrop, Escape, a drag down, or the close button. */
  onCancel?: () => void;
  trigger?: ReactNode;
  /** Whole top row of the sheet, replacing the drag handle or the close row. */
  header?: ReactNode;
  /** The grab handle a `half` sheet draws. */
  handle?: ReactNode;
  /** Closes a `full` sheet, inside the default header row. */
  close?: ReactNode;
  children: ReactNode;
  type: "full" | "half";
}

export interface BottomSheetRef {
  open: () => void;
  close: () => void;
}

// A share of the sheet's own height, not pixels: no height is known on the server, and 100% clears any viewport.
const PARKED = 100;

export const BottomSheet = forwardRef<BottomSheetRef, BottomSheetProps>(
  (
    {
      className,
      bodyClassName,
      open,
      onCancel,
      trigger,
      header,
      handle,
      close,
      type = "half",
      children,
    }: BottomSheetProps,
    bottomSheetRef,
  ) => {
    const ref = useRef<HTMLDivElement>(null);
    const shown = useRef(false);
    const portal = useOverlayPortal();
    const overlayLayerProps = useOverlayLayerProps();
    //? It portals out of its page, so the `inert` on a page the CSR stack keeps drawn underneath never reaches it.
    const isCurrentPage = usePageActivity() === "current";
    const [root, setRoot] = useState<HTMLDivElement | null>(null);
    const [selfOpen, setSelfOpen] = useState(false);
    const [dismissals, setDismissals] = useState(0);
    const isOpen = open ?? selfOpen;
    const isActive = isOpen && isCurrentPage;

    const [{ y, opacity }, api] = useSpring(() => ({ y: PARKED, opacity: 0 }));

    const show = async () => {
      shown.current = true;
      await Promise.all(api.start({ y: 0, opacity: 1, immediate: false, config: config.default }));
    };
    const hide = async () => {
      // Clamped: an overshoot past the edge would flicker the parked sheet's visibility.
      await Promise.all(
        api.start({ y: PARKED, opacity: 0, immediate: false, config: { ...config.stiff, velocity: 0, clamp: true } }),
      );
    };
    //? The person's dismissal; `open` alone decides what is drawn, so a controlled sheet hides once its parent agrees.
    const dismiss = () => {
      if (open === undefined) setSelfOpen(false);
      else setDismissals((count) => count + 1);
      onCancel?.();
    };

    const bind = useDismissDrag({
      threshold: (height) => height / 3,
      heightOf: () => ref.current?.offsetHeight ?? 0,
      onDrag: (y, height) => void api.start({ y: height ? (Math.max(0, y) / height) * PARKED : 0, immediate: true }),
      onRelease: (release) => {
        if (release.dismiss) dismiss();
        else void show();
      },
    });

    useImperativeHandle(bottomSheetRef, () => ({
      open: () => {
        setSelfOpen(true);
        void show();
      },
      close: dismiss,
    }));

    useEscapeKey(isActive, dismiss);
    useBodyScrollLock(isActive);

    //? `dismissals` re-runs this when a controlled parent keeps `open` through a drag-dismiss, snapping the sheet back.
    useEffect(() => {
      if (isOpen) void show();
      else if (shown.current) void hide();
    }, [isOpen, dismissals]);

    return (
      <>
        {trigger ? (
          <div
            className="contents"
            onClick={() => {
              setSelfOpen(true);
            }}
          >
            {trigger}
          </div>
        ) : null}
        {portal
          ? createPortal(
              // Sized by nothing, so it catches no click; an overlay opened in the sheet lands here, above the panel.
              <div
                {...overlayLayerProps}
                ref={setRoot}
                className="fixed top-0 left-0"
                style={{ zIndex: overlayZ.modal, visibility: isCurrentPage ? undefined : "hidden" }}
              >
                <animated.div
                  style={{ opacity, pointerEvents: isOpen ? "auto" : "none" }}
                  onClick={dismiss}
                  className="fixed inset-0 bg-black/50 backdrop-blur-sm"
                />
                <animated.div
                  ref={ref}
                  style={{
                    translateY: y.to((value) => `${value}%`),
                    visibility: y.to((value) => (value < PARKED ? "inherit" : "hidden")),
                  }}
                  className={cn(
                    "fixed bottom-0 left-0 flex w-full flex-col bg-card text-card-foreground",
                    type === "half" && "h-[90dvh] rounded-t-box border-border border-t shadow-2xl",
                    type === "full" &&
                      "h-[100dvh] pt-[max(var(--akan-top-safe-area,0px),env(safe-area-inset-top,0px))]",
                    className,
                  )}
                >
                  <OverlayPortalProvider value={root}>
                    {header ??
                      (type === "half" ? (
                        <SheetHandle {...bind()} className="cursor-grab touch-pan-y py-3">
                          {handle}
                        </SheetHandle>
                      ) : (
                        <div className="flex shrink-0 justify-end p-2">
                          <div className="contents" onClick={dismiss}>
                            {close ?? (
                              <button
                                aria-label="Close"
                                className={buttonRecipe(
                                  { variant: "ghost", size: "icon" },
                                  "rounded-full text-foreground/50",
                                )}
                                type="button"
                              >
                                <BiX className="text-2xl" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    <div
                      className={cn(
                        "scrollbar-thin min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(1rem+max(var(--akan-bottom-safe-area,0px),env(safe-area-inset-bottom,0px)))]",
                        bodyClassName,
                      )}
                    >
                      {children}
                    </div>
                  </OverlayPortalProvider>
                </animated.div>
              </div>,
              portal,
            )
          : null}
      </>
    );
  },
);
