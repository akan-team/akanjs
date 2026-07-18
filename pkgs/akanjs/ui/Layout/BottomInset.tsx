"use client";
import { getEnv } from "akanjs/base";
import { clsx, DEFAULT_BOTTOM_INSET, debugFrame, type FrameSlotRegistration, usePathCtx } from "akanjs/client";
import { type ReactNode, useLayoutEffect, useRef, useState } from "react";

import { Portal } from "../Portal";

export interface BottomInsetProps {
  className?: string;
  children: ReactNode;
  keyboardSticky?: boolean;
  role?: "bottomChrome" | "keyboardAccessory";
  estimatedHeight?: number;
  frameScope?: FrameSlotRegistration["scope"];
  frameSource?: FrameSlotRegistration["source"];
  frameCache?: boolean;
}

export const BottomInset = ({
  className,
  children,
  keyboardSticky,
  role,
  estimatedHeight,
  frameScope = "page",
  frameSource = "bottomInset",
  frameCache,
}: BottomInsetProps) => {
  const [measuredHeight, setMeasuredHeight] = useState<number>();
  const contentRef = useRef<HTMLDivElement>(null);
  const pathCtx = usePathCtx();
  const pathRoute = pathCtx.location?.pathRoute;
  const path = pathCtx.location?.pathRoute?.path;
  const registerFrameSlot = pathCtx.registerFrameSlot ?? (() => () => undefined);
  const suffix = getEnv().renderMode === "csr" && path ? `-${path}` : "";
  const frameRole = !role && keyboardSticky ? "keyboardAccessory" : (role ?? "bottomChrome");
  const portalId = frameRole === "keyboardAccessory" ? `keyboardInsetContent${suffix}` : `bottomInsetContent${suffix}`;
  const resolvedEstimatedHeight = estimatedHeight ?? pathRoute?.pageState.bottomInset ?? DEFAULT_BOTTOM_INSET;
  const useDeclaredHeight = pathRoute?.explicitPageConfigKeys?.bottomInset === true;
  const readContentHeight = () => {
    const element = contentRef.current;
    if (!element) return undefined;
    const height = Math.ceil(element.getBoundingClientRect().height);
    return height > 0 ? height : undefined;
  };

  useLayoutEffect(() => {
    if (!path) return;
    debugFrame("bottomInset.mount", {
      path,
      keyboardSticky,
      role: frameRole,
      frameScope,
      frameSource,
    });
    return () => debugFrame("bottomInset.unmount", { path, frameSource });
  }, [path, keyboardSticky, frameRole, frameScope, frameSource]);
  useLayoutEffect(() => {
    if (!path) return;
    const height = useDeclaredHeight ? resolvedEstimatedHeight : (measuredHeight ?? readContentHeight());
    return registerFrameSlot({
      type: "bottomInset",
      role: frameRole,
      scope: frameScope,
      source: frameSource,
      estimatedHeight: resolvedEstimatedHeight,
      height,
      cache: frameCache,
    });
  }, [
    registerFrameSlot,
    frameRole,
    frameScope,
    frameSource,
    resolvedEstimatedHeight,
    measuredHeight,
    frameCache,
    path,
    useDeclaredHeight,
  ]);
  useLayoutEffect(() => {
    const element = contentRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const update = () => {
      const height = readContentHeight();
      if (typeof height === "number" && height > 0)
        setMeasuredHeight((prev) => {
          if (prev === height) return prev;
          debugFrame("bottomInset.measure", { path, from: prev, to: height });
          return height;
        });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <Portal id={portalId}>
      <div
        ref={contentRef}
        data-akan-frame-slot="bottomInset"
        data-akan-frame-role={frameRole}
        className={clsx("pointer-events-auto w-full", className)}
      >
        {children}
      </div>
    </Portal>
  );
};
