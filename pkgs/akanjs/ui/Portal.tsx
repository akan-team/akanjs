"use client";

import { type ReactNode, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { captureServerPortal } from "./ServerPortal";

interface PortalProps {
  children: ReactNode;
  id: string;
}

export const Portal = ({ children, id }: PortalProps) => {
  const [targetElement, setTargetElement] = useState<HTMLElement | null>(() =>
    typeof document === "undefined" ? null : document.getElementById(id),
  );

  useLayoutEffect(() => {
    setTargetElement(document.getElementById(id));
  }, [id]);

  if (typeof document === "undefined" && captureServerPortal(id, children)) {
    return null;
  }

  return targetElement ? createPortal(children, targetElement) : null;
};
