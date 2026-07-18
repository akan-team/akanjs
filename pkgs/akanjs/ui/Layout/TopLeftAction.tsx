"use client";
import { getEnv } from "akanjs/base";
import { usePathCtx } from "akanjs/client";
import { type ReactNode, useEffect, useState } from "react";

import { Portal } from "../Portal";

export interface TopLeftActionProps {
  className?: string;
  children: ReactNode;
}

export const TopLeftAction = ({ className, children }: TopLeftActionProps) => {
  const [render, setRender] = useState(false);
  const path = usePathCtx().location?.pathRoute?.path;
  const suffix = getEnv().renderMode === "csr" && path ? `-${path}` : "";
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
