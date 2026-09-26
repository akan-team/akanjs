"use client";

import { type ReactNode, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { captureServerPortal } from "./ServerPortal";

interface PortalProps {
  children: ReactNode;
  id: string;
}

export const Portal = ({ children, id }: PortalProps) => {
  //? Null on the first client render too: the server rendered nothing here, and a portal created during
  //? hydration makes React claim the parent's next server node for the portal's content.
  const [targetElement, setTargetElement] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    setTargetElement(document.getElementById(id));
  }, [id]);

  if (typeof document === "undefined" && captureServerPortal(id, children)) {
    return null;
  }

  return targetElement ? createPortal(children, targetElement) : null;
};
