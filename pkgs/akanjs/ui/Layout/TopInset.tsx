"use client";
import { getEnv } from "akanjs/base";
import { cn, DEFAULT_TOP_INSET, debugFrame, usePathCtx } from "akanjs/client";
import { type ReactNode, useEffect, useLayoutEffect, useState } from "react";

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
  const suffix = getEnv().renderMode === "csr" && path ? `-${pathCtx.pageKey ?? path}` : "";

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
      <div data-akan-frame-slot="topInset" data-akan-frame-role="topChrome" className={cn("size-full", className)}>
        {children}
      </div>
    </Portal>
  );
};

export interface TopLeftActionProps {
  className?: string;
  children: ReactNode;
}

export const TopLeftAction = ({ className, children }: TopLeftActionProps) => {
  const [render, setRender] = useState(false);
  const pathCtx = usePathCtx();
  const path = pathCtx.location?.pathRoute?.path;
  const suffix = getEnv().renderMode === "csr" && path ? `-${pathCtx.pageKey ?? path}` : "";
  useEffect(() => {
    setRender(true);
  }, []);

  if (!render) return null;

  return (
    <Portal id={`topLeftActionContent${suffix}`}>
      <div className={className}>{children}</div>
    </Portal>
  );
};
