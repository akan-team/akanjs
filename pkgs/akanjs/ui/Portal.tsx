"use client";

import { type ReactNode, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";

interface PortalProps {
  children: ReactNode;
  id: string;
  /** Drawn in place until the target is found: on the server, and in the first client render that hydrates it. */
  fallback?: ReactNode;
}

export const Portal = ({ children, id, fallback = null }: PortalProps) => {
  //? Null on the first client render too: the server cannot portal, and a portal created during hydration makes
  //? React claim the parent's next server node for the portal's content.
  const [targetElement, setTargetElement] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    setTargetElement(document.getElementById(id));
  }, [id]);

  return targetElement ? createPortal(children, targetElement) : fallback;
};
