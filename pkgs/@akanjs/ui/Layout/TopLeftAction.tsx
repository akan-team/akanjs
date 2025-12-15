"use client";
import { baseClientEnv } from "@akanjs/base";
import { usePathCtx } from "@akanjs/client";
import { useEffect, useState } from "react";

import { Portal } from "../Portal";

export interface TopLeftActionProps {
  className?: string;
  children: any;
}

export const TopLeftAction = ({ className, children }: TopLeftActionProps) => {
  const [render, setRender] = useState(false); //! 이거 왜 쓰는지 모르겠음 삭제해도 될듯
  const { location } = usePathCtx();
  const suffix = baseClientEnv.renderMode === "csr" ? `-${location.pathRoute.path}` : "";
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
