"use client";
import { useDrag } from "@use-gesture/react";
import { cn } from "akanjs/client";
import { st } from "akanjs/store";
import { useEscapeKey } from "akanjs/webkit";
import { forwardRef, type ReactNode, useEffect, useImperativeHandle, useRef, useState } from "react";
import { BiX } from "react-icons/bi";
import { config, useSpring } from "react-spring";
import { animated } from "./animated";
import { buttonRecipe } from "./Button";

interface BottomSheetProps {
  className?: string;
  bodyClassName?: string;
  /** Left out, the sheet opens from its own trigger and handle. */
  open?: boolean;
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

// A constant, not `window.innerHeight`: this renders on the server, where the global throws.
const OFFSCREEN = 2000;

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
    const pageState = st.use.pageState({ agent: false });
    const [selfOpen, setSelfOpen] = useState(false);
    const isOpen = open ?? selfOpen;

    const [{ y, opacity }, api] = useSpring(() => ({ y: OFFSCREEN, opacity: 0 }));

    const openModal = async () => {
      setSelfOpen(true);
      await Promise.all(api.start({ y: 0, opacity: 1, immediate: false, config: config.default }));
    };
    const closeModal = async () => {
      const height = ref.current?.clientHeight ?? OFFSCREEN;
      await Promise.all(
        api.start({ y: height, opacity: 0, immediate: false, config: { ...config.stiff, velocity: 0 } }),
      );
      setSelfOpen(false);
      onCancel?.();
    };

    const bind = useDrag(({ down, movement: [, my] }) => {
      const height = ref.current?.clientHeight ?? OFFSCREEN;
      if (down) void api.start({ y: Math.max(0, my), immediate: true });
      else if (my > height / 3) void closeModal();
      else void openModal();
    });

    useImperativeHandle(bottomSheetRef, () => ({
      open: openModal,
      close: closeModal,
    }));

    useEscapeKey(isOpen, () => {
      void closeModal();
    });

    useEffect(() => {
      if (isOpen) void openModal();
      else void closeModal();
    }, [isOpen]);

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
        <animated.div
          style={{ opacity }}
          onClick={() => void closeModal()}
          className={cn("fixed inset-0 bg-black/50 backdrop-blur-sm", isOpen ? "z-50" : "-z-[1]")}
        />
        <animated.div
          ref={ref}
          style={{ y, paddingTop: type === "full" ? pageState.topSafeArea : 0 }}
          className={cn(
            "fixed bottom-0 left-0 z-[101] flex w-full flex-col bg-card text-card-foreground",
            type === "half" && "h-[90dvh] rounded-t-box border-border border-t shadow-2xl",
            type === "full" && "h-[100dvh]",
            className,
          )}
        >
          {header ??
            (type === "half" ? (
              <animated.div {...bind()} className="flex shrink-0 cursor-grab touch-pan-y justify-center py-3">
                {handle ?? <div className="h-1 w-10 rounded-full bg-foreground/15" />}
              </animated.div>
            ) : (
              <div className="flex shrink-0 justify-end p-2" style={{ paddingTop: pageState.topSafeArea }}>
                <div className="contents" onClick={() => void closeModal()}>
                  {close ?? (
                    <button
                      aria-label="Close"
                      className={buttonRecipe({ variant: "ghost", size: "icon" }, "rounded-full text-foreground/50")}
                      type="button"
                    >
                      <BiX className="text-2xl" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          <div className={cn("scrollbar-thin min-h-0 flex-1 overflow-y-auto px-4 pb-4", bodyClassName)}>{children}</div>
        </animated.div>
      </>
    );
  },
);
