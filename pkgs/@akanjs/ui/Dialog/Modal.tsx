"use client";
import { clsx, usePage } from "@akanjs/client";
import { animated } from "@akanjs/ui";
import * as Dialog from "@radix-ui/react-dialog";
import { useDrag } from "@use-gesture/react";
import { useContext, useEffect, useRef, useState } from "react";
import { BiX } from "react-icons/bi";
import { config, useSpring } from "react-spring";

import { DialogContext } from "./context";

const MODAL_MARGIN = 0; // px
const OPACITY = { START: 0, END: 1 };

const interpolate = (o: number, i: number, t: number) => {
  return o + (i - o) * t;
};

export interface ModalProps {
  className?: string;
  bodyClassName?: string;
  confirmClose?: boolean;
  children?: any;
  onCancel?: () => void;
}
export const Modal = ({ className, bodyClassName, confirmClose, children, onCancel }: ModalProps) => {
  const { open, setOpen, title, action } = useContext(DialogContext);
  const openRef = useRef<boolean>(open);
  const { l } = usePage();
  const ref = useRef<HTMLDivElement>(null);
  const [{ translate }, api] = useSpring(() => ({ translate: 1 }));
  const [showBackground, setShowBackground] = useState(false);
  const openModal = async ({ canceled }: { canceled?: boolean } = {}) => {
    setTimeout(() => {
      setShowBackground(true);
    }, 100);
    await Promise.all(api.start({ translate: 0, immediate: false, config: canceled ? config.wobbly : config.stiff }));
  };
  const closeModal = async ({ velocity = 0, confirmClose }: { velocity?: number; confirmClose?: boolean }) => {
    if (confirmClose && !window.confirm(l("base.confirmClose"))) {
      return;
    }

    setTimeout(() => {
      setShowBackground(false);
    }, 100);
    await Promise.all(api.start({ translate: 1, immediate: false, config: { ...config.stiff, velocity } }));
    setOpen(false);
    onCancel?.();
  };
  const bind = useDrag(
    ({ last, velocity: [, vy], direction: [, dy], offset: [, oy], movement: [, my], cancel, canceled }) => {
      if (!ref.current) return;
      const height = (ref.current.clientHeight || MODAL_MARGIN) - MODAL_MARGIN;
      if (my > 70) cancel();
      if (last) {
        if (my > height * 0.5 || (vy > 0.5 && dy > 0))
          void closeModal({ velocity: vy / height, confirmClose: confirmClose });
        else void openModal({ canceled });
      } else void api.start({ translate: oy / height, immediate: true });
    },
    { from: () => [0, translate.get()], filterTaps: true, bounds: { top: 0 }, rubberband: true }
  );
  const opacity = translate.to((t) => {
    return interpolate(OPACITY.END, OPACITY.START, t);
  });
  const translateY = translate.to((t) => {
    return `${t * 100}%`;
  });

  useEffect(() => {
    if (openRef.current === open) return;
    openRef.current = open;
    if (open) void openModal();
    else void closeModal({});
  }, [open]);

  return (
    <Dialog.Portal>
      <Dialog.Overlay
        onClick={() => {
          void closeModal({ confirmClose });
        }}
      >
        {showBackground ? (
          <div className={"data-[state=open]:animate-fadeIn bg-base-content/50 fixed inset-0 z-10 backdrop-blur-md"} />
        ) : null}
      </Dialog.Overlay>
      <Dialog.Content
        className="fixed top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center"
        asChild
        forceMount
      >
        <div className="z-10">
          <animated.div ref={ref} style={{ translateY, opacity }}>
            <button
              className="btn btn-circle btn-sm absolute top-[-16px] right-0 z-20 md:top-[-40px]"
              onClick={() => void closeModal({ confirmClose })}
            >
              <BiX className="text-3xl" />
            </button>
            <div
              className={clsx(
                "bg-base-100 animate-fadeIn mx-auto mt-6 flex max-h-[75vh] w-full max-w-[96vw] max-w-screen flex-col items-center justify-center overflow-x-hidden rounded-lg transition-all duration-100 sm:w-[90%] sm:px-2 sm:pb-2 md:mt-0 md:max-h-[90vh] md:pt-0",
                className
              )}
            >
              <Dialog.Title asChild>
                <animated.div
                  {...bind()}
                  className="animate-fadeIn relative z-10 flex w-full cursor-pointer touch-pan-y flex-col items-center justify-center px-4 pt-1"
                >
                  <div className="flex w-full cursor-pointer items-center justify-center pt-1 opacity-50">
                    <div className="h-1 w-24 rounded-full bg-gray-500" />
                  </div>
                  <div className="flex w-full items-center justify-start">
                    <div className="w-full text-start text-lg font-bold">{title}</div>
                  </div>
                </animated.div>
              </Dialog.Title>
              <Dialog.Description asChild>
                <div
                  className={clsx(
                    "border-base-content/30 scrollbar-none relative m-2 flex size-full min-w-[90vw] overflow-x-hidden overflow-y-scroll border-t-[0.1px] p-4 sm:p-4 md:min-w-[384px] md:px-8 lg:min-w-[576px] xl:min-w-[768px]",
                    bodyClassName
                  )}
                >
                  {children}
                </div>
              </Dialog.Description>
              {action ? <div className="w-full">{action}</div> : null}
            </div>
          </animated.div>
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  );
};
