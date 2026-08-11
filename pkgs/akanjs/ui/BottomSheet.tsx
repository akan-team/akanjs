"use client";
import { useDrag } from "@use-gesture/react";
import { cn } from "akanjs/client";
import { st } from "akanjs/store";
import { animated } from "akanjs/ui";
import { useEscapeKey } from "akanjs/webkit";
import { forwardRef, type ReactNode, useEffect, useImperativeHandle, useRef } from "react";
import { BiX } from "react-icons/bi";
import { config, useSpring } from "react-spring";

interface BottomSheetProps {
  open: boolean;
  onCancel: () => void;
  children: ReactNode;
  type: "full" | "half";
}

export interface BottomSheetRef {
  open: () => void;
  close: () => void;
}

export const BottomSheet = forwardRef<BottomSheetRef, BottomSheetProps>(
  ({ open, onCancel, type = "half", children }: BottomSheetProps, bottomSheetRef) => {
    const ref = useRef<HTMLDivElement>(null);
    const pageState = st.use.pageState();

    const [{ y, opacity }, api] = useSpring(() => ({ y: window.innerHeight, opacity: 0 }));

    const openModal = async () => {
      //rubber band
      await Promise.all(api.start({ y: 0, opacity: 100, immediate: false, config: config.default }));
    };
    const closeModal = async () => {
      await Promise.all(
        api.start({ y: window.innerHeight, opacity: 0, immediate: false, config: { ...config.stiff, velocity: 0 } }),
      );
      onCancel();
    };

    const bind = useDrag(
      ({ down, velocity: [, vy], direction: [, dy], offset: [, oy], movement: [, my], xy, initial }) => {
        if (down) {
          if (my < 0) void api.start({ y: 0, immediate: true });
          else void api.start({ y: my, immediate: true });
        } else {
          if (my > window.innerHeight / 3) void closeModal();
          else void openModal();
        }
      },
    );

    useImperativeHandle(bottomSheetRef, () => ({
      open: openModal,
      close: closeModal,
    }));

    useEscapeKey(open, () => {
      void closeModal();
    });

    useEffect(() => {
      if (open) void openModal();
      else void closeModal();
    }, [open]);

    return (
      <>
        <animated.div
          style={{
            opacity,
          }}
          onClick={() => void closeModal()}
          className={cn("fixed top-0 left-0 size-full bg-muted-foreground/50", open && "z-50", !open && "-z-[1]")}
        />
        <animated.div
          ref={ref}
          style={{ y, paddingTop: type === "full" ? pageState.topSafeArea : 0 }}
          className={cn(
            "fixed bottom-0 left-0 z-[101] w-full bg-background",
            type === "half" && "h-[90%] rounded-t-3xl",
            type === "full" && "h-[100vh]",
          )}
        >
          <div className="flex h-8 w-full items-start justify-center pt-2">
            {type === "half" ? (
              <animated.div {...bind()} className="flex h-8 w-full items-start justify-center pt-2">
                <div className="h-2 w-32 rounded-full bg-muted"></div>
              </animated.div>
            ) : (
              <button
                onClick={() => void closeModal()}
                className="absolute top-2 right-2 text-4xl"
                style={{ paddingTop: pageState.topSafeArea }}
              >
                <BiX />
              </button>
            )}
          </div>

          <div className="relative size-full pt-5">{children}</div>
        </animated.div>
      </>
    );
  },
);
