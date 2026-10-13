"use client";
import { cn, DEFAULT_TOP_INSET, debugFrame, useInHiddenLayout, usePathCtx } from "akanjs/client";
import { type ReactNode, useLayoutEffect } from "react";

import { FrameSlotPortal } from "./FrameSlotPortal";

export interface TopInsetProps {
  className?: string;
  children: ReactNode;
  estimatedHeight?: number;
}

export const TopInset = ({ className, children, estimatedHeight = DEFAULT_TOP_INSET }: TopInsetProps) => {
  const pathCtx = usePathCtx();
  const isHidden = useInHiddenLayout();
  const path = pathCtx.location?.pathRoute?.path;
  const registerFrameSlot = pathCtx.registerFrameSlot ?? (() => () => undefined);

  useLayoutEffect(() => {
    if (!path) return;
    debugFrame("topInset.mount", { path, estimatedHeight });
    return () => debugFrame("topInset.unmount", { path, estimatedHeight });
  }, [path, estimatedHeight]);
  useLayoutEffect(() => {
    if (!path || isHidden) return;
    return registerFrameSlot({
      type: "topInset",
      scope: "page",
      source: "topInset",
      estimatedHeight,
    });
  }, [registerFrameSlot, estimatedHeight, path, isHidden]);
  return (
    <FrameSlotPortal slot="topInset">
      <div data-akan-frame-slot="topInset" data-akan-frame-role="topChrome" className={cn("size-full", className)}>
        {children}
      </div>
    </FrameSlotPortal>
  );
};

export interface TopLeftActionProps {
  className?: string;
  children: ReactNode;
}

export const TopLeftAction = ({ className, children }: TopLeftActionProps) => {
  return (
    <FrameSlotPortal slot="topLeftAction">
      <div className={className}>{children}</div>
    </FrameSlotPortal>
  );
};
