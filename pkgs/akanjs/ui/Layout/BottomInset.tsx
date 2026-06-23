"use client";
import { getEnv } from "akanjs/base";
import { clsx, DEFAULT_BOTTOM_INSET, type FrameSlotRegistration, usePathCtx } from "akanjs/client";
import { st } from "akanjs/store";
import { type ReactNode, useEffect, useRef, useState } from "react";

import { Portal } from "../Portal";

export interface BottomInsetProps {
  className?: string;
  children: ReactNode;
  keyboardSticky?: boolean;
  estimatedHeight?: number;
  frameScope?: FrameSlotRegistration["scope"];
  frameSource?: FrameSlotRegistration["source"];
  frameCache?: boolean;
}

export const BottomInset = ({
  className,
  children,
  keyboardSticky,
  estimatedHeight = DEFAULT_BOTTOM_INSET,
  frameScope = "page",
  frameSource = "bottomInset",
  frameCache,
}: BottomInsetProps) => {
  const [render, setRender] = useState(false);
  const [measuredHeight, setMeasuredHeight] = useState<number>();
  const contentRef = useRef<HTMLDivElement>(null);
  const pathCtx = usePathCtx();
  const { location } = pathCtx;
  const registerFrameSlot = pathCtx.registerFrameSlot ?? (() => () => undefined);
  const suffix = getEnv().renderMode === "csr" ? `-${location.pathRoute.path}` : "";
  const keyboardHeight = st.use.keyboardHeight();

  useEffect(() => {
    setRender(true);
  }, []);
  useEffect(
    () =>
      registerFrameSlot({
        type: "bottomInset",
        scope: frameScope,
        source: frameSource,
        estimatedHeight,
        height: measuredHeight,
        cache: frameCache,
      }),
    [registerFrameSlot, frameScope, frameSource, estimatedHeight, measuredHeight, frameCache],
  );
  useEffect(() => {
    const element = contentRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const update = () => {
      const height = Math.ceil(element.getBoundingClientRect().height);
      if (height > 0) setMeasuredHeight(height);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [render]);

  if (!render) return null;
  return (
    <Portal id={`bottomInsetContent${suffix}`}>
      <div
        ref={contentRef}
        className={clsx(className, `size-full transition-all ease-out`, {
          "duration-[285ms]": keyboardHeight,
          "duration-0": !keyboardHeight,
          absolute: keyboardSticky && keyboardHeight,
        })}
        style={{
          bottom: keyboardSticky && keyboardHeight ? Math.max(0, keyboardHeight - location.pathRoute.pageState.bottomSafeArea) : 0,
        }}
      >
        {children}
      </div>
    </Portal>
  );
};
