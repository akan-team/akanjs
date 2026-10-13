"use client";
import {
  cn,
  DEFAULT_BOTTOM_INSET,
  debugFrame,
  type FrameSlotRegistration,
  useInHiddenLayout,
  usePathCtx,
} from "akanjs/client";
import { type ReactNode, useLayoutEffect, useState } from "react";

import { FrameSlotPortal } from "./FrameSlotPortal";

export interface BottomInsetProps {
  className?: string;
  children: ReactNode;
  keyboardSticky?: boolean;
  contentAnchor?: "bottom";
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
  contentAnchor,
  role,
  estimatedHeight,
  frameScope = "page",
  frameSource = "bottomInset",
  frameCache,
}: BottomInsetProps) => {
  const [measuredHeight, setMeasuredHeight] = useState<number>();
  //? State, not a ref: in a CSR frame the content mounts a render later, once its portal has found the slot.
  const [contentElement, setContentElement] = useState<HTMLDivElement | null>(null);
  const pathCtx = usePathCtx();
  const isHidden = useInHiddenLayout();
  const pathRoute = pathCtx.location?.pathRoute;
  const path = pathCtx.location?.pathRoute?.path;
  const registerFrameSlot = pathCtx.registerFrameSlot ?? (() => () => undefined);
  const frameRole = !role && keyboardSticky ? "keyboardAccessory" : (role ?? "bottomChrome");
  const resolvedEstimatedHeight = estimatedHeight ?? pathRoute?.pageState.bottomInset ?? DEFAULT_BOTTOM_INSET;
  const useDeclaredHeight = pathRoute?.explicitPageConfigKeys?.bottomInset === true;
  const readContentHeight = () => {
    const element = contentElement;
    if (!element) return undefined;
    const height = Math.ceil(element.getBoundingClientRect().height);
    return height > 0 ? height : undefined;
  };

  useLayoutEffect(() => {
    if (!path) return;
    debugFrame("bottomInset.mount", {
      path,
      keyboardSticky,
      contentAnchor,
      role: frameRole,
      frameScope,
      frameSource,
    });
    return () => debugFrame("bottomInset.unmount", { path, frameSource });
  }, [path, keyboardSticky, contentAnchor, frameRole, frameScope, frameSource]);
  useLayoutEffect(() => {
    if (!path || isHidden) return;
    const height = useDeclaredHeight ? resolvedEstimatedHeight : (measuredHeight ?? readContentHeight());
    return registerFrameSlot({
      type: "bottomInset",
      role: frameRole,
      scope: frameScope,
      source: frameSource,
      contentAnchor,
      estimatedHeight: resolvedEstimatedHeight,
      height,
      cache: frameCache,
    });
  }, [
    registerFrameSlot,
    frameRole,
    frameScope,
    frameSource,
    contentAnchor,
    resolvedEstimatedHeight,
    measuredHeight,
    frameCache,
    path,
    useDeclaredHeight,
    isHidden,
  ]);
  useLayoutEffect(() => {
    const element = contentElement;
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
  }, [contentElement]);
  return (
    <FrameSlotPortal slot={frameRole === "keyboardAccessory" ? "keyboardInset" : "bottomInset"}>
      <div
        ref={setContentElement}
        data-akan-frame-slot="bottomInset"
        data-akan-frame-role={frameRole}
        className={cn("pointer-events-auto w-full", className)}
      >
        {children}
      </div>
    </FrameSlotPortal>
  );
};
