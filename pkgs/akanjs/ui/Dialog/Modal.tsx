"use client";
import { useDrag } from "@use-gesture/react";
import { clsx, usePage } from "akanjs/client";
import { animated } from "akanjs/ui";
import { type ReactNode, useCallback, useContext, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BiX } from "react-icons/bi";
import { config, useSpring } from "react-spring";

import { DialogContext } from "./context";

const MODAL_MARGIN = 0; // px
const OPACITY = { START: 0, END: 1 };
let bodyScrollLockCount = 0;
let previousBodyOverflow = "";

const interpolate = (o: number, i: number, t: number) => {
  return o + (i - o) * t;
};

export interface ModalProps {
  className?: string;
  bodyClassName?: string;
  confirmClose?: boolean;
  children?: ReactNode;
  onCancel?: () => void;
}
export const Modal = ({ className, bodyClassName, confirmClose, children, onCancel }: ModalProps) => {
  const { open, setOpen, title, action } = useContext(DialogContext);
  const { l } = usePage();
  const ref = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closingRef = useRef(false);
  const focusedElementRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const contentId = useId();
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

  useEffect(() => {
    if (!isMounted || typeof document === "undefined") return;

    bodyScrollLockCount += 1;
    if (bodyScrollLockCount === 1) {
      previousBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }

    return () => {
      bodyScrollLockCount -= 1;
      if (bodyScrollLockCount === 0) {
        document.body.style.overflow = previousBodyOverflow;
        previousBodyOverflow = "";
      }
    };
  }, [isMounted]);

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

  useEffect(() => {
    if (!isMounted) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      requestClose();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isMounted, requestClose]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  if (!isMounted || !portalElement) return null;

  return createPortal(
    <>
      <div
        className={clsx("fixed inset-0 z-10", showBackground && "animate-fadeIn bg-black/50 backdrop-blur-md")}
        onClick={(event) => {
          if (event.target !== event.currentTarget) return;
          requestClose();
        }}
      />
      <div className="fixed top-1/2 left-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center">
        <div className="z-10">
          <animated.div
            ref={ref}
            style={{ translateY, opacity }}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            aria-describedby={contentId}
            tabIndex={-1}
          >
            <button
              type="button"
              aria-label="Close"
              className="btn btn-circle btn-sm absolute top-[-16px] right-0 z-20 md:top-[-40px]"
              onClick={() => requestClose()}
            >
              <BiX className="text-3xl" />
            </button>
            <div
              className={clsx(
                "mx-auto mt-6 flex max-h-[75vh] w-full max-w-screen animate-fadeIn flex-col items-center justify-center overflow-x-hidden rounded-lg bg-base-100 transition-all duration-100 sm:w-[90%] sm:px-2 sm:pb-2 md:mt-0 md:max-h-[90vh] md:pt-0",
                className,
              )}
            >
              <animated.div
                {...bind()}
                id={titleId}
                className="relative z-10 flex w-full animate-fadeIn cursor-pointer touch-pan-y flex-col items-center justify-center px-4 pt-1"
              >
                <div className="flex w-full cursor-pointer items-center justify-center pt-1 opacity-50">
                  <div className="h-1 w-24 rounded-full bg-gray-500" />
                </div>
                <div className="flex w-full items-center justify-start">
                  <div className="w-full text-start font-bold text-lg">{title}</div>
                </div>
              </animated.div>
              <div
                id={contentId}
                className={clsx(
                  "scrollbar-none relative m-2 flex size-full min-w-[90vw] overflow-x-hidden overflow-y-scroll border-base-content/30 border-t-[0.1px] p-4 sm:p-4 md:min-w-[384px] md:px-8 lg:min-w-[576px] xl:min-w-[768px]",
                  bodyClassName,
                )}
              >
                {children}
              </div>
              {action ? <div className="w-full">{action}</div> : null}
            </div>
          </animated.div>
        </div>
      </div>
    </>,
    portalElement,
  );
};
