"use client";

import { type ReactNode, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";

interface PortalProps {
  children: ReactNode;
  id: string;
}

export const Portal = ({ children, id }: PortalProps) => {
  //? Null on the first client render too: the server cannot portal, and a portal created during hydration makes
  //? React claim the parent's next server node for the portal's content.
  const [targetElement, setTargetElement] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    setTargetElement(document.getElementById(id));
  }, [id]);

  return targetElement ? createPortal(children, targetElement) : null;
};
