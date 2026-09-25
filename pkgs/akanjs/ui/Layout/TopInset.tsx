"use client";
import { getEnv } from "akanjs/base";
import { clsx, DEFAULT_TOP_INSET, debugFrame, usePathCtx } from "akanjs/client";
import { type ReactNode, useLayoutEffect } from "react";

import { Portal } from "../Portal";

export interface TopInsetProps {
  className?: string;
  children: ReactNode;
  estimatedHeight?: number;
}

export const TopInset = ({ className, children, estimatedHeight = DEFAULT_TOP_INSET }: TopInsetProps) => {
  const pathCtx = usePathCtx();
  const path = pathCtx.location?.pathRoute?.path;
  const registerFrameSlot = pathCtx.registerFrameSlot ?? (() => () => undefined);
  const suffix = getEnv().renderMode === "csr" && path ? `-${path}` : "";

  useLayoutEffect(() => {
    if (!path) return;
    debugFrame("topInset.mount", { path, estimatedHeight });
    return () => debugFrame("topInset.unmount", { path, estimatedHeight });
  }, [path, estimatedHeight]);
  useLayoutEffect(() => {
    if (!path) return;
    return registerFrameSlot({
      type: "topInset",
      scope: "page",
      source: "topInset",
      estimatedHeight,
    });
  }, [registerFrameSlot, estimatedHeight, path]);

  return (
    <Portal id={`topInsetContent${suffix}`}>
      <div data-akan-frame-slot="topInset" data-akan-frame-role="topChrome" className={clsx("size-full", className)}>
        {children}
      </div>
    </Portal>
  );
};
